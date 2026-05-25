<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			vouchers, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Vouchers
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.vouchers.length }} total ·
						<span class="text-(--ui-success)">+ {{ formatLKR(store.totalReceipts) }}</span>
						received ·
						<span class="text-(--ui-error)">− {{ formatLKR(store.totalPayments) }}</span>
						paid out
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newVoucher">
				New voucher
			</UButton>
		</header>

		<!-- Content-shaped skeleton while the page hydrates. See
			usePageLoading + ListPageSkeleton for the timing rationale. -->
		<ListPageSkeleton v-if="isLoading" :chip-count="2" :column-count="7" />

		<UCard v-else>
			<template #header>
				<!-- Filter strip — chip-style type filter + Advanced
					popover for date range. Same pattern as the other
					ledgers. -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, party, reference…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<UPopover>
							<UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" class="relative">
								Advanced
								<span
									v-if="store.hasDateFilters"
									class="absolute -top-1 -right-1 size-2 rounded-full bg-(--ui-info)"
								/>
							</UButton>
							<template #content>
								<div class="p-4 w-[420px] space-y-4">
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar" class="size-3.5" />
											Voucher date
										</div>
										<DateRangeField
											v-model:from="store.dateFrom"
											v-model:to="store.dateTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="store.clearDateFilters">
											Clear date filter
										</UButton>
									</div>
								</div>
							</template>
						</UPopover>
						<UButton
							v-if="hasAnyFilter"
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset
						</UButton>
					</div>

					<!-- Type + date chip rows. Stack at sm, sit side-by-side
						from md+. items-start keeps each column flush
						with the top of the row when one wraps. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-arrow-left-right" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<button
								v-for="t in VOUCHER_TYPES"
								:key="t"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="typeChipClasses(t)"
								@click="store.toggleTypeFilter(t)"
							>
								{{ TYPE_LABEL[t] }}
							</button>
						</div>

						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<span class="text-xs text-(--ui-text-muted) mr-1">Date:</span>
							<button
								v-for="p in DATE_PRESETS"
								:key="p.key"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="datePresetClasses(p.key)"
								@click="toggleDatePreset(p.key)"
							>
								{{ p.label }}
							</button>
						</div>
					</div>
				</div>
			</template>

			<!-- Table action bar + filtered-rows summary. Auto-fit on
				the left; receipts/payments/net on the right (vouchers
				carry both directions). -->
			<div
				v-if="!store.loading && !store.error"
				class="flex justify-between items-center gap-3 flex-wrap text-sm text-(--ui-text-muted) tabular-nums mb-3"
			>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-table-columns-split"
					title="Auto-size columns to their content"
					@click="autoFitColumns"
				>
					Auto-fit columns
				</UButton>
				<div class="flex items-center gap-2 ml-auto flex-wrap">
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted) mr-1">{{ store.filtered.length }} of {{ store.vouchers.length }} shown</span>
					<StatChip label="In" color="success" :value="`+ ${formatLKR(filteredReceipts)}`" />
					<StatChip label="Out" color="error" :value="`− ${formatLKR(filteredPayments)}`" />
					<StatChip label="Net" :color="filteredNet >= 0 ? 'success' : 'error'">
						{{ filteredNet >= 0 ? '+' : '−' }} {{ formatLKR(Math.abs(filteredNet)) }}
					</StatChip>
				</div>
			</div>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading vouchers…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-ticket" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.vouchers.length === 0">
					No vouchers yet. Click <span class="font-medium">New voucher</span> to log one.
				</div>
				<div v-else>
					No vouchers match your filters.
				</div>
			</div>

			<!-- Selection action bar — renders above the table whenever any
				row is ticked. Surfaces a count + Clear + Generate PDFs. -->
			<div
				v-if="selectedRows.length > 0 && !store.loading && !store.error"
				class="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-(--ui-primary)/30 bg-(--ui-primary)/10 text-sm"
			>
				<div>
					<span class="font-medium">{{ selectedRows.length }} selected</span>
					<span class="text-(--ui-text-muted)"> · across all filters / pages</span>
				</div>
				<div class="flex items-center gap-2">
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						@click="selectedRows = []"
					>
						Clear
					</UButton>
					<UButton
						size="xs"
						icon="i-lucide-file-down"
						:loading="bulkPdf.running"
						@click="generateBulkPdfs"
					>
						Generate PDFs
					</UButton>
				</div>
			</div>

			<ResizableDataTable
				v-if="!store.loading && !store.error && store.filtered.length > 0"
				ref="tableRef"
				v-model:selection="selectedRows"
				:rows="store.filtered"
				state-key="vouchers-table"
				:row-actions="itemsFor"
				default-sort-field="voucher_date"
				:default-sort-order="-1"
				selectable
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
						<!-- Same min-w + justify-center + uppercase shape as
							StatusBadge so the Type column reads as a tidy
							stack of equal-width pills alongside the status
							columns on the other lists. -->
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
				<Column field="payment_method" header="Method" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ methodLabel(data.payment_method) }}
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

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Voucher PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- Bulk PDF progress modal. Same shape as bills/payslips —
			progress bar, current filename, error list, Cancel /
			Open folder / Done. Dismiss is blocked while running. -->
		<UModal
			:open="bulkPdf.modalOpen"
			:dismissible="false"
			:close="false"
			title="Generating voucher PDFs"
		>
			<template #body>
				<div class="space-y-3">
					<div class="text-sm">
						<div class="flex justify-between tabular-nums">
							<span>{{ bulkPdf.progress }} of {{ bulkPdf.total }}</span>
							<span class="text-(--ui-text-muted)">{{ bulkPdf.errors.length }} error{{ bulkPdf.errors.length === 1 ? "" : "s" }}</span>
						</div>
						<div class="mt-2 h-2 rounded-full bg-(--ui-bg-muted) overflow-hidden">
							<div
								class="h-full bg-(--ui-primary) transition-all duration-150"
								:style="{ width: bulkPdf.total === 0 ? '0%' : `${Math.round((bulkPdf.progress / bulkPdf.total) * 100)}%` }"
							/>
						</div>
					</div>
					<div v-if="bulkPdf.currentName" class="text-xs text-(--ui-text-muted) truncate">
						Rendering <span class="font-medium">{{ bulkPdf.currentName }}</span>…
					</div>
					<div v-if="bulkPdf.errors.length > 0" class="max-h-32 overflow-auto text-xs space-y-1 rounded-md border border-(--ui-error)/30 bg-(--ui-error)/5 p-2">
						<div v-for="(e, i) in bulkPdf.errors" :key="i">
							<span class="font-medium">{{ e.name }}:</span>
							<span class="text-(--ui-text-muted)"> {{ e.message }}</span>
						</div>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton
						v-if="bulkPdf.running"
						color="neutral"
						variant="outline"
						@click="bulkPdf.cancelled = true"
					>
						{{ bulkPdf.cancelled ? "Cancelling…" : "Cancel" }}
					</UButton>
					<UButton
						v-else-if="bulkPdf.outputDir"
						color="neutral"
						variant="outline"
						icon="i-lucide-folder-open"
						@click="openOutputFolder"
					>
						Open folder
					</UButton>
					<UButton
						v-if="!bulkPdf.running"
						@click="bulkPdf.modalOpen = false"
					>
						Done
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { VoucherRow, VoucherType } from "~/stores/vouchers";
	import { invoke } from "@tauri-apps/api/core";
	import { join } from "@tauri-apps/api/path";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { formatLKR } from "~/lib/money";
	import { resolveProtectPassword } from "~/lib/pdf";
	import { buildVoucherPdfPayload, resolveVoucherRelatedLabel } from "~/lib/voucher-pdf";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Vouchers" });

	const router = useRouter();
	const toast = useToast();
	const store = useVouchersStore();
	const settingsStore = useSettingsStore();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const payslipsStore = usePayslipsStore();
	const currency = useActiveCurrency();

	// Loading state owned by `usePageLoading` — see the composable for
	// the rAF-yield trick that ensures the skeleton actually paints.
	// ensureLoaded() handles the "already cached?" guard the old
	// inline length-check ternaries did, with concurrent-safe shared
	// pendingLoad inside each store.
	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			store.ensureLoaded(),
			invoicesStore.ensureLoaded(),
			billsStore.ensureLoaded(),
			payslipsStore.ensureLoaded(),
			settingsStore.ensureLoaded()
		]);
	}));

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newVoucher = () => router.push("/vouchers/new");

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.typeFilters.length > 0
		|| store.hasDateFilters
	);

	// Filtered totals — split by direction (receipt vs payment) so the
	// readout matches the dual-direction nature of the voucher ledger.
	// Net is just (in - out) on the visible slice.
	const filteredReceipts = computed(() =>
		store.filtered
			.filter((v) => v.voucher_type === "receipt")
			.reduce((sum, v) => sum + v.amount_cents, 0)
	);
	const filteredPayments = computed(() =>
		store.filtered
			.filter((v) => v.voucher_type === "payment")
			.reduce((sum, v) => sum + v.amount_cents, 0)
	);
	const filteredNet = computed(() => filteredReceipts.value - filteredPayments.value);

	const resetFilters = () => {
		store.search = "";
		store.clearTypeFilters();
		store.clearDateFilters();
	};

	// Type chips. Two values only — multi-select still works (selecting
	// both equals neither). Receipts use success-green (money in),
	// payments use error-red (money out) so the colour aligns with the
	// dashboard's cash-flow chart.
	const VOUCHER_TYPES: VoucherType[] = ["receipt", "payment"];
	const TYPE_LABEL: Record<VoucherType, string> = {
		receipt: "Receipts",
		payment: "Payments"
	};
	const TYPE_ACTIVE_CLASSES: Record<VoucherType, string> = {
		receipt: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		payment: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const typeChipClasses = (t: VoucherType): string =>
		store.typeFilters.includes(t) ? TYPE_ACTIVE_CLASSES[t] : inactiveChip;

	// Quick date presets — same shape as the other ledgers, applied to
	// voucher_date.
	type DatePresetKey = "today" | "this_week" | "this_month" | "this_year";
	const DATE_PRESETS: { key: DatePresetKey, label: string }[] = [
		{ key: "today", label: "Today" },
		{ key: "this_week", label: "This week" },
		{ key: "this_month", label: "This month" },
		{ key: "this_year", label: "This year" }
	];
	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const datePresetBounds = (key: DatePresetKey): { from: string, to: string } => {
		const now = new Date();
		if (key === "today") {
			const iso = isoFromDate(now);
			return { from: iso, to: iso };
		}
		if (key === "this_week") {
			const daysSinceMon = (now.getDay() + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - daysSinceMon);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			return { from: isoFromDate(monday), to: isoFromDate(sunday) };
		}
		if (key === "this_month") {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		const first = new Date(now.getFullYear(), 0, 1);
		const last = new Date(now.getFullYear(), 11, 31);
		return { from: isoFromDate(first), to: isoFromDate(last) };
	};
	const isDatePresetActive = (key: DatePresetKey): boolean => {
		const { from, to } = datePresetBounds(key);
		return store.dateFrom === from && store.dateTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.dateFrom = null;
			store.dateTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.dateFrom = from;
		store.dateTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const methodLabel = (m: string | null): string => {
		if (!m) return "—";
		return ({
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		} as Record<string, string>)[m] ?? m;
	};

	// --- Row selection (for bulk PDF) -------------------------------------
	const selectedRows = ref<VoucherRow[]>([]);

	// --- Single-row PDF preview ------------------------------------------
	// `currentVoucher` is captured before opening so the builder always
	// renders the row the user clicked from. The linked-doc label is
	// resolved against the three sibling stores so the receipt / payment
	// PDF shows the right "Invoice / Bill / Payslip" tag.
	const currentVoucher = ref<VoucherRow | null>(null);
	const pdf = usePdfPreview({
		command: "export_voucher_pdf",
		buildPayload: () => {
			if (!currentVoucher.value) return {};
			return buildVoucherPdfPayload({
				row: currentVoucher.value,
				settings: settingsStore.settings,
				currency: currency.value,
				relatedLabel: resolveVoucherRelatedLabel(currentVoucher.value, {
					invoices: invoicesStore,
					bills: billsStore,
					payslips: payslipsStore
				})
			});
		},
		fileName: () => `${currentVoucher.value?.number ?? "voucher"}.pdf`,
		title: "Voucher PDF preview"
	});

	const onPdfClick = (v: VoucherRow) => {
		currentVoucher.value = v;
		pdf.open();
	};

	// --- Row actions ------------------------------------------------------
	// Two-group menu: Open, then Generate PDF. Vouchers have no lifecycle
	// transitions to surface (voucher_type is immutable post-creation), so
	// no middle group like quotes / bills.
	function itemsFor(v: VoucherRow) {
		return [
			[
				{
					label: "Open",
					icon: "i-lucide-pencil",
					onSelect: () => router.push(`/vouchers/${v.id}`)
				}
			],
			[
				{
					label: "Generate PDF & Print",
					icon: "i-lucide-file-down",
					onSelect: () => onPdfClick(v)
				}
			]
		];
	}

	// --- Bulk PDF generation ---------------------------------------------
	const bulkPdf = reactive({
		modalOpen: false,
		running: false,
		cancelled: false,
		progress: 0,
		total: 0,
		currentName: "",
		outputDir: "" as string,
		errors: [] as { name: string, message: string }[]
	});

	const openOutputFolder = async () => {
		if (!bulkPdf.outputDir) return;
		try {
			await invoke("open_path", { path: bulkPdf.outputDir });
		} catch (err) {
			toast.add({
				title: "Could not open folder",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const safeName = (s: string): string => s.replace(/[^\w.-]+/g, "_");

	const generateBulkPdfs = async () => {
		if (bulkPdf.running) return;
		if (selectedRows.value.length === 0) return;

		let folder: string | null = null;
		try {
			const picked = await openDialog({ directory: true, multiple: false });
			folder = Array.isArray(picked) ? picked[0] ?? null : picked;
		} catch (err) {
			toast.add({
				title: "Could not open folder picker",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		if (!folder) return;

		const selectedIds = new Set(selectedRows.value.map((r) => r.id));
		const targets: VoucherRow[] = [];
		for (const v of store.vouchers) {
			if (selectedIds.has(v.id)) targets.push(v);
		}
		targets.sort((a, b) => a.number.localeCompare(b.number));

		bulkPdf.modalOpen = true;
		bulkPdf.running = true;
		bulkPdf.cancelled = false;
		bulkPdf.progress = 0;
		bulkPdf.total = targets.length;
		bulkPdf.currentName = "";
		bulkPdf.outputDir = folder;
		bulkPdf.errors = [];

		const protectPassword = await resolveProtectPassword("export_voucher_pdf");

		for (const row of targets) {
			if (bulkPdf.cancelled) break;
			bulkPdf.currentName = row.number;

			try {
				const payload = buildVoucherPdfPayload({
					row,
					settings: settingsStore.settings,
					currency: currency.value,
					relatedLabel: resolveVoucherRelatedLabel(row, {
						invoices: invoicesStore,
						bills: billsStore,
						payslips: payslipsStore
					})
				});

				const outputPath = await join(folder, `${safeName(row.number)}.pdf`);
				await invoke("export_voucher_pdf", { data: payload, outputPath, protectPassword });
			} catch (err) {
				bulkPdf.errors.push({
					name: row.number,
					message: err instanceof Error ? err.message : String(err)
				});
			} finally {
				bulkPdf.progress += 1;
			}
		}

		bulkPdf.running = false;
		bulkPdf.currentName = "";

		const successCount = bulkPdf.progress - bulkPdf.errors.length;
		const cancelledTail = bulkPdf.cancelled ? ` · ${bulkPdf.total - bulkPdf.progress} skipped` : "";
		toast.add({
			title: bulkPdf.cancelled
				? `Cancelled — ${successCount} of ${bulkPdf.total} done${cancelledTail}`
				: `Generated ${successCount} of ${bulkPdf.total} PDFs`,
			description: bulkPdf.errors.length > 0
				? `${bulkPdf.errors.length} error${bulkPdf.errors.length === 1 ? "" : "s"} — see modal for details.`
				: undefined,
			color: bulkPdf.errors.length === 0 && !bulkPdf.cancelled ? "success" : "warning",
			icon: bulkPdf.errors.length === 0 && !bulkPdf.cancelled ? "i-lucide-check" : "i-lucide-triangle-alert"
		});
	};
</script>
