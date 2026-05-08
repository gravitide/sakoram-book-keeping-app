// Reusable list-view state: sort + paginate any reactive array.
//
// Each list page (clients, vendors, quotes, invoices, bills, vouchers,
// categories) wires a store's `filtered` computed into this composable
// along with column descriptors, and renders the resulting `paged` rows.
// Keeps every list page on the same UX (sort indicators, page size
// selector, snap-back on filter, reset on sort change) without each one
// reinventing the bookkeeping.
//
// The store still owns search/status/date filtering — this composable
// only sits on top of an already-filtered array.

import type { MaybeRefOrGetter } from "vue";
import { computed, reactive, ref, toValue, watch } from "vue";

export type SortDir = "asc" | "desc";
export type PageSize = 10 | 25 | 50 | 100;

/// Describes one sortable column to the composable. Pages may have more
/// columns in their template than they register here — only the ones with
/// a `getValue` get a click-to-sort header.
export interface ListColumn<T> {
	key: string
	getValue?: (row: T) => string | number | null
}

export interface UseListViewOptions {
	defaultSortKey?: string
	defaultDir?: SortDir
	defaultPageSize?: PageSize
}

// Returned object is wrapped in reactive() so consumers can read & write
// properties directly (`list.sortKey`, `list.page = 2`) and templates
// auto-unwrap them — no `.value` noise. Functions stay callable.
export interface UseListViewReturn<T> {
	sortKey: string | null
	sortDir: SortDir
	pageSize: PageSize
	page: number
	readonly total: number
	readonly totalPages: number
	readonly paged: T[]
	readonly rangeStart: number
	readonly rangeEnd: number
	toggleSort: (key: string) => void
	isSortable: (key: string) => boolean
}

export function useListView<T>(
	source: MaybeRefOrGetter<T[]>,
	columns: ListColumn<T>[],
	opts: UseListViewOptions = {}
): UseListViewReturn<T> {
	const sortKey = ref<string | null>(opts.defaultSortKey ?? null);
	const sortDir = ref<SortDir>(opts.defaultDir ?? "desc");
	const pageSize = ref<PageSize>(opts.defaultPageSize ?? 10);
	const page = ref<number>(1);

	const sorted = computed<T[]>(() => {
		const rows = toValue(source);
		if (!sortKey.value) return rows;
		const col = columns.find((c) => c.key === sortKey.value);
		if (!col?.getValue) return rows;
		const dir = sortDir.value === "asc" ? 1 : -1;
		// Slice first so we don't mutate the upstream array.
		return rows.slice().sort((a, b) => compare(col.getValue!(a), col.getValue!(b)) * dir);
	});

	const total = computed(() => sorted.value.length);
	const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

	const paged = computed<T[]>(() => {
		const start = (page.value - 1) * pageSize.value;
		return sorted.value.slice(start, start + pageSize.value);
	});

	const rangeStart = computed(() => total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1);
	const rangeEnd = computed(() => Math.min(page.value * pageSize.value, total.value));

	// When the underlying list shrinks (filter applied) or page-size grows,
	// snap the current page back into range so the user doesn't land on an
	// empty "page 7 of 3".
	watch([total, pageSize], () => {
		if (page.value > totalPages.value) page.value = totalPages.value;
	});

	function toggleSort(key: string) {
		const col = columns.find((c) => c.key === key);
		if (!col?.getValue) return;
		if (sortKey.value === key) {
			sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
		} else {
			sortKey.value = key;
			sortDir.value = "asc";
		}
		page.value = 1;
	}

	const sortableSet = new Set(columns.filter((c) => c.getValue).map((c) => c.key));
	function isSortable(key: string) {
		return sortableSet.has(key);
	}

	// reactive() unwraps the refs/computeds so callers do `list.sortKey`
	// instead of `list.sortKey.value`, and templates auto-unwrap. Mutations
	// (`list.page = 2`) write through to the underlying refs. The two casts
	// peel through `Ref<T> → T` so the public interface stays clean.
	const obj = {
		sortKey,
		sortDir,
		pageSize,
		page,
		total,
		totalPages,
		paged,
		rangeStart,
		rangeEnd,
		toggleSort,
		isSortable
	};
	return reactive(obj) as unknown as UseListViewReturn<T>;
}

// Localecompare with `numeric: true` makes "doc-2" sort before "doc-10".
// Nulls collate to the bottom in ascending order (matches SQLite's NULLS LAST
// convention without us having to special-case in every column).
function compare(a: string | number | null, b: string | number | null): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
