import { describe, expect, it } from "vitest";
import { designerShortcutsAllowed } from "./designer-keys";

const el = (tagName: string, opts: { editable?: boolean, inDialog?: boolean } = {}) => ({
	tagName,
	isContentEditable: opts.editable ?? false,
	closest: (sel: string) => (sel === "[role=dialog]" && opts.inDialog ? {} : null)
});

describe("designerShortcutsAllowed", () => {
	it("is on for the page and the canvas", () => {
		expect(designerShortcutsAllowed(el("BODY"))).toBe(true);
		expect(designerShortcutsAllowed(el("DIV"))).toBe(true);
		expect(designerShortcutsAllowed(null)).toBe(true);
	});

	it("is off while typing, so Backspace and Ctrl+Z edit the text", () => {
		expect(designerShortcutsAllowed(el("INPUT"))).toBe(false);
		expect(designerShortcutsAllowed(el("TEXTAREA"))).toBe(false);
		expect(designerShortcutsAllowed(el("DIV", { editable: true }))).toBe(false);
	});

	it("is off inside a dialog, so the crop or confirm dialog's keys never edit the design behind it", () => {
		expect(designerShortcutsAllowed(el("BUTTON", { inDialog: true }))).toBe(false);
	});
});
