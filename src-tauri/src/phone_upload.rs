// Phone upload — a tiny LAN HTTP server so the user can push a photo
// from their phone straight onto an invoice on the desktop.
//
// Flow:
//   1. The invoice page calls `start_phone_upload(invoice_id)`.
//   2. We lazily start an axum server bound to 0.0.0.0 on an ephemeral
//      port, mint a random token, and map token -> Session.
//   3. The desktop shows a QR for `http://<lan-ip>:<port>/?t=<token>`.
//   4. The phone scans it, opens the capture page, takes photos, and
//      POSTs them to `/upload?t=<token>`.
//   5. Each upload is validated (image only, 20 MB cap), saved to disk,
//      and announced via the `phone-upload-received` Tauri event so the
//      invoice page can register it as an attachment.
//   6. `cancel_phone_upload(token)` drops the session; once the last
//      session is gone the server shuts itself down after a short grace.
//
// Security: the only thing standing between the open LAN port and the
// filesystem is the token. It's a random UUIDv4 (not guessable), every
// route validates it, and uploads are content-sniffed so the declared
// Content-Type can't smuggle a non-image through. Files are written
// with our own UUID filename — the phone's filename is never trusted.

use std::collections::HashMap;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::{DefaultBodyLimit, Multipart, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{oneshot, Mutex};

use crate::tenants;

/// Hard cap on a single uploaded file.
const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
/// How long a session stays valid with no activity. Refreshed on every
/// successful upload so a multi-photo session doesn't time out mid-run.
const SESSION_TTL: Duration = Duration::from_secs(120);
/// Grace period after the last session ends before the server stops —
/// avoids thrashing the listener if the user reopens the modal quickly.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

// ---------- Shared state ----------------------------------------------------

struct Session {
	invoice_id: String,
	/// Directory the photos land in: invoice_attachments/<tenant>/<invoice>.
	save_dir: PathBuf,
	/// Wall-clock expiry. Pruned by the background sweeper and checked on
	/// every request.
	expires_at: SystemTime,
}

type Sessions = Arc<Mutex<HashMap<String, Session>>>;

#[derive(Default)]
struct ServerControl {
	running: bool,
	port: Option<u16>,
	shutdown_tx: Option<oneshot::Sender<()>>,
}

/// Tauri-managed state. Both fields are Arc-wrapped so the axum handlers
/// and the deferred-shutdown task can hold them without reaching back
/// into Tauri's state registry.
#[derive(Default)]
pub struct PhoneUploadState {
	sessions: Sessions,
	control: Arc<Mutex<ServerControl>>,
}

/// Cloned into every axum handler.
#[derive(Clone)]
struct AppState {
	app: AppHandle,
	sessions: Sessions,
}

// ---------- Command payloads ------------------------------------------------

#[derive(Serialize)]
pub struct UploadSession {
	/// Full URL (with token) to encode into the QR.
	url: String,
	token: String,
	/// Epoch milliseconds — the frontend ticks a countdown off this.
	expires_at: i64,
}

#[derive(Serialize, Clone)]
pub struct AttachmentFile {
	file_path: String,
	filename: String,
	size: u64,
	mime: String,
}

fn epoch_ms(t: SystemTime) -> i64 {
	t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Best-effort pick of this machine's real LAN IPv4 address.
///
/// `local_ip_address::local_ip()` frequently returns a virtual-adapter
/// address on Windows dev machines — WSL, the Hyper-V "Default Switch",
/// VirtualBox, Docker — and a phone on the real Wi-Fi can't route to
/// those.
///
/// Primary method: ask the OS which source address it would use to reach
/// an off-link destination. "Connecting" a UDP socket sends no packets —
/// it just makes the kernel resolve the route — so this returns the
/// *live* address of whichever interface holds the default route (the
/// real Wi-Fi / Ethernet adapter), immune to stale enumeration entries
/// and to virtual adapters (which have no default gateway).
///
/// Fallback (no default route — machine fully offline): enumerate every
/// interface, drop loopback / link-local / non-private / known-virtual
/// adapters, and prefer the range a home router hands out.
fn route_source_ip() -> Option<IpAddr> {
	// 8.8.8.8 is just a routing target — no packet is actually sent.
	let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
	socket.connect("8.8.8.8:80").ok()?;
	match socket.local_addr().ok()?.ip() {
		IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(IpAddr::V4(v4)),
		_ => None,
	}
}

fn pick_lan_ip() -> Result<IpAddr, String> {
	if let Some(ip) = route_source_ip() {
		return Ok(ip);
	}

	let ifaces = local_ip_address::list_afinet_netifas()
		.map_err(|e| format!("could not enumerate network interfaces: {e}"))?;

	const VIRTUAL_KEYWORDS: &[&str] = &[
		"vethernet", "virtualbox", "vmware", "wsl", "hyper-v", "hyperv",
		"docker", "loopback", "bluetooth", "tailscale", "zerotier", "default switch",
	];

	let mut candidates: Vec<(u8, std::net::Ipv4Addr)> = Vec::new();
	for (name, ip) in ifaces {
		let IpAddr::V4(v4) = ip else { continue };
		if v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || !v4.is_private() {
			continue;
		}
		let lname = name.to_lowercase();
		if VIRTUAL_KEYWORDS.iter().any(|kw| lname.contains(kw)) {
			continue;
		}
		let o = v4.octets();
		let rank = if o[0] == 192 && o[1] == 168 {
			0
		} else if o[0] == 10 {
			1
		} else {
			2
		};
		candidates.push((rank, v4));
	}
	candidates.sort_by_key(|(rank, _)| *rank);
	if let Some((_, v4)) = candidates.first() {
		return Ok(IpAddr::V4(*v4));
	}
	// Nothing survived the filter — fall back to the crate's guess rather
	// than failing outright.
	local_ip_address::local_ip()
		.map_err(|e| format!("could not determine this machine's LAN address: {e}"))
}

/// Resolve (and create) the attachment directory for an invoice in the
/// active tenant.
fn attachment_dir(app: &AppHandle, invoice_id: &str) -> Result<PathBuf, String> {
	let tenant = tenants::active_tenant_id(app)?;
	let dir = app
		.path()
		.app_data_dir()
		.map_err(|e| e.to_string())?
		.join("invoice_attachments")
		.join(tenant)
		.join(invoice_id);
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir)
}

// ---------- Tauri commands --------------------------------------------------

#[tauri::command]
pub async fn start_phone_upload(
	app: AppHandle,
	state: tauri::State<'_, PhoneUploadState>,
	invoice_id: String,
) -> Result<UploadSession, String> {
	// Start the server on first use. Bind to an ephemeral port so we never
	// collide with whatever else is on the machine.
	let port = {
		let mut control = state.control.lock().await;
		if control.running {
			control.port.ok_or("server running but no port recorded")?
		} else {
			let listener = tokio::net::TcpListener::bind("0.0.0.0:0")
				.await
				.map_err(|e| format!("could not bind upload server: {e}"))?;
			let port = listener.local_addr().map_err(|e| e.to_string())?.port();

			let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
			let app_state = AppState { app: app.clone(), sessions: state.sessions.clone() };
			let router = build_router(app_state);

			tokio::spawn(async move {
				let _ = axum::serve(listener, router)
					.with_graceful_shutdown(async move {
						let _ = shutdown_rx.await;
					})
					.await;
			});

			// Background sweeper: drop expired sessions so a stale token
			// can't linger. When the map empties out it hands off to the
			// deferred-shutdown path; once the server has stopped the
			// sweeper exits so we don't leak a task per server cycle.
			let sweep_sessions = state.sessions.clone();
			let sweep_control = state.control.clone();
			tokio::spawn(async move {
				loop {
					tokio::time::sleep(Duration::from_secs(30)).await;
					if !sweep_control.lock().await.running {
						break;
					}
					let now = SystemTime::now();
					let mut sessions = sweep_sessions.lock().await;
					sessions.retain(|_, s| s.expires_at > now);
					let empty = sessions.is_empty();
					drop(sessions);
					if empty {
						maybe_schedule_shutdown(sweep_sessions.clone(), sweep_control.clone());
					}
				}
			});

			control.running = true;
			control.port = Some(port);
			control.shutdown_tx = Some(shutdown_tx);
			port
		}
	};

	// LAN address so the phone can reach this machine.
	let ip = pick_lan_ip()?;

	let token = uuid::Uuid::new_v4().to_string();
	let save_dir = attachment_dir(&app, &invoice_id)?;
	let expires_at = SystemTime::now() + SESSION_TTL;

	state.sessions.lock().await.insert(
		token.clone(),
		Session { invoice_id, save_dir, expires_at },
	);

	Ok(UploadSession {
		url: format!("http://{ip}:{port}/?t={token}"),
		token,
		expires_at: epoch_ms(expires_at),
	})
}

#[tauri::command]
pub async fn cancel_phone_upload(
	state: tauri::State<'_, PhoneUploadState>,
	token: String,
) -> Result<(), String> {
	state.sessions.lock().await.remove(&token);
	maybe_schedule_shutdown(state.sessions.clone(), state.control.clone());
	Ok(())
}

/// Import a file the user picked from the desktop file dialog. Validates
/// it's an image, copies it into the invoice's attachment directory under
/// our own UUID filename, and returns the metadata the JS store needs to
/// record the row. Mirrors the shape of the `phone-upload-received` event
/// so both upload paths feed one insert function.
#[tauri::command]
pub async fn import_invoice_attachment(
	app: AppHandle,
	invoice_id: String,
	src_path: String,
) -> Result<AttachmentFile, String> {
	let bytes = std::fs::read(&src_path).map_err(|e| format!("could not read file: {e}"))?;
	let kind = infer::get(&bytes).ok_or("Unrecognised file type")?;
	if kind.matcher_type() != infer::MatcherType::Image {
		return Err("Only image files can be attached".into());
	}
	let dir = attachment_dir(&app, &invoice_id)?;
	let ext = kind.extension();
	let stored = format!("{}.{ext}", uuid::Uuid::new_v4());
	let dest = dir.join(&stored);
	std::fs::write(&dest, &bytes).map_err(|e| format!("could not save attachment: {e}"))?;

	let original = std::path::Path::new(&src_path)
		.file_name()
		.and_then(|n| n.to_str())
		.unwrap_or(&stored)
		.to_string();

	Ok(AttachmentFile {
		file_path: dest.to_string_lossy().to_string(),
		filename: original,
		size: bytes.len() as u64,
		mime: kind.mime_type().to_string(),
	})
}

/// If no sessions remain, shut the server down after a grace period.
/// Re-checks emptiness when the grace elapses, so a session created in
/// the meantime keeps the server alive. Resetting `running`/`port` means
/// the next `start_phone_upload` rebinds a fresh listener.
fn maybe_schedule_shutdown(sessions: Sessions, control: Arc<Mutex<ServerControl>>) {
	tokio::spawn(async move {
		tokio::time::sleep(SHUTDOWN_GRACE).await;
		if !sessions.lock().await.is_empty() {
			return;
		}
		let mut control = control.lock().await;
		if let Some(tx) = control.shutdown_tx.take() {
			let _ = tx.send(());
		}
		control.running = false;
		control.port = None;
	});
}

// ---------- axum wiring -----------------------------------------------------

fn build_router(state: AppState) -> Router {
	Router::new()
		.route("/", get(serve_capture_page))
		.route("/upload", post(handle_upload))
		.layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES))
		.with_state(state)
}

