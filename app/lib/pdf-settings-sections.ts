// /settings/pdf reads top-down in three sections: the Page (paper and live
// preview), the Design (starter templates, safe area, Document style, accent),
// then the Font. Their ids and labels are shared by the page and the sidebar's
// in-page anchors (app/layouts/default.vue), so the two never disagree.
//
// Pure, store-free, relative imports only (vitest).

/** The element ids of the page's three sections (anchor targets, `#id`). */
export const PDF_SECTION_IDS = { page: "page", design: "design", font: "font" } as const;

export interface PdfSettingsSection { hash: string, label: string, icon: string }

/** The sidebar's in-page anchors for /settings/pdf: Page, Design, Font. */
export function pdfSettingsSections(): PdfSettingsSection[] {
	return [
		{ hash: `#${PDF_SECTION_IDS.page}`, label: "Page", icon: "i-lucide-file" },
		{ hash: `#${PDF_SECTION_IDS.design}`, label: "Design", icon: "i-lucide-layout-template" },
		{ hash: `#${PDF_SECTION_IDS.font}`, label: "Font", icon: "i-lucide-type" }
	];
}
