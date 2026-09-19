//! OAuth 2.0 for installed apps: system browser + PKCE + a one-shot loopback
//! listener on 127.0.0.1. The refresh token lives ONLY in the OS keychain —
//! never in tenants.json, backup.json, or a (portable) business folder.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::Query;
use axum::response::Html;
use axum::routing::get;
use axum::Router;
use data_encoding::BASE64URL_NOPAD;
use keyring::Entry;
use rand_core::{OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::sync::oneshot;

use super::remote::RemoteError;

/// Files this app created — the ONLY Drive access we ever ask for.
pub const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
/// Just enough to show WHICH account is connected. Drive's own `about.user`
/// withholds `emailAddress` from a drive.file-only app for many accounts.
/// Deliberately not `profile`: the name + photo already come from Drive.
pub const EMAIL_SCOPE: &str = "https://www.googleapis.com/auth/userinfo.email";
const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const KEYRING_SERVICE: &str = "com.sakoram.billing.gdrive";
const KEYRING_USER: &str = "refresh_token";
const CONSENT_TIMEOUT: Duration = Duration::from_secs(300);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Sakoram</title>\
<body style=\"font-family:system-ui;text-align:center;padding-top:20vh\">\
<h2>You can close this tab</h2><p>Return to Sakoram to finish connecting Google Drive.</p></body>";

/// Compile-time Google OAuth client. Google documents that an installed-app
/// "secret" is not confidential, but it still stays out of the repo — CI
/// injects it. `None` ⇒ the whole feature reports itself as not configured.
pub fn client_creds() -> Option<(&'static str, &'static str)> {
	match (option_env!("SAKORAM_GOOGLE_CLIENT_ID"), option_env!("SAKORAM_GOOGLE_CLIENT_SECRET")) {
		(Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => Some((id, secret)),
		_ => None,
	}
}

/// 32 random bytes, base64url — a valid PKCE verifier (43 chars) and `state`.
pub fn random_token() -> String {
	let mut buf = [0u8; 32];
	OsRng.fill_bytes(&mut buf);
	BASE64URL_NOPAD.encode(&buf)
}

pub fn pkce_challenge(verifier: &str) -> String {
	BASE64URL_NOPAD.encode(&Sha256::digest(verifier.as_bytes()))
}

pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
	reqwest::Url::parse_with_params(AUTH_ENDPOINT, &[
		("client_id", client_id),
		("redirect_uri", redirect_uri),
		("response_type", "code"),
		("scope", &format!("{SCOPE} {EMAIL_SCOPE}")),
		("code_challenge", challenge),
		("code_challenge_method", "S256"),
		("state", state),
		// Both are needed for Google to hand back a refresh token every time.
		("access_type", "offline"),
		("prompt", "consent"),
	])
	.expect("static endpoint is a valid URL")
	.to_string()
}

/// What the loopback route hands to `wait_for_code`. Shared with
/// `AuthCanceller` so a cancel travels down the SAME channel as a real
/// redirect — no `select!` needed (tokio's `macros` feature is off).
type ParamsSender = Arc<Mutex<Option<oneshot::Sender<HashMap<String, String>>>>>;

/// `error` value `AuthCanceller` injects; never sent by Google.
const CANCEL_MARKER: &str = "sakoram_cancelled";

/// Same stable code as `backup::CANCELLED`, so the frontend stays silent.
pub const SIGN_IN_CANCELLED: &str = "DRIVE_CANCELLED: Sign-in cancelled.";

/// Aborts the sign-in that `begin` started. Without it, closing the browser tab
/// left `finish` waiting out the full 5-minute consent timeout with the Connect
/// button stuck loading. Idempotent; a no-op once the redirect has arrived.
pub struct AuthCanceller(ParamsSender);

impl AuthCanceller {
	pub fn cancel(&self) {
		if let Some(tx) = self.0.lock().unwrap().take() {
			let _ = tx.send(HashMap::from([("error".to_string(), CANCEL_MARKER.to_string())]));
		}
	}
}

/// An authorisation in flight. Dropping it shuts the loopback listener down.
pub struct PendingAuth {
	verifier: String,
	state: String,
	redirect_uri: String,
	rx: oneshot::Receiver<HashMap<String, String>>,
	_shutdown: oneshot::Sender<()>,
}

/// Bind the loopback listener and build the consent URL the caller opens in
/// the system browser.
pub async fn begin(client_id: &str) -> Result<(String, PendingAuth, AuthCanceller), String> {
	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| format!("could not start sign-in listener: {e}"))?;
	let port = listener.local_addr().map_err(|e| e.to_string())?.port();
	let redirect_uri = format!("http://127.0.0.1:{port}");

	let (tx, rx) = oneshot::channel::<HashMap<String, String>>();
	let tx: ParamsSender = Arc::new(Mutex::new(Some(tx)));
	let canceller = AuthCanceller(tx.clone());
	let router = Router::new().route(
		"/",
		get(move |Query(params): Query<HashMap<String, String>>| {
			let tx = tx.clone();
			async move {
				if let Some(tx) = tx.lock().unwrap().take() {
					let _ = tx.send(params);
				}
				Html(DONE_PAGE)
			}
		}),
	);
	let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
	tokio::spawn(async move {
		let _ = axum::serve(listener, router)
			.with_graceful_shutdown(async {
				let _ = shutdown_rx.await;
			})
			.await;
	});

	let verifier = random_token();
	let state = random_token();
	let url = auth_url(client_id, &redirect_uri, &pkce_challenge(&verifier), &state);
	Ok((url, PendingAuth { verifier, state, redirect_uri, rx, _shutdown: shutdown_tx }, canceller))
}

