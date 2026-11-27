// Undo / redo for the page designer: a plain past / present / future stack of
// immutable snapshots (the designer's whole draft — design, paper, Document
// style, accent and font — so every kind of change undoes). The page records
// once per gesture (pointer up, the end of a nudge), not per pointer move.
// Lives as long as the designer window does (spec: "undo/redo for as long as
// the window stays open").
//
// Pure, store-free (vitest).

export interface History<T> { past: T[], present: T, future: T[] }

/** How many steps back undo can go. */
export const HISTORY_LIMIT = 100;

export function startHistory<T>(present: T): History<T> {
	return { past: [], present, future: [] };
}

/** `next` as the new present; nothing when it equals the present. Clears the redo trail. */
export function record<T>(h: History<T>, next: T): History<T> {
	if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
	const past = [...h.past, h.present];
	return { past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
	if (h.past.length === 0) return h;
	return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
	if (h.future.length === 0) return h;
	return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
