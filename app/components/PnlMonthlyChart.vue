<template>
	<div>
		<!-- Legend + summary band sits above the chart so the user has
			context before they parse the bars. Same shape as the
			dashboard's MonthlyCashFlowChart legend. -->
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap text-xs">
			<div class="flex items-center gap-4 flex-wrap">
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2.5 rounded-sm bg-(--ui-success)" />
					<span class="text-(--ui-text-muted)">Income</span>
					<span class="text-(--ui-text) tabular-nums font-medium">{{ formatLKR(totalIncome) }}</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2.5 rounded-sm bg-(--ui-error)" />
					<span class="text-(--ui-text-muted)">Expense</span>
					<span class="text-(--ui-text) tabular-nums font-medium">{{ formatLKR(totalExpense) }}</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-0.5 bg-(--ui-primary)" />
					<span class="text-(--ui-text-muted)">Net (trend)</span>
				</div>
			</div>
			<div class="text-(--ui-text-muted) tabular-nums">
				Net <span :class="netTotal >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'" class="font-medium">
					{{ netTotal >= 0 ? "+" : "−" }}{{ formatLKR(Math.abs(netTotal)) }}
				</span>
			</div>
		</div>

		<!-- Single-month series: the chart degenerates to two solitary
			bars which doesn't convey "trend" — skip the SVG and tell
			the user why. The breakdown table + KPI tiles already
			cover this case. -->
		<div v-if="months.length < 2" class="py-8 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-md">
			<UIcon name="i-lucide-trending-up" class="size-8 mx-auto mb-2 opacity-40" />
			<div>Trend chart shows when the range spans 2+ months.</div>
			<div class="text-xs mt-0.5">
				Pick a wider date range above to see month-over-month trend.
			</div>
		</div>

		<div v-else class="relative">
			<svg
				:viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
				class="w-full h-56"
				role="img"
				:aria-label="`Income vs expense by month over ${months.length} months`"
				@mouseleave="hover = null"
			>
				<!-- Y-axis ticks: max / mid / 0. Minimal but enough to read
					magnitudes. -->
				<g>
					<line
						v-for="tick in yTicks"
						:key="tick.value"
						:x1="PADDING_LEFT"
						:x2="SVG_WIDTH - PADDING_RIGHT"
						:y1="tick.y"
						:y2="tick.y"
						class="stroke-(--ui-border)"
						stroke-width="0.5"
						stroke-dasharray="2 3"
					/>
					<text
						v-for="tick in yTicks"
						:key="`l-${tick.value}`"
						:x="PADDING_LEFT - 6"
						:y="tick.y + 3"
						text-anchor="end"
						class="fill-(--ui-text-muted) text-[9px] tabular-nums"
					>
						{{ tick.label }}
					</text>
				</g>

				<!-- Bars: income left, expense right, per month. -->
				<g>
					<g
						v-for="(m, i) in months"
						:key="m.key"
						@mouseenter="hover = i"
					>
						<!-- Column-wide hover hit-zone so the tooltip fires
							even between the two bars. -->
						<rect
							:x="m.colX"
							y="0"
							:width="colWidth"
							:height="SVG_HEIGHT - PADDING_BOTTOM"
							class="fill-transparent"
							:class="hover === i ? 'fill-(--ui-primary)/5' : ''"
						/>

						<rect
							:x="m.incomeX"
							:y="m.incomeY"
							:width="barWidth"
							:height="m.incomeH"
							class="fill-(--ui-success) transition-opacity"
							:class="hover === null || hover === i ? '' : 'opacity-50'"
							rx="1.5"
						/>
						<rect
							:x="m.expenseX"
							:y="m.expenseY"
							:width="barWidth"
							:height="m.expenseH"
							class="fill-(--ui-error) transition-opacity"
							:class="hover === null || hover === i ? '' : 'opacity-50'"
							rx="1.5"
						/>

						<!-- X-axis labels. Year only on the first month or
							at year boundaries so the axis stays tidy. -->
						<text
							:x="m.colX + colWidth / 2"
							:y="SVG_HEIGHT - 14"
							text-anchor="middle"
							class="fill-(--ui-text-muted) text-[9px]"
						>
							{{ m.shortLabel }}
						</text>
						<text
							v-if="m.showYear"
							:x="m.colX + colWidth / 2"
							:y="SVG_HEIGHT - 4"
							text-anchor="middle"
							class="fill-(--ui-text-muted)/70 text-[8px] tabular-nums"
						>
							{{ m.year }}
						</text>
					</g>
				</g>

				<!-- Zero baseline -->
				<line
					:x1="PADDING_LEFT"
					:x2="SVG_WIDTH - PADDING_RIGHT"
					:y1="zeroY"
					:y2="zeroY"
					class="stroke-(--ui-border)"
					stroke-width="1"
				/>

				<!-- Net trend line + dots, drawn on top so it floats above
					the bars. The line dipping below zero crosses the
					baseline into the loss zone — same visual cue the
					Net KPI tile uses. -->
				<g v-if="netPath">
					<path
						:d="netPath"
						class="stroke-(--ui-primary) fill-none"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle
						v-for="(m, i) in months"
						:key="`pt-${m.key}`"
						:cx="m.colX + colWidth / 2"
						:cy="m.netY"
						r="2.5"
						class="fill-(--ui-primary) transition-opacity"
						:class="hover === null || hover === i ? '' : 'opacity-40'"
					/>
				</g>
			</svg>

			<!-- HTML tooltip — same pattern as MonthlyCashFlowChart. -->
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
						:class="months[hover]!.netCents >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
					>
						{{ months[hover]!.netCents >= 0 ? "+" : "−" }}{{ formatLKR(Math.abs(months[hover]!.netCents)) }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// P&L monthly trend chart.
//
// Twin grouped bars per month (income green, expense red) with a net
// trend line overlay tying the months together. Accrual basis — the
// caller passes the same row sets the P&L page already filters, so
// the chart and the breakdown table line up to the rupee.
//
// Hand-rolled SVG (no Chart.js / D3), same approach as the dashboard
// charts. Responsive via viewBox; internal coords are stable so bar
// math doesn't break on resize.

	import { formatLKR } from "~/lib/money";

	interface IncomeRow { issue_date: string, subtotal_cents: number }
	interface ExpenseRow { issue_date: string, subtotal_cents: number }
	interface PayrollRow { period_end: string, earnings_cents: number }

	const props = defineProps<{
		invoices: IncomeRow[]
		bills: ExpenseRow[]
		payslips: PayrollRow[]
		/// Inclusive ISO bounds defining the visible range. When either
		/// bound is blank the chart falls back to the last 12 months
		/// ending at the current month so the page never renders an
		/// empty axis.
		dateFrom: string
		dateTo: string
	}>();

	const hover = ref<number | null>(null);

	// SVG canvas. Reasons in this internal coord space so labels +
	// bar widths stay predictable regardless of rendered size.
	const SVG_WIDTH = 720;
	const SVG_HEIGHT = 220;
	const PADDING_LEFT = 44;
	const PADDING_RIGHT = 12;
	const PADDING_TOP = 12;
	const PADDING_BOTTOM = 32;

	const monthKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	const monthShort = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "short" });
	const monthFull = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

	// Resolve the visible month list. If the parent passed both
	// bounds, walk from dateFrom's month to dateTo's month; otherwise
	// fall back to a rolling 12-month window ending now.
	const monthRange = computed<{ start: Date, end: Date }>(() => {
		if (props.dateFrom && props.dateTo) {
			const [fy, fm] = props.dateFrom.split("-").map(Number);
			const [ty, tm] = props.dateTo.split("-").map(Number);
			if (fy && fm && ty && tm) {
				return {
					start: new Date(fy, fm - 1, 1),
					end: new Date(ty, tm - 1, 1)
				};
			}
		}
		const today = new Date();
		return {
			start: new Date(today.getFullYear(), today.getMonth() - 11, 1),
			end: new Date(today.getFullYear(), today.getMonth(), 1)
		};
	});

	// Bucket the input rows into a {YYYY-MM: {income, expense}} map.
	// Done once per props change; reused by the geometry computed.
	const buckets = computed(() => {
		const m = new Map<string, { income: number, expense: number }>();
		const bump = (key: string, field: "income" | "expense", v: number) => {
			const slot = m.get(key) ?? { income: 0, expense: 0 };
			slot[field] += v;
			m.set(key, slot);
		};
		for (const r of props.invoices) bump(r.issue_date.slice(0, 7), "income", r.subtotal_cents);
		for (const r of props.bills) bump(r.issue_date.slice(0, 7), "expense", r.subtotal_cents);
		for (const r of props.payslips) bump(r.period_end.slice(0, 7), "expense", r.earnings_cents);
		return m;
	});

	// The list of monthly slots we render. Always emit a full series
	// across the resolved range so empty months show as zero-height
	// bars rather than gaps.
	const months = computed(() => {
		const { start, end } = monthRange.value;
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
		const baseline = SVG_HEIGHT - PADDING_BOTTOM;

		// First pass: collect raw amounts so we know the max for scale.
		// monthCount calculated up-front so the loop body doesn't mutate
		// its own bound — keeps eslint's no-unmodified-loop-condition
		// happy (it can't see Date.setMonth side effects).
		const raw: Array<{ d: Date, key: string, income: number, expense: number }> = [];
		const monthCount = (end.getFullYear() - start.getFullYear()) * 12
			+ (end.getMonth() - start.getMonth()) + 1;
		let maxCents = 0;
		for (let i = 0; i < monthCount; i++) {
			const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
			const key = monthKey(d);
			const slot = buckets.value.get(key) ?? { income: 0, expense: 0 };
			raw.push({ d, key, income: slot.income, expense: slot.expense });
			if (slot.income > maxCents) maxCents = slot.income;
			if (slot.expense > maxCents) maxCents = slot.expense;
		}
		const scaleMax = maxCents > 0 ? maxCents : 1;
		const cw = (SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT) / Math.max(1, raw.length);
		const bw = Math.min(14, Math.max(6, cw * 0.32));
		const bg = Math.max(2, cw * 0.06);

		// Second pass: build geometry. Net y maps the signed value
		// (can dip below baseline into the loss zone).
		let prevYear = -1;
		return raw.map((r, i) => {
			const colX = PADDING_LEFT + i * cw;
			const innerStart = colX + (cw - bw * 2 - bg) / 2;
			const incomeH = (r.income / scaleMax) * usableHeight;
			const expenseH = (r.expense / scaleMax) * usableHeight;
			const net = r.income - r.expense;
			// Net line: map [-scaleMax, +scaleMax] to the chart's
			// vertical range, anchored on the baseline. Clamp so big
			// net values don't escape the chart.
			const netRatio = Math.max(-1, Math.min(1, net / scaleMax));
			const netY = baseline - netRatio * usableHeight;
			const showYear = i === 0 || r.d.getFullYear() !== prevYear;
			prevYear = r.d.getFullYear();
			return {
				key: r.key,
				year: r.d.getFullYear(),
				shortLabel: monthShort(r.d),
				fullLabel: monthFull(r.d),
				showYear,
				colX,
				incomeX: innerStart,
				expenseX: innerStart + bw + bg,
				incomeY: baseline - incomeH,
				expenseY: baseline - expenseH,
				incomeH,
				expenseH,
				incomeCents: r.income,
				expenseCents: r.expense,
				netCents: net,
				netY
			};
		});
	});

	// Column / bar widths derived from the resolved month count. The
	// internal `cw` / `bw` inside `months` match these but are scoped
	// to that computed; these top-level refs are what the template
	// reads for the hover hit-zone width and bar rendering. Declared
	// after `months` to satisfy no-use-before-define.
	const colWidth = computed(() => {
		const n = Math.max(1, months.value.length);
		return (SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT) / n;
	});
	const barWidth = computed(() => Math.min(14, Math.max(6, colWidth.value * 0.32)));

	const zeroY = SVG_HEIGHT - PADDING_BOTTOM;

	// Y-axis ticks: max / mid / 0. shortMoney keeps the axis dense.
	const yTicks = computed(() => {
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
		const baseline = SVG_HEIGHT - PADDING_BOTTOM;
		let maxCents = 0;
		for (const m of months.value) {
			if (m.incomeCents > maxCents) maxCents = m.incomeCents;
			if (m.expenseCents > maxCents) maxCents = m.expenseCents;
		}
		if (maxCents === 0) {
			return [{ value: 0, y: baseline, label: "0" }];
		}
		return [
			{ value: maxCents, y: baseline - usableHeight, label: shortMoney(maxCents) },
			{ value: maxCents / 2, y: baseline - usableHeight / 2, label: shortMoney(maxCents / 2) },
			{ value: 0, y: baseline, label: "0" }
		];
	});

	function shortMoney(cents: number): string {
		const abs = Math.abs(cents);
		if (abs >= 100_000_00) {
			const v = cents / 100;
			if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
			if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
			return v.toFixed(0);
		}
		return (cents / 100).toFixed(0);
	}

	// Smooth path for the net trend line. Catmull-Rom-to-Bezier: for
	// each segment we derive two control points from the four
	// surrounding samples so the curve passes through every dot
	// without the harsh elbows a polyline would have. Standard
	// 1/6 tension; ends clamp the missing neighbour to the endpoint
	// so the curve doesn't whip past the start / finish.
	//
	// Drawn after the bars so it floats on top. The v-if on the outer
	// <g> guards single-point ranges (invalid SVG path).
	const netPath = computed<string | null>(() => {
		if (months.value.length < 2) return null;
		const cw = colWidth.value;
		const pts = months.value.map((m) => ({
			x: m.colX + cw / 2,
			y: m.netY
		}));
		const fix = (n: number) => n.toFixed(2);
		let d = `M${fix(pts[0]!.x)},${fix(pts[0]!.y)}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] ?? pts[i]!;
			const p1 = pts[i]!;
			const p2 = pts[i + 1]!;
			const p3 = pts[i + 2] ?? p2;
			const c1x = p1.x + (p2.x - p0.x) / 6;
			const c1y = p1.y + (p2.y - p0.y) / 6;
			const c2x = p2.x - (p3.x - p1.x) / 6;
			const c2y = p2.y - (p3.y - p1.y) / 6;
			d += ` C${fix(c1x)},${fix(c1y)} ${fix(c2x)},${fix(c2y)} ${fix(p2.x)},${fix(p2.y)}`;
		}
		return d;
	});

	const totalIncome = computed(() =>
		months.value.reduce((s, m) => s + m.incomeCents, 0)
	);
	const totalExpense = computed(() =>
		months.value.reduce((s, m) => s + m.expenseCents, 0)
	);
	const netTotal = computed(() => totalIncome.value - totalExpense.value);

	// HTML tooltip horizontal position (% of chart width) at the
	// hovered column's centre. SVG uses internal coords; the tooltip
	// lives in the HTML layer so it can style + sit above the SVG.
	const tooltipLeft = computed(() => {
		if (hover.value === null || !months.value[hover.value]) return 0;
		const cx = months.value[hover.value]!.colX + colWidth.value / 2;
		return (cx / SVG_WIDTH) * 100;
	});
</script>
