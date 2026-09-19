//! `RemoteStore` over the Google Drive v3 REST API. Hand-written: six endpoints
//! do not justify a generated SDK crate.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;

use super::oauth;
use super::plan::{fits_app_property, RemoteFile};
use super::remote::{RemoteBusiness, RemoteError, RemoteStore};

const API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";
const ROOT_NAME: &str = "Sakoram Backups";

pub fn map_status(status: u16, body: &str) -> RemoteError {
	match status {
		401 => RemoteError::AuthRevoked("Google Drive sign-in is no longer valid.".into()),
		403 if body.contains("storageQuotaExceeded") => RemoteError::QuotaExceeded("Your Google Drive is full.".into()),
		404 => RemoteError::NotFound("Not found on Google Drive.".into()),
		_ => RemoteError::Other(format!("Google Drive returned {status}: {}", body.chars().take(200).collect::<String>())),
	}
}

/// Escape a value for a Drive `q` string literal.
pub fn escape_q(raw: &str) -> String {
	raw.replace('\\', "\\\\").replace('\'', "\\'")
}

#[derive(Deserialize)]
struct FileList {
	#[serde(default, rename = "nextPageToken")]
	next_page_token: Option<String>,
	#[serde(default)]
	files: Vec<DriveFile>,
}

#[derive(Deserialize)]
struct DriveFile {
	id: String,
	#[serde(default)]
	name: String,
	/// Drive serialises int64 as a JSON string.
	#[serde(default)]
	size: Option<String>,
	#[serde(default, rename = "md5Checksum")]
	md5: Option<String>,
	#[serde(default, rename = "appProperties")]
	props: HashMap<String, String>,
}

pub struct GDrive {
	http: reqwest::Client,
	client_id: String,
	client_secret: String,
	refresh_token: String,
	access: tokio::sync::Mutex<Option<(String, Instant)>>,
	/// `"<key>|<path>"` → Drive id. Folder paths end with '/'; `"<key>|"` is the
	/// business root; `"|"` is the `Sakoram Backups` root.
	ids: Mutex<HashMap<String, String>>,
}

impl GDrive {
	pub fn new(client_id: &str, client_secret: &str, refresh_token: String) -> Self {
		let http = reqwest::Client::builder().timeout(Duration::from_secs(120)).build().expect("reqwest client");
		Self {
			http,
			client_id: client_id.into(),
			client_secret: client_secret.into(),
			refresh_token,
			access: tokio::sync::Mutex::new(None),
			ids: Mutex::new(HashMap::new()),
		}
	}

	async fn token(&self) -> Result<String, RemoteError> {
		let mut guard = self.access.lock().await;
		if let Some((token, expires)) = guard.as_ref() {
			if Instant::now() + Duration::from_secs(60) < *expires {
				return Ok(token.clone());
			}
		}
		let fresh = oauth::refresh(&self.http, &self.client_id, &self.client_secret, &self.refresh_token).await?;
		let expires = Instant::now() + Duration::from_secs(fresh.expires_in);
		*guard = Some((fresh.access_token.clone(), expires));
		Ok(fresh.access_token)
	}

	/// Send, mapping transport failures to `Offline` and HTTP failures through `map_status`.
	async fn send(&self, req: reqwest::RequestBuilder) -> Result<reqwest::Response, RemoteError> {
		let resp = req.bearer_auth(self.token().await?).send().await.map_err(|e| RemoteError::Offline(e.to_string()))?;
		if resp.status().is_success() {
			return Ok(resp);
		}
		let status = resp.status().as_u16();
		let body = resp.text().await.unwrap_or_default();
		Err(map_status(status, &body))
	}

	async fn query(&self, q: &str) -> Result<Vec<DriveFile>, RemoteError> {
		let mut out = Vec::new();
		let mut page: Option<String> = None;
		loop {
			let mut params = vec![
				("q", q.to_string()),
				("spaces", "drive".to_string()),
				("pageSize", "1000".to_string()),
				("fields", "nextPageToken,files(id,name,size,md5Checksum,appProperties)".to_string()),
			];
			if let Some(token) = &page {
				params.push(("pageToken", token.clone()));
			}
			let list: FileList = self
				.send(self.http.get(format!("{API}/files")).query(&params))
				.await?
				.json()
				.await
				.map_err(|e| RemoteError::Other(e.to_string()))?;
			out.extend(list.files);
			match list.next_page_token {
				Some(next) => page = Some(next),
				None => return Ok(out),
			}
		}
	}

