<template>
	<div ref="tableWrap">
		<DataTable
			:key="tableKey"
			v-model:context-menu-selection="ctxRow"
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
			:rows="rowsPerPage"
			:rows-per-page-options="rowsPerPageOptions"
			current-page-report-template="Showing {first} to {last} of {totalRecords}"
			paginator-template="CurrentPageReport FirstPageLink PrevPageLink NextPageLink LastPageLink RowsPerPageDropdown"
			:sort-field="defaultSortField"
			:sort-order="defaultSortOrder"
			class="text-sm"
			:table-style="tableStyle"
			:context-menu="!!rowActions"
			@row-click="onRowClickInternal"
			@row-contextmenu="onRowContextMenu"
		>
			<!-- Pass-through: PrimeVue's `<DataTable>` discovers `<Column>`
				children from its default slot, so projecting the parent's
				default slot here works the same as nesting Columns
				directly under DataTable. -->
			<slot />
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
		rowsPerPageOptions: () => [10, 15, 25, 50, 100]
	});

	const emit = defineEmits<{
		rowClick: [row: T]
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

	const onRowClickInternal = (e: DataTableRowClickEvent) => {
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
