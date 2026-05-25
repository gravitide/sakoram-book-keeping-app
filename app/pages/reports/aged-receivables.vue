<template>
	<div class="select-none">
		<!-- Top toolbar — back link + PDF action. Same layout as P&L /
			VAT for consistency across the reports module. -->
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
				Aged receivables
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Aged receivables is a snapshot of "who owes us money
						RIGHT NOW", not a range like P&L. The buckets count
						days past each invoice's due_date, so the report
						implicitly says "as of today". -->
					Outstanding invoice balances grouped by days past due, as of {{ asOfLabel }}. Highlights which clients to chase first.
				</template>
			</p>
		</header>

		<!-- Loading skeleton mirroring the real layout: 3 KPI tiles +
			bucket-distribution table + per-client breakdown table. -->
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
						:key="`cl-skel-${r}`"
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
			<!-- 3-up KPI tiles. Match the P&L / VAT shape: text-2xl on
				sm + 2xl+, smaller at md/lg where tiles are tight. -->
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
						{{ totals.invoiceCount }} open invoice{{ totals.invoiceCount === 1 ? "" : "s" }} · {{ totals.clientCount }} client{{ totals.clientCount === 1 ? "" : "s" }}
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
						{{ totals.overdueCount }} invoice{{ totals.overdueCount === 1 ? "" : "s" }} past due
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
						{{ totals.currentCount }} invoice{{ totals.currentCount === 1 ? "" : "s" }} still in-window
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
								{{ totals.invoiceCount }}
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

			<!-- Per-client breakdown — every client with outstanding
				balances, with their bucket distribution + total.
				Default-sorted by total descending so the worst-aged
				clients land at the top. Click a row to jump to
				/invoices pre-filtered to that client. Uses
				ResizableDataTable for the same column-resize + drag-pan
				+ sort + Fit page-size UX every other list page has. -->
			<div class="mb-2 flex items-end justify-between gap-2 flex-wrap">
				<div>
					<div class="font-medium">
						By client
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-0.5">
						Click a row to open that client's invoice list pre-filtered. Drag column edges to resize.
					</div>
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					{{ clientRows.length }} client{{ clientRows.length === 1 ? "" : "s" }} with open balance
				</div>
			</div>

			<div v-if="clientRows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-lg">
				<UIcon name="i-lucide-check-circle-2" class="size-10 mx-auto mb-2 opacity-40 text-(--ui-success)" />
				<div>Nothing outstanding — all invoices paid.</div>
			</div>

			<ResizableDataTable
				v-else
				:rows="clientRows"
				state-key="reports-aged-receivables-by-client"
				data-key="rowKey"
				default-sort-field="total"
				:default-sort-order="-1"
				:default-page-size="50"
				@row-click="(row) => openClient(row.clientId)"
			>
				<Column field="name" header="Client" sortable>
					<template #body="{ data }">
						<div class="min-w-[140px] max-w-[260px]">
							<div class="font-medium truncate">
								{{ data.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted) truncate">
								{{ data.invoiceCount }} open invoice{{ data.invoiceCount === 1 ? "" : "s" }}
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
			title="Aged receivables PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Aged receivables.
//
// Snapshot of "who owes us money RIGHT NOW", bucketed by days past
// each invoice's due_date:
//
//   Current  — not yet overdue (due_date >= today)
//   1-30     — overdue 1-30 days
//   31-60    — overdue 31-60 days
//   61-90    — overdue 61-90 days
//   90+      — overdue more than 90 days
//
// "Outstanding" = invoice's balance (total minus linked receipt
// vouchers) — same `balanceCentsFor()` the dashboard tile + P&L
// drill-down use, so this report can never disagree with the rest
// of the app.
//
// Only sent invoices with balance > 0 count. Drafts haven't been
// issued, cancelled invoices never count, fully-paid ones are out.

	import type { InvoiceRow } from "~/stores/invoices";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildAgedReceivablesPdfPayload } from "~/lib/report-pdf";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Aged receivables" });

	const router = useRouter();
	const invoicesStore = useInvoicesStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Client names come off the denormalised `invoice.client_name`
	// column (migration 0028) so we don't need the clients store loaded
	// here. The "Open invoices for client X" row click only needs the
	// FK id — which lives on the invoice itself.
	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			invoicesStore.ensureLoaded(),
			// Vouchers carry the receipts that derive each invoice's
			// balance — without them every invoice looks fully owed.
			vouchersStore.ensureLoaded()
		]);
	}));

	// "As of" is implicit — today. Future: add an as-of date picker
	// for back-dating an aged-receivables snapshot for audit work.
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

	// Per-invoice bucket calculation. Returns the bucket key the
	// invoice belongs to + its outstanding balance in cents.
	const bucketFor = (inv: InvoiceRow): { key: BucketKey, balance: number } | null => {
		if (inv.status !== "sent") return null;
		const balance = invoicesStore.balanceCentsFor(inv);
		if (balance <= 0) return null;

		// Whole-day diff between due_date and today. Both ISO YYYY-MM-DD
		// at midnight local; we round to avoid DST one-hour fuzz.
		const [y, mo, d] = inv.due_date.split("-").map(Number);
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

	// All open invoices with their bucket assignments — the base
	// dataset for the two tables below.
	interface OpenInvoice {
		invoice: InvoiceRow
		bucket: BucketKey
		balance: number
	}
	const openInvoices = computed<OpenInvoice[]>(() =>
		invoicesStore.invoices
			.map((inv) => {
				const b = bucketFor(inv);
				return b ? { invoice: inv, bucket: b.key, balance: b.balance } : null;
			})
			.filter((x): x is OpenInvoice => x !== null)
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
		for (const oi of openInvoices.value) {
			acc[oi.bucket].count++;
			acc[oi.bucket].amount += oi.balance;
		}
		return acc;
	});

	// Per-client breakdown. Group invoices by client_id, sum each
	// bucket per client. Sort descending by total so worst offenders
	// land at the top. Declared before `totals` because the KPI
	// computed depends on its row count for the "clients" tally.
	interface ClientAgingRow {
		// Stable string key the DataTable uses as data-key. We can't use
		// clientId alone because invoices with a null FK would all
		// collapse onto the same row identity.
		rowKey: string
		clientId: number | null
		name: string
		invoiceCount: number
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
	const clientRows = computed<ClientAgingRow[]>(() => {
		const byClient = new Map<number, ClientAgingRow>();
		for (const oi of openInvoices.value) {
			const cid = oi.invoice.client_id;
			let row = byClient.get(cid);
			if (!row) {
				row = {
					rowKey: `client:${cid}`,
					clientId: cid,
					name: oi.invoice.client_name || "(no client)",
					invoiceCount: 0,
					current: 0,
					b1to30: 0,
					b31to60: 0,
					b61to90: 0,
					b90plus: 0,
					total: 0
				};
				byClient.set(cid, row);
			}
			row.invoiceCount++;
			row.total += oi.balance;
			row[oi.bucket] += oi.balance;
		}
		return Array.from(byClient.values()).sort((a, b) => b.total - a.total);
	});

	// Top-of-page KPIs.
	const totals = computed(() => {
		const bs = bucketStats.value;
		const totalCurrent = bs.current.amount;
		const totalOverdue = bs.b1to30.amount + bs.b31to60.amount + bs.b61to90.amount + bs.b90plus.amount;
		const totalOutstanding = totalCurrent + totalOverdue;
		const overdueCount = bs.b1to30.count + bs.b31to60.count + bs.b61to90.count + bs.b90plus.count;
		const clientCount = clientRows.value.length;
		return {
			totalCurrent,
			totalOverdue,
			totalOutstanding,
			invoiceCount: openInvoices.value.length,
			overdueCount,
			currentCount: bs.current.count,
			clientCount
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

	// Open the /invoices list pre-filtered to a client. Uses the
	// same store-filter + route pattern the clients-detail page
	// already uses.
	const openClient = (clientId: number | null) => {
		if (clientId === null) return;
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = clientId;
		void router.push("/invoices");
	};

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildAgedReceivablesPdfPayload({
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
			clientRows: clientRows.value
		}),
		fileName: () => {
			const stamp = asOfDate.toISOString().slice(0, 10);
			return `aged-receivables-${stamp}.pdf`;
		},
		title: "Aged receivables PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
