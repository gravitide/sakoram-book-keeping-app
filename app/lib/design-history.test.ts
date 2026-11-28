import { describe, expect, it } from "vitest";
import { afterSave, canRedo, canUndo, HISTORY_LIMIT, record, redo, startHistory, undo } from "./design-history";

describe("design history", () => {
	it("undoes and redoes a change", () => {
		const h = record(startHistory({ n: 1 }), { n: 2 });
		expect(h.present).toEqual({ n: 2 });
		expect(canUndo(h)).toBe(true);
		const back = undo(h);
		expect(back.present).toEqual({ n: 1 });
		expect(canRedo(back)).toBe(true);
		expect(redo(back).present).toEqual({ n: 2 });
	});

	it("drops the redo trail when something new happens after an undo", () => {
		const h = record(undo(record(startHistory({ n: 1 }), { n: 2 })), { n: 3 });
		expect(h.present).toEqual({ n: 3 });
		expect(canRedo(h)).toBe(false);
	});

	it("doesn't record a change that changes nothing", () => {
		const h = record(startHistory({ n: 1 }), { n: 1 });
		expect(canUndo(h)).toBe(false);
	});

	it("keeps at most HISTORY_LIMIT steps back", () => {
		let h = startHistory({ n: 0 });
		for (let n = 1; n <= 150; n++) h = record(h, { n });
		expect(h.past).toHaveLength(HISTORY_LIMIT);
		expect(h.past[0]).toEqual({ n: 50 });
	});

	it("does nothing past either end", () => {
		const h = startHistory({ n: 1 });
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});
});

describe("afterSave", () => {
	it("starts a new history: a save may have deleted files that undo would bring back", () => {
		const h = afterSave({ n: 3 });
		expect(h.present).toEqual({ n: 3 });
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});
});

describe("record with a merge key", () => {
	it("merges consecutive records with the same merge key into one step", () => {
		let h = startHistory("a");
		h = record(h, "ab", { merge: "text:x" });
		h = record(h, "abc", { merge: "text:x" });
		expect(h.past).toEqual(["a"]);
		expect(undo(h).present).toBe("a");
		expect(redo(undo(h)).present).toBe("abc");
	});

	it("starts a new step for a different key, no key, or after undo", () => {
		let h = record(startHistory("a"), "ab", { merge: "text:x" });
		h = record(h, "abY", { merge: "text:y" });
		expect(h.past).toEqual(["a", "ab"]);
		h = record(h, "abYZ");
		h = record(h, "abYZ!", { merge: "text:y" });
		expect(h.past).toEqual(["a", "ab", "abY", "abYZ"]);
		const u = record(undo(h), "q", { merge: "text:y" });
		expect(u.past).toEqual(["a", "ab", "abY", "abYZ"]);
	});
});
