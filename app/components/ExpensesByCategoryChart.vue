<template>
	<div>
		<div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
			<div>
				<div class="text-2xl font-semibold tabular-nums">
					{{ formatLKR(total) }}
				</div>
				<div class="text-xs text-(--ui-text-muted) mt-0.5">
					Last 90 days · {{ paidCount }} payment{{ paidCount === 1 ? "" : "s" }}
				</div>
			</div>
			<div v-if="categoryRows.length > 1" class="text-xs text-(--ui-text-muted)">
				Top: <span class="text-(--ui-text) font-medium">{{ categoryRows[0]!.name }}</span>
			</div>
		</div>

		<div v-if="total === 0" class="py-8 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-piggy-bank" class="size-8 block mx-auto mb-2 opacity-50" />
			No expenses recorded in the last 90 days.
		</div>

		<template v-else>
			<!-- Donut + legend. Donut is hidden when `showDonut` is
				false (the lg-range collapsed mode on the dashboard
				where the card sits in a narrow ~1/3-width slot and
				the SVG would crowd the legend). The legend itself
				stays — that's the actual data. -->
			<div class="flex items-center gap-5 flex-wrap">
				<svg v-if="showDonut" viewBox="0 0 100 100" class="size-40 shrink-0 -rotate-90">
					<circle cx="50" cy="50" r="40" class="fill-none stroke-(--ui-bg-muted)" stroke-width="14" />
					<circle
						v-for="(slice, i) in slices"
						:key="slice.row.id"
						cx="50"
						cy="50"
						r="40"
						class="fill-none transition-opacity"
						:class="hover === null || hover === i ? '' : 'opacity-30'"
						:stroke="slice.color"
						stroke-width="14"
						:stroke-dasharray="`${slice.arc} ${CIRC - slice.arc}`"
						:stroke-dashoffset="-slice.offset"
						stroke-linecap="butt"
						@mouseenter="hover = i"
						@mouseleave="hover = null"
					/>
					<!-- Centre label flips between hovered slice's share
						and the bare "Spend" mode. Sits inside the
						hollow of the donut. -->
					<g class="rotate-90" style="transform-origin: 50px 50px;">
						<text
							x="50" y="48"
							text-anchor="middle"
							class="fill-(--ui-text) text-[11px] font-semibold tabular-nums"
						>
							{{ centreTop }}
						</text>
						<text
							x="50" y="58"
							text-anchor="middle"
							class="fill-(--ui-text-muted) text-[6px] uppercase tracking-wider"
						>
							{{ centreSub }}
						</text>
					</g>
				</svg>

				<!-- Legend: top categories (cap at 6 + "Other" rollup so
					a long tail doesn't clutter the card). Hovering a
					row highlights its donut slice. -->
				<ul class="flex-1 min-w-0 space-y-1.5">
					<li
						v-for="(row, i) in categoryRows"
						:key="row.id"
						class="flex items-center gap-2 text-sm"
						:class="hover === null || hover === i ? '' : 'opacity-50'"
						@mouseenter="hover = i"
						@mouseleave="hover = null"
					>
						<span class="inline-flex size-5 shrink-0 rounded items-center justify-center text-white" :style="{ backgroundColor: row.color }">
							<UIcon :name="row.icon" class="size-3" />
						</span>
						<span class="flex-1 truncate">{{ row.name }}</span>
						<span class="text-xs text-(--ui-text-muted) tabular-nums w-10 text-right">
							{{ Math.round((row.amount / total) * 100) }}%
						</span>
						<!-- Compact amount (e.g. "Rs 100.3K") instead of the
							full "Rs 100,300.00" — the headline at the
							top already shows the precise total. Saves
							~60px, letting the category-name column
							breathe so the labels don't truncate at
							this card width. Full figure stays
							accessible via the title-attr tooltip. -->
						<span
							class="tabular-nums w-16 text-right shrink-0 whitespace-nowrap"
							:title="formatLKR(row.amount)"
						>
							{{ currency.symbol }} {{ compactAmount(row.amount) }}
						</span>
					</li>
				</ul>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
// Expenses by category — donut showing where the business is
// spending its money. Pulls from bills issued in the last 90 days
// (rolling), grouped by category. Bills without a category roll up
// into "Uncategorised" at the bottom, and the long tail (anything
// past the 6th category) collapses into "Other".
//
// We use the bill's `category_snapshot` (frozen at creation time) to
// label the slice, so renames/recolors don't shift older numbers.
// The icon is the same Lucide name picked when the category was
// created, and the swatch colour comes from the theme palette in
// `app/lib/theme.ts`.

	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { useBillsStore } from "~/stores/bills";

	// `showDonut` lets the dashboard collapse the SVG when the card
	// sits in a narrow slot (lg-range, before the user expands it).
	// Defaults to true so the chart still works as a standalone block
	// for any other caller.
	withDefaults(defineProps<{ showDonut?: boolean }>(), { showDonut: true });

	const billsStore = useBillsStore();
	const currency = useActiveCurrency();

	const hover = ref<number | null>(null);

	// Donut math constants. Stroke-dasharray on a circle is in user
	// units; 2πr with r=40 ≈ 251.33. We pre-compute it once.
	const CIRC = 2 * Math.PI * 40;

	// Window: last 90 days. Calendar-day boundary so the same
	// bill doesn't drift in/out as the clock ticks past midnight.
	const cutoffISO = computed(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - 90);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	});

	interface CategoryRow {
		id: string // category snapshot's name, or "__uncat" / "__other"
		name: string
		color: string // resolved hex colour for the swatch / slice
		icon: string
		amount: number
	}

	// Aggregate. We work off the bill's total (what the user spent
	// on the bill, regardless of how much is paid yet). Cancelled
	// bills don't count.
	const categoryRows = computed<CategoryRow[]>(() => {
		const map = new Map<string, CategoryRow>();
		for (const b of billsStore.bills) {
			if (b.status === "cancelled") continue;
			if (b.issue_date < cutoffISO.value) continue;
			let snap: { name: string, color: string, icon: string } | null = null;
			if (b.category_snapshot) {
				try {
					snap = JSON.parse(b.category_snapshot) as { name: string, color: string, icon: string };
				} catch { /* malformed — treat as uncategorised */ }
			}
			const key = snap?.name ?? "__uncat";
			const existing = map.get(key);
			if (existing) {
				existing.amount += b.total_cents;
			} else {
				map.set(key, {
					id: key,
					name: snap?.name ?? "Uncategorised",
					color: snap ? themeHex(snap.color) ?? "#9ca3af" : "#9ca3af",
					icon: snap?.icon ?? "i-lucide-help-circle",
					amount: b.total_cents
				});
			}
		}

		// Sort highest-spend first. Cap at 6 individually-shown
		// categories; everything past that collapses into a single
		// "Other" entry so the legend stays readable.
		const sorted = [...map.values()].sort((a, b) => b.amount - a.amount);
		if (sorted.length <= 7) return sorted;
		const top = sorted.slice(0, 6);
		const tail = sorted.slice(6);
		const other: CategoryRow = {
			id: "__other",
			name: `Other · ${tail.length} categories`,
			color: "#6b7280",
			icon: "i-lucide-more-horizontal",
			amount: tail.reduce((s, c) => s + c.amount, 0)
		};
		return [...top, other];
	});

	const total = computed(() => categoryRows.value.reduce((s, r) => s + r.amount, 0));

	const paidCount = computed(() => {
		let n = 0;
		for (const b of billsStore.bills) {
			if (b.status === "cancelled") continue;
			if (b.issue_date < cutoffISO.value) continue;
			n++;
		}
		return n;
	});

	// Pre-compute slice geometry so the template stays declarative.
	const slices = computed(() => {
		let runningOffset = 0;
		const out: { row: CategoryRow, color: string, arc: number, offset: number }[] = [];
		for (const row of categoryRows.value) {
			const share = total.value > 0 ? row.amount / total.value : 0;
			const arc = share * CIRC;
			out.push({ row, color: row.color, arc, offset: runningOffset });
			runningOffset += arc;
		}
		return out;
	});

	// Compact money for the donut hole — the headline above already
	// shows the full, precise figure, so the centre just needs a
	// short, always-fits summary (e.g. "123.5M"). A full 9-digit
	// number can't fit a circular hole at any donut size.
	const compactAmount = (cents: number): string => {
		const v = cents / 100;
		const abs = Math.abs(v);
		const trim = (n: number, suffix: string): string =>
			`${n.toFixed(1).replace(/\.0$/, "")}${suffix}`;
		if (abs >= 1e9) return trim(v / 1e9, "B");
		if (abs >= 1e6) return trim(v / 1e6, "M");
		if (abs >= 1e3) return trim(v / 1e3, "K");
		return v.toFixed(0);
	};

	// Donut centre: hovered share if any, otherwise a compact total.
	const centreTop = computed(() => {
		if (hover.value !== null && categoryRows.value[hover.value]) {
			const row = categoryRows.value[hover.value]!;
			return `${Math.round((row.amount / total.value) * 100)}%`;
		}
		return compactAmount(total.value);
	});
	const centreSub = computed(() => {
		if (hover.value !== null && categoryRows.value[hover.value]) {
			return categoryRows.value[hover.value]!.name;
		}
		return "Spend";
	});
</script>
