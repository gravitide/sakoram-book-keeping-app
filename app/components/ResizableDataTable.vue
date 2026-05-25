<template>
	<div ref="tableWrap">
		<DataTable
			:key="tableKey"
			v-model:context-menu-selection="ctxRow"
			:selection="selectable ? selection : undefined"
			:value="rows"
			:data-key="dataKey"
			striped-rows
			show-gridlines
			removable-sort
			resizable-columns
			column-resize-mode="expand"
			state-storage="local"
			:state-key="stateKey"
			paginator
			:rows="effectiveRows"
			:rows-per-page-options="rowsPerPageOptions"
			current-page-report-template="Showing {first} to {last} of {totalRecords}"
			paginator-template="FirstPageLink PrevPageLink NextPageLink LastPageLink CurrentPageReport"
			:sort-field="defaultSortField"
			:sort-order="defaultSortOrder"
			class="text-sm"
			:table-style="tableStyle"
			:context-menu="!!rowActions"
			@row-click="onRowClickInternal"
			@row-contextmenu="onRowContextMenu"
			@update:selection="(value: T[] | T | null) => emit('update:selection', Array.isArray(value) ? value : [])"
		>
			<!-- Prepend a checkbox selection column when `selectable` is on.
				PrimeVue stamps each cell with `data-p-selection-column='true'`
				so the row-click handler + CSS can identify and skip it
				when picking the "first clickable cell".

				`selectionMode="multiple"` is set on the column only, NOT
				on the parent DataTable — setting it on the DataTable
				would also enable click-anywhere-on-a-row to toggle
				selection, which fights our `@row-click → open detail`
				flow (a click on the first cell would both open AND
				tick). Column-only keeps selection scoped to the
				checkbox itself; `v-model:selection` still works the
				same way. -->
			<Column
				v-if="selectable"
				selection-mode="multiple"
				:exportable="false"
				header-style="width: 3rem"
				:style="{ width: '3rem' }"
			/>
			<!-- Pass-through: PrimeVue's `<DataTable>` discovers `<Column>`
				children from its default slot, so projecting the parent's
				default slot here works the same as nesting Columns
				directly under DataTable. -->
			<slot />

			<!-- Custom rows-per-page picker rendered at the end of the
				paginator strip. PrimeVue's built-in RowsPerPageDropdown
				only takes a number[] — we want a "Fit" option that
				auto-sizes the page to the viewport, so we drop the
				built-in dropdown from paginator-template and render our
				own here.

				Paginator strip layout reads left → right as
				`[<<] [<] [>] [>>] Showing N..M of T  /  Per page [Fit]`.

				The buttons come first in `paginator-template` (above)
				so the "Showing …" report — whose width changes as
				the user pages through — grows / shrinks to the RIGHT
				of the buttons rather than pushing them around. Was
				the other way before; every page click visibly shifted
				the nav buttons horizontally. -->
			<template #paginatorend>
				<div class="flex items-center gap-2 text-sm ml-2">
					<span class="text-(--ui-text-muted)">Per page</span>
					<USelect
						v-model="pageSizeChoice"
						:items="pageSizeOptions"
						value-key="value"
						label-key="label"
						class="w-32"
					/>
				</div>
			</template>
		</DataTable>

		<!-- Row right-click menu. Renders only when the parent supplied a
			`row-actions` callback. Same `{ label, icon, onSelect }`
			grouped-by-divider shape every list page was already using;
			we adapt to PrimeVue's `MenuItem` (`command`, `separator`)
			inside this component so callers don't need to know. -->
		<ContextMenu
			v-if="rowActions"
			ref="rowCtxMenu"
			:model="ctxItems"
			@hide="ctxRow = null"
		>
			<template #item="{ item, props: itemProps }">
				<a
					v-if="!item.separator"
					class="flex items-center cursor-pointer text-sm select-none"
					v-bind="itemProps.action"
				>
					<UIcon
						v-if="item.icon"
						:name="item.icon"
						class="size-5 text-(--ui-text-muted) shrink-0"
					/>
					<span>{{ item.label }}</span>
				</a>
			</template>
		</ContextMenu>
	</div>
</template>

