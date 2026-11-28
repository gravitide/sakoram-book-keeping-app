// The page designer window (app/composables/usePageDesignerWindow.ts) edits
// the OPEN business's page design through its own webview and its own sql
// pool. Anything that changes which database is usable — switching, closing,
// forgetting or deleting a business, locking or (un)encrypting it, replacing
// it from a backup — closes the designer first, so it can never save into
// the wrong business or a sealed one. Every such command calls `close`.

use tauri::{AppHandle, Manager};

/// The designer window's label (capabilities/main.json lists "designer-*").
pub const DESIGNER_LABEL: &str = "designer-main";

/// Close the designer window if it is open. A missing window, or one that
/// is already going, is not an error.
pub(crate) fn close(app: &AppHandle) {
	if let Some(window) = app.get_webview_window(DESIGNER_LABEL) {
		let _ = window.destroy();
	}
}

#[cfg(test)]
mod tests {
	use super::DESIGNER_LABEL;

	#[test]
	fn the_designer_label_is_covered_by_the_capability_pattern() {
		assert_eq!(DESIGNER_LABEL, "designer-main");
		assert!(DESIGNER_LABEL.starts_with("designer-"));
		let caps = include_str!("../capabilities/main.json");
		assert!(caps.contains("\"designer-*\""), "capabilities/main.json must list designer-*");
	}
}
