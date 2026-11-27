<template>
	<!-- One sheet of the business's paper, to scale: the Stationery's
		artwork or reserved bands, the Safe area, grey stand-ins for the
		content and (optionally) the printer band. White in both themes: it
		previews the paper. Every position comes from stationery-geometry; the
		default slot draws on top in the same px space (the editor's guides). -->
	<div
		class="relative bg-white overflow-hidden select-none"
		:style="{ width: `${px(paperInfo.widthMm)}px`, height: `${px(paperInfo.heightMm)}px` }"
	>
		<!-- Pre-printed paper: everything outside the Safe area is the
			paper's own print, left blank by the PDF. -->
		<div v-if="mode === 'preprinted'" class="absolute inset-0 stationery-preprinted" />

		<template v-if="mode === 'background'">
			<img
				v-if="artworkUrl"
				:src="artworkUrl"
				alt=""
				class="absolute inset-0 w-full h-full object-cover"
				draggable="false"
			>
			<div
				v-else
				class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 text-center px-2"
			>
				<UIcon :name="artworkExt === 'pdf' ? 'i-lucide-file-text' : 'i-lucide-image-off'" class="size-6" />
				<span v-if="!compact" class="text-[11px]">
					{{ artworkExt === "pdf" ? "PDF background (first page)" : "No background uploaded yet" }}
				</span>
			</div>
		</template>

		<!-- Header & footer images, each at its own place on the page. -->
		<template v-if="mode === 'header_footer'">
			<template v-for="slot in HEADER_FOOTER_SLOTS" :key="slot">
				<div
					v-if="images?.[slot]"
					class="absolute overflow-hidden"
					:style="box(images[slot]!.rect)"
				>
					<img
						v-if="images[slot]!.url"
						:src="images[slot]!.url!"
						alt=""
						class="w-full h-full object-contain"
						draggable="false"
					>
					<div v-else class="w-full h-full flex items-center justify-center bg-zinc-200 text-zinc-500">
						<UIcon :name="images[slot]!.ext === 'pdf' ? 'i-lucide-file-text' : 'i-lucide-image'" class="size-4" />
					</div>
				</div>
			</template>
		</template>

		<!-- Safe area: white over pre-printed bands, dashed everywhere. -->
		<div
			class="absolute border border-dashed border-(--ui-primary)"
			:class="mode === 'preprinted' ? 'bg-white' : ''"
			:style="box(safe)"
		/>

		<div
			v-for="(bar, i) in bars"
			:key="i"
			class="absolute rounded-[1px] bg-zinc-400/45"
			:style="box(bar)"
		/>

		<template v-if="printerBand">
			<div
				v-for="(band, i) in printerBands"
				:key="`band-${i}`"
				class="absolute stationery-printer-band pointer-events-none"
				:style="box(band)"
			/>
		</template>

		<slot />
	</div>
</template>

<script setup lang="ts">
	// The to-scale sheet behind the Stationery thumbnail and the Stationery
	// editor. Geometry (Safe area, placeholder bars, printer band, Built-in
	// Layout margins) comes from app/lib/stationery-geometry.ts; this only
	// positions what it returns.
	import type { PaperSize } from "~/lib/page-settings";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import type { BackgroundExt, HeaderFooterSlot, StationeryMarginsMm, StationeryMode } from "~/lib/stationery";
	import type { MmRect, PageImageView } from "~/lib/stationery-geometry";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { HEADER_FOOTER_SLOTS } from "~/lib/stationery";
	import { mmToPx, placeholderBars, printerBandRects, rectToPx, safeAreaMargins, safeAreaRect } from "~/lib/stationery-geometry";

	const props = withDefaults(defineProps<{
		paper: PaperSize
		mode: StationeryMode
		/** Built-in only: whose margins frame the content. */
		layout: PdfLayoutKey
		/**
		 * The Stationery's margins (Full-page background / Header & footer
		 * images — already pushed out of the images — / Pre-printed paper).
		 * Ignored under Built-in.
		 */
		margins: StationeryMarginsMm
		/** CSS px per mm. */
		scale: number
		artworkUrl?: string | null
		artworkExt?: BackgroundExt | null
		printerBand?: boolean
		/** Thumbnail size: no captions. */
		compact?: boolean
		/** Header & footer images: where each sits and what to show in it. */
		images?: Partial<Record<HeaderFooterSlot, PageImageView | null>> | null
	}>(), { artworkUrl: null, artworkExt: null, printerBand: false, compact: false, images: null });

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const px = (mm: number) => mmToPx(mm, props.scale);
	const effectiveMargins = computed(() => safeAreaMargins(props.mode, props.layout, paperInfo.value, props.margins));
	const safe = computed(() => safeAreaRect(paperInfo.value, effectiveMargins.value));
	const bars = computed(() => placeholderBars(safe.value));
	const printerBands = computed(() => printerBandRects(paperInfo.value));

	const box = (rect: MmRect) => {
		const r = rectToPx(rect, props.scale);
		return { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` };
	};
</script>

<style scoped>
	.stationery-preprinted {
		background: repeating-linear-gradient(135deg, #f4f4f5 0 6px, #e4e4e7 6px 7px);
	}

	.stationery-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.16) 0 3px, transparent 3px 7px);
	}
</style>
