<template>
	<div class="select-none">
		<!-- select-none on the page root: the dashboard is a glanceable
			overview (KPI tiles, charts, activity feed), not data the user
			copies out — so the whole page opts out of text selection. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Dashboard
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Where the money is — what you're owed, what you owe, what's in motion.
				</p>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-xs text-(--ui-text-muted) tabular-nums">
					{{ todayLabel }}
				</span>
				<!-- Create-new actions live here, in the header, rather than
					as a card mid-dashboard — consistent, always in reach. -->
				<UDropdownMenu :items="newItems">
					<UButton
						color="primary"
						icon="i-lucide-plus"
						trailing-icon="i-lucide-chevron-down"
					>
						New
					</UButton>
				</UDropdownMenu>
			</div>
		</header>

		<div v-if="loadError" class="mb-4">
			<UAlert
				color="error"
				variant="subtle"
				icon="i-lucide-circle-alert"
				title="Could not load dashboard data"
				:description="loadError"
			/>
		</div>

		<!-- KPI tiles -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
			<NuxtLink to="/invoices" class="block group" @click="prefilterReceivables">
				<UCard class="transition group-hover:border-(--ui-primary)">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
							Receivables outstanding
						</div>
						<UIcon name="i-lucide-arrow-down-left" class="size-4 text-(--ui-success)" />
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{{ formatLKR(invoicesStore.outstandingTotal) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-2">
						<span>{{ openInvoiceCount }} open</span>
						<UBadge
							v-if="invoicesStore.overdueCount > 0"
							color="error"
							variant="subtle"
							size="sm"
						>
							{{ invoicesStore.overdueCount }} overdue
						</UBadge>
					</div>
				</UCard>
			</NuxtLink>

			<NuxtLink to="/bills" class="block group" @click="prefilterPayables">
				<UCard class="transition group-hover:border-(--ui-primary)">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
							Payables outstanding
						</div>
						<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{{ formatLKR(billsStore.outstandingTotal) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-2">
						<span>{{ openBillCount }} open</span>
						<UBadge
							v-if="billsStore.overdueCount > 0"
							color="error"
							variant="subtle"
							size="sm"
						>
							{{ billsStore.overdueCount }} overdue
						</UBadge>
					</div>
				</UCard>
			</NuxtLink>

			<NuxtLink to="/quotes" class="block group" @click="prefilterOpenQuotes">
				<UCard class="transition group-hover:border-(--ui-primary)">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
							Open quotes
						</div>
						<UIcon name="i-lucide-file-text" class="size-4 text-(--ui-primary)" />
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums">
						{{ formatLKR(openQuotesValue) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ openQuotesCount }} active · {{ acceptedQuotesCount }} accepted
					</div>
				</UCard>
			</NuxtLink>

			<UCard>
				<div class="flex items-start justify-between gap-2">
					<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
						Net cash · {{ monthLabel }}
					</div>
					<UIcon name="i-lucide-trending-up" class="size-4" :class="netCashThisMonth >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'" />
				</div>
				<div
					class="mt-2 text-2xl font-semibold tabular-nums"
					:class="netCashThisMonth >= 0 ? 'text-(--ui-text)' : 'text-(--ui-error)'"
				>
					{{ netCashThisMonth >= 0 ? '+' : '−' }}{{ formatLKR(Math.abs(netCashThisMonth)) }}
				</div>
				<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-3">
					<span class="text-(--ui-success)">+{{ formatLKR(receiptsThisMonth) }}</span>
					<span class="text-(--ui-error)">−{{ formatLKR(paymentsThisMonth) }}</span>
				</div>
			</UCard>
		</div>

		<!-- Insights block: monthly cash flow + receivables aging +
			expenses by category. One grid that reflows per breakpoint.

			At sm/md everything stacks. At lg–xl, a 6-col grid lets
			the user toggle the cashflow / expenses split. Collapsed
			is 4/6 + 2/6 (donut hidden, legend only); expanded is
			3/6 + 3/6 (donut + legend; cashflow shrinks to a
			comfortable 1:1).
			At 2xl, a 5-col grid is fixed at 3/5 + 2/5 with the donut
			always shown (toggle hidden — there's enough room for
			both without compromise). Receivables drops to its own
			full-width row 2 from lg upward.

			Achieved with `order-*` + responsive `col-span-*` plus a
			small `:class` binding for the lg toggle. DOM order stays
			declarative; no card markup is duplicated. -->
		<div class="grid grid-cols-1 lg:grid-cols-6 2xl:grid-cols-5 gap-4 mb-4">
			<!-- Monthly cash flow — receipts vs payments grouped per
				month over the last 12 months. Sourced off the voucher
				ledger (single source of truth for cash flow after the
				bills/invoices payments-via-vouchers refactor).
				`lg:col-span-2` (collapsed) shrinks to `lg:col-span-1`
				when the user expands the expenses card. Fixed
				col-span-3 at 2xl regardless of toggle. -->
			<UCard
				style="view-transition-name: dashboard-cashflow"
				class="2xl:col-span-3" :class="[
					expensesExpanded ? 'lg:col-span-3' : 'lg:col-span-4'
				]"
			>
				<template #header>
					<div class="flex items-center justify-between gap-4 flex-wrap">
						<div>
							<div class="font-medium">
								Monthly cash flow
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								Receipts in, payments out — last {{ cashflowMonths }} months from the voucher ledger.
							</div>
						</div>
						<UIcon name="i-lucide-bar-chart-3" class="size-4 text-(--ui-text-muted)" />
					</div>
				</template>
				<MonthlyCashFlowChart :vouchers="vouchersStore.vouchers" :months-back="cashflowMonths" />
			</UCard>

			<!-- Receivables aging — full-width on its own row from lg
				upward (`lg:order-3 lg:col-span-3` covers lg-xl,
				`2xl:col-span-5` extends to the 5-col grid). -->
			<UCard class="lg:order-3 lg:col-span-6 2xl:col-span-5">
				<template #header>
					<div class="flex items-center justify-between gap-2">
						<div>
							<div class="font-medium">
								Receivables aging
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								Outstanding invoice balances by days past due.
							</div>
						</div>
						<UIcon name="i-lucide-alarm-clock" class="size-4 text-(--ui-text-muted)" />
					</div>
				</template>
				<ReceivablesAgingChart />
			</UCard>

			<!-- Expenses by category — `lg:order-2` keeps it next to
				cashflow on row 1. Width swaps based on the expand
				toggle: 1/3 collapsed (legend only) or 2/3 expanded
				(donut + legend). At 2xl always col-span-2 (donut shown
				since `showDonut` is forced true via `isLgRange`). -->
			<UCard
				style="view-transition-name: dashboard-expenses"
				class="lg:order-2 2xl:col-span-2" :class="[
					expensesExpanded ? 'lg:col-span-3' : 'lg:col-span-2'
				]"
			>
				<template #header>
					<div class="flex items-center justify-between gap-2">
						<div>
							<div class="font-medium">
								Expenses by category
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								Where the money's going, last 90 days.
							</div>
						</div>
						<!-- Toggle only renders at lg-xl (where it has
							something to do). At 2xl the card is already
							fully expanded; at sm/md it stacks full width. -->
						<UButton
							v-if="isLgRange"
							size="xs"
							variant="ghost"
							color="neutral"
							:icon="userExpanded
								? 'i-lucide-chevrons-right'
								: 'i-lucide-chevrons-left'"
							:title="userExpanded ? 'Collapse chart' : 'Expand chart'"
							@click="toggleExpenses"
						/>
						<UIcon
							v-else
							name="i-lucide-pie-chart"
							class="size-4 text-(--ui-text-muted)"
						/>
					</div>
				</template>
				<ExpensesByCategoryChart :show-donut="showExpensesDonut" />
			</UCard>
		</div>

		<!-- Recent activity + at-a-glance lists. Placed above Top clients
			so the things that need attention (activity, overdue) come
			first. -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
			<UCard class="lg:col-span-2">
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Recent activity
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							Across quotes, invoices, bills, vouchers
						</div>
					</div>
				</template>

				<div v-if="recentActivity.length === 0" class="text-sm text-(--ui-text-muted) py-6 text-center">
					Nothing recorded yet. Create a quote, invoice or voucher to get started.
				</div>

				<ul v-else class="divide-y divide-(--ui-border)">
					<li v-for="item in recentActivity" :key="`${item.kind}-${item.id}`">
						<NuxtLink
							:to="item.to"
							class="flex items-center gap-3 py-2.5 hover:bg-(--ui-bg-elevated) -mx-2 px-2 rounded transition"
						>
							<UIcon :name="item.icon" class="size-4 shrink-0" :class="item.iconClass" />
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-medium text-sm tabular-nums">{{ item.number }}</span>
									<UBadge :color="item.badgeColor" variant="subtle" size="sm">
										{{ item.kindLabel }}
									</UBadge>
									<span class="text-xs text-(--ui-text-muted) truncate">
										{{ item.subtitle }}
									</span>
								</div>
								<div class="text-xs text-(--ui-text-muted) mt-0.5">
									{{ item.dateLabel }}
								</div>
							</div>
							<div
								class="text-sm font-medium tabular-nums shrink-0"
								:class="item.amountClass"
							>
								{{ item.amountPrefix }}{{ formatLKR(item.amountCents) }}
							</div>
						</NuxtLink>
					</li>
				</ul>
			</UCard>

			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Overdue
						</div>
						<UIcon name="i-lucide-alarm-clock" class="size-4 text-(--ui-error)" />
					</div>
				</template>

				<div v-if="overdueItems.length === 0" class="text-sm text-(--ui-text-muted) py-3">
					Nothing overdue. Nice.
				</div>
				<ul v-else class="space-y-2">
					<li v-for="item in overdueItems" :key="`${item.kind}-${item.id}`">
						<NuxtLink
							:to="item.to"
							class="flex items-center justify-between gap-2 hover:text-(--ui-primary) text-sm"
						>
							<div class="min-w-0">
								<div class="font-medium tabular-nums truncate">
									{{ item.number }}
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									{{ item.subtitle }} · due {{ item.dueDate }}
								</div>
							</div>
							<div class="text-sm font-medium tabular-nums shrink-0" :class="item.amountClass">
								{{ formatLKR(item.amountCents) }}
							</div>
						</NuxtLink>
					</li>
				</ul>
			</UCard>
		</div>

		<!-- Top clients — full-width (the list-with-bars reads better
			with horizontal room). Sits below activity / overdue. -->
		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-2">
					<div>
						<div class="font-medium">
							Top clients
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-0.5">
							Invoiced revenue over the last 12 months — concentration check.
						</div>
					</div>
					<UIcon name="i-lucide-users" class="size-4 text-(--ui-text-muted)" />
				</div>
			</template>
			<TopClientsChart />
		</UCard>
	</div>
</template>

<script setup lang="ts">
// Dashboard. Tiles are derived from the same Pinia stores the list pages
// use, so loading them here also warms the cache for the user's next
// click. There's no persisted 'overdue' status on either bills or
// invoices any more — both derive that state in JS from due_date and
// linked vouchers, so no flagOverdue call is needed at mount time.

	import type { ClientSnapshot } from "~/stores/quotes";
	import { useMediaQuery } from "@vueuse/core";
	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useQuotesStore } from "~/stores/quotes";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Dashboard" });

	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const quotesStore = useQuotesStore();
	const vouchersStore = useVouchersStore();

	// Expand/collapse state for the Expenses-by-category card. Only
	// meaningful at lg-xl (1024-1535px) — below lg cards stack with
	// full width, at 2xl the 5-col grid already gives both cards
	// enough room. `isLgRange` gates the toggle button's visibility
	// and the donut-vs-legend visibility computed below.
	const isLgRange = useMediaQuery("(min-width: 1024px) and (max-width: 1535.98px)");
	const userExpanded = ref(false);

	// Monthly-cashflow horizon, decided per breakpoint × expand state.
	// We drop to 6 months whenever the chart is in its narrow form,
	// where 12 bars would squeeze uncomfortably:
	//   - lg collapsed (1024-1279, col-span-4 of 6 ≈ 2/3 of a ~750px row)
	//   - lg expanded (col-span-3 of 6 = half) — even narrower
	//   - xl expanded (1280-1535, col-span-3 of 6 = half) — same chart
	//     width as lg collapsed, so the same horizon makes sense
	// 12 months everywhere else — sm/md stack full width, xl collapsed
	// has the wider container, 2xl gives col-span-3 of 5.
	const isLgOnly = useMediaQuery("(min-width: 1024px) and (max-width: 1279.98px)");
	const cashflowMonths = computed(() => {
		if (isLgOnly.value) return 6;
		if (isLgRange.value && userExpanded.value) return 6;
		return 12;
	});

	// What the dashboard binds to the chart's `:show-donut` prop:
	// - At lg-xl: follows the user's toggle.
	// - Anywhere else (sm/md stacked, or 2xl with room): always true.
	const showExpensesDonut = computed(() => !isLgRange.value || userExpanded.value);

	// What the grid uses for col-span decisions at lg. We don't want
	// the col-span to "stick" expanded if the user shrinks the window
	// back below lg or grows past 2xl — so this only counts when we're
	// actively in the lg-xl range where the toggle is meaningful.
	const expensesExpanded = computed(() => isLgRange.value && userExpanded.value);

	// Toggle handler — wraps the state mutation in the View Transitions
	// API so the cards smoothly morph between sizes and the donut
	// fades in/out instead of the layout snapping instantly. The
	// `view-transition-name` we set on each card in the template tells
	// the browser to track them across the state change. Tauri's
	// Chromium webview supports this; we fall back to an instant
	// toggle if the API isn't there. Async DOM update is required
	// because Vue commits state changes asynchronously — the callback
	// returns the nextTick promise so the snapshot reflects the
	// post-change DOM. Suspending nuxi `await nextTick()` is fine
	// here since this only runs in response to a click event.
	const toggleExpenses = async () => {
		const next = !userExpanded.value;
		const apply = async () => {
			userExpanded.value = next;
			await nextTick();
		};
		const doc = document as Document & {
			startViewTransition?: (cb: () => Promise<void> | void) => unknown
		};
		if (typeof document !== "undefined" && doc.startViewTransition) {
			doc.startViewTransition(apply);
		} else {
			void apply();
		}
	};

	const loadError = ref<string | null>(null);

	onMounted(async () => {
		try {
			// Load everything in parallel — they're independent reads.
			await Promise.all([
				invoicesStore.load(),
				billsStore.load(),
				quotesStore.load(),
				vouchersStore.load()
			]);
		} catch (err) {
			loadError.value = err instanceof Error ? err.message : String(err);
		}
	});

	const todayLabel = computed(() => {
		const d = new Date();
		return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
	});

	const monthLabel = computed(() => {
		const d = new Date();
		return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
	});

	// Header "New" dropdown — the create actions, moved out of the
	// mid-dashboard "Quick actions" card into a single always-in-reach
	// menu next to the date.
	const newItems = [
		{ label: "Quote", icon: "i-lucide-file-text", to: "/quotes/new" },
		{ label: "Invoice", icon: "i-lucide-receipt", to: "/invoices/new" },
		{ label: "Bill", icon: "i-lucide-file-input", to: "/bills/new" },
		{ label: "Voucher", icon: "i-lucide-ticket", to: "/vouchers/new" }
	];

	// --- KPI tile prefilters ---
	// Each tile narrows the destination list to the slice the tile
	// summarises, so the user lands on exactly the rows behind the
	// headline number. Pinia state survives navigation, so we mutate
	// the target store synchronously here and NuxtLink follows up
	// with the route change. Other filters (search, client, dates)
	// are cleared so the slice isn't unintentionally narrower than
	// what the tile promises.

	const prefilterReceivables = () => {
		invoicesStore.search = "";
		invoicesStore.clientFilter = "all";
		invoicesStore.clearDateFilters();
		invoicesStore.statusFilters = ["sent", "partial", "overdue"];
	};

	const prefilterPayables = () => {
		billsStore.search = "";
		billsStore.vendorFilter = "all";
		billsStore.categoryFilter = "all";
		billsStore.clearDateFilters();
		billsStore.statusFilters = ["unpaid", "partial", "overdue"];
	};

	const prefilterOpenQuotes = () => {
		quotesStore.search = "";
		quotesStore.clientFilter = "all";
		quotesStore.clearDateFilters();
		quotesStore.statusFilters = ["draft", "sent"];
	};

	// --- Counts that don't already exist on the stores ---

	const openInvoiceCount = computed(() =>
		invoicesStore.invoices.filter((i) => ["sent", "partial", "overdue"].includes(i.status)).length
	);

	const openBillCount = computed(() =>
		billsStore.bills.filter((b) => ["unpaid", "partial", "overdue"].includes(b.status)).length
	);

	const openQuotesCount = computed(() =>
		quotesStore.quotes.filter((q) => q.status === "draft" || q.status === "sent").length
	);

	const acceptedQuotesCount = computed(() =>
		quotesStore.quotes.filter((q) => q.status === "accepted").length
	);

	const openQuotesValue = computed(() =>
		quotesStore.quotes
			.filter((q) => q.status === "draft" || q.status === "sent")
			.reduce((s, q) => s + q.total_cents, 0)
	);

	// --- This-month cash flow from vouchers (the single source of truth for
	// "actual money moved" — invoice/bill paid_cents are derived from these). ---

	const monthBoundsISO = (): { start: string, end: string } => {
		const d = new Date();
		const y = d.getFullYear();
		const m = d.getMonth();
		const pad = (n: number) => String(n).padStart(2, "0");
		const start = `${y}-${pad(m + 1)}-01`;
		// end-exclusive: first day of next month
		const next = new Date(y, m + 1, 1);
		const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
		return { start, end };
	};

	const inThisMonth = (iso: string): boolean => {
		const { start, end } = monthBoundsISO();
		return iso >= start && iso < end;
	};

	const receiptsThisMonth = computed(() =>
		vouchersStore.vouchers
			.filter((v) => v.voucher_type === "receipt" && inThisMonth(v.voucher_date))
			.reduce((s, v) => s + v.amount_cents, 0)
	);

	const paymentsThisMonth = computed(() =>
		vouchersStore.vouchers
			.filter((v) => v.voucher_type === "payment" && inThisMonth(v.voucher_date))
			.reduce((s, v) => s + v.amount_cents, 0)
	);

	const netCashThisMonth = computed(() => receiptsThisMonth.value - paymentsThisMonth.value);

	// --- Recent activity feed ---

	interface ActivityItem {
		kind: "quote" | "invoice" | "bill" | "voucher"
		kindLabel: string
		id: number
		number: string
		subtitle: string
		dateLabel: string
		sortKey: string // ISO created_at, lex-sortable
		amountCents: number
		amountPrefix: string
		amountClass: string
		to: string
		icon: string
		iconClass: string
		badgeColor: "primary" | "success" | "warning" | "error" | "info" | "neutral"
	}

	const parseClientName = (snap: string): string => {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "(client)";
		} catch {
			return "(client)";
		}
	};

	// Bills carry their vendor info in vendor_snapshot (same shape as
	// client_snapshot — `{ name, ... }`) since the bills→vendors refactor.
	const parseVendorName = (snap: string): string => {
		try {
			return (JSON.parse(snap) as { name?: string }).name ?? "(vendor)";
		} catch {
			return "(vendor)";
		}
	};

	const formatDate = (iso: string): string => {
		const [y, m, d] = iso.split(/[\sT-]/).map(Number);
		if (!y || !m || !d) return iso;
		const dt = new Date(y, m - 1, d);
		return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	};

	const recentActivity = computed<ActivityItem[]>(() => {
		const items: ActivityItem[] = [];

		for (const q of quotesStore.quotes) {
			items.push({
				kind: "quote",
				kindLabel: "Quote",
				id: q.id,
				number: q.number,
				subtitle: parseClientName(q.client_snapshot),
				dateLabel: formatDate(q.created_at),
				sortKey: q.created_at,
				amountCents: q.total_cents,
				amountPrefix: "",
				amountClass: "text-(--ui-text-muted)",
				to: `/quotes/${q.id}`,
				icon: "i-lucide-file-text",
				iconClass: "text-(--ui-text-muted)",
				badgeColor: "neutral"
			});
		}

		for (const i of invoicesStore.invoices) {
			items.push({
				kind: "invoice",
				kindLabel: "Invoice",
				id: i.id,
				number: i.number,
				subtitle: parseClientName(i.client_snapshot),
				dateLabel: formatDate(i.created_at),
				sortKey: i.created_at,
				amountCents: i.total_cents,
				amountPrefix: "",
				amountClass: "text-(--ui-text)",
				to: `/invoices/${i.id}`,
				icon: "i-lucide-receipt",
				iconClass: "text-(--ui-primary)",
				badgeColor: "primary"
			});
		}

		for (const b of billsStore.bills) {
			items.push({
				kind: "bill",
				kindLabel: "Bill",
				id: b.id,
				number: b.number,
				subtitle: parseVendorName(b.vendor_snapshot),
				dateLabel: formatDate(b.created_at),
				sortKey: b.created_at,
				amountCents: b.total_cents,
				amountPrefix: "",
				amountClass: "text-(--ui-text)",
				to: `/bills/${b.id}`,
				icon: "i-lucide-file-input",
				iconClass: "text-(--ui-warning)",
				badgeColor: "warning"
			});
		}

		for (const v of vouchersStore.vouchers) {
			const isReceipt = v.voucher_type === "receipt";
			items.push({
				kind: "voucher",
				kindLabel: isReceipt ? "Receipt" : "Payment",
				id: v.id,
				number: v.number,
				subtitle: v.party_name,
				dateLabel: formatDate(v.created_at),
				sortKey: v.created_at,
				amountCents: v.amount_cents,
				amountPrefix: isReceipt ? "+" : "−",
				amountClass: isReceipt ? "text-(--ui-success)" : "text-(--ui-error)",
				to: `/vouchers/${v.id}`,
				icon: "i-lucide-ticket",
				iconClass: isReceipt ? "text-(--ui-success)" : "text-(--ui-error)",
				badgeColor: isReceipt ? "success" : "error"
			});
		}

		// Sort by created_at descending (lex sort works for ISO timestamps).
		items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
		return items.slice(0, 10);
	});

	// --- Overdue list (right column) ---

	interface OverdueItem {
		kind: "invoice" | "bill"
		id: number
		number: string
		subtitle: string
		dueDate: string
		amountCents: number
		amountClass: string
		to: string
	}

	const overdueItems = computed<OverdueItem[]>(() => {
		const items: OverdueItem[] = [];
		for (const i of invoicesStore.invoices) {
			// Invoice status is now derived from linked receipt vouchers
			// + due date — the persisted column is only draft|sent|cancelled.
			if (invoicesStore.derivedStatus(i) !== "overdue") continue;
			items.push({
				kind: "invoice",
				id: i.id,
				number: i.number,
				subtitle: parseClientName(i.client_snapshot),
				dueDate: formatDate(i.due_date),
				amountCents: invoicesStore.balanceCentsFor(i),
				amountClass: "text-(--ui-error)",
				to: `/invoices/${i.id}`
			});
		}
		for (const b of billsStore.bills) {
			// Bill status is now derived from the linked payment vouchers
			// + due date — the row's persisted `status` is just open|cancelled.
			if (billsStore.derivedStatus(b) !== "overdue") continue;
			items.push({
				kind: "bill",
				id: b.id,
				number: b.number,
				subtitle: parseVendorName(b.vendor_snapshot),
				dueDate: formatDate(b.due_date),
				amountCents: billsStore.balanceCentsFor(b),
				amountClass: "text-(--ui-warning)",
				to: `/bills/${b.id}`
			});
		}
		// Earliest due_date first (the most painful one).
		items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
		return items.slice(0, 6);
	});
</script>
