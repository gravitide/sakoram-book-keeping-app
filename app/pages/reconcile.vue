<template>
	<div class="select-none">
		<!-- Top toolbar: title + help + import button -->
		<div class="mb-4 flex items-center justify-between gap-4 flex-wrap">
			<h1 class="text-2xl font-semibold flex items-center gap-3">
				Bank reconciliation
				<HelpButton slug="reconciliation" />
			</h1>
			<UButton
				size="sm"
				icon="i-lucide-upload"
				:disabled="banks.activeBanks.length === 0"
				@click="importOpen = true"
			>
				Import statement
			</UButton>
		</div>

		<!-- Bank selector + summary -->
		<UCard class="mb-6">
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UFormField label="Bank account" :ui="{ root: 'w-auto' }">
						<USelect
							v-model="selectedBankId"
							:items="bankOptions"
							value-key="value"
							class="md:w-72"
						/>
					</UFormField>
					<div class="text-sm text-(--ui-text-muted) tabular-nums">
						<span class="font-medium text-(--ui-text)">{{ matchedCount }}</span> of
						<span class="font-medium text-(--ui-text)">{{ allRows.length }}</span> reconciled
						·
						<span class="font-medium text-(--ui-text)">{{ unmatchedRows.length }}</span> unmatched
						·
						<span class="font-medium text-(--ui-text)">{{ unreconciledVouchers.length }}</span> unmatched vouchers
					</div>
				</div>
			</template>

			<!-- Status filter chips -->
			<div class="flex items-center gap-2 flex-wrap">
				<UButton
					v-for="s in STATUS_FILTERS"
					:key="s.key"
					size="xs"
					:variant="statusFilters.includes(s.key) ? 'solid' : 'soft'"
					:color="statusFilters.includes(s.key) ? 'primary' : 'neutral'"
					@click="toggleStatusFilter(s.key)"
				>
					{{ s.label }}
				</UButton>
				<UButton
					v-if="suggestedRows.length > 0"
					size="xs"
					variant="soft"
					color="primary"
					icon="i-lucide-check-check"
					class="ml-auto"
					@click="acceptAllSuggestions"
				>
					Accept all suggestions ({{ suggestedRows.length }})
				</UButton>
			</div>
		</UCard>

		<!-- Statement rows table -->
		<UCard class="mb-6">
			<template #header>
				<div class="app-chrome font-medium">
					Statement rows
				</div>
			</template>
			<div v-if="visibleRows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-search" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="allRows.length === 0">
					No statement rows yet. Click <span class="font-medium">Import statement</span> to upload a CSV.
				</div>
				<div v-else>
					No rows match the current filter.
				</div>
			</div>
			<ReconcileStatementRowList
				v-else
				:rows="visibleRows"
				:suggestions="suggestionsMap"
				@accept="onAccept"
				@unlink="onUnlink"
				@pick-other="(rowId) => openPicker(rowId)"
				@find-voucher="(rowId) => openPicker(rowId)"
				@create-voucher="(rowId) => openCreateVoucher(rowId)"
			/>
		</UCard>

		<!-- Import history -->
		<UCard v-if="importsForBank.length > 0" class="mb-6">
			<template #header>
				<div class="app-chrome font-medium">
					Imports
				</div>
			</template>
			<div class="space-y-1.5">
				<div
					v-for="imp in importsForBank"
					:key="imp.id"
					class="flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm"
				>
					<div class="min-w-0 flex-1">
						<div class="font-medium truncate">
							{{ imp.filename || "(no filename)" }}
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ imp.row_count }} row{{ imp.row_count === 1 ? '' : 's' }} · {{ imp.imported_at.split(' ')[0] }}
						</div>
					</div>
					<UButton
						size="xs"
						variant="ghost"
						color="error"
						icon="i-lucide-trash-2"
						@click="confirmDeleteImport(imp.id, imp.filename, imp.row_count)"
					/>
				</div>
			</div>
		</UCard>

		<!-- Unreconciled vouchers panel — vouchers on this bank that
			haven't been matched to a statement row. Same ResizableDataTable
			shape every other list page uses (sort, paginate, auto-fit,
			localStorage column widths) so the rhythm carries through. -->
		<UCard v-if="unreconciledVouchers.length > 0">
			<template #header>
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<div class="app-chrome font-medium">
						Unreconciled vouchers ({{ unreconciledVouchers.length }})
					</div>
					<UButton
						size="xs"
						variant="soft"
						color="neutral"
						icon="i-lucide-table-columns-split"
						title="Auto-size columns to their content"
						@click="autoFitUnreconciledColumns"
					>
						Auto-fit columns
					</UButton>
				</div>
			</template>
			<div class="text-xs text-(--ui-text-muted) mb-3">
				Vouchers on this bank that aren't on the imported statement. Could be a missing entry or a bounced transaction.
			</div>
			<ResizableDataTable
				ref="unreconciledTableRef"
				:rows="unreconciledVouchers"
				state-key="reconcile-unreconciled-vouchers-table"
				default-sort-field="voucher_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/vouchers/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="voucher_type" header="Type" sortable>
					<template #body="{ data }">
						<UBadge
							:color="data.voucher_type === 'receipt' ? 'success' : 'warning'"
							variant="subtle"
							size="sm"
							class="min-w-24 justify-center uppercase tracking-wider"
						>
							{{ data.voucher_type === 'receipt' ? 'Receipt' : 'Payment' }}
						</UBadge>
					</template>
				</Column>
				<Column field="voucher_date" header="Date" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.voucher_date }}
						</div>
					</template>
				</Column>
				<Column field="party_name" header="Party" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.party_name }}
						</div>
					</template>
				</Column>
				<Column field="reference" header="Reference" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.reference || "—" }}
						</div>
					</template>
				</Column>
				<Column field="description" header="Description" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.description || "—" }}
						</div>
					</template>
				</Column>
				<Column
					field="amount_cents"
					header="Amount"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div
							class="truncate text-right tabular-nums whitespace-nowrap font-medium"
							:class="data.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'"
						>
							{{ data.voucher_type === 'receipt' ? '+' : '−' }} {{ formatLKR(data.amount_cents) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<!-- Modals — components will be created in subsequent tasks. -->
		<BankStatementImportModal
			v-model:open="importOpen"
			:bank-id="selectedBankId"
		/>
		<BankStatementVoucherPickerModal
			v-model:open="pickerOpen"
			:bank-id="selectedBankId"
			:row-id="pickerRowId"
			@picked="onPickerPicked"
		/>
		<BankStatementCreateVoucherModal
			v-model:open="createOpen"
			:bank-id="selectedBankId"
			:source-row="createSourceRow"
			@created="onVoucherCreated"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { MatchCandidate } from "~/lib/reconcile-match";
	import { formatLKR } from "~/lib/money";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Reconcile" });

	const banks = useBusinessBanksStore();
	const vouchersStore = useVouchersStore();
	const store = useBankStatementsStore();
	const toast = useToast();
	const router = useRouter();

	// Auto-fit hook for the unreconciled-vouchers ResizableDataTable —
	// same shape every list page exposes (tableRef.autoFit()) so the
	// "Auto-fit columns" button has the standard behaviour.
	const unreconciledTableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitUnreconciledColumns = () => unreconciledTableRef.value?.autoFit();

	await Promise.all([
		banks.ensureLoaded(),
		vouchersStore.ensureLoaded(),
		store.ensureLoaded()
	]);

	const selectedBankId = ref<number | null>(banks.defaultBank?.id ?? banks.activeBanks[0]?.id ?? null);

	type StatusKey = "matched" | "suggested" | "unmatched";
	const STATUS_FILTERS: { key: StatusKey, label: string }[] = [
		{ key: "matched", label: "Matched" },
		{ key: "suggested", label: "Suggested" },
		{ key: "unmatched", label: "Unmatched" }
	];
	const statusFilters = ref<StatusKey[]>([]);
	const toggleStatusFilter = (s: StatusKey) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};

	const bankOptions = computed(() =>
		banks.activeBanks.map((b) => ({
			label: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
			value: b.id
		}))
	);

	const allRows = computed(() =>
		selectedBankId.value === null
			? []
			: store.rows.filter((r) => r.business_bank_id === selectedBankId.value)
	);

	const suggestionsMap = computed<Map<number, MatchCandidate[]>>(() =>
		selectedBankId.value === null
			? new Map()
			: store.suggestMatchesFor(selectedBankId.value)
	);

	const statusOf = (row: typeof allRows.value[number]): StatusKey => {
		if (row.matched_voucher_id !== null) return "matched";
		const suggestions = suggestionsMap.value.get(row.id);
		if (suggestions && suggestions.length > 0) return "suggested";
		return "unmatched";
	};

	const matchedCount = computed(() => allRows.value.filter((r) => r.matched_voucher_id !== null).length);
	const unmatchedRows = computed(() => allRows.value.filter((r) => r.matched_voucher_id === null));
	const suggestedRows = computed(() =>
		unmatchedRows.value.filter((r) => (suggestionsMap.value.get(r.id)?.length ?? 0) > 0)
	);

	const visibleRows = computed(() => {
		if (statusFilters.value.length === 0) return allRows.value;
		return allRows.value.filter((r) => statusFilters.value.includes(statusOf(r)));
	});

	const unreconciledVouchers = computed(() =>
		selectedBankId.value === null
			? []
			: vouchersStore.vouchers
				.filter((v) => v.business_bank_id === selectedBankId.value && v.reconciled_at === null)
				.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date))
	);

	const onAccept = async (rowId: number, voucherId: number) => {
		try {
			await store.linkMatch(rowId, voucherId);
			toast.add({ title: "Linked", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Could not link", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const onUnlink = async (rowId: number) => {
		try {
			await store.unlinkMatch(rowId);
			toast.add({ title: "Unlinked", color: "info", icon: "i-lucide-unlink" });
		} catch (err) {
			toast.add({ title: "Could not unlink", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const acceptAllSuggestions = async () => {
		const ops: Promise<void>[] = [];
		for (const row of suggestedRows.value) {
			const top = suggestionsMap.value.get(row.id)?.[0];
			if (!top) continue;
			ops.push(store.linkMatch(row.id, top.voucher.id));
		}
		try {
			await Promise.all(ops);
			toast.add({ title: `Linked ${ops.length} suggestion${ops.length === 1 ? "" : "s"}`, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Some links failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// Modal state
	const importOpen = ref(false);
	const pickerOpen = ref(false);
	const pickerRowId = ref<number | null>(null);
	const openPicker = (rowId: number) => {
		pickerRowId.value = rowId;
		pickerOpen.value = true;
	};
	const onPickerPicked = async (rowId: number, voucherId: number) => {
		await onAccept(rowId, voucherId);
		pickerOpen.value = false;
	};

	const createOpen = ref(false);
	const createSourceRow = ref<typeof allRows.value[number] | null>(null);
	const openCreateVoucher = (rowId: number) => {
		createSourceRow.value = allRows.value.find((r) => r.id === rowId) ?? null;
		createOpen.value = true;
	};
	const onVoucherCreated = async () => {
		createOpen.value = false;
		await Promise.all([store.load(), vouchersStore.load()]);
	};

	// Imports for the selected bank, newest first.
	const importsForBank = computed(() =>
		selectedBankId.value === null
			? []
			: store.imports.filter((i) => i.business_bank_id === selectedBankId.value)
	);

	// Delete-import confirmation. Uses window.confirm for v1 simplicity;
	// upgrade to a UModal later if the question grows more nuanced. The
	// store's deleteImport handles the cascade: clears reconciled_at on
	// every matched voucher, then deletes the import (CASCADE drops the
	// statement rows).
	const confirmDeleteImport = async (id: number, filename: string | null, rowCount: number) => {
		const matchedCount = store.rows.filter(
			(r) => r.import_id === id && r.matched_voucher_id !== null
		).length;
		const msg = `Delete this import?\n\n${rowCount} statement row${rowCount === 1 ? "" : "s"} (${filename ?? "no filename"}) will be removed. ${matchedCount} matched voucher${matchedCount === 1 ? "" : "s"} will be marked unreconciled.`;
		// eslint-disable-next-line no-alert -- v1 uses window.confirm; upgrade to UModal later
		if (!window.confirm(msg)) return;
		try {
			await store.deleteImport(id);
			toast.add({ title: "Import deleted", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};
</script>
