mod cache;
mod commands;
mod utils;

use cache::CacheDb;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

pub struct AppState {
    pub cache: Mutex<Option<CacheDb>>,
    pub recent_writes: Mutex<HashMap<String, Instant>>,
    pub initial_profile_id: Mutex<Option<String>>,
}

#[tauri::command]
fn open_profile_in_new_window(profile_id: String) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(current_exe)
        .arg(format!("--profile={}", profile_id))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_initial_profile(state: tauri::State<AppState>) -> Option<String> {
    state.initial_profile_id.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Parse --profile= argument before building the app
    let initial_profile_id: Option<String> = std::env::args()
        .find_map(|arg| arg.strip_prefix("--profile=").map(String::from));

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            cache: Mutex::new(None),
            recent_writes: Mutex::new(HashMap::new()),
            initial_profile_id: Mutex::new(initial_profile_id),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::notes::list_notes,
            commands::notes::read_note,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::delete_note,
            commands::notes::create_folder,
            commands::notes::rename_folder,
            commands::notes::delete_folder,
            commands::notes::move_note,
            commands::notes::initialize_cache,
            commands::notes::list_notes_cached,
            commands::notes::process_file_changes,
            open_profile_in_new_window,
            get_initial_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
