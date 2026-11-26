import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEMO_LETTERHEAD_ACCENT, demoLetterheadSettings } from "./demo-letterhead";
import { parseStationery, resolveStationeryMode } from "./stationery";
import { svgHasLiveText } from "./stationery-artwork";

const svg = readFileSync(fileURLToPath(new URL("../assets/stationery/demo-letterhead.svg", import.meta.url)), "utf8");

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

	it("keeps every other mode's stored settings", () => {
		const stored = JSON.stringify({ preprinted: { top: 60, right: 10, bottom: 30, left: 10 } });
		expect(parseStationery(demoLetterheadSettings(stored).pdf_stationery).preprinted).toEqual({ top: 60, right: 10, bottom: 30, left: 10 });
	});
});
