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
import type { PageDesign } from "~/lib/page-design";
import type { PaperSize } from "~/lib/page-settings";
import type { PdfLayoutKey } from "~/lib/pdf-layouts";
import { itemAssetKind, readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
import { designTemplate } from "~/lib/design-templates";
import { imageFileIds, parsePageDesign, withLogoSlots } from "~/lib/page-design";
import { resolvePaperSize } from "~/lib/page-settings";
import { logoSpotPlan } from "~/lib/stationery-artwork";
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
	 * The design with each company-logo spot filled with a copy of the company
	 * logo (spec: a copy, not a link) — WITHOUT saving it. The copies are
	 * written to the business folder under the spots' ids, listed in
	 * `uploaded`, so a caller that drops the design (the page designer's
	 * Discard) can remove them.
	 */
	async function fillLogoSpots(design: PageDesign): Promise<{ design: PageDesign, uploaded: string[] }> {
		const spots = design.items.filter((i) => i.type === "image" && i.src?.kind === "company_logo");
		if (spots.length === 0) return { design, uploaded: [] };
		const id = tenantId();
		// A logo_path whose file is gone (moved, deleted by hand) counts as no
		// logo: the spot becomes an empty slot.
		const logo = settings.settings?.logo_path ? await readBusinessAsset(id, "logo").catch(() => null) : null;
		const plan = logoSpotPlan(logo ? logo[0] : null);
		if (plan === "empty") return { design: withLogoSlots(design, null), uploaded: [] };
		// "link": the spot keeps following the company logo (a format a design
		// image can't be), which every PDF already prints as-is.
		if (plan === "link") return { design, uploaded: [] };
		for (const spot of spots) await saveBusinessAsset(id, itemAssetKind(spot.id), plan.copyAs, logo![1]);
		return { design: withLogoSlots(design, plan.copyAs), uploaded: spots.map((s) => s.id) };
	}

	/** A fresh copy of a starter template on `paper`, logo spots filled (fillLogoSpots) — WITHOUT saving it. */
	async function prepareTemplate(key: DesignTemplateKey, paper: PaperSize): Promise<{ design: PageDesign, documentStyle: PdfLayoutKey | null, uploaded: string[] }> {
		const { design, documentStyle } = designTemplate(key, paper);
		return { ...(await fillLogoSpots(design)), documentStyle };
	}

	/**
	 * Replace the business's design with a fresh copy of a starter template,
	 * and set the Document style it comes with — unless `keepDocumentStyle`.
	 */
	async function applyTemplate(key: DesignTemplateKey, { keepDocumentStyle = false } = {}): Promise<void> {
		const id = tenantId();
		const row = settings.settings;
		const { design: next, documentStyle } = await prepareTemplate(key, resolvePaperSize(row?.pdf_paper_size).key);

		const previous = parsePageDesign(row?.pdf_design);
		await settings.save({
			pdf_design: JSON.stringify(next),
			...(documentStyle && !keepDocumentStyle ? { pdf_layout: documentStyle } : {})
		});
		for (const old of imageFileIds(previous)) {
			// Best effort: an orphaned file is harmless, a failed save isn't.
			await removeBusinessAsset(id, itemAssetKind(old)).catch((e) => console.warn("page design: couldn't remove", old, e));
		}
	}

	return { fillLogoSpots, prepareTemplate, applyTemplate };
}
