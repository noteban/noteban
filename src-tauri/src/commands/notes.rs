use crate::cache::CacheDb;
use crate::lock_or_err;
use crate::utils::{compute_content_hash, extract_inline_tags};
use crate::AppState;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFrontmatter {
    pub id: String,
    pub title: String,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    pub column: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub frontmatter: NoteFrontmatter,
    pub content: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub path: String,
    pub name: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotesWithFolders {
    pub notes: Vec<Note>,
    pub folders: Vec<Folder>,
}

#[derive(Debug, Deserialize)]
pub struct CreateNoteInput {
    pub notes_dir: String,
    pub folder_path: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub date: Option<String>,
    pub column: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNoteInput {
    pub file_path: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub date: Option<String>,
    pub column: Option<String>,
    pub tags: Option<Vec<String>>,
    pub order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteWithTags {
    pub note: Note,
    pub inline_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotesWithTagsAndFolders {
    pub notes: Vec<NoteWithTags>,
    pub folders: Vec<Folder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub event_type: String, // "create", "modify", "remove"
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncrementalUpdateResult {
    pub updated_notes: Vec<NoteWithTags>,
    pub removed_paths: Vec<String>,
}

/// Record a file write for self-save detection
fn record_write(file_path: &str, state: &State<AppState>) {
    let mut writes = match state.recent_writes.lock() {
        Ok(w) => w,
        Err(_) => {
            log::warn!("Failed to acquire recent_writes lock");
            return;
        }
    };

    // Cap at 1000 entries to prevent memory issues
    if writes.len() >= 1000 {
        // Remove oldest entries
        let cutoff = Instant::now() - Duration::from_secs(5);
        writes.retain(|_, time| *time > cutoff);

        // If still over limit, clear oldest half
        if writes.len() >= 1000 {
            let mut entries: Vec<_> = writes.drain().collect();
            entries.sort_by(|a, b| b.1.cmp(&a.1));
            entries.truncate(500);
            writes.extend(entries);
        }
    }

    writes.insert(file_path.to_string(), Instant::now());

    // Cleanup old entries (older than 5 seconds)
    writes.retain(|_, time| time.elapsed() < Duration::from_secs(5));
}

/// Check if a file was recently written by us
fn is_recent_write(file_path: &str, state: &State<AppState>) -> bool {
    let writes = match state.recent_writes.lock() {
        Ok(w) => w,
        Err(_) => return false, // Assume not recent if lock fails
    };
    if let Some(write_time) = writes.get(file_path) {
        write_time.elapsed() < Duration::from_secs(2)
    } else {
        false
    }
}

/// Get file modification time as unix timestamp
fn get_file_mtime(path: &PathBuf) -> Result<i64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let mtime = metadata
        .modified()
        .map_err(|_| "Failed to get mtime".to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid mtime".to_string())?
        .as_secs() as i64;
    Ok(mtime)
}

/// Atomically write content to a file using a temp file and rename
fn atomic_write(path: &PathBuf, content: &str) -> Result<(), String> {
    let temp_path = path.with_extension(format!("md.tmp.{}", Uuid::new_v4()));

    // Write to temporary file
    fs::write(&temp_path, content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Atomically rename temp to target
    fs::rename(&temp_path, path).map_err(|e| {
        // Clean up temp file on failure
        let _ = fs::remove_file(&temp_path);
        format!("Failed to rename temp file: {}", e)
    })
}

/// Validate that a path is within the base directory (prevents symlink attacks)
fn validate_path_within_base(path: &PathBuf, base: &PathBuf) -> Result<PathBuf, String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base path: {}", e))?;

    if !canonical_path.starts_with(&canonical_base) {
        return Err("Path is outside notes directory".to_string());
    }

    Ok(canonical_path)
}

/// Sanitize a single tag to only allow safe characters
fn sanitize_tag(tag: &str) -> String {
    tag.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '/')
        .collect::<String>()
        .trim_matches(|c| c == '-' || c == '_')
        .to_string()
}

/// Sanitize a list of tags
fn sanitize_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|t| sanitize_tag(&t))
        .filter(|t| !t.is_empty())
        .collect()
}

fn parse_note(file_path: &PathBuf) -> Result<Note, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Split frontmatter from content
    let parts: Vec<&str> = content.splitn(3, "---").collect();

    if parts.len() < 3 {
        return Err("Invalid note format: missing frontmatter".to_string());
    }

    let frontmatter_str = parts[1].trim();
    let note_content = parts[2].trim().to_string();

    let frontmatter: NoteFrontmatter = serde_yaml::from_str(frontmatter_str)
        .map_err(|e| format!("Failed to parse frontmatter: {}", e))?;

    Ok(Note {
        frontmatter,
        content: note_content,
        file_path: file_path.to_string_lossy().to_string(),
    })
}

fn serialize_note(frontmatter: &NoteFrontmatter, content: &str) -> String {
    let frontmatter_str = serde_yaml::to_string(frontmatter)
        .unwrap_or_default();

    format!("---\n{}---\n\n{}", frontmatter_str, content)
}

fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

#[tauri::command]
pub fn list_notes(notes_dir: String) -> Result<NotesWithFolders, String> {
    let base_path = PathBuf::from(&notes_dir);

    if !base_path.exists() {
        fs::create_dir_all(&base_path)
            .map_err(|e| format!("Failed to create notes directory: {}", e))?;
        return Ok(NotesWithFolders {
            notes: vec![],
            folders: vec![],
        });
    }

    let mut notes = Vec::new();
    let mut folders = Vec::new();

    for entry in WalkDir::new(&base_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            // Skip .attachments directories
            !e.file_name()
                .to_str()
                .map(|s| s.ends_with(".attachments"))
                .unwrap_or(false)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let relative = path
            .strip_prefix(&base_path)
            .map_err(|e| format!("Failed to get relative path: {}", e))?;

        if path.is_dir() {
            folders.push(Folder {
                path: path.to_string_lossy().to_string(),
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                relative_path: relative.to_string_lossy().to_string(),
            });
        } else if path.extension().map_or(false, |ext| ext == "md") {
            match parse_note(&path.to_path_buf()) {
                Ok(note) => notes.push(note),
                Err(e) => log::warn!("Skipping invalid note {:?}: {}", path, e),
            }
        }
    }

    // Sort by modified date (newest first)
    notes.sort_by(|a, b| b.frontmatter.modified.cmp(&a.frontmatter.modified));
    // Sort folders alphabetically by relative path
    folders.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(NotesWithFolders { notes, folders })
}

#[tauri::command]
pub fn read_note(file_path: String) -> Result<Note, String> {
    let path = PathBuf::from(&file_path);
    parse_note(&path)
}

#[tauri::command]
pub fn create_note(input: CreateNoteInput, state: State<AppState>) -> Result<NoteWithTags, String> {
    let now = Utc::now();
    let id = Uuid::new_v4().to_string();

    let tags = sanitize_tags(input.tags.clone().unwrap_or_default());

    let frontmatter = NoteFrontmatter {
        id: id.clone(),
        title: input.title.clone(),
        created: now,
        modified: now,
        date: input.date,
        column: input.column.unwrap_or_else(|| "todo".to_string()),
        tags,
        order: 0,
    };

    let content = input.content.unwrap_or_default();
    let file_content = serialize_note(&frontmatter, &content);

    // Determine target directory (root or subfolder)
    let target_dir = match &input.folder_path {
        Some(folder) => PathBuf::from(&input.notes_dir).join(folder),
        None => PathBuf::from(&input.notes_dir),
    };

    // Ensure directory exists
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create notes directory: {}", e))?;

    // Generate filename from title, handling duplicates
    let base_slug = slugify(&input.title);
    let mut filename = format!("{}.md", base_slug);
    let mut file_path = target_dir.join(&filename);

    // If file exists, add a number suffix
    let mut counter = 1;
    while file_path.exists() {
        filename = format!("{}-{}.md", base_slug, counter);
        file_path = target_dir.join(&filename);
        counter += 1;
    }

    let file_path_str = file_path.to_string_lossy().to_string();

    // Record write for self-save detection
    record_write(&file_path_str, &state);

    atomic_write(&file_path, &file_content)?;

    let note = Note {
        frontmatter,
        content,
        file_path: file_path_str.clone(),
    };

    // Extract inline tags for cache and return value
    let inline_tags = extract_inline_tags(&note.content);

    // Update cache
    if let Ok(cache_lock) = state.cache.lock() {
        if let Some(cache) = cache_lock.as_ref() {
            let hash = compute_content_hash(&file_content);
            let mtime = get_file_mtime(&file_path).unwrap_or(0);
            if let Err(e) = cache.upsert_note(&note, &hash, mtime, &inline_tags) {
                log::warn!("Cache update failed for new note: {}", e);
            }
        }
    }

    Ok(NoteWithTags { note, inline_tags })
}

#[tauri::command]
pub fn update_note(input: UpdateNoteInput, state: State<AppState>) -> Result<NoteWithTags, String> {
    let path = PathBuf::from(&input.file_path);
    let mut note = parse_note(&path)?;
    let mut current_path = path.clone();
    let old_file_path = input.file_path.clone();

    // Check if title is changing and rename file if needed
    let title_changed = input.title.as_ref().map_or(false, |new_title| {
        new_title != &note.frontmatter.title
    });

    // Update frontmatter fields
    if let Some(title) = input.title {
        note.frontmatter.title = title;
    }
    if let Some(date) = input.date {
        note.frontmatter.date = Some(date);
    }
    if let Some(column) = input.column {
        note.frontmatter.column = column;
    }
    if let Some(tags) = input.tags {
        note.frontmatter.tags = sanitize_tags(tags);
    }
    if let Some(order) = input.order {
        note.frontmatter.order = order;
    }
    if let Some(content) = input.content {
        note.content = content;
    }

    // Update modified timestamp
    note.frontmatter.modified = Utc::now();

    // Rename file if title changed
    if title_changed {
        if let Some(parent) = path.parent() {
            // Get old attachments folder path
            let old_stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let old_attachments = parent.join(format!("{}.attachments", old_stem));

            let base_slug = slugify(&note.frontmatter.title);
            let mut new_filename = format!("{}.md", base_slug);
            let mut new_path = parent.join(&new_filename);
            let mut new_stem = base_slug.clone();

            // Handle duplicates (but skip if it's the same file)
            let mut counter = 1;
            while new_path.exists() && new_path != path {
                new_stem = format!("{}-{}", base_slug, counter);
                new_filename = format!("{}.md", new_stem);
                new_path = parent.join(&new_filename);
                counter += 1;
            }

            // Only rename if the new path is different
            if new_path != path {
                let new_attachments = parent.join(format!("{}.attachments", new_stem));
                let mut attachments_renamed = false;

                // Record both old and new paths
                record_write(&path.to_string_lossy(), &state);
                record_write(&new_path.to_string_lossy(), &state);

                // Rename attachments first (if any) to avoid partial state
                if old_attachments.exists() && old_attachments.is_dir() {
                    if new_attachments.exists() {
                        return Err("Attachments folder already exists".to_string());
                    }
                    fs::rename(&old_attachments, &new_attachments)
                        .map_err(|e| format!("Failed to rename attachments folder: {}", e))?;
                    attachments_renamed = true;
                }

                if let Err(e) = fs::rename(&path, &new_path) {
                    if attachments_renamed {
                        let _ = fs::rename(&new_attachments, &old_attachments);
                    }
                    return Err(format!("Failed to rename note: {}", e));
                }
                current_path = new_path;

                // Remove old path from cache
                if let Ok(cache_lock) = state.cache.lock() {
                    if let Some(cache) = cache_lock.as_ref() {
                        if let Err(e) = cache.remove_note(&old_file_path) {
                            log::warn!("Cache remove failed for renamed note: {}", e);
                        }
                    }
                }
            }
        }
    }

    let file_content = serialize_note(&note.frontmatter, &note.content);
    let current_path_str = current_path.to_string_lossy().to_string();

    // Record write for self-save detection
    record_write(&current_path_str, &state);

    atomic_write(&current_path, &file_content)?;

    note.file_path = current_path_str.clone();

    // Extract inline tags for cache and return value
    let inline_tags = extract_inline_tags(&note.content);

    // Update cache
    if let Ok(cache_lock) = state.cache.lock() {
        if let Some(cache) = cache_lock.as_ref() {
            let hash = compute_content_hash(&file_content);
            let mtime = get_file_mtime(&current_path).unwrap_or(0);
            if let Err(e) = cache.upsert_note(&note, &hash, mtime, &inline_tags) {
                log::warn!("Cache update failed for note: {}", e);
            }
        }
    }

    Ok(NoteWithTags { note, inline_tags })
}

#[tauri::command]
pub fn delete_note(file_path: String, state: State<AppState>) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Get the attachments folder path
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let attachments = path
        .parent()
        .map(|p| p.join(format!("{}.attachments", stem)));

    // Record write for self-save detection
    record_write(&file_path, &state);

    // Delete the note file
    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete note: {}", e))?;

    // Delete the attachments folder if it exists
    if let Some(attach_path) = attachments {
        if attach_path.exists() && attach_path.is_dir() {
            fs::remove_dir_all(&attach_path)
                .map_err(|e| format!("Failed to delete attachments folder: {}", e))?;
        }
    }

    // Remove from cache
    if let Ok(cache_lock) = state.cache.lock() {
        if let Some(cache) = cache_lock.as_ref() {
            if let Err(e) = cache.remove_note(&file_path) {
                log::warn!("Cache remove failed for deleted note: {}", e);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn create_folder(
    notes_dir: String,
    folder_name: String,
    parent_path: Option<String>,
) -> Result<Folder, String> {
    let base = PathBuf::from(&notes_dir);
    let target = match parent_path {
        Some(parent) => base.join(parent).join(&folder_name),
        None => base.join(&folder_name),
    };

    if target.exists() {
        return Err("Folder already exists".to_string());
    }

    fs::create_dir_all(&target).map_err(|e| format!("Failed to create folder: {}", e))?;

    let relative = target
        .strip_prefix(&base)
        .map_err(|e| format!("Failed to get relative path: {}", e))?;

    Ok(Folder {
        path: target.to_string_lossy().to_string(),
        name: folder_name,
        relative_path: relative.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn rename_folder(old_path: String, new_name: String) -> Result<Folder, String> {
    let old = PathBuf::from(&old_path);
    if !old.exists() || !old.is_dir() {
        return Err("Folder does not exist".to_string());
    }

    let new = old
        .parent()
        .ok_or("Cannot rename root folder")?
        .join(&new_name);

    if new.exists() {
        return Err("A folder with that name already exists".to_string());
    }

    fs::rename(&old, &new).map_err(|e| format!("Failed to rename folder: {}", e))?;

    Ok(Folder {
        path: new.to_string_lossy().to_string(),
        name: new_name,
        relative_path: new
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub fn delete_folder(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);
    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete folder: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn move_note(file_path: String, target_folder: String, state: State<AppState>) -> Result<Note, String> {
    let source = PathBuf::from(&file_path);
    if !source.exists() {
        return Err("Note does not exist".to_string());
    }

    let target_dir = PathBuf::from(&target_folder);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create target folder: {}", e))?;
    }

    let file_name = source.file_name().ok_or("Invalid file name")?;
    let destination = target_dir.join(file_name);

    // Get the source attachments folder (note-name.attachments)
    let source_stem = source
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let source_attachments = source
        .parent()
        .map(|p| p.join(format!("{}.attachments", source_stem)));

    // Handle name collision
    let mut final_dest = destination.clone();
    let mut final_stem = source_stem.clone();
    let mut counter = 1;
    while final_dest.exists() {
        final_stem = format!("{}-{}", source_stem, counter);
        final_dest = target_dir.join(format!("{}.md", final_stem));
        counter += 1;
    }

    // Record writes for self-save detection
    record_write(&file_path, &state);
    record_write(&final_dest.to_string_lossy(), &state);

    // Move the attachments folder if it exists
    let mut attachments_moved = false;
    let dest_attachments = target_dir.join(format!("{}.attachments", final_stem));
    if let Some(src_attach) = source_attachments {
        if src_attach.exists() && src_attach.is_dir() {
            if dest_attachments.exists() {
                return Err("Attachments folder already exists".to_string());
            }
            fs::rename(&src_attach, &dest_attachments)
                .map_err(|e| format!("Failed to move attachments folder: {}", e))?;
            attachments_moved = true;
        }
    }

    // Move the note file
    if let Err(e) = fs::rename(&source, &final_dest) {
        if attachments_moved {
            let rollback = source
                .parent()
                .map(|p| p.join(format!("{}.attachments", source_stem)));
            if let Some(rollback_path) = rollback {
                let _ = fs::rename(&dest_attachments, &rollback_path);
            }
        }
        return Err(format!("Failed to move note: {}", e));
    }

    // Remove old path from cache
    if let Ok(cache_lock) = state.cache.lock() {
        if let Some(cache) = cache_lock.as_ref() {
            if let Err(e) = cache.remove_note(&file_path) {
                log::warn!("Cache remove failed for moved note: {}", e);
            }
        }
    }

    let note = parse_note(&final_dest)?;

    // Add new path to cache
    if let Ok(cache_lock) = state.cache.lock() {
        if let Some(cache) = cache_lock.as_ref() {
            let content = fs::read_to_string(&final_dest).unwrap_or_else(|_| note.content.clone());
            let hash = compute_content_hash(&content);
            let mtime = get_file_mtime(&final_dest).unwrap_or(0);
            let inline_tags = extract_inline_tags(&note.content);
            if let Err(e) = cache.upsert_note(&note, &hash, mtime, &inline_tags) {
                log::warn!("Cache update failed for moved note: {}", e);
            }
        }
    }

    Ok(note)
}

#[tauri::command]
pub fn initialize_cache(profile_id: String, state: State<AppState>) -> Result<(), String> {
    let cache = CacheDb::new(&profile_id)?;

    // Verify integrity and rebuild if corrupt
    if !cache.verify_integrity().unwrap_or(false) {
        log::warn!("Cache integrity check failed, invalidating...");
        cache.invalidate_all()?;
    }

    let mut cache_lock = lock_or_err(&state.cache)?;
    *cache_lock = Some(cache);
    Ok(())
}

#[tauri::command]
pub fn list_notes_cached(
    notes_dir: String,
    state: State<AppState>,
) -> Result<NotesWithTagsAndFolders, String> {
    let base_path = PathBuf::from(&notes_dir);

    if !base_path.exists() {
        fs::create_dir_all(&base_path)
            .map_err(|e| format!("Failed to create notes directory: {}", e))?;
        return Ok(NotesWithTagsAndFolders {
            notes: vec![],
            folders: vec![],
        });
    }

    let cache_lock = lock_or_err(&state.cache)?;
    let cache = cache_lock.as_ref();

    let mut notes = Vec::new();
    let mut folders = Vec::new();
    let mut seen_paths = HashSet::new();

    for entry in WalkDir::new(&base_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            !e.file_name()
                .to_str()
                .map(|s| s.ends_with(".attachments"))
                .unwrap_or(false)
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let relative = path
            .strip_prefix(&base_path)
            .map_err(|e| format!("Failed to get relative path: {}", e))?;

        if path.is_dir() {
            folders.push(Folder {
                path: path.to_string_lossy().to_string(),
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                relative_path: relative.to_string_lossy().to_string(),
            });
        } else if path.extension().map_or(false, |ext| ext == "md") {
            let file_path_str = path.to_string_lossy().to_string();
            seen_paths.insert(file_path_str.clone());

            let path_buf = path.to_path_buf();
            let mtime = get_file_mtime(&path_buf)?;

            // Check cache first
            if let Some(c) = cache {
                if !c.needs_update(&file_path_str, mtime) {
                    if let Ok(Some(cached)) = c.get_note(&file_path_str) {
                        notes.push(NoteWithTags {
                            note: cached.note,
                            inline_tags: cached.inline_tags,
                        });
                        continue;
                    }
                }
            }

            // Parse and cache
            match parse_note(&path_buf) {
                Ok(note) => {
                    let inline_tags = extract_inline_tags(&note.content);

                    if let Some(c) = cache {
                        let content =
                            fs::read_to_string(&path_buf).unwrap_or_else(|_| note.content.clone());
                        let hash = compute_content_hash(&content);
                        if let Err(e) = c.upsert_note(&note, &hash, mtime, &inline_tags) {
                            log::warn!("Cache update failed during list: {}", e);
                        }
                    }

                    notes.push(NoteWithTags { note, inline_tags });
                }
                Err(e) => log::warn!("Skipping invalid note {:?}: {}", path, e),
            }
        }
    }

    // Remove stale cache entries
    if let Some(c) = cache {
        if let Err(e) = c.remove_notes_not_in(&seen_paths) {
            log::warn!("Failed to remove stale cache entries: {}", e);
        }
    }

    // Sort by modified date (newest first)
    notes.sort_by(|a, b| b.note.frontmatter.modified.cmp(&a.note.frontmatter.modified));
    folders.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(NotesWithTagsAndFolders { notes, folders })
}

#[tauri::command]
pub fn process_file_changes(
    notes_dir: String,
    changes: Vec<FileChangeEvent>,
    state: State<AppState>,
) -> Result<IncrementalUpdateResult, String> {
    let base_path = PathBuf::from(&notes_dir);
    let cache_lock = lock_or_err(&state.cache)?;
    let cache = cache_lock.as_ref();

    let mut updated_notes = Vec::new();
    let mut removed_paths = Vec::new();

    for change in changes {
        // Skip self-initiated writes
        if is_recent_write(&change.file_path, &state) {
            log::debug!("Skipping self-initiated change: {}", change.file_path);
            continue;
        }

        match change.event_type.as_str() {
            "remove" => {
                if let Some(c) = cache {
                    if let Err(e) = c.remove_note(&change.file_path) {
                        log::warn!("Cache remove failed for file change: {}", e);
                    }
                }
                removed_paths.push(change.file_path);
            }
            "create" | "modify" => {
                let path = PathBuf::from(&change.file_path);

                // Skip if not a markdown file or doesn't exist
                if !path.exists() || !path.extension().map_or(false, |e| e == "md") {
                    continue;
                }

                // Skip files outside notes directory (with symlink protection)
                if validate_path_within_base(&path, &base_path).is_err() {
                    log::warn!("Skipping file outside notes directory: {}", change.file_path);
                    continue;
                }

                let mtime = match get_file_mtime(&path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                // Check if we need to update
                if let Some(c) = cache {
                    if !c.needs_update(&change.file_path, mtime) {
                        continue;
                    }
                }

                match parse_note(&path) {
                    Ok(note) => {
                        let inline_tags = extract_inline_tags(&note.content);

                        if let Some(c) = cache {
                            let content = fs::read_to_string(&path)
                                .unwrap_or_else(|_| note.content.clone());
                            let hash = compute_content_hash(&content);
                            if let Err(e) = c.upsert_note(&note, &hash, mtime, &inline_tags) {
                                log::warn!("Cache update failed for file change: {}", e);
                            }
                        }

                        updated_notes.push(NoteWithTags {
                            note,
                            inline_tags,
                        });
                    }
                    Err(e) => log::warn!("Failed to parse {}: {}", change.file_path, e),
                }
            }
            _ => {}
        }
    }

    Ok(IncrementalUpdateResult {
        updated_notes,
        removed_paths,
    })
}