/// Wait for the browser redirect → `(code, verifier, redirect_uri)`.
async fn wait_for_code(pending: PendingAuth) -> Result<(String, String, String), String> {
	let PendingAuth { verifier, state, redirect_uri, rx, _shutdown } = pending;
	let params = tokio::time::timeout(CONSENT_TIMEOUT, rx)
		.await
		.map_err(|_| "Timed out waiting for Google sign-in.".to_string())?
		.map_err(|_| "Sign-in was interrupted.".to_string())?;
	if let Some(err) = params.get("error") {
		if err == CANCEL_MARKER {
			return Err(SIGN_IN_CANCELLED.to_string());
		}
		return Err(format!("Google sign-in was declined ({err})."));
	}
	if params.get("state").map(String::as_str) != Some(state.as_str()) {
		return Err("Sign-in response had an unexpected state — ignored for safety.".into());
	}
	let code = params.get("code").cloned().ok_or_else(|| "Google did not return an authorisation code.".to_string())?;
	Ok((code, verifier, redirect_uri))
}

#[derive(Debug, Clone, Deserialize)]
pub struct Tokens {
	pub access_token: String,
	pub expires_in: u64,
	#[serde(default)]
	pub refresh_token: Option<String>,
	/// Space-separated scopes Google actually GRANTED — not what we asked for.
	#[serde(default)]
	pub scope: Option<String>,
}

/// Asking for more than one scope makes Google's consent screen show a
/// checkbox per permission, so the user can untick Drive and still "succeed".
/// That would connect fine and then fail every backup with a 403. A response
/// with no `scope` field is given the benefit of the doubt.
pub fn grants_drive(granted: Option<&str>) -> bool {
	granted.is_none_or(|scopes| scopes.split_whitespace().any(|s| s == SCOPE))
}

pub async fn finish(pending: PendingAuth, client_id: &str, client_secret: &str) -> Result<Tokens, String> {
	let (code, verifier, redirect_uri) = wait_for_code(pending).await?;
	let http = reqwest::Client::new();
	let resp = http
		.post(TOKEN_ENDPOINT)
		.form(&[
			("code", code.as_str()),
			("client_id", client_id),
			("client_secret", client_secret),
			("redirect_uri", redirect_uri.as_str()),
			("grant_type", "authorization_code"),
			("code_verifier", verifier.as_str()),
		])
		.send()
		.await
		.map_err(|e| format!("DRIVE_OFFLINE: {e}"))?;
	if !resp.status().is_success() {
		return Err(format!("Google rejected the sign-in ({}).", resp.status()));
	}
	resp.json::<Tokens>().await.map_err(|e| format!("Unexpected token response: {e}"))
}

/// Exchange the refresh token for an access token. `invalid_grant` means the
/// user revoked access (or the token expired) → `AuthRevoked`, which the UI
/// turns into a "reconnect Google Drive" prompt.
pub async fn refresh(http: &reqwest::Client, client_id: &str, client_secret: &str, refresh_token: &str) -> Result<Tokens, RemoteError> {
	let resp = http
		.post(TOKEN_ENDPOINT)
		.form(&[
			("client_id", client_id),
			("client_secret", client_secret),
			("refresh_token", refresh_token),
			("grant_type", "refresh_token"),
		])
		.send()
		.await
		.map_err(|e| RemoteError::Offline(e.to_string()))?;
	let status = resp.status();
	if status.is_success() {
		return resp.json::<Tokens>().await.map_err(|e| RemoteError::Other(e.to_string()));
	}
	let body = resp.text().await.unwrap_or_default();
	if body.contains("invalid_grant") {
		Err(RemoteError::AuthRevoked("Google Drive access was revoked or has expired.".into()))
	} else {
		Err(RemoteError::Other(format!("token refresh failed ({status})")))
	}
}

/// Best-effort: tell Google to invalidate the token on Disconnect.
pub async fn revoke(http: &reqwest::Client, token: &str) {
	let _ = http.post(REVOKE_ENDPOINT).form(&[("token", token)]).send().await;
}

