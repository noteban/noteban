use crate::cache::sync::SyncFileRecord;
use crate::cache::CacheDb;
use crate::AppState;
use chrono::{DateTime, Utc};
use directories::ProjectDirs;
use reqwest::{Client, Method, StatusCode};
use roxmltree::Document;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::State;
use url::Url;
use uuid::Uuid;
use walkdir::WalkDir;

const KEYRING_SERVICE: &str = "noteban.nextcloud";
const DEFAULT_REMOTE_FOLDER: &str = "Noteban";
const SYNC_STATUS_KEY: &str = "sync_status";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
    <d:getetag/>
  </d:prop>
</d:propfind>"#;

#[derive(Debug, Clone)]
pub struct LoginSession {
    pub server_url: String,
    pub poll_token: String,
    pub poll_endpoint: String,
    pub created_at: Instant,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStartResponse {
    pub session_id: String,
    pub login_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextcloudAccountMetadata {
    pub server_url: String,
    pub login_name: String,
    pub user_id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum LoginPollResponse {
    Pending,
    Complete { account: NextcloudAccountMetadata },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub status: String,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub started_at: String,
    pub finished_at: String,
    pub uploaded: usize,
    pub downloaded: usize,
    pub deleted_local: usize,
    pub deleted_remote: usize,
    pub conflicts: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LoginStartJson {
    poll: LoginPollJson,
    login: String,
}

#[derive(Debug, Deserialize)]
struct LoginPollJson {
    token: String,
    endpoint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginCompleteJson {
    server: String,
    login_name: String,
    app_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredentials {
    server_url: String,
    login_name: String,
    app_password: String,
    user_id: String,
}

#[derive(Debug, Deserialize)]
struct OcsUserResponse {
    ocs: OcsUserEnvelope,
}

#[derive(Debug, Deserialize)]
struct OcsUserEnvelope {
    data: OcsUserData,
}

#[derive(Debug, Deserialize)]
struct OcsUserData {
    id: String,
    #[serde(default)]
    displayname: Option<String>,
}

#[derive(Debug, Clone)]
struct RemoteFile {
    relative_path: String,
    is_dir: bool,
    etag: Option<String>,
    modified: Option<i64>,
    size: Option<i64>,
}

#[derive(Debug, Clone)]
struct LocalFile {
    path: PathBuf,
    hash: String,
    mtime: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncDecision {
    Noop,
    UploadLocal,
    DownloadRemote,
    UploadNew,
    DownloadNew,
    DeleteLocal,
    DeleteRemote,
    Conflict,
}

#[tauri::command]
pub async fn nextcloud_login_start(
    server_url: String,
    state: State<'_, AppState>,
) -> Result<LoginStartResponse, String> {
    let server_url = normalize_server_url(&server_url)?;
    let client = http_client()?;
    let response = client
        .post(join_url(&server_url, "/index.php/login/v2"))
        .header("User-Agent", user_agent())
        .send()
        .await
        .map_err(|e| format!("Failed to start Nextcloud login: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Nextcloud login start failed with status {}",
            response.status()
        ));
    }

    let payload: LoginStartJson = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Nextcloud login response: {}", e))?;

    let session_id = Uuid::new_v4().to_string();
    let session = LoginSession {
        server_url,
        poll_token: payload.poll.token,
        poll_endpoint: payload.poll.endpoint,
        created_at: Instant::now(),
    };

    let mut sessions = state
        .nextcloud_login_sessions
        .lock()
        .map_err(|_| "Internal login session lock error".to_string())?;
    sessions.insert(session_id.clone(), session);

    Ok(LoginStartResponse {
        session_id,
        login_url: payload.login,
    })
}

#[tauri::command]
pub async fn nextcloud_login_poll(
    session_id: String,
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<LoginPollResponse, String> {
    let session = {
        let mut sessions = state
            .nextcloud_login_sessions
            .lock()
            .map_err(|_| "Internal login session lock error".to_string())?;

        let Some(session) = sessions.get(&session_id).cloned() else {
            return Err("Login session not found".to_string());
        };

        if session.created_at.elapsed() > LOGIN_TIMEOUT {
            sessions.remove(&session_id);
            return Err("Login session expired".to_string());
        }

        session
    };

    let client = http_client()?;
    let response = client
        .post(&session.poll_endpoint)
        .header("User-Agent", user_agent())
        .form(&[("token", session.poll_token.as_str())])
        .send()
        .await
        .map_err(|e| format!("Failed to poll Nextcloud login: {}", e))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(LoginPollResponse::Pending);
    }

    if !response.status().is_success() {
        return Err(format!(
            "Nextcloud login poll failed with status {}",
            response.status()
        ));
    }

    let complete: LoginCompleteJson = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Nextcloud login completion: {}", e))?;

    let server_url = normalize_server_url(&complete.server)
        .or_else(|_| normalize_server_url(&session.server_url))?;
    let user = resolve_nextcloud_user(
        &client,
        &server_url,
        &complete.login_name,
        &complete.app_password,
    )
    .await?;

    let credentials = StoredCredentials {
        server_url: server_url.clone(),
        login_name: complete.login_name.clone(),
        app_password: complete.app_password,
        user_id: user.id.clone(),
    };
    store_credentials(&profile_id, &credentials)?;

    {
        let mut sessions = state
            .nextcloud_login_sessions
            .lock()
            .map_err(|_| "Internal login session lock error".to_string())?;
        sessions.remove(&session_id);
    }

    Ok(LoginPollResponse::Complete {
        account: NextcloudAccountMetadata {
            server_url,
            login_name: complete.login_name,
            user_id: user.id,
            display_name: user.displayname,
        },
    })
}

#[tauri::command]
pub fn nextcloud_disconnect(profile_id: String) -> Result<(), String> {
    delete_credentials(&profile_id)
}

#[tauri::command]
pub fn get_default_notes_dir(profile_id: String) -> Result<String, String> {
    let path = default_notes_dir(&profile_id)?;
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create default notes directory: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_sync_status(profile_id: String) -> Result<SyncStatus, String> {
    let cache = CacheDb::new(&profile_id)?;
    read_sync_status(&cache)
}

#[tauri::command]
pub async fn sync_now(
    profile_id: String,
    remote_folder: Option<String>,
) -> Result<SyncSummary, String> {
    let cache = CacheDb::new(&profile_id)?;
    let started_at = Utc::now();
    write_sync_status(
        &cache,
        SyncStatus {
            status: "syncing".to_string(),
            last_sync_at: Some(started_at.to_rfc3339()),
            last_error: None,
            conflicts: Vec::new(),
        },
    )?;

    let result = run_sync(profile_id, remote_folder, started_at).await;

    match result {
        Ok(summary) => {
            let status = if summary.errors.is_empty() {
                "ok"
            } else {
                "error"
            };
            write_sync_status(
                &cache,
                SyncStatus {
                    status: status.to_string(),
                    last_sync_at: Some(summary.finished_at.clone()),
                    last_error: summary.errors.first().cloned(),
                    conflicts: summary.conflicts.clone(),
                },
            )?;
            Ok(summary)
        }
        Err(error) => {
            write_sync_status(
                &cache,
                SyncStatus {
                    status: "error".to_string(),
                    last_sync_at: Some(Utc::now().to_rfc3339()),
                    last_error: Some(error.clone()),
                    conflicts: Vec::new(),
                },
            )?;
            Err(error)
        }
    }
}

async fn run_sync(
    profile_id: String,
    remote_folder: Option<String>,
    started_at: DateTime<Utc>,
) -> Result<SyncSummary, String> {
    let remote_folder = normalize_remote_folder(remote_folder);
    let credentials = load_credentials(&profile_id)?;
    let local_root = default_notes_dir(&profile_id)?;
    fs::create_dir_all(&local_root)
        .map_err(|e| format!("Failed to create local sync directory: {}", e))?;

    let cache = CacheDb::new(&profile_id)?;
    let client = http_client()?;

    ensure_remote_dir(&client, &credentials, &remote_folder).await?;

    let remote_files = list_remote_files(&client, &credentials, &remote_folder).await?;
    let local_files = list_local_files(&local_root)?;

    let mut summary = SyncSummary {
        started_at: started_at.to_rfc3339(),
        finished_at: Utc::now().to_rfc3339(),
        uploaded: 0,
        downloaded: 0,
        deleted_local: 0,
        deleted_remote: 0,
        conflicts: Vec::new(),
        errors: Vec::new(),
    };

    let all_paths: HashSet<String> = local_files
        .keys()
        .chain(remote_files.keys())
        .cloned()
        .collect();

    for relative_path in all_paths {
        let local = local_files.get(&relative_path);
        let remote = remote_files.get(&relative_path);
        let record = cache.get_sync_record(&relative_path)?;

        let local_changed = local
            .map(|file| {
                record
                    .as_ref()
                    .and_then(|r| r.last_synced_hash.as_ref())
                    .map_or(true, |hash| hash != &file.hash)
            })
            .unwrap_or(false);
        let remote_changed = remote
            .map(|file| {
                record
                    .as_ref()
                    .and_then(|r| r.remote_etag.as_ref())
                    .zip(file.etag.as_ref())
                    .map_or(true, |(old, new)| old != new)
            })
            .unwrap_or(false);

        let decision = decide_sync_action(
            local.is_some(),
            remote.is_some(),
            record.is_some(),
            local_changed,
            remote_changed,
        );

        match decision {
            SyncDecision::Noop => {
                if let (Some(local), Some(remote)) = (local, remote) {
                    upsert_record(&cache, &relative_path, local, remote, &local.hash)?;
                }
            }
            SyncDecision::UploadLocal | SyncDecision::UploadNew => {
                if let Some(local) = local {
                    let etag = upload_file(
                        &client,
                        &credentials,
                        &remote_folder,
                        &relative_path,
                        &local.path,
                    )
                    .await?;
                    summary.uploaded += 1;
                    upsert_record_with_etag(
                        &cache,
                        &relative_path,
                        local,
                        etag.or_else(|| remote.and_then(|r| r.etag.clone())),
                        remote.and_then(|r| r.modified),
                        remote.and_then(|r| r.size),
                        &local.hash,
                    )?;
                }
            }
            SyncDecision::DownloadRemote | SyncDecision::DownloadNew => {
                if let Some(remote) = remote {
                    let bytes =
                        download_file(&client, &credentials, &remote_folder, &relative_path)
                            .await?;
                    write_local_file(&local_root, &relative_path, &bytes)?;
                    let updated_local = local_file_from_path(&local_root, &relative_path)?;
                    summary.downloaded += 1;
                    upsert_record(
                        &cache,
                        &relative_path,
                        &updated_local,
                        remote,
                        &updated_local.hash,
                    )?;
                }
            }
            SyncDecision::DeleteLocal => {
                delete_local_file(&local_root, &relative_path)?;
                cache.remove_sync_record(&relative_path)?;
                summary.deleted_local += 1;
            }
            SyncDecision::DeleteRemote => {
                delete_remote_file(&client, &credentials, &remote_folder, &relative_path).await?;
                cache.remove_sync_record(&relative_path)?;
                summary.deleted_remote += 1;
            }
            SyncDecision::Conflict => {
                if let (Some(local), Some(remote)) = (local, remote) {
                    let bytes =
                        download_file(&client, &credentials, &remote_folder, &relative_path)
                            .await?;
                    let remote_hash = hash_bytes(&bytes);

                    if remote_hash == local.hash {
                        upsert_record(&cache, &relative_path, local, remote, &local.hash)?;
                        continue;
                    }

                    let conflict_relative =
                        write_conflict_file(&local_root, &relative_path, &bytes)?;
                    let conflict_local = local_file_from_path(&local_root, &conflict_relative)?;
                    let conflict_etag = upload_file(
                        &client,
                        &credentials,
                        &remote_folder,
                        &conflict_relative,
                        &conflict_local.path,
                    )
                    .await?;

                    let uploaded_etag = upload_file(
                        &client,
                        &credentials,
                        &remote_folder,
                        &relative_path,
                        &local.path,
                    )
                    .await?;
                    summary.uploaded += 2;
                    summary.conflicts.push(relative_path.clone());

                    upsert_record_with_etag(
                        &cache,
                        &relative_path,
                        local,
                        uploaded_etag.or_else(|| remote.etag.clone()),
                        remote.modified,
                        remote.size,
                        &local.hash,
                    )?;
                    upsert_record_with_etag(
                        &cache,
                        &conflict_relative,
                        &conflict_local,
                        conflict_etag,
                        None,
                        None,
                        &conflict_local.hash,
                    )?;
                } else if local.is_some() {
                    if let Some(local) = local {
                        let etag = upload_file(
                            &client,
                            &credentials,
                            &remote_folder,
                            &relative_path,
                            &local.path,
                        )
                        .await?;
                        summary.uploaded += 1;
                        summary.conflicts.push(relative_path.clone());
                        upsert_record_with_etag(
                            &cache,
                            &relative_path,
                            local,
                            etag,
                            None,
                            None,
                            &local.hash,
                        )?;
                    }
                } else if let Some(remote) = remote {
                    let bytes =
                        download_file(&client, &credentials, &remote_folder, &relative_path)
                            .await?;
                    let conflict_relative =
                        write_conflict_file(&local_root, &relative_path, &bytes)?;
                    let conflict_local = local_file_from_path(&local_root, &conflict_relative)?;
                    summary.downloaded += 1;
                    summary.conflicts.push(relative_path.clone());
                    upsert_record(
                        &cache,
                        &conflict_relative,
                        &conflict_local,
                        remote,
                        &conflict_local.hash,
                    )?;
                }
            }
        }
    }

    summary.finished_at = Utc::now().to_rfc3339();
    Ok(summary)
}

fn decide_sync_action(
    local_exists: bool,
    remote_exists: bool,
    had_record: bool,
    local_changed: bool,
    remote_changed: bool,
) -> SyncDecision {
    match (
        local_exists,
        remote_exists,
        had_record,
        local_changed,
        remote_changed,
    ) {
        (true, true, false, _, _) => SyncDecision::Conflict,
        (true, true, true, false, false) => SyncDecision::Noop,
        (true, true, true, true, false) => SyncDecision::UploadLocal,
        (true, true, true, false, true) => SyncDecision::DownloadRemote,
        (true, true, true, true, true) => SyncDecision::Conflict,
        (true, false, false, _, _) => SyncDecision::UploadNew,
        (false, true, false, _, _) => SyncDecision::DownloadNew,
        (true, false, true, false, _) => SyncDecision::DeleteLocal,
        (true, false, true, true, _) => SyncDecision::Conflict,
        (false, true, true, _, false) => SyncDecision::DeleteRemote,
        (false, true, true, _, true) => SyncDecision::Conflict,
        (false, false, true, _, _) => SyncDecision::Noop,
        (false, false, false, _, _) => SyncDecision::Noop,
    }
}

async fn resolve_nextcloud_user(
    client: &Client,
    server_url: &str,
    login_name: &str,
    app_password: &str,
) -> Result<OcsUserData, String> {
    let response = client
        .get(join_url(server_url, "/ocs/v1.php/cloud/user?format=json"))
        .basic_auth(login_name, Some(app_password))
        .header("OCS-APIRequest", "true")
        .header("User-Agent", user_agent())
        .send()
        .await
        .map_err(|e| format!("Failed to resolve Nextcloud user: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to resolve Nextcloud user, status {}",
            response.status()
        ));
    }

    let payload: OcsUserResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Nextcloud user response: {}", e))?;

    Ok(payload.ocs.data)
}

async fn ensure_remote_dir(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
) -> Result<(), String> {
    let mut current = String::new();
    for segment in remote_folder.split('/').filter(|s| !s.is_empty()) {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(segment);
        mkcol(client, credentials, &dav_url(credentials, &current)).await?;
    }
    Ok(())
}

async fn ensure_remote_parent(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
    relative_path: &str,
) -> Result<(), String> {
    let Some(parent) = Path::new(relative_path).parent() else {
        return Ok(());
    };
    let parent = normalize_relative_path(parent);
    if parent.is_empty() {
        return Ok(());
    }
    let full_parent = join_relative(remote_folder, &parent);
    let mut current = String::new();
    for segment in full_parent.split('/').filter(|s| !s.is_empty()) {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(segment);
        mkcol(client, credentials, &dav_url(credentials, &current)).await?;
    }
    Ok(())
}

async fn mkcol(client: &Client, credentials: &StoredCredentials, url: &str) -> Result<(), String> {
    let response = client
        .request(webdav_method("MKCOL")?, url)
        .basic_auth(&credentials.login_name, Some(&credentials.app_password))
        .header("User-Agent", user_agent())
        .send()
        .await
        .map_err(|e| format!("Failed to create remote folder: {}", e))?;

    match response.status().as_u16() {
        201 | 405 => Ok(()),
        status => Err(format!("Failed to create remote folder, status {}", status)),
    }
}

async fn list_remote_files(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
) -> Result<HashMap<String, RemoteFile>, String> {
    let mut files = HashMap::new();
    let mut dirs = vec![String::new()];
    let mut seen_dirs = HashSet::new();

    while let Some(dir) = dirs.pop() {
        if !seen_dirs.insert(dir.clone()) {
            continue;
        }

        let remote_path = join_relative(remote_folder, &dir);
        let entries = propfind(
            client,
            credentials,
            remote_folder,
            &dav_url(credentials, &remote_path),
        )
        .await?;

        for entry in entries {
            if entry.relative_path.is_empty() {
                continue;
            }
            if entry.is_dir {
                dirs.push(entry.relative_path.clone());
            } else if should_sync_file(&entry.relative_path) {
                files.insert(entry.relative_path.clone(), entry);
            }
        }
    }

    Ok(files)
}

async fn propfind(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
    url: &str,
) -> Result<Vec<RemoteFile>, String> {
    let response = client
        .request(webdav_method("PROPFIND")?, url)
        .basic_auth(&credentials.login_name, Some(&credentials.app_password))
        .header("Depth", "1")
        .header("Content-Type", "application/xml")
        .header("User-Agent", user_agent())
        .body(PROPFIND_BODY)
        .send()
        .await
        .map_err(|e| format!("Failed to list remote files: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to list remote files, status {}",
            response.status()
        ));
    }

    let xml = response
        .text()
        .await
        .map_err(|e| format!("Failed to read remote file list: {}", e))?;

    parse_multistatus(&xml, credentials, remote_folder)
}

fn parse_multistatus(
    xml: &str,
    credentials: &StoredCredentials,
    remote_folder: &str,
) -> Result<Vec<RemoteFile>, String> {
    let doc = Document::parse(xml).map_err(|e| format!("Invalid WebDAV XML: {}", e))?;
    let mut files = Vec::new();

    for response in doc
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "response")
    {
        let href = response
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == "href")
            .and_then(|node| node.text())
            .unwrap_or_default();

        let Some(relative_path) = href_to_relative_path(href, &credentials.user_id, remote_folder)
        else {
            continue;
        };

        let prop = response
            .descendants()
            .find(|node| node.is_element() && node.tag_name().name() == "prop");

        let is_dir = prop
            .and_then(|prop| {
                prop.descendants()
                    .find(|node| node.is_element() && node.tag_name().name() == "collection")
            })
            .is_some();

        let etag = prop.and_then(|prop| child_text(prop, "getetag"));
        let modified = prop
            .and_then(|prop| child_text(prop, "getlastmodified"))
            .and_then(|value| parse_http_date(&value));
        let size = prop
            .and_then(|prop| child_text(prop, "getcontentlength"))
            .and_then(|value| value.parse::<i64>().ok());

        files.push(RemoteFile {
            relative_path,
            is_dir,
            etag,
            modified,
            size,
        });
    }

    Ok(files)
}

fn child_text(node: roxmltree::Node<'_, '_>, name: &str) -> Option<String> {
    node.descendants()
        .find(|child| child.is_element() && child.tag_name().name() == name)
        .and_then(|child| child.text())
        .map(str::to_string)
}

async fn download_file(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
    relative_path: &str,
) -> Result<Vec<u8>, String> {
    let remote_path = join_relative(remote_folder, relative_path);
    let response = client
        .get(dav_url(credentials, &remote_path))
        .basic_auth(&credentials.login_name, Some(&credentials.app_password))
        .header("User-Agent", user_agent())
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", relative_path, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {}, status {}",
            relative_path,
            response.status()
        ));
    }

    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| format!("Failed to read {}: {}", relative_path, e))
}

