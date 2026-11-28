// What a starter template's preview thumbnail renders with (the page
// designer's template picker): the business's own settings, with the
// template's design on the business's paper and the Document style the
// template sets (or the business's, for a template that sets none). The
// company-logo spot stays linked to the company logo, so the preview shows
// the real logo without copying anything. Item ids are fixed, so the same
// template renders to the same payload and its thumbnail can be cached.
//
// Pure, store-free, relative imports only (vitest).

import type { DesignTemplateKey } from "./design-templates";
import type { CompanySettingsRow } from "~/stores/settings";
import { designTemplate } from "./design-templates";
import { resolvePaperSize } from "./paper-sizes";

const previewIds = () => {
	let n = 0;
	return () => `preview${String(++n).padStart(3, "0")}`;
};

export function templatePreviewSettings(settings: CompanySettingsRow, key: DesignTemplateKey): CompanySettingsRow {
	const paper = resolvePaperSize(settings.pdf_paper_size).key;
	const { design, documentStyle } = designTemplate(key, paper, previewIds());
	return { ...settings, pdf_design: JSON.stringify(design), pdf_layout: documentStyle ?? settings.pdf_layout };
}
