<template>
	<div>
		<!-- Linked state: a compact summary of the chosen invoice. -->
		<div
			v-if="selectedInvoice"
			class="flex items-center gap-2 rounded-md border border-(--ui-border) bg-(--ui-bg-elevated)/40 px-3 py-2"
		>
			<UIcon name="i-lucide-receipt" class="size-4 text-(--ui-text-muted) shrink-0" />
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium tabular-nums">
					{{ selectedInvoice.number }}
				</div>
				<div class="text-xs text-(--ui-text-muted) truncate">
					{{ clientName(selectedInvoice) }} · {{ formatLKR(selectedInvoice.total_cents) }}
				</div>
			</div>
			<template v-if="!disabled">
				<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-replace" @click="open = true">
					Change
				</UButton>
				<UButton
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-lucide-x"
					aria-label="Unlink invoice"
					@click="emit('update:modelValue', null)"
				/>
			</template>
		</div>

		<!-- Empty state. -->
		<UButton
			v-else-if="!disabled"
			variant="outline"
			color="neutral"
			icon="i-lucide-link"
			@click="open = true"
		>
			Link an invoice
		</UButton>
		<span v-else class="text-sm text-(--ui-text-muted)">Not linked</span>

		<!-- Picker modal: search + status chips + a clickable table. -->
		<UModal v-model:open="open" title="Link an invoice" :ui="{ content: 'sm:max-w-3xl' }">
			<template #body>
				<div class="space-y-3">
					<UInput
						v-model="search"
						placeholder="Search by invoice number or client…"
						icon="i-lucide-search"
						autofocus
					/>

					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<button
							v-for="s in STATUSES"
							:key="s"
							type="button"
							class="text-xs px-2.5 py-1 rounded-full border transition cursor-pointer"
							:class="chipClass(s)"
							@click="toggleStatus(s)"
						>
							{{ STATUS_LABEL[s] }}
						</button>
					</div>

					<div class="border border-(--ui-border) rounded-md max-h-[55vh] overflow-auto">
						<table class="w-full text-sm">
							<thead class="sticky top-0 z-10 bg-(--ui-bg) text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
								<tr>
									<SortableTh th-class="py-2 pl-3 pr-2 font-medium" :active="sortKey === 'number'" :dir="sortDir" @sort="toggleSort('number')">
										Number
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium" :active="sortKey === 'client'" :dir="sortDir" @sort="toggleSort('client')">
										Client
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium" :active="sortKey === 'issued'" :dir="sortDir" @sort="toggleSort('issued')">
										Issued
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium text-right" :active="sortKey === 'total'" :dir="sortDir" @sort="toggleSort('total')">
										Total
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium text-right" :active="sortKey === 'balance'" :dir="sortDir" @sort="toggleSort('balance')">
										Balance
									</SortableTh>
									<SortableTh th-class="py-2 pl-2 pr-3 font-medium" :active="sortKey === 'status'" :dir="sortDir" @sort="toggleSort('status')">
										Status
									</SortableTh>
								</tr>
							</thead>
							<tbody>
								<tr
									v-for="i in rows"
									:key="i.id"
									class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
									:class="{ 'bg-(--ui-primary)/10': i.id === modelValue }"
									@click="pick(i.id)"
								>
									<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
										{{ i.number }}
									</td>
									<td class="py-2 px-2 max-w-[12rem] truncate">
										{{ clientName(i) }}
									</td>
									<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
										{{ i.issue_date }}
									</td>
									<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
										{{ formatLKR(i.total_cents) }}
									</td>
									<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
										{{ formatLKR(invoicesStore.balanceCentsFor(i)) }}
									</td>
									<td class="py-2 pl-2 pr-3">
										<StatusBadge :status="invoicesStore.derivedStatus(i)" />
									</td>
								</tr>
							</tbody>
						</table>
						<div v-if="rows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted)">
							<UIcon name="i-lucide-receipt" class="size-8 mx-auto mb-2 opacity-50" />
							No invoices match your search.
						</div>
					</div>

					<p class="text-xs text-(--ui-text-muted)">
						{{ rows.length }} invoice{{ rows.length === 1 ? "" : "s" }} · cancelled invoices are hidden
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end w-full">
					<UButton color="neutral" variant="outline" @click="open = false">
						Close
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// Linked-invoice picker field. Replaces a flat dropdown — with hundreds
// of invoices a searchable table is far easier to navigate. v-model is
// the invoice id (or null when unlinked). The field shows a compact
// summary of the chosen invoice; clicking Change / "Link an invoice"
// opens a modal with a search box, status-filter chips, and a clickable
// table. Mirrors LinkedBillField.
//
// Cancelled invoices are excluded from the picker — you wouldn't link a
// receipt to a voided invoice — but an invoice already linked before it
// was cancelled still renders in the summary box.

	import type { SortDir } from "~/composables/useListView";
	import type { InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import { formatLKR } from "~/lib/money";
	import { useInvoicesStore } from "~/stores/invoices";

	interface Props {
		modelValue: number | null
		disabled?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false });
	const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

	const invoicesStore = useInvoicesStore();

	const open = ref(false);
	const search = ref("");
	const statusFilters = ref<InvoiceStatus[]>([]);

	// Picker offers every derived state except cancelled — cancelled
	// invoices are filtered out entirely, so there's no chip for them.
	const STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "overdue"];
	const STATUS_LABEL: Record<InvoiceStatus, string> = {
		draft: "Draft",
		sent: "Sent",
		partial: "Partial",
		paid: "Paid",
		overdue: "Overdue",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<InvoiceStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		sent: "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		overdue: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const chipClass = (s: InvoiceStatus): string =>
		statusFilters.value.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;
	const toggleStatus = (s: InvoiceStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};

	const clientName = (i: InvoiceRow): string => {
		try {
			return (JSON.parse(i.client_snapshot) as { name?: string }).name ?? "(client)";
		} catch {
			return "(client)";
		}
	};

	const selectedInvoice = computed<InvoiceRow | null>(() =>
		props.modelValue ? invoicesStore.invoices.find((i) => i.id === props.modelValue) ?? null : null
	);

	// Click-to-sort on the table headers. Starts on issue date, newest
	// first; clicking the active column flips direction, clicking a new
	// column starts it ascending.
	type SortKey = "number" | "client" | "issued" | "total" | "balance" | "status";
	const sortKey = ref<SortKey>("issued");
	const sortDir = ref<SortDir>("desc");
	const toggleSort = (key: SortKey) => {
		if (sortKey.value === key) {
			sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
		} else {
			sortKey.value = key;
			sortDir.value = "asc";
		}
	};
	const sortValue = (i: InvoiceRow): string | number => {
		switch (sortKey.value) {
		case "number": return i.number;
		case "client": return clientName(i).toLowerCase();
		case "issued": return i.issue_date;
		case "total": return i.total_cents;
		case "balance": return invoicesStore.balanceCentsFor(i);
		case "status": return invoicesStore.derivedStatus(i);
		}
	};

	// Non-cancelled invoices, narrowed by the search box and the status
	// chips, then ordered by the active sort column.
	const rows = computed<InvoiceRow[]>(() => {
		const q = search.value.trim().toLowerCase();
		const matched = invoicesStore.invoices.filter((i) => {
			if (i.status === "cancelled") return false;
			if (statusFilters.value.length > 0
				&& !statusFilters.value.includes(invoicesStore.derivedStatus(i))) {
				return false;
			}
			if (!q) return true;
			return (
				i.number.toLowerCase().includes(q)
				|| clientName(i).toLowerCase().includes(q)
			);
		});
		return matched.sort((a, b) => {
			const va = sortValue(a);
			const vb = sortValue(b);
			let cmp = typeof va === "number" && typeof vb === "number"
				? va - vb
				: String(va).localeCompare(String(vb));
			if (cmp === 0) cmp = a.id - b.id;
			return sortDir.value === "asc" ? cmp : -cmp;
		});
	});

	const pick = (id: number) => {
		emit("update:modelValue", id);
		open.value = false;
	};
</script>
