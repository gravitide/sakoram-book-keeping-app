import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEMO_LETTERHEAD_ACCENT, demoLetterheadSettings } from "./demo-letterhead";
import { buildPageSettings } from "./page-settings";
import { parseStationery, resolveStationeryMode } from "./stationery";
import { svgAspect, svgHasLiveText } from "./stationery-artwork";

const asset = (name: string) => readFileSync(fileURLToPath(new URL(`../assets/stationery/${name}`, import.meta.url)), "utf8");
const svg = asset("demo-letterhead.svg");
const headerSvg = asset("demo-header.svg");
const footerSvg = asset("demo-footer.svg");

describe("the demo letterhead artwork", () => {
	it("holds no live text, so importing it raises no font warning", () => {
		expect(svgHasLiveText(svg)).toBe(false);
		expect(svg).not.toMatch(/font-family|@font-face/i);
	});

	it("is an A4 sheet in millimetres", () => {
		expect(svg).toMatch(/width="210mm"/);
		expect(svg).toMatch(/height="297mm"/);
		expect(svg).toMatch(/viewBox="0 0 210 297"/);
	});

	it("stays small enough to bundle with the app", () => {
		expect(Buffer.byteLength(svg)).toBeLessThan(8 * 1024);
	});

	it("shares its colour with the demo's PDF accent, so the Layout's rules match the artwork", () => {
		expect(DEMO_LETTERHEAD_ACCENT).toMatch(/^#[0-9a-f]{6}$/);
		expect(svg).toContain(`fill="${DEMO_LETTERHEAD_ACCENT}"`);
	});
});

describe("the demo Header & footer images", () => {
	it.each([["header", headerSvg], ["footer", footerSvg]])("the %s holds no live text and stays small", (_slot, image) => {
		expect(svgHasLiveText(image)).toBe(false);
		expect(image).not.toMatch(/font-family|@font-face/i);
		expect(Buffer.byteLength(image)).toBeLessThan(8 * 1024);
	});

	it("are the letterhead's own header band and footer, full A4 width", () => {
		// Header band + gold stripe: 0-27.2 mm. Footer: the gold rule at 284 mm to the foot.
		expect(svgAspect(headerSvg)).toBeCloseTo(210 / 27.2, 6);
		expect(svgAspect(footerSvg)).toBeCloseTo(210 / 13, 6);
		expect(headerSvg).toContain(`fill="${DEMO_LETTERHEAD_ACCENT}"`);
	});
});

describe("demoLetterheadSettings", () => {
	it("switches the business to Full-page background with the bundled SVG on A4", () => {
		const patch = demoLetterheadSettings(null);
		expect(resolveStationeryMode(patch.pdf_stationery_mode)).toBe("background");
		const { background } = parseStationery(patch.pdf_stationery);
		expect(background).toMatchObject({ ext: "svg", paper: "a4", crop: null, live_text: false });
	});

	it("sets margins that keep the content clear of the header band and footer", () => {
		// The header band + gold stripe end at 27.2 mm and the footer's gold rule
		// starts at 284 mm (13 mm from the foot), so 38 / 22 leave ~10 mm of air.
		const { margins } = parseStationery(demoLetterheadSettings(null).pdf_stationery).background;
		expect(margins).toEqual({ top: 38, right: 18, bottom: 22, left: 18 });
	});

	it("also stores Header & footer images, placed like a fresh upload, without switching to them", () => {
		const patch = demoLetterheadSettings(null);
		expect(patch.pdf_stationery_mode).toBe("background");
		const { header, footer, margins } = parseStationery(patch.pdf_stationery).header_footer;
		expect(header).toMatchObject({ ext: "svg", paper: "a4", crop: null, live_text: false });
		expect(footer).toMatchObject({ ext: "svg", paper: "a4", crop: null, live_text: false });
		// Full width, flush to its edge.
		expect(header!.rect.x).toBe(0);
		expect(header!.rect.y).toBe(0);
		expect(header!.rect.w).toBe(210);
		expect(header!.rect.h).toBeCloseTo(27.2, 6);
		expect(footer!.rect.w).toBe(210);
		expect(footer!.rect.h).toBeCloseTo(13, 6);
		expect(footer!.rect.y).toBeCloseTo(284, 6);
		// The same Safe area as the letterhead it was cut from.
		expect(margins).toEqual({ top: 38, right: 18, bottom: 22, left: 18 });
	});

	it("switching the demo to Header & footer images prints both images in the letterhead's Safe area", () => {
		const page = buildPageSettings({ ...demoLetterheadSettings(null), pdf_stationery_mode: "header_footer", pdf_paper_size: "a4" });
		expect(page.margins).toEqual({ top: 38, right: 18, bottom: 22, left: 18 });
		expect(page.header_footer?.header).toMatchObject({ ext: "svg", x: 0, y: 0, w: 210 });
		expect(page.header_footer?.footer).toMatchObject({ ext: "svg", x: 0, w: 210 });
	});

	it("keeps every other mode's stored settings", () => {
		const stored = JSON.stringify({ preprinted: { top: 60, right: 10, bottom: 30, left: 10 } });
		expect(parseStationery(demoLetterheadSettings(stored).pdf_stationery).preprinted).toEqual({ top: 60, right: 10, bottom: 30, left: 10 });
	});
});
