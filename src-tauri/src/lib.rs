#[cfg(desktop)]
use tauri::{
	menu::{Menu, MenuItem},
	tray::TrayIconBuilder
};
mod data_io;
mod pdf;
mod phone_upload;
mod tenants;

// Multi-tenancy: each business has its own SQLite file under
// app_data_dir/businesses/. We don't register migrations with
// tauri-plugin-sql because new tenants get added at runtime — instead
// the `tenants` module runs migrations directly via sqlx whenever a
// tenant DB is opened.

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
							app.exit(0);
						}
						other => {
							println!("menu item {} not handled", other);
						}
					})
					.build(_app)?;
			}

			Ok(())
		})
		.plugin(tauri_plugin_sql::Builder::default().build())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_shell::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_fs::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.manage(phone_upload::PhoneUploadState::default())
		.invoke_handler(tauri::generate_handler![
			pdf::export_quote_pdf,
			pdf::export_invoice_pdf,
			pdf::export_bill_pdf,
			pdf::export_voucher_pdf,
			pdf::export_payslip_pdf,
			pdf::copy_file,
			pdf::open_path,
			tenants::list_tenants,
			tenants::create_tenant,
			tenants::rename_tenant,
			tenants::delete_tenant,
			tenants::set_active_tenant,
			tenants::ensure_tenant_db,
			tenants::set_tenant_logo,
			tenants::tenant_logo_path,
			data_io::export_tenant_data,
			data_io::peek_export_manifest,
			data_io::import_tenant_data,
			phone_upload::start_phone_upload,
			phone_upload::cancel_phone_upload,
			phone_upload::import_document_attachment,
			phone_upload::clear_document_attachments,
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