pub fn store_refresh_token(token: &str) -> Result<(), String> {
	Entry::new(KEYRING_SERVICE, KEYRING_USER)
		.and_then(|e| e.set_password(token))
		.map_err(|e| format!("Could not save the Google sign-in to the system keychain: {e}"))
}

pub fn load_refresh_token() -> Option<String> {
	Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?.get_password().ok().filter(|t| !t.is_empty())
}

pub fn clear_refresh_token() {
	if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
		let _ = entry.delete_credential();
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn pkce_challenge_matches_the_rfc_7636_appendix_b_vector() {
		assert_eq!(
			pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
			"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
		);
	}

	/// Run with `--nocapture` to see what build.rs resolved from the environment
	/// / the repo-root `.env`. Prints only whether credentials exist, never them.
	#[test]
	fn client_creds_are_all_or_nothing() {
		let creds = client_creds();
		eprintln!("google drive credentials compiled in: {}", creds.is_some());
		if let Some((id, secret)) = creds {
			assert!(!id.is_empty() && !secret.is_empty());
		}
	}

	#[test]
	fn random_tokens_are_url_safe_43_chars_and_unique() {
		let a = random_token();
		assert_eq!(a.len(), 43);
		assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
		assert_ne!(a, random_token());
	}

	#[test]
	fn drive_must_be_among_the_granted_scopes() {
		assert!(grants_drive(Some("https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file openid")));
		assert!(!grants_drive(Some("https://www.googleapis.com/auth/userinfo.email openid")));
		// A lookalike must not pass a substring check.
		assert!(!grants_drive(Some("https://www.googleapis.com/auth/drive.file.evil")));
		assert!(grants_drive(None));
	}

	#[test]
	fn auth_url_requests_offline_access_for_drive_file_and_email_only() {
		let url = auth_url("cid.apps.googleusercontent.com", "http://127.0.0.1:5123", "CHAL", "STATE");
		let parsed = reqwest::Url::parse(&url).unwrap();
		let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
		assert_eq!(parsed.host_str(), Some("accounts.google.com"));
		assert_eq!(q["scope"], "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email");
		assert_eq!(q["redirect_uri"], "http://127.0.0.1:5123");
		assert_eq!(q["code_challenge"], "CHAL");
		assert_eq!(q["code_challenge_method"], "S256");
		assert_eq!(q["state"], "STATE");
		assert_eq!(q["access_type"], "offline");
		assert_eq!(q["prompt"], "consent");
		assert_eq!(q["response_type"], "code");
	}

	#[test]
	fn loopback_listener_delivers_the_code_and_rejects_a_wrong_state() {
		tauri::async_runtime::block_on(async {
			let (url, pending, _canceller) = begin("cid").await.unwrap();
			let parsed = reqwest::Url::parse(&url).unwrap();
			let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
			let redirect = q["redirect_uri"].clone();

			// Simulate Google redirecting the browser back with a FORGED state.
			let http = reqwest::Client::new();
			http.get(format!("{redirect}/?code=abc&state=forged")).send().await.unwrap();
			let err = wait_for_code(pending).await.unwrap_err();
			assert!(err.contains("state"));
		});
	}

	#[test]
	fn cancelling_ends_the_wait_immediately_with_the_cancelled_code() {
		tauri::async_runtime::block_on(async {
			let (_url, pending, canceller) = begin("cid").await.unwrap();
			canceller.cancel();
			canceller.cancel(); // idempotent
			let started = std::time::Instant::now();
			let err = wait_for_code(pending).await.unwrap_err();
			assert_eq!(err, SIGN_IN_CANCELLED);
			assert!(started.elapsed() < Duration::from_secs(2), "must not wait out the consent timeout");
		});
	}

	#[test]
	fn a_cancel_after_the_redirect_arrived_does_not_clobber_the_code() {
		tauri::async_runtime::block_on(async {
			let (url, pending, canceller) = begin("cid").await.unwrap();
			let parsed = reqwest::Url::parse(&url).unwrap();
			let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
			reqwest::Client::new().get(format!("{}/?code=abc&state={}", q["redirect_uri"], q["state"])).send().await.unwrap();
			canceller.cancel();
			let (code, _, _) = wait_for_code(pending).await.unwrap();
			assert_eq!(code, "abc");
		});
	}

	#[test]
	fn loopback_listener_returns_the_code_for_the_right_state() {
		tauri::async_runtime::block_on(async {
			let (url, pending, _canceller) = begin("cid").await.unwrap();
			let parsed = reqwest::Url::parse(&url).unwrap();
			let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
			let http = reqwest::Client::new();
			http.get(format!("{}/?code=abc&state={}", q["redirect_uri"], q["state"])).send().await.unwrap();
			let (code, _verifier, _redirect) = wait_for_code(pending).await.unwrap();
			assert_eq!(code, "abc");
		});
	}
}
