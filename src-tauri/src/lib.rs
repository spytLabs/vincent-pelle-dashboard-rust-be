mod koombiyo;
mod google_sheets;
mod woocommerce;
mod koombiyo_orders;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            koombiyo::login_koombiyo,
            koombiyo::validate_koombiyo,
            koombiyo::fetch_koombiyo_districts,
            koombiyo::fetch_koombiyo_cities,
            koombiyo::check_koombiyo_waybills,
            koombiyo::fetch_pod,
            google_sheets::get_order_details,
            google_sheets::update_order_details,
            google_sheets::update_order_status,
            google_sheets::fetch_orders_sheets,
            koombiyo_orders::send_koombiyo_orders
        ])
        .setup(|app| {
            // Traverse multiple possible locations for .env files based on invocation path
            let _ = dotenvy::from_filename(".env.local");
            let _ = dotenvy::from_filename("../.env.local");
            let _ = dotenvy::dotenv(); // Handles standard .env discovery upwards

            // In packaged builds (e.g. Windows installer), load bundled env files
            // from the app resource directory when present.
            if let Ok(resource_dir) = app.path().resource_dir() {
                let candidates = [
                    resource_dir.join(".env.production"),
                    resource_dir.join(".env"),
                ];

                for path in candidates {
                    if path.exists() {
                        let _ = dotenvy::from_path(&path);
                    }
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
