// Whether the page designer's keyboard shortcuts (Delete, Ctrl+Z, Ctrl+D…)
// may act on a key press. Not while the user is typing — Backspace and Ctrl+Z
// belong to the text field — and not inside a dialog (the crop or confirm
// dialog), whose keys must never edit the design behind it.
//
// Pure (vitest): takes the event target's shape, not a DOM type.

interface KeyTarget {
	tagName?: string
	isContentEditable?: boolean
	closest?: (selector: string) => unknown
}

export function designerShortcutsAllowed(target: KeyTarget | null): boolean {
	if (!target) return true;
	if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return false;
	return !target.closest?.("[role=dialog]");
}
