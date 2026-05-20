// Resizable table columns — drag the divider between header cells to
// widen / narrow a column. Widths persist to localStorage per-page so
// a user's layout survives reloads (per-machine, not per-tenant).
//
// Usage on a list page:
//   const cols = useResizableColumns("invoices", [
//     { key: "number", default: 130 },
//     { key: "client", default: 220 },
//     ...
//   ]);
//   <table class="table-fixed w-full">
//     <colgroup>
//       <col v-for="c in COLUMNS" :key="c.key"
//            :style="{ width: cols.widths[c.key] + 'px' }">
//     </colgroup>
//     <ResizableTh @resize-start="cols.startResize('number', $event)" ...>
//       Number
//     </ResizableTh>

import { reactive, ref, watch } from "vue";

export interface ResizableColumn {
	key: string
	/** Starting width in pixels — used when nothing's in localStorage yet. */
	default: number
	/** Minimum width the user can drag down to (default 60px). */
	min?: number
	/** Maximum width the user can drag up to (default 1000px). */
	max?: number
}

const STORAGE_NAMESPACE = "sakoram.tableWidths";

const clamp = (n: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, n));

export function useResizableColumns(pageKey: string, columns: ResizableColumn[]) {
	const storageKey = `${STORAGE_NAMESPACE}.${pageKey}`;
	const minOf = (key: string): number =>
		columns.find((c) => c.key === key)?.min ?? 60;
	const maxOf = (key: string): number =>
		columns.find((c) => c.key === key)?.max ?? 1000;

	// Seed from defaults, then overlay any saved widths.
	const initial: Record<string, number> = {};
	for (const c of columns) initial[c.key] = c.default;
	if (typeof localStorage !== "undefined") {
		try {
			const saved = localStorage.getItem(storageKey);
			if (saved) {
				const parsed = JSON.parse(saved) as Record<string, unknown>;
				for (const c of columns) {
					const v = parsed[c.key];
					if (typeof v === "number" && Number.isFinite(v)) {
						initial[c.key] = clamp(v, minOf(c.key), maxOf(c.key));
					}
				}
			}
		} catch { /* malformed entry — fall back to defaults */ }
	}

	const widths = ref<Record<string, number>>(initial);

	// Persist on every change. localStorage writes are cheap enough that
	// we don't bother debouncing during a drag.
	watch(widths, (next) => {
		if (typeof localStorage === "undefined") return;
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
		} catch { /* quota / private-mode — best-effort */ }
	}, { deep: true });

	/// Begin a drag-to-resize on `columnKey`. Wires window-level
	/// mousemove/mouseup listeners (so the drag survives the cursor
	/// leaving the original header cell), and forces a col-resize cursor
	/// on the body for the duration.
	const startResize = (columnKey: string, event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const startWidth = widths.value[columnKey] ?? minOf(columnKey);
		const min = minOf(columnKey);
		const max = maxOf(columnKey);

		const onMove = (e: MouseEvent): void => {
			const next = clamp(startWidth + (e.clientX - startX), min, max);
			widths.value = { ...widths.value, [columnKey]: next };
		};
		const onUp = (): void => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			document.body.style.removeProperty("cursor");
			document.body.style.removeProperty("user-select");
		};

		// Lock the cursor and suppress text selection across the page
		// during the drag.
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	/// Snap every column back to its default. Useful for a "Reset
	/// columns" action in a list page's overflow menu.
	const reset = (): void => {
		const next: Record<string, number> = {};
		for (const c of columns) next[c.key] = c.default;
		widths.value = next;
	};

	// Wrap in reactive() so templates can do `cols.widths.foo` without
	// the .value dance — same convenience pattern useListView uses.
	// A plain { widths, ... } would expose `widths` as the raw ref in
	// templates (Vue only auto-unwraps refs inside reactive proxies or
	// at the top level of setup state).
	return reactive({ widths, startResize, reset });
}