	async fn create_folder(&self, name: &str, parent: Option<&str>, props: serde_json::Value) -> Result<String, RemoteError> {
		let mut meta = json!({ "name": name, "mimeType": FOLDER_MIME, "appProperties": props });
		if let Some(parent) = parent {
			meta["parents"] = json!([parent]);
		}
		let created: DriveFile = self
			.send(self.http.post(format!("{API}/files")).query(&[("fields", "id")]).json(&meta))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		Ok(created.id)
	}

	fn cached(&self, cache_key: &str) -> Option<String> {
		self.ids.lock().unwrap().get(cache_key).cloned()
	}

	fn remember(&self, cache_key: String, id: String) {
		self.ids.lock().unwrap().insert(cache_key, id);
	}

	async fn root_id(&self) -> Result<String, RemoteError> {
		if let Some(id) = self.cached("|") {
			return Ok(id);
		}
		let q = format!("mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='root' }}");
		let id = match self.query(&q).await?.into_iter().next() {
			Some(found) => found.id,
			None => self.create_folder(ROOT_NAME, None, json!({ "skKind": "root" })).await?,
		};
		self.remember("|".into(), id.clone());
		Ok(id)
	}

	async fn find_business(&self, key: &str) -> Result<Option<DriveFile>, RemoteError> {
		let q = format!(
			"mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='business' }} and appProperties has {{ key='skKey' and value='{}' }}",
			escape_q(key)
		);
		Ok(self.query(&q).await?.into_iter().next())
	}

	async fn business_id(&self, key: &str) -> Result<String, RemoteError> {
		let cache_key = format!("{key}|");
		if let Some(id) = self.cached(&cache_key) {
			return Ok(id);
		}
		let found = self.find_business(key).await?.ok_or_else(|| RemoteError::NotFound("No backup folder for this business.".into()))?;
		self.remember(cache_key, found.id.clone());
		Ok(found.id)
	}

	/// Id of the folder that should hold `path` (e.g. `attachments/invoice/1/a.jpg`
	/// → the `attachments/invoice/1/` folder), creating missing levels.
	async fn parent_folder_id(&self, key: &str, path: &str) -> Result<String, RemoteError> {
		let mut parent = self.business_id(key).await?;
		let mut walked = String::new();
		let segments: Vec<&str> = path.split('/').collect();
		for segment in &segments[..segments.len().saturating_sub(1)] {
			walked.push_str(segment);
			walked.push('/');
			let cache_key = format!("{key}|{walked}");
			if let Some(id) = self.cached(&cache_key) {
				parent = id;
				continue;
			}
			let q = format!(
				"'{parent}' in parents and name='{}' and mimeType='{FOLDER_MIME}' and trashed=false",
				escape_q(segment)
			);
			let id = match self.query(&q).await?.into_iter().next() {
				Some(found) => found.id,
				None => self.create_folder(segment, Some(&parent), json!({ "skKind": "dir", "skKey": key })).await?,
			};
			self.remember(cache_key, id.clone());
			parent = id;
		}
		Ok(parent)
	}

	async fn file_id(&self, key: &str, path: &str) -> Result<String, RemoteError> {
		let cache_key = format!("{key}|{path}");
		if let Some(id) = self.cached(&cache_key) {
			return Ok(id);
		}
		self.list(key).await?; // repopulates the id cache
		self.cached(&cache_key).ok_or_else(|| RemoteError::NotFound(path.to_string()))
	}

	/// The connected account, shown in Settings. Works with the `drive.file` scope.
	pub async fn account_email(&self) -> Result<String, RemoteError> {
		#[derive(Deserialize)]
		struct About {
			user: User,
		}
		#[derive(Deserialize)]
		struct User {
			#[serde(rename = "emailAddress")]
			email: String,
		}
		let about: About = self
			.send(self.http.get(format!("{API}/about")).query(&[("fields", "user(emailAddress)")]))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		Ok(about.user.email)
	}
}

impl RemoteStore for GDrive {
	async fn list_businesses(&self) -> Result<Vec<RemoteBusiness>, RemoteError> {
		let q = format!("mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='business' }}");
		Ok(self
			.query(&q)
			.await?
			.into_iter()
			.filter_map(|f| f.props.get("skKey").cloned().map(|key| RemoteBusiness { key, name: f.name }))
			.collect())
	}

