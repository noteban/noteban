use super::db::CacheDb;
use rusqlite::{params, OptionalExtension};

#[derive(Debug, Clone)]
pub struct SyncFileRecord {
    pub relative_path: String,
    pub local_hash: Option<String>,
    pub remote_etag: Option<String>,
    pub last_synced_hash: Option<String>,
    pub local_mtime: Option<i64>,
    pub remote_mtime: Option<i64>,
    pub remote_size: Option<i64>,
    pub synced_at: i64,
}

impl CacheDb {
    pub fn get_sync_record(&self, relative_path: &str) -> Result<Option<SyncFileRecord>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        conn.query_row(
            "SELECT relative_path, local_hash, remote_etag, last_synced_hash, local_mtime, remote_mtime, remote_size, synced_at
             FROM sync_files WHERE relative_path = ?",
            [relative_path],
            |row| {
                Ok(SyncFileRecord {
                    relative_path: row.get(0)?,
                    local_hash: row.get(1)?,
                    remote_etag: row.get(2)?,
                    last_synced_hash: row.get(3)?,
                    local_mtime: row.get(4)?,
                    remote_mtime: row.get(5)?,
                    remote_size: row.get(6)?,
                    synced_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to read sync record: {}", e))
    }

    pub fn upsert_sync_record(&self, record: &SyncFileRecord) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO sync_files
             (relative_path, local_hash, remote_etag, last_synced_hash, local_mtime, remote_mtime, remote_size, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                record.relative_path,
                record.local_hash,
                record.remote_etag,
                record.last_synced_hash,
                record.local_mtime,
                record.remote_mtime,
                record.remote_size,
                record.synced_at,
            ],
        )
        .map_err(|e| format!("Failed to write sync record: {}", e))?;

        Ok(())
    }

    pub fn remove_sync_record(&self, relative_path: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        conn.execute(
            "DELETE FROM sync_files WHERE relative_path = ?",
            [relative_path],
        )
        .map_err(|e| format!("Failed to remove sync record: {}", e))?;

        Ok(())
    }

    pub fn set_sync_state(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
            params![key, value],
        )
        .map_err(|e| format!("Failed to write sync state: {}", e))?;

        Ok(())
    }

    pub fn get_sync_state(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Cache lock error".to_string())?;

        conn.query_row("SELECT value FROM sync_state WHERE key = ?", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| format!("Failed to read sync state: {}", e))
    }
}