async fn upload_file(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
    relative_path: &str,
    local_path: &Path,
) -> Result<Option<String>, String> {
    ensure_remote_parent(client, credentials, remote_folder, relative_path).await?;
    let bytes = fs::read(local_path)
        .map_err(|e| format!("Failed to read local file {}: {}", relative_path, e))?;
    let remote_path = join_relative(remote_folder, relative_path);
    let response = client
        .put(dav_url(credentials, &remote_path))
        .basic_auth(&credentials.login_name, Some(&credentials.app_password))
        .header("User-Agent", user_agent())
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("Failed to upload {}: {}", relative_path, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to upload {}, status {}",
            relative_path,
            response.status()
        ));
    }

    Ok(response
        .headers()
        .get("etag")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string))
}

async fn delete_remote_file(
    client: &Client,
    credentials: &StoredCredentials,
    remote_folder: &str,
    relative_path: &str,
) -> Result<(), String> {
    let remote_path = join_relative(remote_folder, relative_path);
    let response = client
        .delete(dav_url(credentials, &remote_path))
        .basic_auth(&credentials.login_name, Some(&credentials.app_password))
        .header("User-Agent", user_agent())
        .send()
        .await
        .map_err(|e| format!("Failed to delete remote {}: {}", relative_path, e))?;

    match response.status().as_u16() {
        200 | 204 | 404 => Ok(()),
        status => Err(format!(
            "Failed to delete remote {}, status {}",
            relative_path, status
        )),
    }
}

