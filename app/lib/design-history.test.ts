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
