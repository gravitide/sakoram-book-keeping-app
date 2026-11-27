import { describe, expect, it } from "vitest";
import { clearBackgroundArtwork, parseStationery, resolveStationeryMode, serializeStationery, setBackgroundArtwork, setBackgroundMargins, setHeaderFooterGeometry, setHeaderFooterImage, setHeaderFooterMargins, setPreprintedMargins, stationeryModeToSave } from "./stationery";

const DEFAULT_PREPRINTED = { top: 55, right: 18, bottom: 20, left: 18 };

describe("parseStationery", () => {
	it("gives Pre-printed paper today's letter bands (55 mm top, 20 mm bottom) when nothing is stored", () => {
		expect(parseStationery(null).preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("reads the business's stored Pre-printed paper bands", () => {
		const json = JSON.stringify({ preprinted: { top: 45, right: 15, bottom: 18, left: 15 } });
		expect(parseStationery(json).preprinted).toEqual({ top: 45, right: 15, bottom: 18, left: 15 });
	});

	it("falls back to the defaults when the stored text isn't JSON", () => {
		expect(parseStationery("{not json").preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("falls back to the defaults when the JSON isn't an object", () => {
		expect(parseStationery("[1, 2]").preprinted).toEqual(DEFAULT_PREPRINTED);
		expect(parseStationery("42").preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("keeps the good bands and defaults only the bad one", () => {
		const json = JSON.stringify({ preprinted: { top: "tall", right: 15, bottom: -4, left: 15 } });
		expect(parseStationery(json).preprinted).toEqual({ top: 55, right: 15, bottom: 20, left: 15 });
	});

	it("defaults a missing band", () => {
		expect(parseStationery(JSON.stringify({ preprinted: { top: 40 } })).preprinted).toEqual({ ...DEFAULT_PREPRINTED, top: 40 });
	});

	it("refuses a band too deep to leave any room on the page", () => {
		const json = JSON.stringify({ preprinted: { top: 400, right: 18, bottom: 20, left: 18 } });
		expect(parseStationery(json).preprinted.top).toBe(55);
	});

	it("round-trips through serializeStationery", () => {
		const s = parseStationery(JSON.stringify({ preprinted: { top: 61.5, right: 12, bottom: 22, left: 12 } }));
		expect(parseStationery(serializeStationery(s))).toEqual(s);
	});
});

describe("setPreprintedMargins", () => {
	it("replaces all four Pre-printed paper margins, keeping the background's settings", () => {
		const stored = setBackgroundMargins(JSON.stringify({ preprinted: { top: 55, right: 12, bottom: 20, left: 14 } }), { top: 70, right: 12, bottom: 35, left: 12 });
		const next = parseStationery(setPreprintedMargins(stored, { top: 40, right: 16, bottom: 25, left: 15 }));
		expect(next.preprinted).toEqual({ top: 40, right: 16, bottom: 25, left: 15 });
		expect(next.background.margins).toEqual({ top: 70, right: 12, bottom: 35, left: 12 });
	});

	it("never saves a band the schema refuses — it falls back to the default instead", () => {
		expect(parseStationery(setPreprintedMargins(null, { top: 999, right: Number.NaN, bottom: 20, left: 18 })).preprinted).toEqual(DEFAULT_PREPRINTED);
	});
});

describe("stationeryModeToSave", () => {
	it("keeps the stored mode when the user didn't pick another", () => {
		expect(stationeryModeToSave("header_footer", "header_footer")).toBe("header_footer");
	});

	it("saves the mode the user picked", () => {
		expect(stationeryModeToSave("background", "preprinted")).toBe("preprinted");
		expect(stationeryModeToSave("builtin", "preprinted")).toBe("preprinted");
		expect(stationeryModeToSave("preprinted", "builtin")).toBe("builtin");
		expect(stationeryModeToSave("background", "builtin")).toBe("builtin");
		expect(stationeryModeToSave("builtin", "background")).toBe("background");
	});

	it("saves the shown mode over anything the column wouldn't accept", () => {
		expect(stationeryModeToSave(null, "builtin")).toBe("builtin");
		expect(stationeryModeToSave("letterhead", "builtin")).toBe("builtin");
	});
});

describe("resolveStationeryMode", () => {
	it("returns the stored mode when the app can render it", () => {
		expect(resolveStationeryMode("builtin")).toBe("builtin");
		expect(resolveStationeryMode("preprinted")).toBe("preprinted");
		expect(resolveStationeryMode("background")).toBe("background");
	});

	it("renders Header & footer images", () => {
		expect(resolveStationeryMode("header_footer")).toBe("header_footer");
	});
});

const NO_BACKGROUND = { ext: null, paper: null, crop: null, live_text: false, margins: { top: 40, right: 18, bottom: 25, left: 18 } };

describe("full-page background settings", () => {
	it("has no artwork and default margins when nothing is stored", () => {
		expect(parseStationery(null).background).toEqual(NO_BACKGROUND);
	});

	it("reads the stored artwork, the sheet it was prepared for, its crop and margins", () => {
		const json = JSON.stringify({ background: { ext: "png", paper: "a4", crop: { x: 0, y: 10, w: 2480, h: 3508 }, live_text: false, margins: { top: 50, right: 20, bottom: 30, left: 20 } } });
		expect(parseStationery(json).background).toEqual({ ext: "png", paper: "a4", crop: { x: 0, y: 10, w: 2480, h: 3508 }, live_text: false, margins: { top: 50, right: 20, bottom: 30, left: 20 } });
	});

	it("drops an artwork format it can't render, keeping the margins", () => {
		const json = JSON.stringify({ background: { ext: "gif", margins: { top: 50, right: 20, bottom: 30, left: 20 } } });
		expect(parseStationery(json).background).toEqual({ ...NO_BACKGROUND, margins: { top: 50, right: 20, bottom: 30, left: 20 } });
	});

	it("keeps Pre-printed paper bands and a background side by side, so switching modes loses neither", () => {
		const json = JSON.stringify({ preprinted: { top: 45, right: 15, bottom: 18, left: 15 }, background: { ext: "svg" } });
		const s = parseStationery(json);
		expect(s.preprinted).toEqual({ top: 45, right: 15, bottom: 18, left: 15 });
		expect(s.background.ext).toBe("svg");
	});
});

describe("setBackgroundArtwork", () => {
	it("records the uploaded artwork and keeps the margins and other modes", () => {
		const stored = JSON.stringify({ preprinted: { top: 45, right: 15, bottom: 18, left: 15 }, background: { margins: { top: 60, right: 10, bottom: 30, left: 10 } } });
		const next = parseStationery(setBackgroundArtwork(stored, { ext: "jpg", paper: "a5", crop: { x: 1, y: 2, w: 3, h: 4 }, live_text: false }));
		expect(next.background).toEqual({ ext: "jpg", paper: "a5", crop: { x: 1, y: 2, w: 3, h: 4 }, live_text: false, margins: { top: 60, right: 10, bottom: 30, left: 10 } });
		expect(next.preprinted).toEqual({ top: 45, right: 15, bottom: 18, left: 15 });
	});

	it("remembers an SVG with live text so the warning survives a reload", () => {
		expect(parseStationery(setBackgroundArtwork(null, { ext: "svg", paper: "a4", crop: null, live_text: true })).background.live_text).toBe(true);
	});
});

describe("clearBackgroundArtwork", () => {
	it("forgets the artwork but keeps the margins", () => {
		const stored = setBackgroundMargins(setBackgroundArtwork(null, { ext: "pdf", paper: "a4", crop: null, live_text: false }), { top: 70, right: 12, bottom: 35, left: 12 });
		expect(parseStationery(clearBackgroundArtwork(stored)).background).toEqual({ ...NO_BACKGROUND, margins: { top: 70, right: 12, bottom: 35, left: 12 } });
	});
});

describe("setBackgroundMargins", () => {
	it("changes only the margins, keeping the artwork", () => {
		const stored = setBackgroundArtwork(null, { ext: "svg", paper: "a4", crop: null, live_text: false });
		expect(parseStationery(setBackgroundMargins(stored, { top: 55, right: 15, bottom: 28, left: 15 })).background).toEqual({ ext: "svg", paper: "a4", crop: null, live_text: false, margins: { top: 55, right: 15, bottom: 28, left: 15 } });
	});

	it("never saves a margin the schema refuses", () => {
		expect(parseStationery(setBackgroundMargins(null, { top: 999, right: -1, bottom: 25, left: 18 })).background.margins).toEqual(NO_BACKGROUND.margins);
	});

	it("falls back to Built-in for anything missing or unknown", () => {
		expect(resolveStationeryMode(null)).toBe("builtin");
		expect(resolveStationeryMode(undefined)).toBe("builtin");
		expect(resolveStationeryMode("letterhead")).toBe("builtin");
	});
});

const HEADER = { ext: "svg", aspect: 7, rect: { x: 0, y: 0, w: 210, h: 30 }, paper: "a4", crop: null, live_text: false } as const;
const FOOTER = { ext: "png", aspect: 14, rect: { x: 0, y: 282, w: 210, h: 15 }, paper: "a4", crop: { x: 0, y: 0, w: 2480, h: 177 }, live_text: false } as const;

describe("header & footer images settings", () => {
	it("has neither image and plain default margins when nothing is stored", () => {
		expect(parseStationery(null).header_footer).toEqual({ header: null, footer: null, margins: { top: 20, right: 18, bottom: 20, left: 18 } });
	});

	it("reads each stored image: format, proportions, placement on the page, the sheet it was placed on and its crop", () => {
		const json = JSON.stringify({ header_footer: { header: HEADER, footer: FOOTER, margins: { top: 34, right: 18, bottom: 19, left: 18 } } });
		expect(parseStationery(json).header_footer).toEqual({ header: HEADER, footer: FOOTER, margins: { top: 34, right: 18, bottom: 19, left: 18 } });
	});

	it("drops an image it can't place (unknown format, no size), keeping the other one", () => {
		const json = JSON.stringify({ header_footer: { header: { ...HEADER, ext: "gif" }, footer: FOOTER } });
		expect(parseStationery(json).header_footer.header).toBeNull();
		expect(parseStationery(json).header_footer.footer).toEqual(FOOTER);
		const flat = JSON.stringify({ header_footer: { header: { ...HEADER, rect: { x: 0, y: 0, w: 0, h: 30 } } } });
		expect(parseStationery(flat).header_footer.header).toBeNull();
	});
});

describe("setHeaderFooterImage", () => {
	it("records one image and keeps the other, the margins and every other mode", () => {
		const stored = setHeaderFooterImage(setBackgroundArtwork(null, { ext: "pdf", paper: "a4", crop: null, live_text: false }), "footer", FOOTER);
		const next = parseStationery(setHeaderFooterImage(stored, "header", HEADER));
		expect(next.header_footer.header).toEqual(HEADER);
		expect(next.header_footer.footer).toEqual(FOOTER);
		expect(next.background.ext).toBe("pdf");
	});

	it("removing one image leaves the other untouched", () => {
		const both = setHeaderFooterImage(setHeaderFooterImage(null, "header", HEADER), "footer", FOOTER);
		const next = parseStationery(setHeaderFooterImage(both, "header", null)).header_footer;
		expect(next.header).toBeNull();
		expect(next.footer).toEqual(FOOTER);
	});
});

describe("setHeaderFooterMargins", () => {
	it("changes only the margins, keeping both images", () => {
		const both = setHeaderFooterImage(setHeaderFooterImage(null, "header", HEADER), "footer", FOOTER);
		const next = parseStationery(setHeaderFooterMargins(both, { top: 40, right: 15, bottom: 30, left: 15 })).header_footer;
		expect(next).toEqual({ header: HEADER, footer: FOOTER, margins: { top: 40, right: 15, bottom: 30, left: 15 } });
	});
});

describe("setHeaderFooterGeometry", () => {
	it("moves each stored image and sets the margins, keeping each image's format, proportions and crop", () => {
		const both = setHeaderFooterImage(setHeaderFooterImage(null, "header", HEADER), "footer", FOOTER);
		const moved = { x: 50, y: 5, w: 110, h: 110 / 7 };
		const next = parseStationery(setHeaderFooterGeometry(both, { header: moved, footer: FOOTER.rect, margins: { top: 30, right: 18, bottom: 22, left: 18 } })).header_footer;
		expect(next.header).toEqual({ ...HEADER, rect: moved });
		expect(next.footer).toEqual(FOOTER);
		expect(next.margins).toEqual({ top: 30, right: 18, bottom: 22, left: 18 });
	});

	it("never brings back an image that has since been removed", () => {
		const onlyFooter = setHeaderFooterImage(null, "footer", FOOTER);
		const next = parseStationery(setHeaderFooterGeometry(onlyFooter, { header: HEADER.rect, footer: FOOTER.rect, margins: { top: 20, right: 18, bottom: 20, left: 18 } })).header_footer;
		expect(next.header).toBeNull();
		expect(next.footer).toEqual(FOOTER);
	});
});