fn list_local_files(local_root: &Path) -> Result<HashMap<String, LocalFile>, String> {
    let mut files = HashMap::new();
    if !local_root.exists() {
        return Ok(files);
    }

    for entry in WalkDir::new(local_root)
        .min_depth(1)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path().to_path_buf();
        let relative_path = path
            .strip_prefix(local_root)
            .map_err(|e| format!("Failed to compute local relative path: {}", e))
            .map(normalize_relative_path)?;

        if !should_sync_file(&relative_path) {
            continue;
        }

        let bytes = fs::read(&path)
            .map_err(|e| format!("Failed to read local file {}: {}", relative_path, e))?;
        let mtime = file_mtime(&path)?;
        files.insert(
            relative_path.clone(),
            LocalFile {
                path,
                hash: hash_bytes(&bytes),
                mtime,
            },
        );
    }

    Ok(files)
}

fn local_file_from_path(local_root: &Path, relative_path: &str) -> Result<LocalFile, String> {
    let path = local_root.join(relative_path);
    let bytes = fs::read(&path)
        .map_err(|e| format!("Failed to read local file {}: {}", relative_path, e))?;
    Ok(LocalFile {
        path,
        hash: hash_bytes(&bytes),
        mtime: file_mtime(&local_root.join(relative_path))?,
    })
}

