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

		<!-- Picker modal: search + status chips + ResizableDataTable. See
			LinkedBillField for the rationale. -->
		<UModal v-model:open="open" title="Link a payslip" :ui="{ content: 'sm:max-w-5xl' }">
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

					<ResizableDataTable
						:rows="rows"
						state-key="voucher-link-payslip"
						default-sort-field="pay_date"
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
						<Column field="_employee" header="Employee" sortable>
							<template #body="{ data }">
								<div class="truncate">
									{{ data._employee }}
								</div>
							</template>
						</Column>
						<Column field="pay_date" header="Pay date" sortable>
							<template #body="{ data }">
								<div class="truncate text-(--ui-text-muted) tabular-nums">
									{{ data.pay_date }}
								</div>
							</template>
						</Column>
						<Column field="net_cents" header="Net pay" sortable :style="{ textAlign: 'right' }">
							<template #body="{ data }">
								<div class="truncate text-right tabular-nums">
									{{ formatLKR(data.net_cents) }}
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
						{{ rows.length }} payslip{{ rows.length === 1 ? "" : "s" }} · cancelled payslips are hidden · click the Number to link
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
// Linked-payslip picker field. Mirrors LinkedBillField / LinkedInvoiceField
// — uses the shared ResizableDataTable for the picker so sort / paginate
// / drag-pan all behave the same as every list page. v-model is the
// payslip id (or null when unlinked).
//
// Cancelled payslips are excluded from the picker — you wouldn't link a
// payment to a voided payslip — but a payslip already linked before it
// was cancelled still renders in the summary box.

	import type { EmployeeSnapshot, PayslipRow, PayslipStatus } from "~/stores/payslips";
	import { formatLKR } from "~/lib/money";
	import { usePayslipsStore } from "~/stores/payslips";

	interface PickerRow extends PayslipRow {
		_employee: string
		_balance: number
		_status: PayslipStatus
	}

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

	const rows = computed<PickerRow[]>(() => {
		const q = search.value.trim().toLowerCase();
		return payslipsStore.payslips
			.filter((p) => {
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
			})
			.map((p) => ({
				...p,
				_employee: employeeName(p),
				_balance: payslipsStore.balanceCentsFor(p),
				_status: payslipsStore.derivedStatus(p)
			}));
	});

	const pick = (id: number) => {
		emit("update:modelValue", id);
		open.value = false;
	};
</script>
