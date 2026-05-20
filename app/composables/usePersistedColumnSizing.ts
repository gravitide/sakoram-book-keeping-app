// Persist a TanStack Table column-sizing state to localStorage. Pair
// with NuxtUI's UTable via `v-model:column-sizing`:
//
//   const columnSizing = usePersistedColumnSizing("invoices", {
//     number: 130, client: 220, project: 240, ...
//   });
//   <UTable :data v-model:column-sizing="columnSizing" ... />
//
// Keys are accessorKey (or whatever column ID TanStack derives). The
// stored value is a plain Record<string, number>. Per-machine, not
// per-tenant.

import { ref, watch } from "vue";

const STORAGE_NAMESPACE = "sakoram.tableWidths";

export function usePersistedColumnSizing(
	pageKey: string,
	defaults: Record<string, number>
) {
	const storageKey = `${STORAGE_NAMESPACE}.${pageKey}`;
	let initial: Record<string, number> = { ...defaults };

	if (typeof localStorage !== "undefined") {
		try {
			const saved = localStorage.getItem(storageKey);
			if (saved) {
				const parsed = JSON.parse(saved) as Record<string, unknown>;
				const sanitised: Record<string, number> = { ...defaults };
				for (const k of Object.keys(parsed)) {
					const v = parsed[k];
					if (typeof v === "number" && Number.isFinite(v) && v > 0) {
						sanitised[k] = v;
					}
				}
				initial = sanitised;
			}
		} catch { /* malformed — fall back to defaults */ }
	}

	const state = ref<Record<string, number>>(initial);

	watch(state, (next) => {
		if (typeof localStorage === "undefined") return;
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
		} catch { /* quota / private-mode — best-effort */ }
	}, { deep: true });

	return state;
}