fn write_local_file(local_root: &Path, relative_path: &str, bytes: &[u8]) -> Result<(), String> {
    let path = local_root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create local folder: {}", e))?;
    }
    fs::write(path, bytes).map_err(|e| format!("Failed to write local file: {}", e))
}

fn delete_local_file(local_root: &Path, relative_path: &str) -> Result<(), String> {
    let path = local_root.join(relative_path);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete local file {}: {}", relative_path, e))?;
    }
    Ok(())
}

fn write_conflict_file(
    local_root: &Path,
    relative_path: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let mut candidate = conflict_relative_path(relative_path, 0);
    let mut counter = 1;
    while local_root.join(&candidate).exists() {
        candidate = conflict_relative_path(relative_path, counter);
        counter += 1;
    }

    let bytes = if relative_path.ends_with(".md") {
        prepare_conflict_note(bytes)
    } else {
        bytes.to_vec()
    };

    write_local_file(local_root, &candidate, &bytes)?;
    Ok(candidate)
}

fn prepare_conflict_note(bytes: &[u8]) -> Vec<u8> {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return bytes.to_vec();
    };
    let parts: Vec<&str> = text.splitn(3, "---").collect();
    if parts.len() != 3 || !parts[0].trim().is_empty() {
        return bytes.to_vec();
    }

    let Ok(mut frontmatter) = serde_yaml::from_str::<serde_yaml::Value>(parts[1].trim()) else {
        return bytes.to_vec();
    };

    if let serde_yaml::Value::Mapping(mapping) = &mut frontmatter {
        mapping.insert(
            serde_yaml::Value::String("id".to_string()),
            serde_yaml::Value::String(Uuid::new_v4().to_string()),
        );
        mapping.insert(
            serde_yaml::Value::String("modified".to_string()),
            serde_yaml::Value::String(Utc::now().to_rfc3339()),
        );
        if let Some(serde_yaml::Value::String(title)) =
            mapping.get_mut(&serde_yaml::Value::String("title".to_string()))
        {
            title.push_str(" (Conflict)");
        }
    }

    let Ok(frontmatter) = serde_yaml::to_string(&frontmatter) else {
        return bytes.to_vec();
    };

    format!("---\n{}---{}", frontmatter, parts[2]).into_bytes()
}

