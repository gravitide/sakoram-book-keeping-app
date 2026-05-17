<template>
	<div>
		<!-- Linked state: a compact summary of the chosen payslip. -->
		<div
			v-if="selectedPayslip"
			class="flex items-center gap-2 rounded-md border border-(--ui-border) bg-(--ui-bg-elevated)/40 px-3 py-2"
		>
			<UIcon name="i-lucide-file-spreadsheet" class="size-4 text-(--ui-text-muted) shrink-0" />
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium tabular-nums">
					{{ selectedPayslip.number }}
				</div>
				<div class="text-xs text-(--ui-text-muted) truncate">
					{{ employeeName(selectedPayslip) }} · {{ formatLKR(selectedPayslip.net_cents) }}
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
					aria-label="Unlink payslip"
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
			Link a payslip
		</UButton>
		<span v-else class="text-sm text-(--ui-text-muted)">Not linked</span>

		<!-- Picker modal: search + status chips + a clickable table. -->
		<UModal v-model:open="open" title="Link a payslip" :ui="{ content: 'sm:max-w-3xl' }">
			<template #body>
				<div class="space-y-3">
					<UInput
						v-model="search"
						placeholder="Search by payslip number or employee…"
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
									<SortableTh th-class="py-2 px-2 font-medium" :active="sortKey === 'employee'" :dir="sortDir" @sort="toggleSort('employee')">
										Employee
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium" :active="sortKey === 'paydate'" :dir="sortDir" @sort="toggleSort('paydate')">
										Pay date
									</SortableTh>
									<SortableTh th-class="py-2 px-2 font-medium text-right" :active="sortKey === 'net'" :dir="sortDir" @sort="toggleSort('net')">
										Net pay
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
									v-for="p in rows"
									:key="p.id"
									class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
									:class="{ 'bg-(--ui-primary)/10': p.id === modelValue }"
									@click="pick(p.id)"
								>
									<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
										{{ p.number }}
									</td>
									<td class="py-2 px-2 max-w-[12rem] truncate">
										{{ employeeName(p) }}
									</td>
									<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
										{{ p.pay_date }}
									</td>
									<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
										{{ formatLKR(p.net_cents) }}
									</td>
									<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
										{{ formatLKR(payslipsStore.balanceCentsFor(p)) }}
									</td>
									<td class="py-2 pl-2 pr-3">
										<StatusBadge :status="payslipsStore.derivedStatus(p)" />
									</td>
								</tr>
							</tbody>
						</table>
						<div v-if="rows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted)">
							<UIcon name="i-lucide-file-spreadsheet" class="size-8 mx-auto mb-2 opacity-50" />
							No payslips match your search.
						</div>
					</div>

					<p class="text-xs text-(--ui-text-muted)">
						{{ rows.length }} payslip{{ rows.length === 1 ? "" : "s" }} · cancelled payslips are hidden
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
// Linked-payslip picker field. Replaces a flat dropdown — with hundreds
// of payslips a searchable table is far easier to navigate. v-model is
// the payslip id (or null when unlinked). The field shows a compact
// summary of the chosen payslip; clicking Change / "Link a payslip"
// opens a modal with a search box, status-filter chips, and a clickable
// table. Mirrors LinkedBillField / LinkedInvoiceField.
//
// Cancelled payslips are excluded from the picker — you wouldn't link a
// payment to a voided payslip — but a payslip already linked before it
// was cancelled still renders in the summary box.

	import type { SortDir } from "~/composables/useListView";
	import type { EmployeeSnapshot, PayslipRow, PayslipStatus } from "~/stores/payslips";
	import { formatLKR } from "~/lib/money";
	import { usePayslipsStore } from "~/stores/payslips";

	interface Props {
		modelValue: number | null
		disabled?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false });
	const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

	const payslipsStore = usePayslipsStore();

	const open = ref(false);
	const search = ref("");
	const statusFilters = ref<PayslipStatus[]>([]);

	// Picker offers every derived state except cancelled — cancelled
	// payslips are filtered out entirely, so there's no chip for them.
	const STATUSES: PayslipStatus[] = ["draft", "unpaid", "partial", "paid"];
	const STATUS_LABEL: Record<PayslipStatus, string> = {
		draft: "Draft",
		unpaid: "Unpaid",
		partial: "Partial",
		paid: "Paid",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<PayslipStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		unpaid: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const chipClass = (s: PayslipStatus): string =>
		statusFilters.value.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;
	const toggleStatus = (s: PayslipStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};

	const employeeName = (p: PayslipRow): string => {
		try {
			return (JSON.parse(p.employee_snapshot) as EmployeeSnapshot).full_name ?? "(employee)";
		} catch {
			return "(employee)";
		}
	};

	const selectedPayslip = computed<PayslipRow | null>(() =>
		props.modelValue ? payslipsStore.payslips.find((p) => p.id === props.modelValue) ?? null : null
	);

	// Click-to-sort on the table headers. Starts on pay date, newest
	// first; clicking the active column flips direction, clicking a new
	// column starts it ascending.
	type SortKey = "number" | "employee" | "paydate" | "net" | "balance" | "status";
	const sortKey = ref<SortKey>("paydate");
	const sortDir = ref<SortDir>("desc");
	const toggleSort = (key: SortKey) => {
		if (sortKey.value === key) {
			sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
		} else {
			sortKey.value = key;
			sortDir.value = "asc";
		}
	};
	const sortValue = (p: PayslipRow): string | number => {
		switch (sortKey.value) {
		case "number": return p.number;
		case "employee": return employeeName(p).toLowerCase();
		case "paydate": return p.pay_date;
		case "net": return p.net_cents;
		case "balance": return payslipsStore.balanceCentsFor(p);
		case "status": return payslipsStore.derivedStatus(p);
		}
	};

	// Non-cancelled payslips, narrowed by the search box and the status
	// chips, then ordered by the active sort column.
	const rows = computed<PayslipRow[]>(() => {
		const q = search.value.trim().toLowerCase();
		const matched = payslipsStore.payslips.filter((p) => {
			if (p.status === "cancelled") return false;
			if (statusFilters.value.length > 0
				&& !statusFilters.value.includes(payslipsStore.derivedStatus(p))) {
				return false;
			}
			if (!q) return true;
			return (
				p.number.toLowerCase().includes(q)
				|| employeeName(p).toLowerCase().includes(q)
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
