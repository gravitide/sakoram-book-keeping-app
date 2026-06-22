<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			bills, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Bills
					<HelpButton slug="bills" />
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ headerStats.total }} total · {{ formatLKR(headerStats.outstandingCents) }} outstanding
						<span v-if="headerStats.overdueCount > 0" class="text-(--ui-error)">
							· {{ headerStats.overdueCount }} overdue
						</span>
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newBill">
				New bill
			</UButton>
		</header>

		<!-- Content-shaped skeleton while the page hydrates. See
			usePageLoading + ListPageSkeleton for the timing rationale. -->
		<ListPageSkeleton v-if="isLoading" :chip-count="5" :column-count="7" />

		<UCard v-else>
			<template #header>
				<!-- Filter strip — chips + Advanced popover, matches the
					quotes/invoices pattern. Vendor and category live in
					row 1; date ranges are tucked into the popover. -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, vendor, vendor invoice…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="store.vendorFilter"
							:items="vendorOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-truck"
							class="w-56"
							:search-input="{ placeholder: 'Filter vendors…' }"
						/>
						<USelectMenu
							v-model="store.categoryFilter"
							:items="categoryOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-tag"
							class="w-48"
							:search-input="{ placeholder: 'Filter categories…' }"
						>
							<!-- Coloured-chip + icon prefix per item, mirroring
								the Category cell on the table below so the
								dropdown reads as a glanceable list of the
								same badges. Sentinel rows (All / Uncategorised)
								have `colorHex: null` and fall through to a
								plain muted UIcon. -->
							<template #item-leading="{ item }">
								<span
									v-if="item.colorHex"
									class="inline-flex size-4 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: item.colorHex }"
								>
									<UIcon :name="item.icon" class="size-2.5" />
								</span>
								<UIcon
									v-else
									:name="item.icon"
									class="size-4 text-(--ui-text-muted) shrink-0"
								/>
							</template>
						</USelectMenu>
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
											Issue date
										</div>
										<DateRangeField
											v-model:from="store.issuedFrom"
											v-model:to="store.issuedTo"
										/>
									</div>
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar-clock" class="size-3.5" />
											Due date
										</div>
										<DateRangeField
											v-model:from="store.dueFrom"
											v-model:to="store.dueTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="store.clearDateFilters">
											Clear date filters
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

					<!-- Status + issued-date chip rows. Stack at sm, sit
						side-by-side from md+. items-start keeps each
						column flush with the top of the row when one
						wraps to two lines. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<button
								v-for="s in BILL_STATUSES"
								:key="s"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="statusChipClasses(s)"
								@click="store.toggleStatusFilter(s)"
							>
								{{ STATUS_LABEL[s] }}
							</button>
						</div>

						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<span class="text-xs text-(--ui-text-muted) mr-1">Issued:</span>
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

			<!-- Table action bar + filtered-rows summary; Auto-fit on
				the left, totals on the right. -->
			<div
				v-if="!isLoading && table.total.value > 0"
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
				<div class="flex items-center gap-3 ml-auto">
					<span class="text-xs text-(--ui-text-muted)">Showing {{ table.rows.value.length }} of {{ table.total.value }}</span>
					<StatChip label="Total" :value="formatLKR(table.sumCents.value)" />
				</div>
			</div>

			<div v-if="table.loading.value && table.rows.value.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading bills…
			</div>
			<div v-else-if="table.total.value === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-input" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="!hasAnyFilter">
					No bills yet. Click <span class="font-medium">New bill</span> to record one.
				</div>
				<div v-else>
					No bills match your filters.
				</div>
			</div>

			<!-- Selection action bar — renders above the table whenever any
				row is ticked. Surfaces a count + Clear + Generate PDFs. -->
			<div
				v-if="selectedRows.length > 0 && !isLoading"
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
				v-if="table.total.value > 0"
				ref="tableRef"
				v-model:selection="selectedRows"
				:rows="table.rows.value"
				:total="table.total.value"
				state-key="bills-table"
				:row-actions="itemsFor"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				selectable
				@request="table.onRequest"
				@row-click="(row) => router.push(`/bills/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="vendor_name" header="Vendor" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.vendor_name || "(no vendor)" }}
						</div>
					</template>
				</Column>
				<Column field="vendor_invoice_number" header="Their #" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.vendor_invoice_number || "—" }}
						</div>
					</template>
				</Column>
				<Column field="category_name" header="Category" sortable>
					<template #body="{ data }">
						<div class="truncate">
							<span v-if="data.category_name" class="inline-flex items-center gap-1.5">
								<span
									class="inline-flex size-5 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: themeHex(data.category_color ?? '') }"
								>
									<UIcon :name="data.category_icon ?? 'i-lucide-tag'" class="size-3" />
								</span>
								<span>{{ data.category_name }}</span>
							</span>
							<span v-else class="text-(--ui-text-muted)">—</span>
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
				<Column field="due_date" header="Due" sortable>
					<template #body="{ data }">
						<div
							class="truncate tabular-nums"
							:class="data._status === 'overdue'
								? 'text-(--ui-error) font-medium'
								: 'text-(--ui-text-muted)'"
						>
							{{ data.due_date }}
						</div>
					</template>
				</Column>
				<Column
					field="total_cents"
					header="Total"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
							{{ formatLKR(data.total_cents) }}
						</div>
					</template>
				</Column>
				<Column
					field="_balance"
					header="Balance"
					sortable
					:style="{ textAlign: 'right' }"
				>
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
		</UCard>

		<!-- New-bill creation lives as a modal (was a standalone page). -->
		<NewBillModal v-model:open="newBillOpen" :issue-date="newBillIssueDate" />

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Bill PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- Bulk PDF progress modal. Mirrors the payslips list page —
			progress bar, current filename, error list, Cancel /
			Open folder / Done. Dismiss is blocked while running so
			the file IO doesn't get yanked mid-iteration. -->
		<UModal
			:open="bulkPdf.modalOpen"
			:dismissible="false"
			:close="false"
			title="Generating bill PDFs"
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
	import type { BillLineRow, BillRow, BillStatus } from "~/stores/bills";
	import { invoke } from "@tauri-apps/api/core";
	import { join } from "@tauri-apps/api/path";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { buildBillPdfPayload } from "~/lib/bill-pdf";
	import { todayISO } from "~/lib/calendar-events";
	import { billDerivedFrom } from "~/lib/derived-status";
	import { andClauses, eqClause, inClause, likeClause, makeSortResolver, rangeClause } from "~/lib/list-query";
	import { formatLKR } from "~/lib/money";
	import { resolveProtectPassword } from "~/lib/pdf";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";
	import { useBillsStore } from "~/stores/bills";
	import { useSettingsStore } from "~/stores/settings";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "Bills" });

	const router = useRouter();
	const toast = useToast();
	const store = useBillsStore();
	const vendorsStore = useVendorsStore();
	const categoriesStore = useBillCategoriesStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Each row carries the derived `_paid` / `_balance` / `_status` from the
	// SQL subquery, so neither all bills NOR all vouchers load in memory — the
	// gate, single PDF, and bulk PDF read those fields straight off the row.
	type BillRowVM = BillRow & { _paid: number, _balance: number, _status: BillStatus };

	const table = useServerTable<BillRowVM>({
		query: () => ({
			from: billDerivedFrom(todayISO()),
			where: andClauses([
				inClause("_status", store.statusFilters),
				eqClause("vendor_id", store.vendorFilter),
				store.categoryFilter === "uncategorised"
					? { sql: "category_id IS NULL", params: [] }
					: eqClause("category_id", store.categoryFilter),
				rangeClause("issue_date", store.issuedFrom, store.issuedTo),
				rangeClause("due_date", store.dueFrom, store.dueTo),
				likeClause(store.search, ["number", "vendor_name", "vendor_invoice_number", "category_name"])
			]),
			sumExpr: "SUM(total_cents)"
		}),
		resolveSortColumn: makeSortResolver({
			number: "number",
			vendor_name: "vendor_name COLLATE NOCASE",
			vendor_invoice_number: "vendor_invoice_number",
			category_name: "category_name COLLATE NOCASE",
			issue_date: "issue_date",
			due_date: "due_date",
			total_cents: "total_cents",
			_balance: "_balance",
			_status: "_status"
		}),
		defaultOrderBy: "datetime(created_at) DESC",
		deps: () => store.listFilters,
		initialSortField: "issue_date",
		initialSortOrder: -1
	});

	const headerStats = ref({ total: 0, outstandingCents: 0, overdueCount: 0 });
	const refreshStats = async () => {
		headerStats.value = await store.fetchHeaderStats();
	};

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			vendorsStore.ensureLoaded(),
			categoriesStore.ensureLoaded(),
			settingsStore.ensureLoaded()
		]);
		await refreshStats();
	}));

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Drives <NewBillModal>; the New button opens it. Auto-opens when
	// the route carries ?new=1 (dashboard New > Bill shortcut or
	// calendar Create-on-this-day). Optional ?issued=YYYY-MM-DD carries
	// through to NewBillModal as the initial issue_date.
	const newBillOpen = ref(false);
	const newBillIssueDate = ref<string | null>(null);
	const newBill = () => {
		newBillIssueDate.value = null;
		newBillOpen.value = true;
	};

	// The create modal writes a bill + may navigate to it. On close, refetch
	// so the grid + header reflect any new row when it doesn't navigate away.
	watch(newBillOpen, (open) => {
		if (!open) {
			void table.reload();
			void refreshStats();
		}
	});
	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			const issued = typeof route.query.issued === "string" ? route.query.issued : null;
			newBillIssueDate.value = issued;
			newBillOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined, issued: undefined } });
		}
	});

	const vendorOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All vendors", value: "all" },
		...[...vendorsStore.vendors]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((v) => ({ label: v.name, value: v.id }))
	]);

	// Categories: include an "Uncategorised" sentinel for bills without a
	// category_id (otherwise the user can't surface those rows in
	// isolation).
	//
	// Each item carries `icon` + `colorHex` so the #item-leading slot
	// below can render the same coloured chip the table cell uses —
	// quicker to spot the right category in a long list than reading
	// names alone. Sentinels (All / Uncategorised) use neutral icons
	// with `colorHex: null` so the slot falls back to a plain UIcon.
	interface CategoryOption {
		label: string
		value: number | "all" | "uncategorised"
		icon: string
		colorHex: string | null
	}
	const categoryOptions = computed<CategoryOption[]>(() => [
		{ label: "All categories", value: "all", icon: "i-lucide-tag", colorHex: null },
		{ label: "Uncategorised", value: "uncategorised", icon: "i-lucide-tag-x", colorHex: null },
		...[...categoriesStore.categories]
			.filter((c) => c.is_archived === 0)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({
				label: c.name,
				value: c.id,
				icon: c.icon,
				colorHex: themeHex(c.color)
			}))
	]);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.vendorFilter !== "all"
		|| store.categoryFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.vendorFilter = "all";
		store.categoryFilter = "all";
		store.clearDateFilters();
	};

	// Status chips. Colour map mirrors StatusBadge so the filter and
	// the row badge speak the same visual language.
	const BILL_STATUSES: BillStatus[] = [
		"unpaid",
		"partial",
		"paid",
		"overdue",
		"cancelled"
	];
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
	const statusChipClasses = (s: BillStatus): string =>
		store.statusFilters.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;

	// Quick issue-date presets — same shape as Quotes / Invoices.
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
		return store.issuedFrom === from && store.issuedTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.issuedFrom = null;
			store.issuedTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.issuedFrom = from;
		store.issuedTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	// --- Row selection (for bulk PDF) -------------------------------------
	// `data-key="id"` on ResizableDataTable means selection survives sort /
	// page / filter changes by id, not by row reference. Selection persists
	// across pagination, matching the payslips list page.
	const selectedRows = ref<BillRowVM[]>([]);

	// --- Single-row PDF preview ------------------------------------------
	// usePdfPreview holds a temp file and exposes open/save/cancel hooks.
	// The builder closes over `currentBill` + `currentLines`, both set just
	// before opening so the preview matches the row the user clicked from.
	const currentBill = ref<BillRowVM | null>(null);
	const currentLines = ref<BillLineRow[]>([]);
	const pdf = usePdfPreview({
		command: "export_bill_pdf",
		buildPayload: () => {
			if (!currentBill.value) return {};
			return buildBillPdfPayload({
				row: currentBill.value,
				lines: currentLines.value,
				settings: settingsStore.settings,
				currency: currency.value,
				paidCents: currentBill.value._paid
			});
		},
		fileName: () => `${currentBill.value?.number ?? "bill"}.pdf`,
		title: "Bill PDF preview"
	});

	const onPdfClick = async (b: BillRowVM) => {
		currentBill.value = b;
		try {
			currentLines.value = await store.getLines(b.id);
		} catch (err) {
			toast.add({
				title: "Could not load lines",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		pdf.open();
	};

	// --- Row actions ------------------------------------------------------
	// Three-group menu: Open + lifecycle (Record payment when something's
	// owed, Cancel/Reopen), Generate PDF. ResizableDataTable draws a
	// separator between groups.
	function itemsFor(b: BillRowVM) {
		const lifecycle: { label: string, icon: string, onSelect: () => void }[] = [
			{ label: "Open", icon: "i-lucide-pencil", onSelect: () => router.push(`/bills/${b.id}`) }
		];
		if (b.status === "open" && b._balance > 0) {
			lifecycle.push({
				label: "Record payment",
				icon: "i-lucide-banknote",
				onSelect: () => router.push(`/vouchers/new?bill=${b.id}`)
			});
		}
		const exports = [{
			label: "Generate PDF & Print",
			icon: "i-lucide-file-down",
			onSelect: () => {
				void onPdfClick(b);
			}
		}];
		return [lifecycle, exports];
	}

	// --- Bulk PDF generation ---------------------------------------------
	// Mirrors the payslips list page. `modalOpen` drives the progress
	// dialog; `running` gates the action bar's spinner; `cancelled` is
	// checked between iterations so the user can abort. Filenames are
	// the bill number — already filesystem-safe ("BIL-2026-0001") but
	// defensive sanitising stays in case a future numbering format
	// includes punctuation.
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
		if (!folder) return; // cancelled

		// Snapshot the selection — if the user keeps clicking around while it
		// runs, we still process exactly what they kicked off. The selected
		// rows already carry `_paid` from the list query, so we export them
		// directly (no need for the full store.bills array).
		const targets: BillRowVM[] = selectedRows.value
			.slice()
			.sort((a, b) => a.number.localeCompare(b.number));

		bulkPdf.modalOpen = true;
		bulkPdf.running = true;
		bulkPdf.cancelled = false;
		bulkPdf.progress = 0;
		bulkPdf.total = targets.length;
		bulkPdf.currentName = "";
		bulkPdf.outputDir = folder;
		bulkPdf.errors = [];

		// Resolve owner-password protection once for the whole run — the
		// preview flow gets this automatically, but the bulk loop invokes
		// the export command directly so it must thread the password too.
		const protectPassword = await resolveProtectPassword("export_bill_pdf");

		for (const row of targets) {
			if (bulkPdf.cancelled) break;
			bulkPdf.currentName = row.number;

			try {
				const lineRows = await store.getLines(row.id);
				const payload = buildBillPdfPayload({
					row,
					lines: lineRows,
					settings: settingsStore.settings,
					currency: currency.value,
					paidCents: row._paid
				});

				const outputPath = await join(folder, `${safeName(row.number)}.pdf`);
				await invoke("export_bill_pdf", { data: payload, outputPath, protectPassword });
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