fn conflict_relative_path(relative_path: &str, counter: usize) -> String {
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = Path::new(relative_path);
    let parent = path
        .parent()
        .map(normalize_relative_path)
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "conflict".to_string());
    let extension = path
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let suffix = if counter == 0 {
        format!("conflict-{}", timestamp)
    } else {
        format!("conflict-{}-{}", timestamp, counter)
    };
    let filename = format!("{}.{}{}", stem, suffix, extension);
    if parent.is_empty() {
        filename
    } else {
        format!("{}/{}", parent, filename)
    }
}

fn upsert_record(
    cache: &CacheDb,
    relative_path: &str,
    local: &LocalFile,
    remote: &RemoteFile,
    synced_hash: &str,
) -> Result<(), String> {
    upsert_record_with_etag(
        cache,
        relative_path,
        local,
        remote.etag.clone(),
        remote.modified,
        remote.size,
        synced_hash,
    )
}

fn upsert_record_with_etag(
    cache: &CacheDb,
    relative_path: &str,
    local: &LocalFile,
    remote_etag: Option<String>,
    remote_mtime: Option<i64>,
    remote_size: Option<i64>,
    synced_hash: &str,
) -> Result<(), String> {
    cache.upsert_sync_record(&SyncFileRecord {
        relative_path: relative_path.to_string(),
        local_hash: Some(local.hash.clone()),
        remote_etag,
        last_synced_hash: Some(synced_hash.to_string()),
        local_mtime: Some(local.mtime),
        remote_mtime,
        remote_size,
        synced_at: Utc::now().timestamp(),
    })
}

