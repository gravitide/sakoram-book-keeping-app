<template>
	<div class="select-none">
		<FeatureLock v-if="locked" title="Aged payables" tier-label="Plus" feature="reports.aged_payables" />

		<!-- Top toolbar — back link + PDF action. Same layout as
			the rest of the reports for consistency. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/reports" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to Reports
			</NuxtLink>

			<UButton
				size="sm"
				color="neutral"
				variant="outline"
				icon="i-lucide-file-down"
				:loading="pdf.state.rendering"
				:disabled="isLoading || pdf.state.rendering"
				:title="isLoading ? 'Loading data…' : 'Preview this report as a PDF'"
				@click="onPdfClick"
			>
				PDF & Print
			</UButton>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3">
				Aged payables
				<HelpButton slug="aged-payables" />
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Aged payables is the mirror of aged receivables: a
						snapshot of "who we owe money RIGHT NOW", not a
						range. Buckets count days past each bill's
						due_date, so the report implicitly says "as of
						today". -->
					Outstanding bill balances grouped by days past due, as of {{ asOfLabel }}. Highlights which vendors to pay first.
				</template>
			</p>
		</header>

		<template v-if="!locked">
			<!-- Loading skeleton mirroring the real layout: 3 KPI tiles +
			bucket-distribution table + per-vendor breakdown table. -->
			<template v-if="isLoading">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-pulse">
					<UCard v-for="i in 3" :key="`kpi-skel-${i}`" class="h-full">
						<div class="space-y-3">
							<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
							<div class="h-7 w-40 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
						</div>
					</UCard>
				</div>

				<UCard class="mb-6 animate-pulse">
					<template #header>
						<div class="h-3 w-40 rounded bg-(--ui-bg-muted)" />
					</template>
					<div class="space-y-3">
						<div
							v-for="r in 5"
							:key="`bk-skel-${r}`"
							class="grid gap-3 py-2 border-b border-(--ui-border)/40 last:border-0"
							style="grid-template-columns: 1fr auto auto auto"
						>
							<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
				</UCard>

				<div class="animate-pulse">
					<div class="mb-2 h-3 w-44 rounded bg-(--ui-bg-muted)" />
					<div class="rounded-lg border border-(--ui-border) p-3 space-y-3">
						<div
							v-for="r in 6"
							:key="`vn-skel-${r}`"
							class="grid gap-3 py-1"
							style="grid-template-columns: 1fr repeat(6, auto)"
						>
							<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
							<div v-for="c in 6" :key="`c-skel-${r}-${c}`" class="h-3 w-16 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
				</div>
			</template>

			<template v-else>
				<!-- 3-up KPI tiles. Match the rest of the reports — text-2xl
				on sm + 2xl+, smaller at md/lg where tiles are tight. -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Total outstanding
							</div>
							<UIcon name="i-lucide-wallet" class="size-4 text-(--ui-text-muted)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
							:title="formatLKR(totals.totalOutstanding)"
						>
							{{ formatLKR(totals.totalOutstanding) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.billCount }} open bill{{ totals.billCount === 1 ? "" : "s" }} · {{ totals.vendorCount }} vendor{{ totals.vendorCount === 1 ? "" : "s" }}
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Overdue
							</div>
							<UIcon name="i-lucide-alarm-clock" class="size-4 text-(--ui-error)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-error)"
							:title="formatLKR(totals.totalOverdue)"
						>
							{{ formatLKR(totals.totalOverdue) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.overdueCount }} bill{{ totals.overdueCount === 1 ? "" : "s" }} past due
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Current (not yet due)
							</div>
							<UIcon name="i-lucide-calendar-clock" class="size-4 text-(--ui-success)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
							:title="formatLKR(totals.totalCurrent)"
						>
							{{ formatLKR(totals.totalCurrent) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.currentCount }} bill{{ totals.currentCount === 1 ? "" : "s" }} still in-window
						</div>
					</UCard>
				</div>

				<!-- Bucket distribution — five rows (Current, 1-30, 31-60,
				61-90, 90+) with count + total + % of overall outstanding. -->
				<UCard class="mb-6">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2 flex-wrap">
							<div class="app-chrome font-medium">
								Bucket distribution
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								As of {{ asOfLabel }}
							</div>
						</div>
					</template>

					<table class="w-full text-sm">
						<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
							<tr>
								<th class="py-2 pl-3 pr-2 font-medium">
									Bucket
								</th>
								<th class="py-2 px-2 font-medium text-right w-20">
									Count
								</th>
								<th class="py-2 px-2 font-medium text-right w-40">
									Amount
								</th>
								<th class="py-2 pl-2 pr-3 font-medium text-right w-24">
									% of total
								</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="bucket in BUCKETS"
								:key="bucket.key"
								class="border-b border-(--ui-border)/60 last:border-0"
							>
								<td class="py-2 pl-3 pr-2">
									<div class="flex items-center gap-2">
										<span
											class="inline-block size-2.5 rounded-sm"
											:class="bucket.swatch"
										/>
										<span :class="bucket.key === 'current' ? '' : 'font-medium'">
											{{ bucket.label }}
										</span>
									</div>
								</td>
								<td class="py-2 px-2 text-right tabular-nums text-(--ui-text-muted)">
									{{ bucketStats[bucket.key].count }}
								</td>
								<td
									class="py-2 px-2 text-right tabular-nums"
									:class="bucket.tone === 'error' ? 'text-(--ui-error)' : bucket.tone === 'warning' ? 'text-(--ui-warning)' : ''"
								>
									{{ formatLKR(bucketStats[bucket.key].amount) }}
								</td>
								<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
									{{ pct(bucketStats[bucket.key].amount, totals.totalOutstanding) }}
								</td>
							</tr>
							<tr class="bg-(--ui-bg-muted)/60">
								<td class="py-3 pl-3 pr-2 font-semibold">
									Total outstanding
								</td>
								<td class="py-3 px-2 text-right tabular-nums font-semibold">
									{{ totals.billCount }}
								</td>
								<td class="py-3 px-2 text-right tabular-nums font-semibold">
									{{ formatLKR(totals.totalOutstanding) }}
								</td>
								<td class="py-3 pl-2 pr-3 text-right tabular-nums font-semibold">
									100%
								</td>
							</tr>
						</tbody>
					</table>
				</UCard>

				<!-- Per-vendor breakdown — every vendor with outstanding
				balances, with their bucket distribution + total.
				Default-sorted by total descending so the worst-aged
				vendors land at the top. Click a row to jump to /bills
				pre-filtered to that vendor. Uses ResizableDataTable for
				the same column-resize + drag-pan + sort UX every other
				list page has. -->
				<div class="mb-2 flex items-end justify-between gap-2 flex-wrap">
					<div>
						<div class="font-medium">
							By vendor
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-0.5">
							Click a row to open that vendor's bill list pre-filtered. Drag column edges to resize.
						</div>
					</div>
					<div class="text-xs text-(--ui-text-muted)">
						{{ vendorRows.length }} vendor{{ vendorRows.length === 1 ? "" : "s" }} with open balance
					</div>
				</div>

				<div v-if="vendorRows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-lg">
					<UIcon name="i-lucide-check-circle-2" class="size-10 mx-auto mb-2 opacity-40 text-(--ui-success)" />
					<div>Nothing outstanding — all bills paid.</div>
				</div>

				<ResizableDataTable
					v-else
					:rows="vendorRows"
					state-key="reports-aged-payables-by-vendor"
					data-key="rowKey"
					default-sort-field="total"
					:default-sort-order="-1"
					:default-page-size="50"
					@row-click="(row) => openVendor(row.vendorId)"
				>
					<Column field="name" header="Vendor" sortable>
						<template #body="{ data }">
							<div class="min-w-[140px] max-w-[260px]">
								<div class="font-medium truncate">
									{{ data.name }}
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									{{ data.billCount }} open bill{{ data.billCount === 1 ? "" : "s" }}
								</div>
							</div>
						</template>
					</Column>
					<Column field="current" header="Current" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="amountClass(data.current, 'neutral')">
								{{ amountOrDash(data.current) }}
							</div>
						</template>
					</Column>
					<Column field="b1to30" header="1-30" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="amountClass(data.b1to30, 'warning')">
								{{ amountOrDash(data.b1to30) }}
							</div>
						</template>
					</Column>
					<Column field="b31to60" header="31-60" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="amountClass(data.b31to60, 'warning')">
								{{ amountOrDash(data.b31to60) }}
							</div>
						</template>
					</Column>
					<Column field="b61to90" header="61-90" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="amountClass(data.b61to90, 'error')">
								{{ amountOrDash(data.b61to90) }}
							</div>
						</template>
					</Column>
					<Column field="b90plus" header="90+" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="amountClass(data.b90plus, 'error')">
								{{ amountOrDash(data.b90plus) }}
							</div>
						</template>
					</Column>
					<Column field="total" header="Total" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap font-semibold">
								{{ formatLKR(data.total) }}
							</div>
						</template>
					</Column>
				</ResizableDataTable>
			</template>

			<PdfPreviewModal
				v-model:open="pdf.state.open"
				:asset-url="pdf.state.assetUrl"
				:temp-path="pdf.state.tempPath"
				:suggested-file-name="pdf.state.suggestedFileName"
				:saving="pdf.state.saving"
				title="Aged payables PDF preview"
				@save="pdf.onSave"
				@cancel="pdf.onCancel"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