	async fn ensure_business(&self, key: &str, name: &str) -> Result<(), RemoteError> {
		let id = match self.find_business(key).await? {
			Some(found) => {
				if found.name != name {
					// Folder name is cosmetic — keep it current after a rename.
					self.send(self.http.patch(format!("{API}/files/{}", found.id)).json(&json!({ "name": name }))).await?;
				}
				found.id
			}
			None => {
				let root = self.root_id().await?;
				self.create_folder(name, Some(&root), json!({ "skKind": "business", "skKey": key })).await?
			}
		};
		self.remember(format!("{key}|"), id);
		Ok(())
	}

	async fn list(&self, key: &str) -> Result<Vec<RemoteFile>, RemoteError> {
		let q = format!(
			"trashed=false and appProperties has {{ key='skKind' and value='file' }} and appProperties has {{ key='skKey' and value='{}' }}",
			escape_q(key)
		);
		let mut out = Vec::new();
		for f in self.query(&q).await? {
			let Some(path) = f.props.get("skPath").cloned() else { continue };
			self.remember(format!("{key}|{path}"), f.id);
			out.push(RemoteFile { path, size: f.size.and_then(|s| s.parse().ok()).unwrap_or(0), md5: f.md5 });
		}
		Ok(out)
	}

	async fn upload(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
		if !fits_app_property("skPath", path) {
			return Err(RemoteError::Other(format!("Path is too long to back up: {path}")));
		}
		let parent = self.parent_folder_id(key, path).await?;
		let name = path.rsplit('/').next().unwrap_or(path);
		let bytes = std::fs::read(local).map_err(|e| RemoteError::Other(format!("read {}: {e}", local.display())))?;
		let meta = json!({
			"name": name,
			"parents": [parent],
			"appProperties": { "skKind": "file", "skKey": key, "skPath": path },
		});
		// Resumable protocol, single PUT: the file only comes into existence when
		// the PUT completes, so a dropped connection never leaves a partial file.
		let init = self
			.send(self.http.post(UPLOAD_API).header("X-Upload-Content-Type", "application/octet-stream").json(&meta))
			.await?;
		let session = init
			.headers()
			.get(reqwest::header::LOCATION)
			.and_then(|v| v.to_str().ok())
			.map(str::to_string)
			.ok_or_else(|| RemoteError::Other("Google Drive did not open an upload session.".into()))?;
		let created: DriveFile = self
			.send(self.http.put(session).header(reqwest::header::CONTENT_TYPE, "application/octet-stream").body(bytes))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		self.remember(format!("{key}|{path}"), created.id);
		Ok(())
	}

	async fn download(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
		let id = self.file_id(key, path).await?;
		let bytes = self
			.send(self.http.get(format!("{API}/files/{id}")).query(&[("alt", "media")]))
			.await?
			.bytes()
			.await
			.map_err(|e| RemoteError::Offline(e.to_string()))?;
		if let Some(parent) = local.parent() {
			std::fs::create_dir_all(parent).map_err(|e| RemoteError::Other(e.to_string()))?;
		}
		std::fs::write(local, &bytes).map_err(|e| RemoteError::Other(format!("write {}: {e}", local.display())))
	}

	async fn trash(&self, key: &str, path: &str) -> Result<(), RemoteError> {
		let id = self.file_id(key, path).await?;
		self.send(self.http.patch(format!("{API}/files/{id}")).json(&json!({ "trashed": true }))).await?;
		self.ids.lock().unwrap().remove(&format!("{key}|{path}"));
		Ok(())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn status_mapping_picks_the_code_the_ui_keys_on() {
		assert!(matches!(map_status(401, ""), RemoteError::AuthRevoked(_)));
		assert!(matches!(map_status(403, r#"{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}"#), RemoteError::QuotaExceeded(_)));
		assert!(matches!(map_status(403, r#"{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}"#), RemoteError::Other(_)));
		assert!(matches!(map_status(404, ""), RemoteError::NotFound(_)));
		assert!(matches!(map_status(500, "boom"), RemoteError::Other(_)));
	}

	#[test]
	fn query_values_escape_quotes_and_backslashes() {
		assert_eq!(escape_q("O'Brien \\ Sons"), "O\\'Brien \\\\ Sons");
	}
}
