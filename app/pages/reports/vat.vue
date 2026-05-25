<template>
	<div class="select-none">
		<div class="mb-4">
			<NuxtLink to="/reports" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to Reports
			</NuxtLink>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3">
				VAT report
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Output VAT (collected on issued invoices) minus
						Input VAT (paid on open bills) for the selected
						period. Net = what to remit to IRD; if Input >
						Output the result is a credit/refund. -->
					Output VAT collected on issued invoices vs. Input VAT paid
					on bills for the selected period. Net is what gets remitted
					to IRD — negative net means an Input-VAT credit carrying
					forward.
				</template>
			</p>
		</header>

		<!-- Loading skeleton — mirrors the real layout (filter card, 3
			KPI tiles, breakdown table, two drill-down tabs). Same
			usePageLoading + animate-pulse pattern the rest of the app
			already uses. -->
		<template v-if="isLoading">
			<UCard class="mb-6 animate-pulse">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-2">
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
							<div class="h-9 rounded bg-(--ui-bg-muted)" />
						</div>
						<div class="space-y-2">
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
							<div class="h-9 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
					<div class="flex flex-wrap gap-1.5 items-center justify-end">
						<div
							v-for="i in 6"
							:key="`pset-skel-${i}`"
							class="h-6 w-24 rounded-md bg-(--ui-bg-muted)"
						/>
					</div>
				</div>
			</UCard>

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
					<div class="h-3 w-28 rounded bg-(--ui-bg-muted)" />
				</template>
				<div class="space-y-3">
					<div
						v-for="r in 3"
						:key="`brk-skel-${r}`"
						class="grid gap-3 py-2 border-b border-(--ui-border)/40 last:border-0"
						style="grid-template-columns: 1fr auto auto"
					>
						<div class="h-3 w-40 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
					</div>
				</div>
			</UCard>
		</template>

		<template v-else>
			<!-- Filter strip — same shape as the P&L report. Date
				presets default to fiscal year on first visit; the user
				typically switches to "This quarter" since Sri Lankan
				VAT returns are quarterly. -->
			<UCard class="mb-6">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
					<div class="grid grid-cols-2 gap-3">
						<UFormField label="From">
							<DateField v-model="dateFrom" />
						</UFormField>
						<UFormField label="To">
							<DateField v-model="dateTo" :min-value="dateFrom || undefined" />
						</UFormField>
					</div>
					<div class="flex flex-wrap gap-1.5 items-center justify-end">
						<button
							v-for="p in DATE_PRESETS"
							:key="p.key"
							type="button"
							class="px-2.5 py-1 text-xs rounded-md border transition cursor-pointer"
							:class="presetClasses(p.key)"
							@click="togglePreset(p.key)"
						>
							{{ p.label }}
						</button>
						<UButton
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-rotate-ccw"
							@click="resetDates"
						>
							Reset
						</UButton>
					</div>
				</div>
			</UCard>

			<!-- Three KPI tiles: Output VAT, Input VAT, Net VAT.
				Same shape as the P&L report; size-down classes
				(text-2xl md:text-xl 2xl:text-2xl) keep 8-9-digit
				totals on a single line at lg widths. -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Output VAT
						</div>
						<UIcon name="i-lucide-arrow-down-left" class="size-4 text-(--ui-success)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
						:title="formatLKR(totals.outputVat)"
					>
						{{ formatLKR(totals.outputVat) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ totals.invoiceCount }} invoice{{ totals.invoiceCount === 1 ? "" : "s" }} issued
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Input VAT
						</div>
						<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-error)"
						:title="formatLKR(totals.inputVat)"
					>
						{{ formatLKR(totals.inputVat) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ totals.billCount }} bill{{ totals.billCount === 1 ? "" : "s" }} received
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Net VAT {{ totals.netVat >= 0 ? "payable" : "credit" }}
						</div>
						<UIcon
							:name="totals.netVat >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
							class="size-4"
							:class="totals.netVat >= 0 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
						/>
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						:class="totals.netVat >= 0 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
						:title="`${totals.netVat >= 0 ? '' : '−'}${formatLKR(Math.abs(totals.netVat))}`"
					>
						{{ totals.netVat >= 0 ? "" : "−" }}{{ formatLKR(Math.abs(totals.netVat)) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ netLabel }}
					</div>
				</UCard>
			</div>

			<!-- Breakdown table — output vs input as the two visible
				lines, then net. % column references output VAT (the
				usual 100%-of-revenue-VAT denominator). -->
			<UCard class="mb-6">
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-2 flex-wrap">
						<div class="app-chrome font-medium">
							Breakdown
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ rangeLabel }}
						</div>
					</div>
				</template>

				<table class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium">
								Line
							</th>
							<th class="py-2 px-2 font-medium text-right">
								Amount
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-24">
								% of output
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-(--ui-border)/60">
							<td class="py-2 pl-3 pr-2">
								<div class="font-medium">
									Output VAT
								</div>
								<div class="text-xs text-(--ui-text-muted)">
									Collected from clients on issued invoices
								</div>
							</td>
							<td class="py-2 px-2 text-right tabular-nums font-medium text-(--ui-success)">
								{{ formatLKR(totals.outputVat) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
								100%
							</td>
						</tr>
						<tr class="border-b border-(--ui-border)/60">
							<td class="py-2 pl-3 pr-2">
								<div>Input VAT</div>
								<div class="text-xs text-(--ui-text-muted)">
									Paid to vendors on open bills — recoverable
								</div>
							</td>
							<td class="py-2 px-2 text-right tabular-nums text-(--ui-error)">
								− {{ formatLKR(totals.inputVat) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
								{{ pct(totals.inputVat, totals.outputVat) }}
							</td>
						</tr>
						<tr class="bg-(--ui-bg-muted)/60">
							<td class="py-3 pl-3 pr-2 font-semibold">
								Net VAT {{ totals.netVat >= 0 ? "payable" : "credit" }}
							</td>
							<td
								class="py-3 px-2 text-right tabular-nums font-semibold"
								:class="totals.netVat >= 0 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
							>
								{{ totals.netVat >= 0 ? "" : "−" }}{{ formatLKR(Math.abs(totals.netVat)) }}
							</td>
							<td
								class="py-3 pl-2 pr-3 text-right tabular-nums font-semibold"
								:class="totals.netVat >= 0 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
							>
								{{ pct(Math.abs(totals.netVat), totals.outputVat) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<!-- Drill-down: two tabs (Invoices / Bills) showing the
				rows that contributed to output / input VAT. Same
				segmented-toggle pattern as the P&L drill-down. -->
			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
						<div class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs">
							<button
								v-for="(t, i) in TABS"
								:key="t.key"
								type="button"
								class="px-3 py-1.5 transition cursor-pointer inline-flex items-center gap-1.5"
								:class="[
									activeTab === t.key
										? 'bg-(--ui-primary) text-(--ui-bg)'
										: 'hover:bg-(--ui-bg-muted)',
									i > 0 ? 'border-l border-(--ui-border)' : ''
								]"
								@click="activeTab = t.key"
							>
								<UIcon :name="t.icon" class="size-3.5" />
								<span>{{ t.label }}</span>
								<span
									class="tabular-nums px-1.5 rounded-sm"
									:class="activeTab === t.key
										? 'bg-(--ui-bg)/20'
										: 'bg-(--ui-bg-muted) text-(--ui-text-muted)'"
								>
									{{ tabCounts[t.key] }}
								</span>
							</button>
						</div>
						<div class="text-xs text-(--ui-text-muted) tabular-nums">
							Total <span class="text-(--ui-text) font-medium ml-1">{{ formatLKR(activeTabTotal) }}</span>
						</div>
					</div>
				</template>

				<div
					v-if="tabCounts[activeTab] === 0"
					class="py-10 text-center text-sm text-(--ui-text-muted)"
				>
					<UIcon :name="activeTabIcon" class="size-10 mx-auto mb-2 opacity-40" />
					<div>{{ activeTabEmpty }}</div>
				</div>

				<table v-else-if="activeTab === 'invoices'" class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium w-40">
								Number
							</th>
							<th class="py-2 px-2 font-medium w-28">
								Date
							</th>
							<th class="py-2 px-2 font-medium">
								Client
							</th>
							<th class="py-2 px-2 font-medium text-right w-32">
								Subtotal
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-32">
								VAT
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in filtered.invoices"
							:key="row.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/invoices/${row.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums whitespace-nowrap">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ row.issue_date }}
							</td>
							<td class="py-2 px-2 truncate max-w-0">
								{{ row.client_name || "—" }}
							</td>
							<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium text-(--ui-success)">
								{{ formatLKR(row.tax_cents) }}
							</td>
						</tr>
					</tbody>
				</table>

				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium w-40">
								Number
							</th>
							<th class="py-2 px-2 font-medium w-28">
								Date
							</th>
							<th class="py-2 px-2 font-medium">
								Vendor
							</th>
							<th class="py-2 px-2 font-medium text-right w-32">
								Subtotal
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-32">
								VAT
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in filtered.bills"
							:key="row.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/bills/${row.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums whitespace-nowrap">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ row.issue_date }}
							</td>
							<td class="py-2 px-2 truncate max-w-0">
								{{ row.vendor_name || "—" }}
							</td>
							<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium text-(--ui-error)">
								{{ formatLKR(row.tax_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>
		</template>
	</div>
</template>

<script setup lang="ts">
// VAT report.
//
// Output VAT (collected on issued invoices) minus Input VAT (paid on
// open bills) for the chosen period. The net is what gets remitted
// to the Inland Revenue Department; a negative net (input > output)
// is an Input-VAT credit carrying forward to the next return.
//
// Sri Lankan businesses typically file VAT returns quarterly — the
// "This quarter" preset is the one most users will click. The
// default range is current fiscal year so the first paint shows a
// useful headline number.
//
// Status filtering mirrors the P&L (sent invoices only, non-cancelled
// bills only). Drafts and cancelled documents never count toward VAT.

	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "VAT report" });

	const router = useRouter();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const settingsStore = useSettingsStore();

	// Loading state owned by `usePageLoading` — see the composable for
	// the rAF-yield trick that ensures the skeleton actually paints.
	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			invoicesStore.ensureLoaded(),
			billsStore.ensureLoaded()
		]);
	}));

	// Date range — same six presets as P&L for consistency. "This
	// quarter" is the one Sri Lankan filers will pick most often.
	const dateFrom = ref("");
	const dateTo = ref("");

	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	type DatePresetKey
		= | "this_month"
			| "last_month"
			| "this_quarter"
			| "this_year"
			| "last_year"
			| "fiscal_year";
	interface DatePreset { key: DatePresetKey, label: string }
	const DATE_PRESETS: DatePreset[] = [
		{ key: "this_month", label: "This month" },
		{ key: "last_month", label: "Last month" },
		{ key: "this_quarter", label: "This quarter" },
		{ key: "this_year", label: "This year" },
		{ key: "last_year", label: "Last year" },
		{ key: "fiscal_year", label: "Fiscal year" }
	];

	function datePresetBounds(key: DatePresetKey): { from: string, to: string } {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		if (key === "this_month") {
			return { from: isoFromDate(new Date(y, m, 1)), to: isoFromDate(new Date(y, m + 1, 0)) };
		}
		if (key === "last_month") {
			return { from: isoFromDate(new Date(y, m - 1, 1)), to: isoFromDate(new Date(y, m, 0)) };
		}
		if (key === "this_quarter") {
			const qStart = Math.floor(m / 3) * 3;
			return { from: isoFromDate(new Date(y, qStart, 1)), to: isoFromDate(new Date(y, qStart + 3, 0)) };
		}
		if (key === "this_year") {
			return { from: `${y}-01-01`, to: `${y}-12-31` };
		}
		if (key === "last_year") {
			return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
		}
		const startMonth1Based = settingsStore.settings?.fiscal_year_start_month ?? 4;
		const startMonth = startMonth1Based - 1;
		const fyStartYear = m >= startMonth ? y : y - 1;
		return {
			from: isoFromDate(new Date(fyStartYear, startMonth, 1)),
			to: isoFromDate(new Date(fyStartYear + 1, startMonth, 0))
		};
	}

	function applyPreset(key: DatePresetKey): void {
		const { from, to } = datePresetBounds(key);
		dateFrom.value = from;
		dateTo.value = to;
	}

	function isPresetActive(key: DatePresetKey): boolean {
		const { from, to } = datePresetBounds(key);
		return dateFrom.value === from && dateTo.value === to;
	}

	function togglePreset(key: DatePresetKey): void {
		if (isPresetActive(key)) {
			dateFrom.value = "";
			dateTo.value = "";
			return;
		}
		applyPreset(key);
	}

	function presetClasses(key: DatePresetKey): string {
		return isPresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: "border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-border-accented)";
	}

	function resetDates(): void {
		dateFrom.value = "";
		dateTo.value = "";
	}

	// Default range = current fiscal year on first visit.
	if (!dateFrom.value && !dateTo.value) {
		applyPreset("fiscal_year");
	}

	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	const filtered = computed(() => {
		// Output VAT: only sent invoices count. Drafts haven't been
		// issued, cancelled never count.
		const invoices = invoicesStore.invoices
			.filter((row) => row.status === "sent" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date));
		// Input VAT: every non-cancelled bill in range. Bills don't
		// have a draft state — once entered they're a real liability
		// and the VAT is recoverable.
		const bills = billsStore.bills
			.filter((row) => row.status !== "cancelled" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date));
		return { invoices, bills };
	});

	const totals = computed(() => {
		const outputVat = filtered.value.invoices.reduce((s, r) => s + r.tax_cents, 0);
		const inputVat = filtered.value.bills.reduce((s, r) => s + r.tax_cents, 0);
		return {
			outputVat,
			inputVat,
			netVat: outputVat - inputVat,
			invoiceCount: filtered.value.invoices.length,
			billCount: filtered.value.bills.length
		};
	});

	// Sub-label on the Net tile. Three branches: nothing to file
	// (zero output), credit carrying forward (negative net), or net
	// payable (positive). Calculated as a share of output VAT so the
	// reader knows "we owe roughly X% of what we collected".
	const netLabel = computed(() => {
		if (totals.value.outputVat === 0 && totals.value.inputVat === 0) {
			return "No VAT activity in this period";
		}
		if (totals.value.netVat === 0) return "Output VAT exactly offset by Input VAT";
		if (totals.value.netVat < 0) return "Carries forward as Input-VAT credit";
		if (totals.value.outputVat === 0) return "All credit, no output to offset";
		const share = (totals.value.netVat / totals.value.outputVat) * 100;
		return `${share.toFixed(1)}% of output VAT`;
	});

	const rangeLabel = computed(() => {
		const fmt = (iso: string): string => {
			const [y, mo, d] = iso.split("-").map(Number);
			if (!y || !mo || !d) return iso;
			const dt = new Date(y, mo - 1, d);
			return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
		};
		if (!dateFrom.value && !dateTo.value) return "All time";
		if (!dateFrom.value) return `Up to ${fmt(dateTo.value)}`;
		if (!dateTo.value) return `From ${fmt(dateFrom.value)}`;
		return `${fmt(dateFrom.value)} → ${fmt(dateTo.value)}`;
	});

	function pct(part: number, whole: number): string {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	}

	// Drill-down tabs — same pattern as the P&L drill-down. Only two
	// tabs here (Invoices / Bills) since payslips don't carry VAT.
	type TabKey = "invoices" | "bills";
	interface TabDef { key: TabKey, label: string, icon: string }
	const TABS: TabDef[] = [
		{ key: "invoices", label: "Invoices", icon: "i-lucide-receipt" },
		{ key: "bills", label: "Bills", icon: "i-lucide-file-input" }
	];
	const activeTab = ref<TabKey>("invoices");

	const tabCounts = computed<Record<TabKey, number>>(() => ({
		invoices: filtered.value.invoices.length,
		bills: filtered.value.bills.length
	}));

	const activeTabTotal = computed(() =>
		activeTab.value === "invoices" ? totals.value.outputVat : totals.value.inputVat
	);

	const activeTabIcon = computed(() =>
		TABS.find((t) => t.key === activeTab.value)?.icon ?? "i-lucide-file"
	);
	const activeTabEmpty = computed(() =>
		activeTab.value === "invoices"
			? "No invoices issued in this period."
			: "No bills in this period."
	);
</script>