#[derive(Deserialize)]
struct TokenQuery {
	t: Option<String>,
}

/// True if the token names a live, unexpired session.
async fn token_valid(sessions: &Sessions, token: &str) -> bool {
	match sessions.lock().await.get(token) {
		Some(s) => s.expires_at > SystemTime::now(),
		None => false,
	}
}

async fn serve_capture_page(
	State(state): State<AppState>,
	Query(q): Query<TokenQuery>,
) -> impl IntoResponse {
	let token = q.t.unwrap_or_default();
	if token.is_empty() || !token_valid(&state.sessions, &token).await {
		return Html(INVALID_PAGE.to_string());
	}
	Html(CAPTURE_PAGE.replace("__TOKEN__", &token))
}

async fn handle_upload(
	State(state): State<AppState>,
	Query(q): Query<TokenQuery>,
	mut multipart: Multipart,
) -> impl IntoResponse {
	let token = q.t.unwrap_or_default();

	// Resolve the session up front; clone what we need so we don't hold
	// the lock across the (slow) multipart read.
	let (invoice_id, save_dir) = {
		let sessions = state.sessions.lock().await;
		match sessions.get(&token) {
			Some(s) if s.expires_at > SystemTime::now() => {
				(s.invoice_id.clone(), s.save_dir.clone())
			}
			_ => {
				return (
					StatusCode::UNAUTHORIZED,
					Json(json!({ "error": "Session expired or invalid" })),
				);
			}
		}
	};

	// Pull the first file field out of the multipart body.
	let bytes = loop {
		match multipart.next_field().await {
			Ok(Some(field)) => {
				if field.file_name().is_none() && field.name() != Some("file") {
					continue;
				}
				match field.bytes().await {
					Ok(b) => break b,
					Err(_) => {
						return (
							StatusCode::PAYLOAD_TOO_LARGE,
							Json(json!({ "error": "File too large (20 MB max)" })),
						);
					}
				}
			}
			Ok(None) => {
				return (
					StatusCode::BAD_REQUEST,
					Json(json!({ "error": "No file in upload" })),
				);
			}
			Err(_) => {
				return (
					StatusCode::BAD_REQUEST,
					Json(json!({ "error": "Malformed upload" })),
				);
			}
		}
	};

	if bytes.len() > MAX_UPLOAD_BYTES {
		return (
			StatusCode::PAYLOAD_TOO_LARGE,
			Json(json!({ "error": "File too large (20 MB max)" })),
		);
	}

	// Sniff the real type from the bytes — never trust the phone's
	// Content-Type. Reject anything that isn't an image.
	let kind = match infer::get(&bytes) {
		Some(k) if k.matcher_type() == infer::MatcherType::Image => k,
		_ => {
			return (
				StatusCode::UNSUPPORTED_MEDIA_TYPE,
				Json(json!({ "error": "Only image files are accepted" })),
			);
		}
	};

	let stored = format!("{}.{}", uuid::Uuid::new_v4(), kind.extension());
	let dest = save_dir.join(&stored);
	if let Err(e) = std::fs::write(&dest, &bytes) {
		return (
			StatusCode::INTERNAL_SERVER_ERROR,
			Json(json!({ "error": format!("Could not save file: {e}") })),
		);
	}

	// Slide the session window forward so a multi-photo run doesn't expire
	// between shots.
	if let Some(s) = state.sessions.lock().await.get_mut(&token) {
		s.expires_at = SystemTime::now() + SESSION_TTL;
	}

	// Tell the desktop. The invoice page filters on invoice_id and writes
	// the DB row.
	let payload = json!({
		"invoice_id": invoice_id,
		"token": token,
		"file_path": dest.to_string_lossy(),
		"filename": stored,
		"size": bytes.len(),
		"mime": kind.mime_type(),
	});
	let _ = state.app.emit("phone-upload-received", payload);

	(StatusCode::OK, Json(json!({ "ok": true })))
}

