mod cache;
mod commands;
mod utils;

use cache::CacheDb;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

/// Acquire a mutex lock, returning an error string if the mutex is poisoned.
pub fn lock_or_err<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "Internal state lock error".to_string())
}

pub struct AppState {
    pub cache: Mutex<Option<CacheDb>>,
    pub recent_writes: Mutex<HashMap<String, Instant>>,
    pub initial_profile_id: Mutex<Option<String>>,
    pub nextcloud_login_sessions: Mutex<HashMap<String, commands::sync::LoginSession>>,
}

#[tauri::command]
fn open_profile_in_new_window(profile_id: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let _ = profile_id;
        return Err("Opening profiles in new windows is not supported on mobile".to_string());
    }

    #[cfg(not(mobile))]
    {
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        std::process::Command::new(current_exe)
            .arg(format!("--profile={}", profile_id))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn get_initial_profile(state: tauri::State<AppState>) -> Result<Option<String>, String> {
    Ok(lock_or_err(&state.initial_profile_id)?.clone())
}

fn install_rustls_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_rustls_crypto_provider();

    // Parse --profile= argument before building the app
    let initial_profile_id: Option<String> =
        std::env::args().find_map(|arg| arg.strip_prefix("--profile=").map(String::from));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(mobile))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(AppState {
            cache: Mutex::new(None),
            recent_writes: Mutex::new(HashMap::new()),
            initial_profile_id: Mutex::new(initial_profile_id),
            nextcloud_login_sessions: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Build the main window programmatically (its tauri.conf.json
            // entry has `create: false`) so we can attach an iOS-specific
            // hook that suppresses WKWebView's default form accessory bar
            // (prev / next / Done) when the soft keyboard is up.
            let window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .expect("missing 'main' window config in tauri.conf.json");

            #[allow(unused_mut)]
            let mut builder = tauri::WebviewWindowBuilder::from_config(app, &window_config)?;

            #[cfg(target_os = "ios")]
            {
                builder = builder.with_input_accessory_view_builder(|_webview| None);
            }

            builder.build()?;

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
            commands::sync::nextcloud_login_start,
            commands::sync::nextcloud_login_poll,
            commands::sync::nextcloud_disconnect,
            commands::sync::sync_now,
            commands::sync::get_sync_status,
            commands::sync::get_default_notes_dir,
            open_profile_in_new_window,
            get_initial_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
