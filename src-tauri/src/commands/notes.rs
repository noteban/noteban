use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

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

#[derive(Debug, Deserialize)]
pub struct CreateNoteInput {
    pub notes_dir: String,
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
pub fn list_notes(notes_dir: String) -> Result<Vec<Note>, String> {
    let path = PathBuf::from(&notes_dir);

    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create notes directory: {}", e))?;
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut notes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "md") {
            match parse_note(&file_path) {
                Ok(note) => notes.push(note),
                Err(e) => log::warn!("Skipping invalid note {:?}: {}", file_path, e),
            }
        }
    }

    // Sort by modified date (newest first)
    notes.sort_by(|a, b| b.frontmatter.modified.cmp(&a.frontmatter.modified));

    Ok(notes)
}

#[tauri::command]
pub fn read_note(file_path: String) -> Result<Note, String> {
    let path = PathBuf::from(&file_path);
    parse_note(&path)
}

#[tauri::command]
pub fn create_note(input: CreateNoteInput) -> Result<Note, String> {
    let now = Utc::now();
    let id = Uuid::new_v4().to_string();

    let frontmatter = NoteFrontmatter {
        id: id.clone(),
        title: input.title.clone(),
        created: now,
        modified: now,
        date: input.date,
        column: input.column.unwrap_or_else(|| "todo".to_string()),
        tags: input.tags.unwrap_or_default(),
        order: 0,
    };

    let content = input.content.unwrap_or_default();
    let file_content = serialize_note(&frontmatter, &content);

    // Generate filename from title, handling duplicates
    let base_slug = slugify(&input.title);
    let mut filename = format!("{}.md", base_slug);
    let mut file_path = PathBuf::from(&input.notes_dir).join(&filename);

    // Ensure directory exists
    fs::create_dir_all(&input.notes_dir)
        .map_err(|e| format!("Failed to create notes directory: {}", e))?;

    // If file exists, add a number suffix
    let mut counter = 1;
    while file_path.exists() {
        filename = format!("{}-{}.md", base_slug, counter);
        file_path = PathBuf::from(&input.notes_dir).join(&filename);
        counter += 1;
    }

    fs::write(&file_path, file_content)
        .map_err(|e| format!("Failed to write note: {}", e))?;

    Ok(Note {
        frontmatter,
        content,
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn update_note(input: UpdateNoteInput) -> Result<Note, String> {
    let path = PathBuf::from(&input.file_path);
    let mut note = parse_note(&path)?;
    let mut current_path = path.clone();

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
        note.frontmatter.tags = tags;
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
            let base_slug = slugify(&note.frontmatter.title);
            let mut new_filename = format!("{}.md", base_slug);
            let mut new_path = parent.join(&new_filename);

            // Handle duplicates (but skip if it's the same file)
            let mut counter = 1;
            while new_path.exists() && new_path != path {
                new_filename = format!("{}-{}.md", base_slug, counter);
                new_path = parent.join(&new_filename);
                counter += 1;
            }

            // Only rename if the new path is different
            if new_path != path {
                fs::rename(&path, &new_path)
                    .map_err(|e| format!("Failed to rename note: {}", e))?;
                current_path = new_path;
            }
        }
    }

    let file_content = serialize_note(&note.frontmatter, &note.content);

    fs::write(&current_path, file_content)
        .map_err(|e| format!("Failed to write note: {}", e))?;

    note.file_path = current_path.to_string_lossy().to_string();

    Ok(note)
}

#[tauri::command]
pub fn delete_note(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err("Note file does not exist".to_string());
    }

    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete note: {}", e))?;

    Ok(())
}
