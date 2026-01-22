use directories::ProjectDirs;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

use super::schema::SCHEMA;

pub struct CacheDb {
    pub conn: Mutex<Connection>,
    pub profile_id: String,
}

impl CacheDb {
    pub fn new(profile_id: &str) -> Result<Self, String> {
        let cache_path = Self::get_cache_path(profile_id)?;

        // Ensure parent directory exists
        if let Some(parent) = cache_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create cache directory: {}", e))?;
        }

        let conn = Connection::open(&cache_path)
            .map_err(|e| format!("Failed to open cache database: {}", e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
            profile_id: profile_id.to_string(),
        };

        db.initialize_schema()?;
        Ok(db)
    }

    fn get_cache_path(profile_id: &str) -> Result<PathBuf, String> {
        let proj_dirs = ProjectDirs::from("", "", "noteban")
            .ok_or("Could not determine cache directory")?;
        Ok(proj_dirs.cache_dir().join(profile_id).join("cache.db"))
    }

    fn initialize_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("Failed to initialize schema: {}", e))?;
        Ok(())
    }

    pub fn invalidate_all(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notes", [])
            .map_err(|e| format!("Failed to invalidate cache: {}", e))?;
        Ok(())
    }

    pub fn verify_integrity(&self) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap();
        let result: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| format!("Integrity check failed: {}", e))?;

        Ok(result == "ok")
    }
}
