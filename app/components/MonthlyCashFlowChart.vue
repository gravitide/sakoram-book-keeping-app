<template>
	<div>
		<!-- Legend + summary band sits above the chart so the user has
			context before they parse the bars. -->
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap text-xs">
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2.5 rounded-sm bg-(--ui-success)" />
					<span class="text-(--ui-text-muted)">Income</span>
					<span class="text-(--ui-text) tabular-nums font-medium">{{ formatLKR(totalIncome) }}</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2.5 rounded-sm bg-(--ui-error)" />
					<span class="text-(--ui-text-muted)">Expenditure</span>
					<span class="text-(--ui-text) tabular-nums font-medium">{{ formatLKR(totalExpenditure) }}</span>
				</div>
			</div>
			<div class="text-(--ui-text-muted) tabular-nums">
				Net <span :class="netTotal >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'">
					{{ netTotal >= 0 ? '+' : '−' }}{{ formatLKR(Math.abs(netTotal)) }}
				</span>
			</div>
		</div>

		<!-- The SVG. responsive width, fixed viewBox so the bars scale
			cleanly. preserveAspectRatio="none" would distort labels —
			we use "xMidYMid meet" and compensate via a wide intrinsic
			ratio so it stays readable. -->
		<div class="relative">
			<svg
				:viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
				class="w-full h-56"
				role="img"
				:aria-label="`Monthly income and expenditure for the last ${months.length} months`"
				@mouseleave="hover = null"
			>
				<!-- Y-axis gridlines + value labels -->
				<g>
					<template v-for="tick in yTicks" :key="tick.value">
						<line
							:x1="PADDING_LEFT"
							:x2="SVG_WIDTH - PADDING_RIGHT"
							:y1="tick.y"
							:y2="tick.y"
							class="stroke-(--ui-border)"
							stroke-width="0.5"
							stroke-dasharray="2 3"
						/>
						<text
							:x="PADDING_LEFT - 6"
							:y="tick.y + 3"
							text-anchor="end"
							class="fill-(--ui-text-muted) text-[9px] tabular-nums"
						>
							{{ tick.label }}
						</text>
					</template>
				</g>

				<!-- Bars: one column per month, two bars (income + expense)
					per column, side-by-side. -->
				<g>
					<g
						v-for="(m, i) in months"
						:key="m.key"
						@mouseenter="hover = i"
					>
						<!-- Hover hit-zone covering the full column so the
							tooltip works even when the user mouses over
							the gap between bars. -->
						<rect
							:x="m.colX"
							y="0"
							:width="COL_WIDTH"
							:height="SVG_HEIGHT - PADDING_BOTTOM"
							class="fill-transparent"
							:class="hover === i ? 'fill-(--ui-primary)/5' : ''"
						/>

						<!-- Income bar -->
						<rect
							:x="m.incomeX"
							:y="m.incomeY"
							:width="BAR_WIDTH"
							:height="m.incomeH"
							class="fill-(--ui-success) transition-opacity"
							:class="hover === null || hover === i ? '' : 'opacity-40'"
							rx="1.5"
						/>
						<!-- Expense bar -->
						<rect
							:x="m.expenseX"
							:y="m.expenseY"
							:width="BAR_WIDTH"
							:height="m.expenseH"
							class="fill-(--ui-error) transition-opacity"
							:class="hover === null || hover === i ? '' : 'opacity-40'"
							rx="1.5"
						/>

						<!-- X-axis label (month / year). Year only on the
							first column and on January transitions, to
							keep the axis tidy. -->
						<text
							:x="m.colX + COL_WIDTH / 2"
							:y="SVG_HEIGHT - 14"
							text-anchor="middle"
							class="fill-(--ui-text-muted) text-[9px]"
						>
							{{ m.shortLabel }}
						</text>
						<text
							v-if="m.showYear"
							:x="m.colX + COL_WIDTH / 2"
							:y="SVG_HEIGHT - 4"
							text-anchor="middle"
							class="fill-(--ui-text-muted)/70 text-[8px] tabular-nums"
						>
							{{ m.year }}
						</text>
					</g>
				</g>

				<!-- Baseline -->
				<line
					:x1="PADDING_LEFT"
					:x2="SVG_WIDTH - PADDING_RIGHT"
					:y1="zeroY"
					:y2="zeroY"
					class="stroke-(--ui-border)"
					stroke-width="1"
				/>
			</svg>

			<!-- HTML tooltip. SVG <title> is too plain — we want a styled
				card with both numbers and the month name. Position
				follows the hovered column. -->
			<div
				v-if="hover !== null && months[hover]"
				class="pointer-events-none absolute -top-2 px-2.5 py-1.5 rounded-md bg-(--ui-bg) border border-(--ui-border) shadow-lg text-xs whitespace-nowrap"
				:style="{ left: `${tooltipLeft}%`, transform: 'translate(-50%, -100%)' }"
			>
				<div class="font-medium mb-1">
					{{ months[hover]!.fullLabel }}
				</div>
				<div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 tabular-nums">
					<span class="text-(--ui-text-muted)">Income</span>
					<span class="text-(--ui-success) text-right">+{{ formatLKR(months[hover]!.incomeCents) }}</span>
					<span class="text-(--ui-text-muted)">Expense</span>
					<span class="text-(--ui-error) text-right">−{{ formatLKR(months[hover]!.expenseCents) }}</span>
					<span class="text-(--ui-text-muted) border-t border-(--ui-border)/50 pt-0.5 mt-0.5">Net</span>
					<span
						class="text-right border-t border-(--ui-border)/50 pt-0.5 mt-0.5"
						:class="(months[hover]!.incomeCents - months[hover]!.expenseCents) >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
					>
						{{ (months[hover]!.incomeCents - months[hover]!.expenseCents) >= 0 ? '+' : '−' }}{{ formatLKR(Math.abs(months[hover]!.incomeCents - months[hover]!.expenseCents)) }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Monthly cash-flow bar chart.
//
// Hand-rolled SVG so the desktop app stays dep-free (no Chart.js,
// no D3, ~150 lines and theme-aware via tokens). The shape is a
// twin-bar grouped chart — one column per month, income (green)
// next to expenditure (red).
//
// We intentionally don't draw negative bars below the baseline:
// every voucher amount is positive (sign is carried by
// voucher_type), so income and expense each get their own non-
// negative scale and share a single y-axis range so the bar
// heights stay comparable across months.

	import type { VoucherRow } from "~/stores/vouchers";
	import { formatLKR } from "~/lib/money";

	const props = defineProps<{
		vouchers: VoucherRow[]
		/// Maximum number of month columns that fit the current layout
		/// (12 wide / 6 narrow on the dashboard). Default 12. Without an
		/// explicit range this is also the window: trailing N months.
		monthsBack?: number
		/// Optional inclusive ISO date bounds from the dashboard's range
		/// chips. `undefined` = prop not used (legacy trailing window);
		/// `null` = unbounded on that side ("All time" starts at the
		/// earliest voucher, an open end finishes at the current month).
		from?: string | null
		to?: string | null
	}>();

	// First-of-month Date for an ISO YYYY-MM-DD string (local time).
	const isoMonthStart = (isoDate: string): Date =>
		new Date(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, 1);

	// The month window actually drawn: [start, start + colCount). With a
	// range that spans more months than the layout cap, we keep the MOST
	// RECENT cap months of the range — the freshest slice is the useful
	// one on a dashboard.
	const visibleMonthRange = computed(() => {
		const cap = props.monthsBack ?? 12;
		const now = new Date();
		const end = props.to ? isoMonthStart(props.to) : new Date(now.getFullYear(), now.getMonth(), 1);
		if (props.from === undefined && props.to === undefined) {
			// Legacy behaviour: trailing `cap` months ending now.
			return { start: new Date(end.getFullYear(), end.getMonth() - (cap - 1), 1), colCount: cap };
		}
		let start: Date;
		if (props.from) {
			start = isoMonthStart(props.from);
		} else {
			// Unbounded start (All time): begin at the earliest voucher
			// that's inside the range's end bound.
			let earliest: string | null = null;
			for (const v of props.vouchers) {
				if (props.to && v.voucher_date > props.to) continue;
				if (earliest === null || v.voucher_date < earliest) earliest = v.voucher_date;
			}
			start = earliest ? isoMonthStart(earliest) : end;
		}
		let colCount = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
		if (colCount < 1) {
			start = end;
			colCount = 1;
		}
		if (colCount > cap) {
			start = new Date(end.getFullYear(), end.getMonth() - (cap - 1), 1);
			colCount = cap;
		}
		return { start, colCount };
	});

	const hover = ref<number | null>(null);

	// SVG canvas geometry. The chart is responsive in CSS but reasons
	// in this internal coordinate space, which keeps the bar widths and
	// labels predictable regardless of the rendered size.
	const SVG_WIDTH = 720;
	const SVG_HEIGHT = 220;
	const PADDING_LEFT = 44;
	const PADDING_RIGHT = 12;
	const PADDING_TOP = 12;
	const PADDING_BOTTOM = 32;
	// Bar geometry scales with the DRAWN month count so a shorter series
	// doesn't look anaemic (e.g. at 6 months each column is ~2x wider, so
	// we double the bar width to keep the column ~55%-filled). Baseline:
	// 14px bars + 3px gap tuned for 12 months. Clamped at the 3-month
	// scale so a 1-2 column range doesn't produce comically fat bars.
	const BAR_WIDTH = computed(() => {
		const totalMonths = Math.max(3, visibleMonthRange.value.colCount);
		return Math.round(14 * (12 / totalMonths));
	});
	const BAR_GAP = computed(() => {
		const totalMonths = Math.max(3, visibleMonthRange.value.colCount);
		return Math.round(3 * (12 / totalMonths));
	});

	// ISO `YYYY-MM` key for a given Date.
	const monthKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

	const monthShort = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "short" });

	const monthFull = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

	// Build the month buckets for the visible window. We always emit a
	// full series so empty months show as no-bars rather than a gap.
	const months = computed(() => {
		const { start: startMonth, colCount } = visibleMonthRange.value;

		// Pre-aggregate vouchers into a {month: {income, expense}} map,
		// honouring the range bounds (full-date compare — a mid-month
		// `to` like "today" must exclude later same-month vouchers).
		const buckets = new Map<string, { income: number, expense: number }>();
		for (const v of props.vouchers) {
			if (props.from && v.voucher_date < props.from) continue;
			if (props.to && v.voucher_date > props.to) continue;
			// voucher_date is ISO `YYYY-MM-DD`; the first 7 chars are
			// the YYYY-MM key. Avoids `new Date()` parsing surprises.
			const key = v.voucher_date.slice(0, 7);
			const slot = buckets.get(key) ?? { income: 0, expense: 0 };
			if (v.voucher_type === "receipt") slot.income += v.amount_cents;
			else if (v.voucher_type === "payment") slot.expense += v.amount_cents;
			buckets.set(key, slot);
		}

		const usableWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
		const colWidth = usableWidth / colCount;
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
		const barW = BAR_WIDTH.value;
		const barGap = BAR_GAP.value;

		// Find the max single-bar value so heights are scaled consistently
		// across the series. 0 is replaced with 1 to avoid divide-by-zero.
		let maxCents = 0;
		for (let i = 0; i < colCount; i++) {
			const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
			const slot = buckets.get(monthKey(d)) ?? { income: 0, expense: 0 };
			if (slot.income > maxCents) maxCents = slot.income;
			if (slot.expense > maxCents) maxCents = slot.expense;
		}
		const scaleMax = maxCents > 0 ? maxCents : 1;

		const baseline = SVG_HEIGHT - PADDING_BOTTOM;
		let prevYear = -1;
		const out: Array<{
			key: string
			year: number
			shortLabel: string
			fullLabel: string
			showYear: boolean
			colX: number
			incomeX: number
			expenseX: number
			incomeY: number
			expenseY: number
			incomeH: number
			expenseH: number
			incomeCents: number
			expenseCents: number
		}> = [];

		for (let i = 0; i < colCount; i++) {
			const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
			const key = monthKey(d);
			const slot = buckets.get(key) ?? { income: 0, expense: 0 };
			const colX = PADDING_LEFT + i * colWidth;
			const innerStart = colX + (colWidth - barW * 2 - barGap) / 2;
			const incomeH = (slot.income / scaleMax) * usableHeight;
			const expenseH = (slot.expense / scaleMax) * usableHeight;
			out.push({
				key,
				year: d.getFullYear(),
				shortLabel: monthShort(d),
				fullLabel: monthFull(d),
				// Show the year on the first column or when the year
				// changes (Jan transitions), so the axis stays readable
				// without doubling up labels every month.
				showYear: i === 0 || d.getFullYear() !== prevYear,
				colX,
				incomeX: innerStart,
				expenseX: innerStart + barW + barGap,
				incomeY: baseline - incomeH,
				expenseY: baseline - expenseH,
				incomeH,
				expenseH,
				incomeCents: slot.income,
				expenseCents: slot.expense
			});
			prevYear = d.getFullYear();
		}
		return out;
	});

	// Reactive column width: must track the drawn month count so the
	// hover hit-zone and label/tooltip positions match the bars when
	// the parent swaps horizons (e.g. 12mo → 6mo at the lg tier) or the
	// range narrows the series.
	const COL_WIDTH = computed(() =>
		(SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT) / visibleMonthRange.value.colCount
	);

	// Y-axis tick values + their pixel positions. Three lines: 0, mid,
	// max — minimal but enough to read the magnitudes.
	const yTicks = computed(() => {
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
		const baseline = SVG_HEIGHT - PADDING_BOTTOM;
		// Find the max bar value across the visible series.
		let maxCents = 0;
		for (const m of months.value) {
			if (m.incomeCents > maxCents) maxCents = m.incomeCents;
			if (m.expenseCents > maxCents) maxCents = m.expenseCents;
		}
		if (maxCents === 0) {
			// No data: just draw the baseline so the empty state isn't
			// completely barren.
			return [{ value: 0, y: baseline, label: "0" }];
		}
		const mid = maxCents / 2;
		return [
			{ value: maxCents, y: baseline - usableHeight, label: shortMoney(maxCents) },
			{ value: mid, y: baseline - usableHeight / 2, label: shortMoney(mid) },
			{ value: 0, y: baseline, label: "0" }
		];
	});

	const zeroY = SVG_HEIGHT - PADDING_BOTTOM;

	// Compact money formatter for the Y-axis ticks: "Rs 1.2M",
	// "Rs 250k". formatLKR is too verbose at axis density.
	function shortMoney(cents: number): string {
		const abs = Math.abs(cents);
		if (abs >= 100_000_00) {
			// >= 100,000.00 (any currency 100k unit) → use M / k
			const v = cents / 100;
			if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
			if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
			return v.toFixed(0);
		}
		return (cents / 100).toFixed(0);
	}

	const totalIncome = computed(() =>
		months.value.reduce((s, m) => s + m.incomeCents, 0)
	);
	const totalExpenditure = computed(() =>
		months.value.reduce((s, m) => s + m.expenseCents, 0)
	);
	const netTotal = computed(() => totalIncome.value - totalExpenditure.value);

	// HTML tooltip horizontal position: % of the chart width at the
	// hovered column's centre. The SVG uses internal coords; the
	// tooltip lives outside the SVG so it can use HTML styling.
	const tooltipLeft = computed(() => {
		if (hover.value === null) return 0;
		const m = months.value[hover.value];
		if (!m) return 0;
		return ((m.colX + COL_WIDTH.value / 2) / SVG_WIDTH) * 100;
	});
</script>
