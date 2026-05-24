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

		<!-- Picker modal: search + status chips + ResizableDataTable. See
			LinkedBillField for the rationale on swapping the hand-rolled
			table for the shared component. -->
		<UModal v-model:open="open" title="Link an invoice" :ui="{ content: 'sm:max-w-5xl' }">
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

					<ResizableDataTable
						:rows="rows"
						state-key="voucher-link-invoice"
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
						<Column field="_client" header="Client" sortable>
							<template #body="{ data }">
								<div class="truncate">
									{{ data._client }}
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
						{{ rows.length }} invoice{{ rows.length === 1 ? "" : "s" }} · cancelled invoices are hidden · click the Number to link
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
// Linked-invoice picker field. Mirrors LinkedBillField — see that file
// for the design notes on why we use ResizableDataTable for the picker.
// v-model is the invoice id (or null when unlinked).
//
// Cancelled invoices are excluded from the picker — you wouldn't link a
// receipt to a voided invoice — but an invoice already linked before it
// was cancelled still renders in the summary box.

	import type { InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import { formatLKR } from "~/lib/money";
	import { useInvoicesStore } from "~/stores/invoices";

	interface PickerRow extends InvoiceRow {
		_client: string
		_balance: number
		_status: InvoiceStatus
	}

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

	const rows = computed<PickerRow[]>(() => {
		const q = search.value.trim().toLowerCase();
		return invoicesStore.invoices
			.filter((i) => {
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
			})
			.map((i) => ({
				...i,
				_client: clientName(i),
				_balance: invoicesStore.balanceCentsFor(i),
				_status: invoicesStore.derivedStatus(i)
			}));
	});

	const pick = (id: number) => {
		emit("update:modelValue", id);
		open.value = false;
	};
</script>