fn read_sync_status(cache: &CacheDb) -> Result<SyncStatus, String> {
    match cache.get_sync_state(SYNC_STATUS_KEY)? {
        Some(value) => {
            serde_json::from_str(&value).map_err(|e| format!("Failed to parse sync status: {}", e))
        }
        None => Ok(SyncStatus {
            status: "idle".to_string(),
            last_sync_at: None,
            last_error: None,
            conflicts: Vec::new(),
        }),
    }
}

fn write_sync_status(cache: &CacheDb, status: SyncStatus) -> Result<(), String> {
    let value = serde_json::to_string(&status)
        .map_err(|e| format!("Failed to encode sync status: {}", e))?;
    cache.set_sync_state(SYNC_STATUS_KEY, &value)
}

fn store_credentials(profile_id: &str, credentials: &StoredCredentials) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &credential_account(profile_id))
        .map_err(|e| format!("Failed to open credential store: {}", e))?;
    let value = serde_json::to_string(credentials)
        .map_err(|e| format!("Failed to encode Nextcloud credentials: {}", e))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Failed to store Nextcloud credentials: {}", e))
}

fn load_credentials(profile_id: &str) -> Result<StoredCredentials, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &credential_account(profile_id))
        .map_err(|e| format!("Failed to open credential store: {}", e))?;
    let value = entry
        .get_password()
        .map_err(|e| format!("Nextcloud account is not connected: {}", e))?;
    serde_json::from_str(&value)
        .map_err(|e| format!("Failed to decode Nextcloud credentials: {}", e))
}

