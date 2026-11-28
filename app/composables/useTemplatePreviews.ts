// Thumbnails for the page designer's template picker: page 1 of a sample
// invoice on each starter template, rendered by the real Typst pipeline at a
// small size with the business's own paper, logo, accent and font
// (design-template-preview.ts). Rendered one after another when the picker
// opens, and cached per template until what it would render changes.

import type { DesignTemplateKey } from "~/lib/design-templates";
import type { CompanySettingsRow } from "~/stores/settings";
import { invoke } from "@tauri-apps/api/core";
import { templatePreviewSettings } from "~/lib/design-template-preview";
import { DESIGN_TEMPLATES } from "~/lib/design-templates";
import { resolveLayoutKey } from "~/lib/pdf-layouts";
import { sampleInvoicePayload } from "~/lib/sample-pdf";

/** Small: the thumbnails are ~150 px wide. */
const PREVIEW_PPI = 30;

export function useTemplatePreviews(settings: () => CompanySettingsRow | null, currency: () => { code: string, symbol: string }) {
	const urls = reactive<Partial<Record<DesignTemplateKey, string>>>({});
	const keys: Partial<Record<DesignTemplateKey, string>> = {};
	let run = 0;

	/** Render whatever is missing or stale. Safe to call on every open. */
	async function load(): Promise<void> {
		const s = settings();
		if (!s || !("__TAURI_INTERNALS__" in window)) return;
		const mine = ++run;
		for (const t of DESIGN_TEMPLATES) {
			if (mine !== run) return; // a newer load took over
			const ts = templatePreviewSettings(s, t.key);
			const data = sampleInvoicePayload(ts, currency(), resolveLayoutKey(ts.pdf_layout));
			const key = JSON.stringify(data);
			if (keys[t.key] === key && urls[t.key]) continue;
			try {
				const png = await invoke<number[]>("render_document_page_png", { data, ppi: PREVIEW_PPI, page: 1 });
				const old = urls[t.key];
				urls[t.key] = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" }));
				if (old) URL.revokeObjectURL(old);
				keys[t.key] = key;
			} catch (e) {
				console.warn("[designer] template preview failed", t.key, e);
			}
		}
	}

	onBeforeUnmount(() => {
		run++;
		for (const url of Object.values(urls)) {
			if (url) URL.revokeObjectURL(url);
		}
	});

	return { urls, load };
}
