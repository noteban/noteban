pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    file_path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    created TEXT NOT NULL,
    modified TEXT NOT NULL,
    date TEXT,
    column_name TEXT NOT NULL,
    order_num INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    file_mtime INTEGER NOT NULL,
    cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('frontmatter', 'inline')),
    PRIMARY KEY (note_id, tag_id, source),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path);
CREATE INDEX IF NOT EXISTS idx_notes_column ON notes(column_name);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
"#;