// Aged payables.
//
// Mirror of aged receivables: a snapshot of "who we owe money RIGHT
// NOW", bucketed by days past each bill's due_date:
//
//   Current  — not yet overdue (due_date >= today)
//   1-30     — overdue 1-30 days
//   31-60    — overdue 31-60 days
//   61-90    — overdue 61-90 days
//   90+      — overdue more than 90 days
//
// "Outstanding" = bill's balance (total minus linked payment
// vouchers) — same `balanceCentsFor()` the dashboard tile + P&L
// drill-down use, so this report can never disagree with the rest
// of the app.
//
// Only open bills with balance > 0 count. Cancelled bills never
// count, fully-paid ones are out.

	import type { BillRow } from "~/stores/bills";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildAgedPayablesPdfPayload } from "~/lib/report-pdf";
	import { useBillsStore } from "~/stores/bills";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("reports.aged_payables"));

	definePageMeta({ title: "Aged payables" });

	const router = useRouter();
	const billsStore = useBillsStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Vendor names come off the denormalised `bill.vendor_name`
	// column (migration 0028) so we don't need the vendors store
	// loaded here. The "Open bills for vendor X" row click only needs
	// the FK id — which lives on the bill itself.
	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			billsStore.ensureLoaded(),
			// Vouchers carry the payments that derive each bill's
			// balance — without them every bill looks fully owed.
			vouchersStore.ensureLoaded()
		]);
	}));

	// "As of" is implicit — today. Future: add an as-of date picker
	// for back-dating a snapshot for audit work.
	const asOfDate = new Date();
	const asOfLabel = asOfDate.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric"
	});

	type BucketKey = "current" | "b1to30" | "b31to60" | "b61to90" | "b90plus";

	interface BucketDef {
		key: BucketKey
		label: string
		swatch: string
		tone: "success" | "warning" | "error" | "neutral"
	}

	// Same colour cascade Sri Lankan accountants expect: green for
	// in-window, yellow for 1-60-day creep, red beyond 60.
	const BUCKETS: BucketDef[] = [
		{ key: "current", label: "Current (not yet due)", swatch: "bg-(--ui-success)", tone: "success" },
		{ key: "b1to30", label: "1-30 days overdue", swatch: "bg-(--ui-warning)/60", tone: "warning" },
		{ key: "b31to60", label: "31-60 days overdue", swatch: "bg-(--ui-warning)", tone: "warning" },
		{ key: "b61to90", label: "61-90 days overdue", swatch: "bg-(--ui-error)/70", tone: "error" },
		{ key: "b90plus", label: "90+ days overdue", swatch: "bg-(--ui-error)", tone: "error" }
	];

	// Per-bill bucket calculation. Returns the bucket key the bill
	// belongs to + its outstanding balance in cents.
	const bucketFor = (bill: BillRow): { key: BucketKey, balance: number } | null => {
		// Persisted bill status is `open` | `cancelled`. Skip
		// cancelled bills — we don't owe a cancelled bill any more.
		if (bill.status !== "open") return null;
		const balance = billsStore.balanceCentsFor(bill);
		if (balance <= 0) return null;

		// Whole-day diff between due_date and today. Both ISO YYYY-MM-DD
		// at midnight local; we round to avoid DST one-hour fuzz.
		const [y, mo, d] = bill.due_date.split("-").map(Number);
		if (!y || !mo || !d) return null;
		const due = new Date(y, mo - 1, d);
		const todayMidnight = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
		const daysOver = Math.floor((todayMidnight.getTime() - due.getTime()) / 86_400_000);

		let key: BucketKey;
		if (daysOver <= 0) key = "current";
		else if (daysOver <= 30) key = "b1to30";
		else if (daysOver <= 60) key = "b31to60";
		else if (daysOver <= 90) key = "b61to90";
		else key = "b90plus";

		return { key, balance };
	};

	// All open bills with their bucket assignments — the base dataset
	// for the two tables below.
	interface OpenBill {
		bill: BillRow
		bucket: BucketKey
		balance: number
	}
	const openBills = computed<OpenBill[]>(() =>
		billsStore.bills
			.map((bill) => {
				const b = bucketFor(bill);
				return b ? { bill, bucket: b.key, balance: b.balance } : null;
			})
			.filter((x): x is OpenBill => x !== null)
	);

	// Bucket-level totals. Used by the distribution table.
	const bucketStats = computed<Record<BucketKey, { count: number, amount: number }>>(() => {
		const init = (): Record<BucketKey, { count: number, amount: number }> => ({
			current: { count: 0, amount: 0 },
			b1to30: { count: 0, amount: 0 },
			b31to60: { count: 0, amount: 0 },
			b61to90: { count: 0, amount: 0 },
			b90plus: { count: 0, amount: 0 }
		});
		const acc = init();
		for (const ob of openBills.value) {
			acc[ob.bucket].count++;
			acc[ob.bucket].amount += ob.balance;
		}
		return acc;
	});

	// Per-vendor breakdown. Group bills by vendor_id, sum each bucket
	// per vendor. Sort descending by total so worst offenders land at
	// the top. Declared before `totals` because the KPI computed
	// depends on its row count for the "vendors" tally.
	interface VendorAgingRow {
		// Stable string key the DataTable uses as data-key. We can't
		// use vendorId alone because bills with a null FK would all
		// collapse onto the same row identity.
		rowKey: string
		vendorId: number | null
		name: string
		billCount: number
		current: number
		b1to30: number
		b31to60: number
		b61to90: number
		b90plus: number
		total: number
		// Allow indexed access by bucket key for the accumulator below
		// — keeps the inner loop typed instead of casting.
		[k: string]: unknown
	}
	const vendorRows = computed<VendorAgingRow[]>(() => {
		const byVendor = new Map<number, VendorAgingRow>();
		for (const ob of openBills.value) {
			const vid = ob.bill.vendor_id;
			let row = byVendor.get(vid);
			if (!row) {
				row = {
					rowKey: `vendor:${vid}`,
					vendorId: vid,
					name: ob.bill.vendor_name || "(no vendor)",
					billCount: 0,
					current: 0,
					b1to30: 0,
					b31to60: 0,
					b61to90: 0,
					b90plus: 0,
					total: 0
				};
				byVendor.set(vid, row);
			}
			row.billCount++;
			row.total += ob.balance;
			row[ob.bucket] += ob.balance;
		}
		return Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
	});

	// Top-of-page KPIs.
	const totals = computed(() => {
		const bs = bucketStats.value;
		const totalCurrent = bs.current.amount;
		const totalOverdue = bs.b1to30.amount + bs.b31to60.amount + bs.b61to90.amount + bs.b90plus.amount;
		const totalOutstanding = totalCurrent + totalOverdue;
		const overdueCount = bs.b1to30.count + bs.b31to60.count + bs.b61to90.count + bs.b90plus.count;
		const vendorCount = vendorRows.value.length;
		return {
			totalCurrent,
			totalOverdue,
			totalOutstanding,
			billCount: openBills.value.length,
			overdueCount,
			currentCount: bs.current.count,
			vendorCount
		};
	});

	// Per-amount-cell colour. Zero values always render as a muted
	// dash regardless of the bucket's tone — otherwise an empty cell
	// in the 1-30 column would still paint a yellow "—" which reads
	// like an actual warning. Non-zero values pick up the bucket's
	// tone (warning for 1-60, error for 60+, plain text for current).
	const amountClass = (v: number, tone: "warning" | "error" | "neutral"): string => {
		if (v === 0) return "text-(--ui-text-muted)";
		if (tone === "warning") return "text-(--ui-warning)";
		if (tone === "error") return "text-(--ui-error)";
		return "";
	};

	const amountOrDash = (v: number): string =>
		v === 0 ? "—" : formatLKR(v);

	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	// Open the /bills list pre-filtered to a vendor. Uses the same
	// store-filter + route pattern the vendors-detail page already
	// uses.
	const openVendor = (vendorId: number | null) => {
		if (vendorId === null) return;
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.clearDateFilters();
		billsStore.vendorFilter = vendorId;
		void router.push("/bills");
	};

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildAgedPayablesPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			asOfDate,
			totals: totals.value,
			buckets: BUCKETS.map((b) => ({
				key: b.key,
				label: b.label,
				count: bucketStats.value[b.key].count,
				amount: bucketStats.value[b.key].amount
			})),
			vendorRows: vendorRows.value
		}),
		fileName: () => {
			const stamp = asOfDate.toISOString().slice(0, 10);
			return `aged-payables-${stamp}.pdf`;
		},
		title: "Aged payables PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
