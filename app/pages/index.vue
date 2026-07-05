<template>
	<div class="select-none">
		<!-- select-none on the page root: the dashboard is a glanceable
			overview (KPI tiles, charts, activity feed), not data the user
			copies out — so the whole page opts out of text selection. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<!-- Left column flex-1 + min-w-0 so the subtitle wraps inside
				this group instead of pushing the date+New cluster down to
				its own row. At very small widths the right group still
				wraps below thanks to flex-wrap on the header. -->
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-semibold">
					Dashboard
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Where the money is — what you're owed, what you owe, what's in motion.
				</p>
			</div>
			<div class="flex items-center gap-3 shrink-0">
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

		<!-- First-run checklist. Self-contained: derives completion from row
			counts, hides once done or dismissed. -->
		<GettingStartedCard />

		<div v-if="loadError" class="mb-4">
			<UAlert
				color="error"
				variant="subtle"
				icon="i-lucide-circle-alert"
				title="Could not load dashboard data"
				:description="loadError"
			/>
		</div>

		<!-- Two-tier loading. The KPI tiles fall out of four small SQL
			aggregates (`app/lib/dashboard-data.ts`) which complete in
			~hundreds of ms even at heavy volume — so the top of the
			page paints something useful almost immediately. The charts
			and activity lists still drive off the Pinia stores, which
			pull thousands of rows on first load — those sections show
			their own skeleton until `dataReady` flips. Second visits
			during the same tenant session skip both: stores are
			already cached, KPIs re-run instantly. -->

		<!-- KPI tile skeleton — only visible during the SQL-aggregate
			round trip (typically <500ms). animate-pulse comes from
			Tailwind. -->
		<div
			v-if="!kpis && !loadError"
			class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
			aria-busy="true"
			aria-live="polite"
		>
			<UCard v-for="i in 4" :key="`kpi-skel-${i}`" class="h-full">
				<div class="space-y-3 animate-pulse">
					<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
					<div class="h-7 w-32 rounded bg-(--ui-bg-muted)" />
					<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
				</div>
			</UCard>
		</div>

		<!-- Charts / activity skeleton — visible until every store has
			hydrated. With ~3400 rows total this can run a few seconds
			on first load. Each card carries a content-shaped placeholder
			that hints at the upcoming layout (mini bars, donut, calendar
			grid, list rows) instead of a flat rectangle — feels like a
			page that's loading rather than a page that's broken. -->
		<div
			v-if="!dataReady && !loadError"
			:class="kpis ? '' : 'mt-6'"
			class="space-y-4 animate-pulse"
			aria-busy="true"
			aria-live="polite"
		>
			<div class="text-sm text-(--ui-text-muted) flex items-center gap-2 animate-none">
				<UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-(--ui-primary)" />
				Loading charts and activity…
			</div>

			<!-- Row 1: Cash flow bars (col-span-4) + Expenses donut
				(col-span-2). Mirrors the real lg:grid-cols-6 split. -->
			<div class="grid grid-cols-1 lg:grid-cols-6 gap-4">
				<UCard class="lg:col-span-4">
					<template #header>
						<div class="space-y-1.5">
							<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
							<div class="h-2 w-48 rounded bg-(--ui-bg-muted)/60" />
						</div>
					</template>
					<!-- Fake twin-bar chart: 12 month columns, two bars
						each at deterministic varying heights so the
						shape reads as a chart immediately. -->
					<div class="flex items-end gap-1.5 h-44">
						<div
							v-for="n in 12"
							:key="`cf-skel-${n}`"
							class="flex gap-0.5 flex-1"
						>
							<div
								class="flex-1 rounded-sm bg-(--ui-bg-muted)"
								:style="{ height: `${30 + ((n * 17) % 55)}%` }"
							/>
							<div
								class="flex-1 rounded-sm bg-(--ui-bg-muted)/70"
								:style="{ height: `${20 + ((n * 23) % 60)}%` }"
							/>
						</div>
					</div>
				</UCard>

				<UCard class="lg:col-span-2">
					<template #header>
						<div class="space-y-1.5">
							<div class="h-3 w-28 rounded bg-(--ui-bg-muted)" />
							<div class="h-2 w-36 rounded bg-(--ui-bg-muted)/60" />
						</div>
					</template>
					<!-- Donut + legend rows. The donut is a thick-ring
						circle (border trick — no SVG needed). -->
					<div class="flex items-center gap-4">
						<div class="size-28 shrink-0 rounded-full border-[14px] border-(--ui-bg-muted)" />
						<div class="flex-1 space-y-2">
							<div class="h-3 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-4/5 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-3/5 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-2/5 rounded bg-(--ui-bg-muted)/60" />
						</div>
					</div>
				</UCard>
			</div>

			<!-- Calendar — 6×7 grid of day cells. -->
			<UCard>
				<template #header>
					<div class="space-y-1.5">
						<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
						<div class="h-2 w-56 rounded bg-(--ui-bg-muted)/60" />
					</div>
				</template>
				<div class="grid grid-cols-7 gap-1">
					<div
						v-for="n in 42"
						:key="`cal-skel-${n}`"
						class="aspect-square rounded-sm bg-(--ui-bg-muted)"
						:class="(n + Math.floor((n - 1) / 7)) % 2 === 0 ? 'opacity-90' : 'opacity-60'"
					/>
				</div>
			</UCard>

			<!-- Receivables aging — 5 horizontal bars, decreasing width
				(longest bar = 0-30 days bucket). -->
			<UCard>
				<template #header>
					<div class="space-y-1.5">
						<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
						<div class="h-2 w-44 rounded bg-(--ui-bg-muted)/60" />
					</div>
				</template>
				<div class="space-y-2.5">
					<div
						v-for="(w, i) in [85, 70, 55, 40, 25]"
						:key="`age-skel-${i}`"
						class="flex items-center gap-3"
					>
						<div class="h-3 w-16 rounded bg-(--ui-bg-muted)" />
						<div
							class="h-6 rounded bg-(--ui-bg-muted)"
							:style="{ width: `${w}%` }"
						/>
					</div>
				</div>
			</UCard>

			<!-- Recent activity (col-span-2) + Overdue list (col-span-1).
				Each is a list of avatar + two text lines + trailing
				amount. -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<UCard class="lg:col-span-2">
					<template #header>
						<div class="space-y-1.5">
							<div class="h-3 w-28 rounded bg-(--ui-bg-muted)" />
							<div class="h-2 w-44 rounded bg-(--ui-bg-muted)/60" />
						</div>
					</template>
					<div class="space-y-3">
						<div
							v-for="n in 5"
							:key="`act-skel-${n}`"
							class="flex items-center gap-3"
						>
							<div class="size-8 shrink-0 rounded-md bg-(--ui-bg-muted)" />
							<div class="flex-1 space-y-1.5">
								<div class="h-3 w-3/5 rounded bg-(--ui-bg-muted)" />
								<div class="h-2 w-2/5 rounded bg-(--ui-bg-muted)/60" />
							</div>
							<div class="h-3 w-16 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
				</UCard>

				<UCard>
					<template #header>
						<div class="space-y-1.5">
							<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
							<div class="h-2 w-32 rounded bg-(--ui-bg-muted)/60" />
						</div>
					</template>
					<div class="space-y-3">
						<div
							v-for="n in 4"
							:key="`od-skel-${n}`"
							class="flex items-center gap-3"
						>
							<div class="size-6 shrink-0 rounded-full bg-(--ui-bg-muted)" />
							<div class="flex-1 space-y-1">
								<div class="h-3 w-4/5 rounded bg-(--ui-bg-muted)" />
								<div class="h-2 w-1/2 rounded bg-(--ui-bg-muted)/60" />
							</div>
						</div>
					</div>
				</UCard>
			</div>
		</div>

		<!-- Real KPI tiles. Rendered as soon as `kpis` populates, even
			if the stores below are still loading — that's the whole
			point of the two-tier split. -->
		<template v-if="kpis">
			<!-- KPI tiles -->
			<!-- Layout: 1 col (mobile) → 4 col (md+). The money figures
			switch to compact form (K/M/B) at md and lg where tile width
			is tightest — see `kpiMoney()` below. At xl the 4-up tiles
			get enough room (~240px+) to fit the full "Rs 3,553,600.00"
			string again. -->
			<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<NuxtLink to="/invoices" class="block group h-full" @click="prefilterReceivables">
					<UCard class="h-full transition group-hover:border-(--ui-primary)">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs md:text-[11px] xl:text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight min-h-[2lh]">
								Receivables outstanding
							</div>
							<UIcon name="i-lucide-arrow-down-left" class="size-4 text-(--ui-success)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
							:title="formatLKR(outstandingInvoices)"
						>
							{{ kpiMoney(outstandingInvoices) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-2">
							<span>{{ openInvoiceCount }} open</span>
							<UBadge
								v-if="overdueInvoiceCount > 0"
								color="error"
								variant="subtle"
								size="sm"
							>
								{{ overdueInvoiceCount }} overdue
							</UBadge>
						</div>
					</UCard>
				</NuxtLink>

				<NuxtLink to="/bills" class="block group h-full" @click="prefilterPayables">
					<UCard class="h-full transition group-hover:border-(--ui-primary)">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs md:text-[11px] xl:text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight min-h-[2lh]">
								Payables outstanding
							</div>
							<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
							:title="formatLKR(outstandingBills)"
						>
							{{ kpiMoney(outstandingBills) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-2">
							<span>{{ openBillCount }} open</span>
							<UBadge
								v-if="overdueBillCount > 0"
								color="error"
								variant="subtle"
								size="sm"
							>
								{{ overdueBillCount }} overdue
							</UBadge>
						</div>
					</UCard>
				</NuxtLink>

				<NuxtLink to="/quotes" class="block group h-full" @click="prefilterOpenQuotes">
					<UCard class="h-full transition group-hover:border-(--ui-primary)">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs md:text-[11px] xl:text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight min-h-[2lh]">
								Open quotes
							</div>
							<UIcon name="i-lucide-file-text" class="size-4 text-(--ui-primary)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
							:title="formatLKR(openQuotesValue)"
						>
							{{ kpiMoney(openQuotesValue) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ openQuotesCount }} active · {{ acceptedQuotesCount }} accepted
						</div>
					</UCard>
				</NuxtLink>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs md:text-[11px] xl:text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight min-h-[2lh]">
							Net cash · {{ monthLabel }}
						</div>
						<UIcon name="i-lucide-trending-up" class="size-4" :class="netCashThisMonth >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						:class="netCashThisMonth >= 0 ? 'text-(--ui-text)' : 'text-(--ui-error)'"
						:title="`${netCashThisMonth >= 0 ? '+' : '−'}${formatLKR(Math.abs(netCashThisMonth))}`"
					>
						{{ netCashThisMonth >= 0 ? '+' : '−' }}{{ kpiMoney(Math.abs(netCashThisMonth)) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-3">
						<span class="text-(--ui-success)" :title="formatLKR(receiptsThisMonth)">+{{ kpiMoney(receiptsThisMonth) }}</span>
						<span class="text-(--ui-error)" :title="formatLKR(paymentsThisMonth)">−{{ kpiMoney(paymentsThisMonth) }}</span>
					</div>
				</UCard>
			</div>
		</template>

		<!-- Real charts / activity. Gated on every store having hydrated,
			so the chart components don't render with empty arrays
			(which flashes incomplete-looking content for a beat). -->
		<template v-if="dataReady">
			<!-- Insights row 1: monthly cash flow + expenses by category.
			Stacks at sm/md. At lg-xl a 6-col grid lets the user toggle
			the split: collapsed = 4/6 + 2/6 (donut hidden, legend only);
			expanded = 3/6 + 3/6 (donut + legend; cashflow shrinks).
			At 2xl a 5-col grid is fixed at 3/5 + 2/5 with the donut
			always shown (toggle hidden — there's enough room without
			compromise).

			Calendar + receivables aging now live in their own rows
			below this block — see the cards under the calendar
			placement comment. -->
			<div class="grid grid-cols-1 lg:grid-cols-6 2xl:grid-cols-5 gap-4 mb-4">
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

				<UCard
					style="view-transition-name: dashboard-expenses"
					class="2xl:col-span-2" :class="[
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

			<!-- Upcoming due-dates calendar. Compact density so the
			dashboard row stays roughly aligned in height with the
			surrounding cards. "View calendar" link in the header jumps
			to the full page for the fuller view + filter chips. -->
			<UCard class="mb-4">
				<template #header>
					<div class="flex items-center justify-between gap-2">
						<div>
							<div class="font-medium">
								Upcoming
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								Due dates across receivables, payables, quote expiries and payslips.
							</div>
						</div>
						<NuxtLink to="/calendar" class="text-xs text-(--ui-primary) hover:underline inline-flex items-center gap-1">
							View calendar
							<UIcon name="i-lucide-arrow-right" class="size-3.5" />
						</NuxtLink>
					</div>
				</template>
				<UpcomingCalendar density="compact" />
			</UCard>

			<!-- Receivables aging — full-width row, sits below the calendar
			so "what's coming due" reads first, then the past-due
			breakdown for finer triage. -->
			<UCard class="mb-4">
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
		</template>
	</div>
</template>

<script setup lang="ts">
// Dashboard. Tiles are derived from the same Pinia stores the list pages
// use, so loading them here also warms the cache for the user's next
// click. There's no persisted 'overdue' status on either bills or
// invoices any more — both derive that state in JS from due_date and
// linked vouchers, so no flagOverdue call is needed at mount time.

	import type { DashboardKpis } from "~/lib/dashboard-data";
	import type { ClientSnapshot } from "~/stores/quotes";
	import { useMediaQuery } from "@vueuse/core";
	import { loadDashboardKpis } from "~/lib/dashboard-data";
	import { formatLKR, formatMoneyCompact } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useQuotesStore } from "~/stores/quotes";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Dashboard" });

	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const quotesStore = useQuotesStore();
	const vouchersStore = useVouchersStore();
	const payslipsStore = usePayslipsStore();

	// Expand/collapse state for the Expenses-by-category card. Only
	// meaningful at lg-xl (1024-1535px) — below lg cards stack with
	// full width, at 2xl the 5-col grid already gives both cards
	// enough room. `isLgRange` gates the toggle button's visibility
	// and the donut-vs-legend visibility computed below.
	const isLgRange = useMediaQuery("(min-width: 1024px) and (max-width: 1535.98px)");
	const userExpanded = ref(false);

	// KPI tiles compact their headline number through md and lg, where
	// the strip is tightest — md packs 2-up into a half-width row and
	// lg packs 4-up across a sidebar'd content area (~180-230px per
	// tile). At xl the 4-up tiles open up to ~240-300px and full
	// "Rs 3,553,600.00" strings fit again; sub-md stacks single-column
	// with the most room of all. `title` carries the exact value on
	// every compacted cell so hover always reveals the precise number.
	const isKpiCompact = useMediaQuery("(min-width: 768px) and (max-width: 1279.98px)");
	const kpiMoney = (cents: number) =>
		(isKpiCompact.value ? formatMoneyCompact(cents) : formatLKR(cents));

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

	// Two-tier loading. KPI tiles paint from focused SQL aggregates
	// (`app/lib/dashboard-data.ts`) — sub-second on any volume because
	// they're four small GROUP BYs, not full table scans. Charts +
	// activity lists still drive off the Pinia stores (which need full
	// rows for things like recent activity / overdue lists / monthly
	// bucketing). So:
	//
	//   - `kpis` populates in <500ms; KPI section paints immediately.
	//   - `dataReady` (all 5 stores hydrated) takes longer at heavy
	//     volume; chart section keeps its skeleton until then.
	//
	// Both ride alongside the existing `ensureLoaded` cache — second
	// visits within the same tenant session skip the store loads
	// entirely, so only the SQL aggregates run.
	const kpis = ref<DashboardKpis | null>(null);

	const dataReady = computed(() =>
		invoicesStore.loaded
		&& billsStore.loaded
		&& quotesStore.loaded
		&& vouchersStore.loaded
		&& payslipsStore.loaded
	);

	onMounted(async () => {
		// KPI aggregates first — they're fast and the user sees a
		// useful page within a fraction of a second.
		try {
			kpis.value = await loadDashboardKpis();
		} catch (err) {
			loadError.value = err instanceof Error ? err.message : String(err);
			return;
		}

		// Then the stores in the background — chart components subscribe
		// to them and paint as they fill in. We don't `await` the
		// outer onMounted on these; the dashboard renders KPI tiles +
		// the chart skeleton meanwhile.
		try {
			await Promise.all([
				invoicesStore.ensureLoaded(),
				billsStore.ensureLoaded(),
				quotesStore.ensureLoaded(),
				vouchersStore.ensureLoaded(),
				payslipsStore.ensureLoaded()
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
		// `?new=1` makes each list page auto-open its New … modal on
		// mount. The standalone /<type>/new pages were removed for
		// quotes / invoices / bills. Vouchers still has a full page
		// because the form is too heavy for a modal (8+ fields,
		// prefill from query, conditional fields, overpayment guard).
		{ label: "Quote", icon: "i-lucide-file-text", to: "/quotes?new=1" },
		{ label: "Invoice", icon: "i-lucide-receipt", to: "/invoices?new=1" },
		{ label: "Bill", icon: "i-lucide-file-input", to: "/bills?new=1" },
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

	// KPI tile shortcuts — read off the SQL-aggregated `kpis` object so
	// the tiles paint as soon as those four small queries finish,
	// without waiting for the full store loads. All return 0 while
	// `kpis` is still null (the loading skeleton is rendering instead).
	const outstandingInvoices = computed(() => kpis.value?.invoices.outstanding_cents ?? 0);
	const outstandingBills = computed(() => kpis.value?.bills.outstanding_cents ?? 0);
	const overdueInvoiceCount = computed(() => kpis.value?.invoices.overdue_count ?? 0);
	const overdueBillCount = computed(() => kpis.value?.bills.overdue_count ?? 0);
	const openInvoiceCount = computed(() => kpis.value?.invoices.open_count ?? 0);
	const openBillCount = computed(() => kpis.value?.bills.open_count ?? 0);
	const openQuotesCount = computed(() => kpis.value?.quotes.open_count ?? 0);
	const acceptedQuotesCount = computed(() => kpis.value?.quotes.accepted_count ?? 0);
	const openQuotesValue = computed(() => kpis.value?.quotes.open_value_cents ?? 0);
	const receiptsThisMonth = computed(() => kpis.value?.cash.receipts_cents ?? 0);
	const paymentsThisMonth = computed(() => kpis.value?.cash.payments_cents ?? 0);
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
