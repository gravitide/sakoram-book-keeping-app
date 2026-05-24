<template>
	<div>
		<!-- Linked state: a compact summary of the chosen bill. -->
		<div
			v-if="selectedBill"
			class="flex items-center gap-2 rounded-md border border-(--ui-border) bg-(--ui-bg-elevated)/40 px-3 py-2"
		>
			<UIcon name="i-lucide-file-input" class="size-4 text-(--ui-text-muted) shrink-0" />
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium tabular-nums">
					{{ selectedBill.number }}
				</div>
				<div class="text-xs text-(--ui-text-muted) truncate">
					{{ vendorName(selectedBill) }} · {{ formatLKR(selectedBill.total_cents) }}
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
					aria-label="Unlink bill"
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
			Link a bill
		</UButton>
		<span v-else class="text-sm text-(--ui-text-muted)">Not linked</span>

		<!-- Picker modal: search + status chips + a ResizableDataTable
			(same component every list page uses) so sort / paginate / drag-pan
			all behave the same as the bills list itself. `sm:max-w-5xl`
			gives the wider columns (Number / Vendor / Issued / Total /
			Balance / Status) enough room to read at a glance. -->
		<UModal v-model:open="open" title="Link a bill" :ui="{ content: 'sm:max-w-5xl' }">
			<template #body>
				<div class="space-y-3">
					<UInput
						v-model="search"
						placeholder="Search by bill number or vendor…"
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

					<ResizableDataTable
						:rows="rows"
						state-key="voucher-link-bill"
						default-sort-field="issue_date"
						:default-sort-order="-1"
						@row-click="(row: PickerRow) => pick(row.id)"
					>
						<Column field="number" header="Number" sortable>
							<template #body="{ data }">
								<div class="truncate font-medium tabular-nums">
									{{ data.number }}
								</div>
							</template>
						</Column>
						<Column field="_vendor" header="Vendor" sortable>
							<template #body="{ data }">
								<div class="truncate">
									{{ data._vendor }}
								</div>
							</template>
						</Column>
						<Column field="issue_date" header="Issued" sortable>
							<template #body="{ data }">
								<div class="truncate text-(--ui-text-muted) tabular-nums">
									{{ data.issue_date }}
								</div>
							</template>
						</Column>
						<Column field="total_cents" header="Total" sortable :style="{ textAlign: 'right' }">
							<template #body="{ data }">
								<div class="truncate text-right tabular-nums">
									{{ formatLKR(data.total_cents) }}
								</div>
							</template>
						</Column>
						<Column field="_balance" header="Balance" sortable :style="{ textAlign: 'right' }">
							<template #body="{ data }">
								<div class="truncate text-right tabular-nums">
									<span v-if="data._balance === 0" class="text-(--ui-text-muted)">—</span>
									<span v-else>{{ formatLKR(data._balance) }}</span>
								</div>
							</template>
						</Column>
						<Column field="_status" header="Status" sortable>
							<template #body="{ data }">
								<StatusBadge :status="data._status" />
							</template>
						</Column>
					</ResizableDataTable>

					<p class="text-xs text-(--ui-text-muted)">
						{{ rows.length }} bill{{ rows.length === 1 ? "" : "s" }} · cancelled bills are hidden · click the Number to link
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
// Linked-bill picker field. Replaces a flat dropdown — with hundreds of
// bills a searchable table is far easier to navigate. v-model is the
// bill id (or null when unlinked). The field shows a compact summary of
// the chosen bill; clicking Change / "Link a bill" opens a modal with a
// search box, status-filter chips, and a clickable ResizableDataTable
// (same component the bills list page uses, so sort / paginate / drag-pan
// all behave identically).
//
// Cancelled bills are excluded from the picker — you wouldn't link a
// payment to a voided bill — but a bill already linked before it was
// cancelled still renders in the summary box.

	import type { BillRow, BillStatus } from "~/stores/bills";
	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";

	// Row shape passed into ResizableDataTable. Mirrors the bills list
	// page's pattern of stamping synthetic fields on each row so PrimeVue's
	// by-field sorting matches the rendered cell — sorting by `_vendor`
	// sorts by the parsed snapshot name, not the JSON blob; sorting by
	// `_balance` sorts by the derived outstanding amount, etc.
	interface PickerRow extends BillRow {
		_vendor: string
		_balance: number
		_status: BillStatus
	}

	interface Props {
		modelValue: number | null
		disabled?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false });
	const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

	const billsStore = useBillsStore();

	const open = ref(false);
	const search = ref("");
	const statusFilters = ref<BillStatus[]>([]);

	// Picker only offers the derived payment states — cancelled bills are
	// filtered out entirely, so there's no chip for them.
	const STATUSES: BillStatus[] = ["unpaid", "partial", "paid", "overdue"];
	const STATUS_LABEL: Record<BillStatus, string> = {
		unpaid: "Unpaid",
		partial: "Partial",
		paid: "Paid",
		overdue: "Overdue",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<BillStatus, string> = {
		unpaid: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		overdue: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const chipClass = (s: BillStatus): string =>
		statusFilters.value.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;
	const toggleStatus = (s: BillStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};

	const vendorName = (b: BillRow): string => {
		try {
			return (JSON.parse(b.vendor_snapshot) as { name?: string }).name ?? "(vendor)";
		} catch {
			return "(vendor)";
		}
	};

	const selectedBill = computed<BillRow | null>(() =>
		props.modelValue ? billsStore.bills.find((b) => b.id === props.modelValue) ?? null : null
	);

	// Open (non-cancelled) bills, narrowed by the search box and the
	// status chips, projected into the synthetic-fielded shape the table
	// consumes. ResizableDataTable handles sort + paginate from here.
	const rows = computed<PickerRow[]>(() => {
		const q = search.value.trim().toLowerCase();
		return billsStore.bills
			.filter((b) => {
				if (b.status === "cancelled") return false;
				if (statusFilters.value.length > 0
					&& !statusFilters.value.includes(billsStore.derivedStatus(b))) {
					return false;
				}
				if (!q) return true;
				return (
					b.number.toLowerCase().includes(q)
					|| vendorName(b).toLowerCase().includes(q)
				);
			})
			.map((b) => ({
				...b,
				_vendor: vendorName(b),
				_balance: billsStore.balanceCentsFor(b),
				_status: billsStore.derivedStatus(b)
			}));
	});

	const pick = (id: number) => {
		emit("update:modelValue", id);
		open.value = false;
	};
</script>
