// Undo / redo for the page designer: a plain past / present / future stack of
// immutable snapshots (the designer's whole draft — design, paper, Document
// style, accent and font — so every kind of change undoes). The page records
// once per gesture (pointer up, the end of a nudge), not per pointer move.
// Lives as long as the designer window does (spec: "undo/redo for as long as
// the window stays open").
//
// Pure, store-free (vitest).

/**
 * `merge`: the key of the last record, when it asked to be merged with the
 * next one of the same key (a burst of typing in one text box is one step).
 */
export interface History<T> { past: T[], present: T, future: T[], merge?: string }

/** How many steps back undo can go. */
export const HISTORY_LIMIT = 100;

export function startHistory<T>(present: T): History<T> {
	return { past: [], present, future: [] };
}

/**
 * `next` as the new present; nothing when it equals the present. Clears the
 * redo trail. With `opts.merge`, a record right after one with the same key
 * replaces the present instead of adding a step.
 */
export function record<T>(h: History<T>, next: T, opts?: { merge?: string }): History<T> {
	if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
	const merge = opts?.merge;
	if (merge !== undefined && merge === h.merge) return { past: h.past, present: next, future: [], merge };
	const past = [...h.past, h.present];
	return { past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), present: next, future: [], merge };
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

/**
 * The history after a Save: a fresh start. Save deletes the image files the
 * saved design dropped (design-draft filesToRemove), so undo must not reach
 * back to a design that still points at them.
 */
export const afterSave = <T>(saved: T): History<T> => startHistory(saved);
