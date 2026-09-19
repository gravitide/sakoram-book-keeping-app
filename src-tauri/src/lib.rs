#[cfg(desktop)]
use tauri::{
	menu::{Menu, MenuItem},
	tray::TrayIconBuilder
};
use tauri::Manager;
mod data_io;
mod drive;
pub mod license;
mod pdf;
mod phone_upload;
mod tenants;
mod vault;
mod vault_fs;

// Multi-tenancy: each business is a portable user-chosen FOLDER holding its
// own SQLite file (business.db). Only tenants.json + license.json stay under
// app_data_dir. We don't register migrations with tauri-plugin-sql because new
// tenants get added at runtime — instead the `tenants` module runs migrations
// directly via sqlx whenever a business DB is opened.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.setup(|_app| {
			#[cfg(desktop)]
			{
				let quit_i = MenuItem::with_id(_app, "quit", "Quit", true, None::<&str>)?;
				let menu = Menu::with_items(_app, &[&quit_i])?;

				let _tray = TrayIconBuilder::new()
					.menu(&menu)
					.show_menu_on_left_click(true)
					.icon(_app.default_window_icon().unwrap().clone())
					.on_menu_event(|app, event| match event.id.as_ref() {
						"quit" => {
							// Close the main window rather than exiting outright so the
							// JS lock-on-close plugin runs first: it closes the sqlite
							// pool BEFORE sealing an encrypted business. `app.exit` would
							// jump straight to the Rust ExitRequested backstop, which
							// can't remove the plaintext db while the pool holds it open.
							match app.get_webview_window("main") {
								Some(main) => {
									let _ = main.close();
								}
								None => app.exit(0),
							}
						}
						other => {
							println!("menu item {} not handled", other);
						}
					})
					.build(_app)?;
			}

			Ok(())
		})
		// Saves each window's size / position / maximized state on exit and
		// restores it on the next launch. Default StateFlags cover size,
		// position and maximized — which is what we want for the main window
		// (and the help window gets the same treatment for free).
		// The main window owns the app's lifetime. Once it is gone (X button,
		// tray Quit — both go through the JS lock-on-close seal first), exit
		// even if the help window is still open; a docs window with no app
		// behind it is useless, and tray Quit must actually quit.
		.on_window_event(|window, event| {
			if window.label() == "main" {
				if let tauri::WindowEvent::Destroyed = event {
					window.app_handle().exit(0);
				}
			}
		})
		.plugin(tauri_plugin_window_state::Builder::default().build())
		.plugin(tauri_plugin_sql::Builder::default().build())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_shell::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.manage(phone_upload::PhoneUploadState::default())
		.manage(vault_fs::VaultSessions::default())
		.manage(drive::DriveState::default())
		.invoke_handler(tauri::generate_handler![
			pdf::export_quote_pdf,
			pdf::export_invoice_pdf,
			pdf::export_bill_pdf,
			pdf::export_voucher_pdf,
			pdf::export_payslip_pdf,
			pdf::export_report_pdf,
			pdf::export_statement_pdf,
			pdf::export_letter_pdf,
			pdf::copy_file,
			pdf::open_path,
			tenants::list_tenants,
			tenants::create_tenant,
			tenants::open_tenant,
			tenants::rename_tenant,
			tenants::delete_tenant,
			tenants::forget_tenant,
			tenants::set_active_tenant,
			tenants::clear_active_tenant,
			tenants::ensure_tenant_db,
			tenants::set_tenant_logo,
			tenants::tenant_logo_path,
			tenants::save_business_asset,
			tenants::read_business_asset,
			tenants::path_exists,
			data_io::export_tenant_data,
			data_io::peek_export_manifest,
			data_io::import_tenant_data,
			phone_upload::start_phone_upload,
			phone_upload::cancel_phone_upload,
			phone_upload::import_document_attachment,
			phone_upload::clear_document_attachments,
			phone_upload::remove_document_attachment,
			vault_fs::tenant_lock_state,
			vault_fs::enable_tenant_encryption,
			vault_fs::unlock_tenant,
			vault_fs::lock_tenant,
			vault_fs::change_tenant_password,
			vault_fs::disable_tenant_encryption,
			drive::drive_status,
			drive::drive_connect_begin,
			drive::drive_connect_finish,
			drive::drive_disconnect,
			drive::drive_set_reminder_days,
			drive::drive_cancel,
			drive::drive_backup_now,
			drive::drive_list_businesses,
			drive::drive_list_snapshots,
			drive::drive_restore,
			license::validate_license,
			license::read_license_state,
			license::write_license_state,
		])
		.build(tauri::generate_context!())
		.expect("error while building tauri application")
		.run(|app_handle, event| {
			if let tauri::RunEvent::ExitRequested { .. } = event {
				// Seal every unlocked business back to its encrypted blob before
				// the process dies, so a plaintext working db isn't left behind.
				let sessions = app_handle.state::<vault_fs::VaultSessions>();
				let _ = vault_fs::lock_all(app_handle, &sessions);
			}
		});
}
