<template>
	<div>
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap text-xs">
			<div class="flex items-center gap-1.5">
				<span class="inline-block size-2.5 rounded-sm bg-(--ui-primary)" />
				<span class="text-(--ui-text-muted)">Salaries paid</span>
				<span class="text-(--ui-text) tabular-nums font-medium">{{ formatLKR(totalPaid) }}</span>
				<span class="text-(--ui-text-muted)">across {{ months.length }} months</span>
			</div>
			<div v-if="months.length > 0" class="text-(--ui-text-muted) tabular-nums">
				Avg <span class="text-(--ui-text)">{{ formatLKR(avgMonthly) }}</span>/mo
			</div>
		</div>

		<div class="relative">
			<svg
				:viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
				class="w-full h-56"
				role="img"
				:aria-label="`Salary paid for the last ${months.length} months`"
				@mouseleave="hover = null"
			>
				<!-- Y gridlines + labels -->
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

				<!-- Bars -->
				<g>
					<g
						v-for="(m, i) in months"
						:key="m.key"
						@mouseenter="hover = i"
					>
						<rect
							:x="m.colX"
							y="0"
							:width="colWidth"
							:height="SVG_HEIGHT - PADDING_BOTTOM"
							class="fill-transparent"
							:class="hover === i ? 'fill-(--ui-primary)/5' : ''"
						/>
						<rect
							:x="m.barX"
							:y="m.barY"
							:width="BAR_WIDTH"
							:height="m.barH"
							class="fill-(--ui-primary) transition-opacity"
							:class="hover === null || hover === i ? '' : 'opacity-40'"
							rx="1.5"
						/>

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

				<line
					:x1="PADDING_LEFT"
					:x2="SVG_WIDTH - PADDING_RIGHT"
					:y1="zeroY"
					:y2="zeroY"
					class="stroke-(--ui-border)"
					stroke-width="1"
				/>
			</svg>

			<div
				v-if="hover !== null && months[hover]"
				class="pointer-events-none absolute -top-2 px-2.5 py-1.5 rounded-md bg-(--ui-bg) border border-(--ui-border) shadow-lg text-xs whitespace-nowrap"
				:style="{ left: `${tooltipLeft}%`, transform: 'translate(-50%, -100%)' }"
			>
				<div class="font-medium mb-1">
					{{ months[hover]!.fullLabel }}
				</div>
				<div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 tabular-nums">
					<span class="text-(--ui-text-muted)">Paid</span>
					<span class="text-right">{{ formatLKR(months[hover]!.paidCents) }}</span>
					<span class="text-(--ui-text-muted)">Vouchers</span>
					<span class="text-right">{{ months[hover]!.voucherCount }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Monthly salary-paid bar chart for the payroll dashboard.
//
// Single-series version of `MonthlyCashFlowChart` — same SVG geometry +
// hover-tooltip scaffolding so the two visually rhyme. Pulls from the
// voucher ledger where `voucher_type = 'payment'` and
// `related_payslip_id IS NOT NULL` (payroll-attributed money out).

	import type { VoucherRow } from "~/stores/vouchers";
	import { formatLKR } from "~/lib/money";

	const props = defineProps<{
		vouchers: VoucherRow[]
		monthsBack?: number
	}>();

	const hover = ref<number | null>(null);

	const SVG_WIDTH = 720;
	const SVG_HEIGHT = 220;
	const PADDING_LEFT = 44;
	const PADDING_RIGHT = 12;
	const PADDING_TOP = 12;
	const PADDING_BOTTOM = 32;
	const BAR_WIDTH = 18;

	const monthKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	const monthShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
	const monthFull = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

	interface MonthBar {
		key: string
		year: number
		shortLabel: string
		fullLabel: string
		showYear: boolean
		colX: number
		barX: number
		barY: number
		barH: number
		paidCents: number
		voucherCount: number
	}

	const months = computed<MonthBar[]>(() => {
		const total = props.monthsBack ?? 12;
		const today = new Date();
		const start = new Date(today.getFullYear(), today.getMonth() - (total - 1), 1);

		// Only payment vouchers that belong to a payslip count toward
		// the salaries-paid total. Receipts and standalone payments are
		// out of scope for this chart.
		const buckets = new Map<string, { paid: number, count: number }>();
		for (const v of props.vouchers) {
			if (v.voucher_type !== "payment") continue;
			if (v.related_payslip_id === null) continue;
			const key = v.voucher_date.slice(0, 7);
			const slot = buckets.get(key) ?? { paid: 0, count: 0 };
			slot.paid += v.amount_cents;
			slot.count += 1;
			buckets.set(key, slot);
		}

		const colCount = total;
		const usableWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
		const cw = usableWidth / colCount;
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

		let maxCents = 0;
		for (let i = 0; i < colCount; i++) {
			const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
			const slot = buckets.get(monthKey(d));
			if (slot && slot.paid > maxCents) maxCents = slot.paid;
		}
		const scaleMax = maxCents > 0 ? maxCents : 1;

		const baseline = SVG_HEIGHT - PADDING_BOTTOM;
		const out: MonthBar[] = [];
		let prevYear = -1;
		for (let i = 0; i < colCount; i++) {
			const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
			const key = monthKey(d);
			const slot = buckets.get(key) ?? { paid: 0, count: 0 };
			const colX = PADDING_LEFT + i * cw;
			const barH = (slot.paid / scaleMax) * usableHeight;
			out.push({
				key,
				year: d.getFullYear(),
				shortLabel: monthShort(d),
				fullLabel: monthFull(d),
				showYear: i === 0 || d.getFullYear() !== prevYear,
				colX,
				barX: colX + (cw - BAR_WIDTH) / 2,
				barY: baseline - barH,
				barH,
				paidCents: slot.paid,
				voucherCount: slot.count
			});
			prevYear = d.getFullYear();
		}
		return out;
	});

	const colWidth = computed(() =>
		(SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT) / (props.monthsBack ?? 12)
	);

	const yTicks = computed(() => {
		const usableHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
		const baseline = SVG_HEIGHT - PADDING_BOTTOM;
		let maxCents = 0;
		for (const m of months.value) {
			if (m.paidCents > maxCents) maxCents = m.paidCents;
		}
		if (maxCents === 0) return [{ value: 0, y: baseline, label: "0" }];
		const mid = maxCents / 2;
		return [
			{ value: maxCents, y: baseline - usableHeight, label: shortMoney(maxCents) },
			{ value: mid, y: baseline - usableHeight / 2, label: shortMoney(mid) },
			{ value: 0, y: baseline, label: "0" }
		];
	});

	const zeroY = SVG_HEIGHT - PADDING_BOTTOM;

	// Compact axis labels — matches MonthlyCashFlowChart's shortMoney.
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

	const totalPaid = computed(() => months.value.reduce((s, m) => s + m.paidCents, 0));
	const avgMonthly = computed(() => {
		const monthsWithPayments = months.value.filter((m) => m.paidCents > 0).length;
		if (monthsWithPayments === 0) return 0;
		return Math.round(totalPaid.value / monthsWithPayments);
	});

	const tooltipLeft = computed(() => {
		if (hover.value === null) return 0;
		const m = months.value[hover.value];
		if (!m) return 0;
		return ((m.colX + colWidth.value / 2) / SVG_WIDTH) * 100;
	});
</script>
