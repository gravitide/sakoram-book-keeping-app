import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { templatePreviewSettings } from "./design-template-preview";
import { designTemplate } from "./design-templates";
import { parsePageDesign } from "./page-design";

const settings = { business_name: "Gravitide", pdf_layout: "minimal", pdf_paper_size: "a5", pdf_design: null } as unknown as CompanySettingsRow;
const ids = (json: string | null) => parsePageDesign(json)!.items.map((i) => i.id);

describe("templatePreviewSettings", () => {
	it("renders the template's design on the business's paper with the Document style it sets", () => {
		const s = templatePreviewSettings(settings, "modern");
		const design = parsePageDesign(s.pdf_design)!;
		expect(design.paper).toBe("a5");
		expect(design.items.map(({ id: _id, ...rest }) => rest)).toEqual(designTemplate("modern", "a5").design.items.map(({ id: _id, ...rest }) => rest));
		expect(s.pdf_layout).toBe("modern");
		expect(s.business_name).toBe("Gravitide");
	});

	it("keeps the business's Document style for a template that doesn't set one", () => {
		expect(templatePreviewSettings(settings, "blank").pdf_layout).toBe("minimal");
	});

	it("is the same every time, so a preview can be cached", () => {
		expect(ids(templatePreviewSettings(settings, "classic").pdf_design)).toEqual(ids(templatePreviewSettings(settings, "classic").pdf_design));
	});
});
