// /settings/pdf has two sections: the Page (a live preview of the saved
// design) and the Design (the way into the page designer window, which owns
// paper, templates, safe area, Document style, accent and font). Their ids and labels are shared by the page and the sidebar's
// in-page anchors (app/layouts/default.vue), so the two never disagree.
//
// Pure, store-free, relative imports only (vitest).

/** The element ids of the page's three sections (anchor targets, `#id`). */
export const PDF_SECTION_IDS = { page: "page", design: "design" } as const;

export interface PdfSettingsSection { hash: string, label: string, icon: string }

/** The sidebar's in-page anchors for /settings/pdf: Page, Design. */
export function pdfSettingsSections(): PdfSettingsSection[] {
	return [
		{ hash: `#${PDF_SECTION_IDS.page}`, label: "Page", icon: "i-lucide-file" },
		{ hash: `#${PDF_SECTION_IDS.design}`, label: "Design", icon: "i-lucide-layout-template" }
	];
}