fn delete_credentials(profile_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &credential_account(profile_id))
        .map_err(|e| format!("Failed to open credential store: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to remove Nextcloud credentials: {}", e)),
    }
}

fn credential_account(profile_id: &str) -> String {
    format!("profile:{}", profile_id)
}

fn default_notes_dir(profile_id: &str) -> Result<PathBuf, String> {
    let dirs = ProjectDirs::from("", "", "noteban")
        .ok_or("Could not determine app data directory".to_string())?;
    Ok(dirs
        .data_dir()
        .join("profiles")
        .join(profile_id)
        .join("notes"))
}

fn normalize_server_url(server_url: &str) -> Result<String, String> {
    let trimmed = server_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Nextcloud server URL cannot be empty".to_string());
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    Url::parse(&with_scheme).map_err(|e| format!("Invalid Nextcloud server URL: {}", e))?;
    Ok(with_scheme)
}

fn normalize_remote_folder(remote_folder: Option<String>) -> String {
    let folder = remote_folder
        .unwrap_or_else(|| DEFAULT_REMOTE_FOLDER.to_string())
        .trim()
        .trim_matches('/')
        .to_string();
    if folder.is_empty() {
        DEFAULT_REMOTE_FOLDER.to_string()
    } else {
        folder
    }
}

fn join_url(server_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        server_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn dav_url(credentials: &StoredCredentials, remote_path: &str) -> String {
    let user = encode_path(&credentials.user_id);
    let path = encode_path(remote_path.trim_matches('/'));
    if path.is_empty() {
        join_url(
            &credentials.server_url,
            &format!("/remote.php/dav/files/{}", user),
        )
    } else {
        join_url(
            &credentials.server_url,
            &format!("/remote.php/dav/files/{}/{}", user, path),
        )
    }
}

fn encode_path(path: &str) -> String {
    path.split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn href_to_relative_path(href: &str, user_id: &str, remote_folder: &str) -> Option<String> {
    let path = if href.starts_with("http://") || href.starts_with("https://") {
        Url::parse(href).ok()?.path().to_string()
    } else {
        href.to_string()
    };
    let decoded = urlencoding::decode(&path).ok()?.into_owned();
    let marker = format!("/remote.php/dav/files/{}/", user_id);
    let idx = decoded.find(&marker)?;
    let after_user = decoded[idx + marker.len()..].trim_matches('/');
    let folder = remote_folder.trim_matches('/');

    if after_user == folder {
        return Some(String::new());
    }

    let prefix = format!("{}/", folder);
    let raw = after_user
        .strip_prefix(&prefix)
        .map(|path| path.trim_matches('/').to_string())?;

    // Strip any `..` / root components so a malicious or compromised
    // WebDAV server cannot return paths that escape `local_root` when
    // joined for write_local_file / delete_local_file.
    let normalized = normalize_relative_path(&raw);
    if normalized.is_empty() && !raw.is_empty() {
        // Path consisted entirely of traversal components; reject it.
        None
    } else {
        Some(normalized)
    }
}

fn join_relative(first: &str, second: &str) -> String {
    let first = first.trim_matches('/');
    let second = second.trim_matches('/');
    match (first.is_empty(), second.is_empty()) {
        (true, true) => String::new(),
        (true, false) => second.to_string(),
        (false, true) => first.to_string(),
        (false, false) => format!("{}/{}", first, second),
    }
}

fn normalize_relative_path(path: impl AsRef<Path>) -> String {
    path.as_ref()
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn should_sync_file(relative_path: &str) -> bool {
    relative_path.ends_with(".md")
        || relative_path
            .split('/')
            .any(|segment| segment.ends_with(".attachments"))
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn file_mtime(path: &Path) -> Result<i64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    system_time_to_timestamp(
        metadata
            .modified()
            .map_err(|e| format!("Failed to read modification time: {}", e))?,
    )
}

fn system_time_to_timestamp(time: SystemTime) -> Result<i64, String> {
    Ok(time
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid modification time".to_string())?
        .as_secs() as i64)
}

fn parse_http_date(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc2822(value)
        .map(|date| date.timestamp())
        .ok()
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(user_agent())
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

fn webdav_method(method: &'static str) -> Result<Method, String> {
    Method::from_bytes(method.as_bytes()).map_err(|e| format!("Invalid HTTP method: {}", e))
}

fn user_agent() -> &'static str {
    concat!("Noteban/", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_credentials() -> StoredCredentials {
        StoredCredentials {
            server_url: "https://cloud.example.com".to_string(),
            login_name: "alice@example.com".to_string(),
            app_password: "secret".to_string(),
            user_id: "alice".to_string(),
        }
    }

    #[test]
    fn normalizes_server_urls() {
        assert_eq!(
            normalize_server_url("cloud.example.com/").unwrap(),
            "https://cloud.example.com"
        );
        assert_eq!(
            normalize_server_url("https://cloud.example.com/nextcloud/").unwrap(),
            "https://cloud.example.com/nextcloud"
        );
    }

    #[test]
    fn maps_href_to_relative_path() {
        assert_eq!(
            href_to_relative_path(
                "/remote.php/dav/files/alice/Noteban/folder/note%201.md",
                "alice",
                "Noteban"
            ),
            Some("folder/note 1.md".to_string())
        );
    }

    #[test]
    fn href_to_relative_path_rejects_traversal() {
        // A malicious server sneaks ../ into the href. normalize_relative_path
        // strips the traversal components so the resulting local path can
        // never escape the notes directory.
        assert_eq!(
            href_to_relative_path(
                "/remote.php/dav/files/alice/Noteban/..%2F..%2Fsecret.txt",
                "alice",
                "Noteban"
            ),
            Some("secret.txt".to_string())
        );
        // Path consisting entirely of traversal components is rejected
        // outright so we never write to an empty/root-relative location.
        assert_eq!(
            href_to_relative_path(
                "/remote.php/dav/files/alice/Noteban/..%2F..",
                "alice",
                "Noteban"
            ),
            None
        );
    }

    #[test]
    fn parses_webdav_multistatus() {
        let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteban/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteban/todo.md</d:href>
    <d:propstat><d:prop><d:getetag>"abc"</d:getetag><d:getcontentlength>12</d:getcontentlength></d:prop></d:propstat>
  </d:response>
</d:multistatus>"#;
        let files = parse_multistatus(xml, &test_credentials(), "Noteban").unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].relative_path, "");
        assert!(files[0].is_dir);
        assert_eq!(files[1].relative_path, "todo.md");
        assert_eq!(files[1].etag.as_deref(), Some("\"abc\""));
    }

    #[test]
    fn decides_sync_actions() {
        assert_eq!(
            decide_sync_action(true, true, true, false, false),
            SyncDecision::Noop
        );
        assert_eq!(
            decide_sync_action(true, true, true, true, false),
            SyncDecision::UploadLocal
        );
        assert_eq!(
            decide_sync_action(true, true, true, true, true),
            SyncDecision::Conflict
        );
        assert_eq!(
            decide_sync_action(true, false, true, false, false),
            SyncDecision::DeleteLocal
        );
        assert_eq!(
            decide_sync_action(false, true, true, false, true),
            SyncDecision::Conflict
        );
    }

    #[test]
    fn rewrites_conflict_note_identity() {
        let original = br#"---
id: original
title: Test
created: "2024-01-01T00:00:00Z"
modified: "2024-01-01T00:00:00Z"
column: todo
tags: []
order: 0
---

Body"#;
        let rewritten = String::from_utf8(prepare_conflict_note(original)).unwrap();
        assert!(rewritten.contains("title: Test (Conflict)"));
        assert!(!rewritten.contains("id: original"));
    }
}