<script setup lang="ts" generic="T extends Record<string, unknown>">
	import type { DataTableRowClickEvent, DataTableRowContextMenuEvent } from "primevue/datatable";
	import type { MenuItem } from "primevue/menuitem";
	import { useDragToScroll } from "~/composables/useDragToScroll";

	/**
	 * Shared wrapper around PrimeVue's `<DataTable>` that bundles every
	 * cross-list piece of UX we'd otherwise repeat on every page:
	 *
	 *  - Wrapping `<div>` + `useDragToScroll` so the body pans on
	 *    left-click-drag once columns exceed the viewport.
	 *  - LocalStorage persistence (sort / page / page-size) via PrimeVue's
	 *    `state-storage="local"` + `:state-key`, plus an opt-out for
	 *    column widths: persisted widths are stripped on every entry so
	 *    the table always opens content-fitted across `width: 100%`.
	 *    Within the session, resizes still grow the table as expected.
	 *  - Optional right-click context menu fed by a `rowActions` callback
	 *    that returns grouped `{ label, icon, onSelect }` items — same
	 *    shape every list page was already producing.
	 *
	 * Callers stay in control of column definitions (default slot) and
	 * where the auto-fit button lives in their filter strip (we
	 * `defineExpose({ autoFit })` so the page wires it up).
	 *
	 * The component is generic over the row type `T`; `@row-click` emits
	 * the typed row so callers can route to detail pages without
	 * casting.
	 */

	interface RowAction {
		label: string
		icon: string
		onSelect: () => void
	}

	interface Props {
		rows: T[]
		stateKey: string
		dataKey?: string
		rowActions?: (row: T) => RowAction[][]
		defaultSortField?: string
		defaultSortOrder?: 1 | -1
		tableStyle?: string
		rowsPerPage?: number
		rowsPerPageOptions?: number[]
		// When true, prepends a multi-select checkbox column and binds
		// PrimeVue's `:selection`/`@update:selection` through the
		// `selection` v-model. The page receives the selection array and
		// owns whatever it wants to do with it (e.g. bulk PDF on payslips).
		selectable?: boolean
		selection?: T[]
	}

	const props = withDefaults(defineProps<Props>(), {
		dataKey: "id",
		rowActions: undefined,
		defaultSortField: undefined,
		defaultSortOrder: -1,
		// `width: 100%` so the table always fills its container on first
		// paint; no `min-width` floor — content drives the natural
		// width, and resize-mode="expand" still grows the table past the
		// container when the user widens a column. Pages with very wide
		// content (and that want a guaranteed scroll-region) can still
		// pass their own `:table-style="'width: 100%; min-width: 60rem'"`.
		tableStyle: "width: 100%",
		rowsPerPage: 15,
		rowsPerPageOptions: () => [10, 15, 25, 50, 100],
		selectable: false,
		selection: () => []
	});

	const emit = defineEmits<{
		rowClick: [row: T]
		"update:selection": [rows: T[]]
	}>();

	// Strip persisted column widths on every page entry so the table
	// opens at the browser's content-fitted natural widths every time —
	// `width: 100%` on the table then stretches it across the container.
	// Runs synchronously in setup (before mount) so PrimeVue never reads
	// the stale widths.
	if (typeof localStorage !== "undefined") {
		try {
			const raw = localStorage.getItem(props.stateKey);
			if (raw) {
				const state = JSON.parse(raw) as Record<string, unknown>;
				delete state.columnWidths;
				delete state.tableWidth;
				localStorage.setItem(props.stateKey, JSON.stringify(state));
			}
		} catch {
			// Malformed state — nuke it; next render writes fresh defaults.
			localStorage.removeItem(props.stateKey);
		}
	}

	const tableWrap = ref<HTMLElement | null>(null);
	useDragToScroll(".p-datatable-table-container", tableWrap);

	// --- Page-size picker (with "Fit") ------------------------------------
	// Replaces PrimeVue's built-in RowsPerPageDropdown so we can offer a
	// "Fit" option that auto-sizes the page to whatever rows the current
	// viewport can comfortably hold. PrimeVue's :rows is driven from our
	// `effectiveRows` computed; everything else (paging buttons, current
	// page indicator) stays untouched.
	type PageSizeChoice = number | "fit";
	const pageSizeStorageKey = `${props.stateKey}:pageSize`;

	// Default to "fit" — most useful for a desktop app where the user
	// expects the table to fill the pane. A persisted numeric pick
	// (from a previous session) wins; otherwise we land on fit.
	const readPersisted = (): PageSizeChoice => {
		if (typeof localStorage === "undefined") return "fit";
		try {
			const raw = localStorage.getItem(pageSizeStorageKey);
			if (raw === "fit") return "fit";
			if (raw === null) return "fit";
			const n = Number(raw);
			return Number.isFinite(n) && n > 0 ? n : "fit";
		} catch {
			return "fit";
		}
	};

	const pageSizeChoice = ref<PageSizeChoice>(readPersisted());

	watch(pageSizeChoice, (v) => {
		if (typeof localStorage === "undefined") return;
		try {
			localStorage.setItem(pageSizeStorageKey, String(v));
		} catch { /* quota / disabled storage — ignore */ }
	});

	// `fitCount` is the number of rows the viewport can hold given the
	// table's vertical position. Re-measured on mount, on window resize,
	// and whenever the user switches to "Fit". Bounded at 3 (a single
	// row table doesn't make sense) and at 200 (sanity ceiling).
	const fitCount = ref<number>(props.rowsPerPage);

	// Empirical chrome accounting for our DataTable styling. Header is
	// ~36px (compact padding), each body row ~36px, paginator strip
	// ~56px including its borders, plus a small bottom buffer so the
	// last row isn't flush against the paginator border.
	const ROW_PX = 36;
	const HEADER_PX = 40;
	const BELOW_TABLE_PX = 80;

	// Trim 2 rows off the raw calculation — empirical eyeballing showed
	// the table sat 2 rows taller than the comfortable mark, with the
	// last rows pressing right up against the paginator. The right
	// long-term fix is to lift the per-row height + chrome from real
	// measurements rather than constants, but a small fixed nudge keeps
	// the math simple and the result reliable across pages.
	const FIT_SAFETY_ROWS = 2;

	const recomputeFit = () => {
		if (typeof window === "undefined") return;
		const wrapEl = tableWrap.value;
		if (!wrapEl) return;
		const tableTop = wrapEl.getBoundingClientRect().top;
		const available = window.innerHeight - tableTop - HEADER_PX - BELOW_TABLE_PX;
		const n = Math.floor(available / ROW_PX) - FIT_SAFETY_ROWS;
		fitCount.value = Math.max(3, Math.min(200, n));
	};

	const effectiveRows = computed<number>(() =>
		pageSizeChoice.value === "fit" ? fitCount.value : pageSizeChoice.value
	);

	// Build the dropdown options. The "Fit" entry shows the resolved
	// count so the user can see what the auto-sizing arrived at.
	const pageSizeOptions = computed<{ label: string, value: PageSizeChoice }[]>(() => {
		const fitLabel = `Fit (${fitCount.value})`;
		return [
			{ label: fitLabel, value: "fit" },
			...props.rowsPerPageOptions.map((n) => ({ label: String(n), value: n }))
		];
	});

	onMounted(() => {
		nextTick(recomputeFit);
		window.addEventListener("resize", recomputeFit);
	});
	onBeforeUnmount(() => {
		window.removeEventListener("resize", recomputeFit);
	});

	// When the user switches to "Fit" from a fixed number, recompute
	// straight away so the table doesn't stay at the old size for a beat.
	watch(pageSizeChoice, (v) => {
		if (v === "fit") recomputeFit();
	});

	// `tableKey` forces a DataTable remount when `autoFit()` is called,
	// which lets the browser re-measure content widths from scratch
	// without a full page reload.
	const tableKey = ref(0);
	function autoFit() {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(props.stateKey);
		}
		tableKey.value++;
	}
	defineExpose({ autoFit });

	// Row-click navigation is intentionally scoped to the **first body
	// cell** of each row, not the whole row. Two reasons:
	//   1. Drag-to-scroll: with the whole row clickable, even a short
	//      pan would tug on the 5px threshold and risk an accidental
	//      navigation. Limiting clicks to the first cell leaves every
	//      other cell as a clean drag surface.
	//   2. Cleaner mental model: the leading column (number, name, id)
	//      reads as the "link" the way it does on GitHub / GitLab
	//      tables — supported visually by the cursor + hover-color
	//      treatment in `main.css`.
	// Right-click still opens the context menu on the entire row via
	// `@row-contextmenu` — that handler doesn't care about cell scope.
	const onRowClickInternal = (e: DataTableRowClickEvent) => {
		const target = e.originalEvent.target as HTMLElement | null;
		const cell = target?.closest("td");
		const cellRow = cell?.parentElement;
		if (!cell || !cellRow) return;
		// "First clickable cell" = the first <td> that isn't the
		// selection column. PrimeVue stamps selection cells with
		// `data-p-selection-column="true"`, so we walk past any of those.
		const firstClickable = cellRow.querySelector(
			":scope > td:not([data-p-selection-column='true'])"
		);
		if (cell !== firstClickable) return;
		const row = e.data as T | undefined;
		if (row) emit("rowClick", row);
	};

	// ContextMenu wiring. The DataTable's `v-model:context-menu-selection`
	// is bound to `ctxRow` so the theme-coloured focus ring lands on the
	// right-clicked row (cleared on menu hide so the highlight doesn't
	// linger).
	const rowCtxMenu = ref<{ show: (e: Event) => void } | null>(null);
	const ctxRow = ref<T | null>(null);
	const ctxItems = ref<MenuItem[]>([]);

	const onRowContextMenu = (e: DataTableRowContextMenuEvent) => {
		if (!props.rowActions) return;
		const row = e.data as T | undefined;
		if (!row) return;
		ctxItems.value = toContextMenuItems(props.rowActions(row));
		rowCtxMenu.value?.show(e.originalEvent);
	};

	// Adapt the page's `{ label, icon, onSelect }` grouped shape into
	// PrimeVue's `MenuItem` (`command` for the handler, `{ separator: true }`
	// between groups).
	function toContextMenuItems(groups: RowAction[][]): MenuItem[] {
		const flat: MenuItem[] = [];
		groups.forEach((group, gi) => {
			if (gi > 0 && group.length > 0) flat.push({ separator: true });
			for (const item of group) {
				flat.push({ label: item.label, icon: item.icon, command: item.onSelect });
			}
		});
		return flat;
	}
</script>
