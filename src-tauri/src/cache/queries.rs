use super::db::CacheDb;
use crate::commands::notes::{Note, NoteFrontmatter};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct CachedNote {
    pub note: Note,
    pub inline_tags: Vec<String>,
}

impl CacheDb {
    /// Check if a file needs re-parsing based on mtime
    pub fn needs_update(&self, file_path: &str, current_mtime: i64) -> bool {
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(_) => return true, // Assume update needed if lock fails
        };
        let result: Result<i64, _> = conn.query_row(
            "SELECT file_mtime FROM notes WHERE file_path = ?",
            [file_path],
            |row| row.get(0),
        );

        match result {
            Ok(cached_mtime) => cached_mtime != current_mtime,
            Err(_) => true, // Not in cache, needs parsing
        }
    }

    /// Get a cached note by file path
    pub fn get_note(&self, file_path: &str) -> Result<Option<CachedNote>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        let note_result = conn.query_row(
            "SELECT id, file_path, title, created, modified, date, column_name, order_num, content
             FROM notes WHERE file_path = ?",
            [file_path],
            |row| {
                let id: String = row.get(0)?;
                let file_path: String = row.get(1)?;
                let title: String = row.get(2)?;
                let created: String = row.get(3)?;
                let modified: String = row.get(4)?;
                let date: Option<String> = row.get(5)?;
                let column: String = row.get(6)?;
                let order: i32 = row.get(7)?;
                let content: String = row.get(8)?;

                Ok(Note {
                    frontmatter: NoteFrontmatter {
                        id,
                        title,
                        created: DateTime::parse_from_rfc3339(&created)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        modified: DateTime::parse_from_rfc3339(&modified)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        date,
                        column,
                        tags: Vec::new(), // Will be populated below
                        order,
                    },
                    content,
                    file_path,
                })
            },
        );

        match note_result {
            Ok(mut note) => {
                // Get frontmatter tags
                let mut stmt = conn
                    .prepare(
                        "SELECT t.name FROM tags t
                         JOIN note_tags nt ON t.id = nt.tag_id
                         WHERE nt.note_id = ? AND nt.source = 'frontmatter'",
                    )
                    .map_err(|e| format!("Failed to prepare tags query: {}", e))?;

                let frontmatter_tags: Vec<String> = stmt
                    .query_map([&note.frontmatter.id], |row| row.get(0))
                    .map_err(|e| format!("Failed to query frontmatter tags: {}", e))?
                    .filter_map(|r| r.ok())
                    .collect();

                note.frontmatter.tags = frontmatter_tags;

                // Get inline tags
                let mut stmt = conn
                    .prepare(
                        "SELECT t.name FROM tags t
                         JOIN note_tags nt ON t.id = nt.tag_id
                         WHERE nt.note_id = ? AND nt.source = 'inline'",
                    )
                    .map_err(|e| format!("Failed to prepare inline tags query: {}", e))?;

                let inline_tags: Vec<String> = stmt
                    .query_map([&note.frontmatter.id], |row| row.get(0))
                    .map_err(|e| format!("Failed to query inline tags: {}", e))?
                    .filter_map(|r| r.ok())
                    .collect();

                Ok(Some(CachedNote { note, inline_tags }))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to get cached note: {}", e)),
        }
    }

    /// Upsert a note and its tags into the cache
    pub fn upsert_note(
        &self,
        note: &Note,
        content_hash: &str,
        file_mtime: i64,
        inline_tags: &[String],
    ) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT OR REPLACE INTO notes
             (id, file_path, title, created, modified, date, column_name, order_num, content, content_hash, file_mtime, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                note.frontmatter.id,
                note.file_path,
                note.frontmatter.title,
                note.frontmatter.created.to_rfc3339(),
                note.frontmatter.modified.to_rfc3339(),
                note.frontmatter.date,
                note.frontmatter.column,
                note.frontmatter.order,
                note.content,
                content_hash,
                file_mtime,
                now
            ],
        )
        .map_err(|e| format!("Failed to cache note: {}", e))?;

        // Update tags
        self.update_note_tags_internal(
            &conn,
            &note.frontmatter.id,
            &note.frontmatter.tags,
            inline_tags,
        )?;

        Ok(())
    }

    fn update_note_tags_internal(
        &self,
        conn: &Connection,
        note_id: &str,
        frontmatter_tags: &[String],
        inline_tags: &[String],
    ) -> Result<(), String> {
        // Remove existing tag associations
        conn.execute("DELETE FROM note_tags WHERE note_id = ?", [note_id])
            .map_err(|e| format!("Failed to clear note tags: {}", e))?;

        // Insert frontmatter tags
        for tag in frontmatter_tags {
            let tag_lower = tag.to_lowercase();
            self.ensure_tag_exists(conn, &tag_lower)?;
            conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id, source)
                 SELECT ?, id, 'frontmatter' FROM tags WHERE name = ?",
                params![note_id, tag_lower],
            )
            .map_err(|e| format!("Failed to insert frontmatter tag: {}", e))?;
        }

        // Insert inline tags
        for tag in inline_tags {
            let tag_lower = tag.to_lowercase();
            self.ensure_tag_exists(conn, &tag_lower)?;
            conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id, source)
                 SELECT ?, id, 'inline' FROM tags WHERE name = ?",
                params![note_id, tag_lower],
            )
            .map_err(|e| format!("Failed to insert inline tag: {}", e))?;
        }

        Ok(())
    }

    fn ensure_tag_exists(&self, conn: &Connection, tag: &str) -> Result<(), String> {
        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?)",
            [tag],
        )
        .map_err(|e| format!("Failed to ensure tag exists: {}", e))?;
        Ok(())
    }

    /// Remove a note from cache by file path
    pub fn remove_note(&self, file_path: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;
        conn.execute("DELETE FROM notes WHERE file_path = ?", [file_path])
            .map_err(|e| format!("Failed to remove note from cache: {}", e))?;
        Ok(())
    }

    /// Remove notes not in the given set of paths
    pub fn remove_notes_not_in(&self, valid_paths: &HashSet<String>) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        // Get all cached paths
        let mut stmt = conn
            .prepare("SELECT file_path FROM notes")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let cached_paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("Failed to query paths: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        // Remove stale entries
        for path in cached_paths {
            if !valid_paths.contains(&path) {
                conn.execute("DELETE FROM notes WHERE file_path = ?", [&path])
                    .map_err(|e| format!("Failed to remove stale note: {}", e))?;
            }
        }

        Ok(())
    }

    /// Get all cached notes
    pub fn get_all_notes(&self) -> Result<Vec<CachedNote>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, file_path, title, created, modified, date, column_name, order_num, content
                 FROM notes",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let notes: Vec<Note> = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let file_path: String = row.get(1)?;
                let title: String = row.get(2)?;
                let created: String = row.get(3)?;
                let modified: String = row.get(4)?;
                let date: Option<String> = row.get(5)?;
                let column: String = row.get(6)?;
                let order: i32 = row.get(7)?;
                let content: String = row.get(8)?;

                Ok(Note {
                    frontmatter: NoteFrontmatter {
                        id,
                        title,
                        created: DateTime::parse_from_rfc3339(&created)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        modified: DateTime::parse_from_rfc3339(&modified)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        date,
                        column,
                        tags: Vec::new(),
                        order,
                    },
                    content,
                    file_path,
                })
            })
            .map_err(|e| format!("Failed to query notes: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        drop(stmt);

        // Get tags for each note (keep lock held to avoid re-acquisition per note)
        let mut result = Vec::new();
        for mut note in notes {
            // Get frontmatter tags
            let mut frontmatter_stmt = conn
                .prepare(
                    "SELECT t.name FROM tags t
                     JOIN note_tags nt ON t.id = nt.tag_id
                     WHERE nt.note_id = ? AND nt.source = 'frontmatter'",
                )
                .map_err(|e| format!("Failed to prepare tags query: {}", e))?;

            let frontmatter_tags: Vec<String> = frontmatter_stmt
                .query_map([&note.frontmatter.id], |row| row.get(0))
                .map_err(|e| format!("Failed to query frontmatter tags: {}", e))?
                .filter_map(|r| r.ok())
                .collect();

            note.frontmatter.tags = frontmatter_tags;

            // Get inline tags
            let mut inline_stmt = conn
                .prepare(
                    "SELECT t.name FROM tags t
                     JOIN note_tags nt ON t.id = nt.tag_id
                     WHERE nt.note_id = ? AND nt.source = 'inline'",
                )
                .map_err(|e| format!("Failed to prepare inline tags query: {}", e))?;

            let inline_tags: Vec<String> = inline_stmt
                .query_map([&note.frontmatter.id], |row| row.get(0))
                .map_err(|e| format!("Failed to query inline tags: {}", e))?
                .filter_map(|r| r.ok())
                .collect();

            result.push(CachedNote { note, inline_tags });
        }

        Ok(result)
    }
}
