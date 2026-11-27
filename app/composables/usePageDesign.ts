// Writes to the business's page design (company_settings.pdf_design) that
// touch files: applying a starter template copies the company logo into each
// logo spot as an ordinary image (spec: a copy, not a link — changing the
// company logo later doesn't touch the design), and removes the previous
// design's image files.
//
// The new design is saved BEFORE the old files are removed, so a failure part
// way through leaves the business on a design whose files all exist.
//
// Pure pieces (templates, logo slots, effective design) live in app/lib; this
// only orchestrates them with the Rust asset commands and the settings store.

import type { DesignTemplateKey } from "~/lib/design-templates";
import type { MarginsMm } from "~/lib/page-design";
import { itemAssetKind, readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
import { designTemplate } from "~/lib/design-templates";
import { imageFileIds, parsePageDesign, withLogoSlots } from "~/lib/page-design";
import { effectiveDesign, resolvePaperSize } from "~/lib/page-settings";
import { artworkFormatOf } from "~/lib/stationery-artwork";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";

export function usePageDesign() {
	const settings = useSettingsStore();
	const tenants = useTenantsStore();

	const tenantId = (): string => {
		const id = tenants.activeTenantId;
		if (!id) throw new Error("No business is open.");
		return id;
	};

	/**
	 * Replace the business's design with a fresh copy of a starter template,
	 * and set the Document style it comes with — unless `keepDocumentStyle`.
	 */
	async function applyTemplate(key: DesignTemplateKey, { keepDocumentStyle = false } = {}): Promise<void> {
		const id = tenantId();
		const row = settings.settings;
		const { design, documentStyle } = designTemplate(key, resolvePaperSize(row?.pdf_paper_size).key);

		const spots = design.items.filter((i) => i.type === "image" && i.src?.kind === "company_logo");
		let logoExt = null;
		if (spots.length > 0 && row?.logo_path) {
			const [ext, bytes] = await readBusinessAsset(id, "logo");
			logoExt = artworkFormatOf(`logo.${ext}`);
			if (logoExt) {
				for (const spot of spots) await saveBusinessAsset(id, itemAssetKind(spot.id), logoExt, bytes);
			}
		}

		const previous = parsePageDesign(row?.pdf_design);
		await settings.save({
			pdf_design: JSON.stringify(withLogoSlots(design, logoExt)),
			...(documentStyle && !keepDocumentStyle ? { pdf_layout: documentStyle } : {})
		});
		for (const old of imageFileIds(previous)) {
			// Best effort: an orphaned file is harmless, a failed save isn't.
			await removeBusinessAsset(id, itemAssetKind(old)).catch((e) => console.warn("page design: couldn't remove", old, e));
		}
	}

	/**
	 * Save a new safe area, in the coordinates of the business's current paper.
	 * A never-chosen design becomes Classic first (its logo copied in), keeping
	 * the Document style the business picked.
	 */
	async function saveMargins(margins: MarginsMm): Promise<void> {
		if (!parsePageDesign(settings.settings?.pdf_design)) await applyTemplate("classic", { keepDocumentStyle: true });
		const design = effectiveDesign(settings.settings);
		await settings.save({ pdf_design: JSON.stringify({ ...design, margins: { ...margins } }) });
	}

	return { applyTemplate, saveMargins };
}