// ---------- Inline pages ----------------------------------------------------

const INVALID_PAGE: &str = r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload unavailable</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;
    align-items:center;justify-content:center;background:#f4efe2;color:#3a3a3a}
  .box{text-align:center;padding:2rem}
  h1{font-size:1.25rem;margin:.5rem 0}
  p{color:#777}
</style></head>
<body><div class="box">
  <div style="font-size:2.5rem">⌛</div>
  <h1>Session expired or invalid</h1>
  <p>Reopen the upload window on your desktop and scan the new code.</p>
</div></body></html>"#;

const CAPTURE_PAGE: &str = r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload invoice photo</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:0;background:#f4efe2;color:#3a3a3a;
    min-height:100vh;padding:1.5rem}
  .card{max-width:420px;margin:0 auto;background:#fffefa;border:1px solid #e3dcc8;
    border-radius:14px;padding:1.5rem;box-shadow:0 6px 24px rgba(0,0,0,.08)}
  h1{font-size:1.2rem;margin:0 0 .25rem}
  .sub{color:#888;font-size:.9rem;margin:0 0 1.25rem}
  label.pick{display:flex;align-items:center;justify-content:center;gap:.5rem;
    border:2px dashed #c9bf9f;border-radius:10px;padding:1.5rem;cursor:pointer;
    font-weight:600;color:#5a5340}
  input[type=file]{display:none}
  img.preview{width:100%;border-radius:10px;margin-top:1rem;display:none}
  button{width:100%;border:0;border-radius:10px;padding:.85rem;font-size:1rem;
    font-weight:600;margin-top:1rem;cursor:pointer}
  .primary{background:#3a3a3a;color:#fff}
  .primary:disabled{opacity:.4;cursor:not-allowed}
  .ghost{background:transparent;color:#777}
  .done{list-style:none;padding:0;margin:1rem 0 0}
  .done li{display:flex;align-items:center;gap:.5rem;font-size:.9rem;
    color:#3f7a3f;padding:.25rem 0}
  .err{color:#b22;font-size:.9rem;margin-top:.75rem;display:none}
  .finished{text-align:center;padding:1rem 0}
  .finished .big{font-size:2.5rem}
</style></head>
<body><div class="card" id="card">
  <h1>Upload invoice photo</h1>
  <p class="sub">Take a photo of the document. You can add several, then tap Done.</p>

  <label class="pick" for="file">📷 Take / choose photo</label>
  <input type="file" id="file" accept="image/*" capture="environment">
  <img class="preview" id="preview" alt="">

  <button class="primary" id="upload" disabled>Upload</button>
  <div class="err" id="err"></div>

  <ul class="done" id="list"></ul>
  <button class="ghost" id="done" style="display:none">Done — close this tab</button>
</div>

<div class="card finished" id="finished" style="display:none">
  <div class="big">✓</div>
  <h1>All set</h1>
  <p class="sub">Your photos are on your desktop. You can close this tab.</p>
</div>

<script>
  var token = "__TOKEN__";
  var fileEl = document.getElementById("file");
  var preview = document.getElementById("preview");
  var uploadBtn = document.getElementById("upload");
  var doneBtn = document.getElementById("done");
  var errEl = document.getElementById("err");
  var listEl = document.getElementById("list");
  var count = 0;

  function showErr(m){ errEl.textContent = m; errEl.style.display = "block"; }
  function clearErr(){ errEl.style.display = "none"; }

  fileEl.addEventListener("change", function(){
    clearErr();
    var f = fileEl.files[0];
    if(!f){ uploadBtn.disabled = true; preview.style.display = "none"; return; }
    preview.src = URL.createObjectURL(f);
    preview.style.display = "block";
    uploadBtn.disabled = false;
  });

  uploadBtn.addEventListener("click", function(){
    var f = fileEl.files[0];
    if(!f) return;
    clearErr();
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";
    var fd = new FormData();
    fd.append("file", f);
    fetch("/upload?t=" + encodeURIComponent(token), { method:"POST", body:fd })
      .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
      .then(function(res){
        uploadBtn.textContent = "Upload";
        if(!res.ok){ showErr(res.j.error || "Upload failed"); uploadBtn.disabled = false; return; }
        count++;
        var li = document.createElement("li");
        li.textContent = "✓ Photo " + count + " uploaded";
        listEl.appendChild(li);
        fileEl.value = "";
        preview.style.display = "none";
        doneBtn.style.display = "block";
      })
      .catch(function(){
        uploadBtn.textContent = "Upload";
        uploadBtn.disabled = false;
        showErr("Network error — check you're on the same Wi-Fi and try again.");
      });
  });

  doneBtn.addEventListener("click", function(){
    document.getElementById("card").style.display = "none";
    document.getElementById("finished").style.display = "block";
  });
</script>
</body></html>"#;
