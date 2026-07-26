<template>
	<svg
		viewBox="0 0 56 79"
		class="w-full h-auto block"
		preserveAspectRatio="xMidYMid meet"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		:aria-label="`${templateKey} layout preview`"
	>
		<!-- paper -->
		<rect x="0.5" y="0.5" width="55" height="78" rx="2.5" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.75" />
		<rect
			v-for="(r, i) in marks"
			:key="i"
			:x="r.x"
			:y="r.y"
			:width="r.w"
			:height="r.h"
			:rx="r.rx ?? 0.6"
			:fill="r.fill"
			:opacity="r.opacity ?? 1"
		/>
	</svg>
</template>

<script setup lang="ts">
	// A tiny schematic A4 mockup of each client-facing PDF layout, used in the
	// Settings template pickers. It conveys *where things sit* (header band,
	// centred title, blank top, density) rather than being a pixel render — the
	// "Preview" button shows the real Typst PDF. Uses the live theme colour so
	// the accent matches the user's branding. No image assets, no drift.

	interface Rect { x: number, y: number, w: number, h: number, rx?: number, fill: string, opacity?: number }

	const props = withDefaults(defineProps<{
		templateKey: string
		/** Theme accent colour (hex). */
		color?: string
	}>(), {
		color: "#16a34a"
	});

	const MARK = "#cbd5e1"; // slate-300 — stand-in for text / table rows
	const HEAD = "#eef2f7"; // light table-header fill

	// Party block (left) + meta (right) + table + total, anchored at `y`.
	function body(y: number): Rect[] {
		return [
			{ x: 6, y, w: 15, h: 2, fill: MARK },
			{ x: 6, y: y + 3.2, w: 20, h: 2, fill: MARK },
			{ x: 38, y, w: 12, h: 2, fill: MARK },
			{ x: 42, y: y + 3.2, w: 8, h: 2, fill: MARK },
			{ x: 6, y: y + 10, w: 44, h: 3, rx: 0.4, fill: HEAD },
			{ x: 6, y: y + 14.5, w: 44, h: 1.8, fill: MARK },
			{ x: 6, y: y + 18, w: 44, h: 1.8, fill: MARK },
			{ x: 6, y: y + 21.5, w: 44, h: 1.8, fill: MARK },
			{ x: 34, y: y + 27, w: 16, h: 3.2, rx: 0.5, fill: props.color, opacity: 0.5 }
		];
	}

	const marks = computed<Rect[]>(() => {
		const c = props.color;
		switch (props.templateKey) {
		case "modern":
			// Left-aligned letterhead: logo and header text SIDE BY SIDE, the
			// text vertically centred on the logo, then the tapered accent rule
			// (one long bar + three shortening dashes). Segment widths mirror
			// the 76/7/5/3 fr split in common.typ's tapered-rule so the thumb
			// matches what actually prints.
			return [
				{ x: 6, y: 6, w: 11, h: 5.5, fill: MARK },
				{ x: 20, y: 6, w: 14, h: 1.4, fill: MARK },
				{ x: 20, y: 8.1, w: 18, h: 1.4, fill: MARK },
				{ x: 20, y: 10.2, w: 16, h: 1.4, fill: MARK },
				{ x: 6, y: 15, w: 34.5, h: 1.3, rx: 0, fill: c },
				{ x: 41.4, y: 15, w: 3.2, h: 1.3, rx: 0, fill: c },
				{ x: 45.5, y: 15, w: 2.3, h: 1.3, rx: 0, fill: c },
				{ x: 48.7, y: 15, w: 1.4, h: 1.3, rx: 0, fill: c },
				...body(21)
			];
		case "minimal":
			return [
				// no rules: light wordmark left, small title right, airy
				{ x: 6, y: 8, w: 16, h: 2.4, fill: MARK },
				{ x: 38, y: 8, w: 12, h: 2.4, fill: MARK },
				...body(30)
			];
		case "compact": {
			// dense: small logo, thin rule, centred title, many tight rows
			const rows: Rect[] = [];
			for (let i = 0; i < 7; i++) rows.push({ x: 6, y: 36 + i * 3, w: 44, h: 1.5, fill: MARK });
			return [
				{ x: 40, y: 5, w: 10, h: 4.5, fill: MARK },
				{ x: 6, y: 12, w: 44, h: 1.3, fill: c },
				{ x: 22, y: 15.5, w: 12, h: 2.4, fill: MARK },
				{ x: 6, y: 21, w: 14, h: 1.6, fill: MARK },
				{ x: 6, y: 24, w: 18, h: 1.6, fill: MARK },
				{ x: 38, y: 21, w: 12, h: 1.6, fill: MARK },
				{ x: 6, y: 32, w: 44, h: 2.4, rx: 0.4, fill: HEAD },
				...rows,
				{ x: 34, y: 60, w: 16, h: 2.6, rx: 0.5, fill: c, opacity: 0.5 }
			];
		}
		case "letterhead":
			return [
				// blank top ~third (pre-printed letterhead), then centred title + rule
				{ x: 18, y: 30, w: 20, h: 3.2, fill: MARK },
				{ x: 6, y: 35, w: 44, h: 1.5, fill: c },
				...body(40)
			];
		default: // classic
			return [
				{ x: 39, y: 6, w: 11, h: 5.5, fill: MARK },
				{ x: 6, y: 15, w: 44, h: 1.5, fill: c },
				{ x: 20, y: 19.5, w: 16, h: 3, fill: MARK },
				...body(27)
			];
		}
	});
</script>
