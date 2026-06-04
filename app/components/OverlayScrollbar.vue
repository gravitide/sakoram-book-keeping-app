<template>
	<div
		ref="rootEl"
		class="relative overflow-hidden"
		@pointerenter="hovering = true"
		@pointerleave="hovering = false"
	>
		<div
			ref="viewportEl"
			class="overlay-scroll-viewport h-full w-full overflow-y-auto"
			@scroll="onScroll"
		>
			<slot />
		</div>
		<!-- Custom thumb: floats over the content's right edge, so it reserves
			zero layout width (unlike a native Chromium scrollbar). Fades in on
			hover / while scrolling / while dragging. -->
		<div
			v-show="hasOverflow"
			class="overlay-scroll-thumb"
			:class="{ 'overlay-scroll-thumb--active': thumbActive }"
			:style="{ height: `${thumbHeight}px`, transform: `translateY(${thumbTop}px)` }"
			@pointerdown="onThumbDown"
		/>
	</div>
</template>

<script setup lang="ts">
	import { useEventListener, useResizeObserver } from "@vueuse/core";

	// Overlay scrollbar for the Tauri (Chromium) webview. The native
	// `::-webkit-scrollbar` always reserves layout width, so content jumps
	// left when the bar appears. We hide the native bar entirely (zero
	// reserved width) and paint our own thin thumb absolutely positioned over
	// the content's right edge. Vertical-only — all the app needs today.

	const MIN_THUMB = 28;
	const SCROLL_FLASH_MS = 700;

	const rootEl = ref<HTMLElement | null>(null);
	const viewportEl = ref<HTMLElement | null>(null);

	const hovering = ref(false);
	const dragging = ref(false);
	const scrolling = ref(false);
	const hasOverflow = ref(false);
	const thumbHeight = ref(0);
	const thumbTop = ref(0);

	const thumbActive = computed(() => hovering.value || dragging.value || scrolling.value);

	let scrollFlashTimer: ReturnType<typeof setTimeout> | undefined;

	function recompute(): void {
		const vp = viewportEl.value;
		if (!vp) return;
		const { scrollHeight, clientHeight, scrollTop } = vp;
		if (scrollHeight <= clientHeight + 1) {
			hasOverflow.value = false;
			return;
		}
		hasOverflow.value = true;
		const trackH = clientHeight;
		const h = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * trackH);
		thumbHeight.value = h;
		const maxScroll = scrollHeight - clientHeight;
		const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
		thumbTop.value = ratio * (trackH - h);
	}

	function onScroll(): void {
		recompute();
		scrolling.value = true;
		if (scrollFlashTimer) clearTimeout(scrollFlashTimer);
		scrollFlashTimer = setTimeout(() => {
			scrolling.value = false;
		}, SCROLL_FLASH_MS);
	}

	// Drag the thumb to scroll the viewport.
	let dragStartY = 0;
	let dragStartScroll = 0;

	function onThumbDown(e: PointerEvent): void {
		const vp = viewportEl.value;
		if (!vp) return;
		e.preventDefault();
		dragging.value = true;
		dragStartY = e.clientY;
		dragStartScroll = vp.scrollTop;
	}

	function onThumbMove(e: PointerEvent): void {
		if (!dragging.value) return;
		const vp = viewportEl.value;
		if (!vp) return;
		const trackH = vp.clientHeight;
		const travel = trackH - thumbHeight.value;
		if (travel <= 0) return;
		const scrollPerPx = (vp.scrollHeight - vp.clientHeight) / travel;
		vp.scrollTop = dragStartScroll + (e.clientY - dragStartY) * scrollPerPx;
	}

	function onThumbUp(): void {
		dragging.value = false;
	}

	// Content height changes (e.g. collapsing a nav group) don't resize the
	// viewport itself, so observe the slotted content child too.
	const contentEl = computed(() => viewportEl.value?.firstElementChild as HTMLElement | null);

	onMounted(() => {
		nextTick(recompute);
	});
	useResizeObserver(viewportEl, recompute);
	useResizeObserver(contentEl, recompute);
	useEventListener(window, "resize", recompute);
	useEventListener(window, "pointermove", onThumbMove);
	useEventListener(window, "pointerup", onThumbUp);

	defineExpose({ recompute });
</script>

<style scoped>
	/* Hide the native scrollbar entirely so it reserves no layout width. */
	.overlay-scroll-viewport {
		scrollbar-width: none;
	}
	.overlay-scroll-viewport::-webkit-scrollbar {
		width: 0;
		height: 0;
		display: none;
	}

	.overlay-scroll-thumb {
		position: absolute;
		top: 0;
		right: 2px;
		width: 6px;
		border-radius: 9999px;
		background: color-mix(in oklab, currentColor 30%, transparent);
		opacity: 0;
		transition: opacity 0.15s ease;
		will-change: transform;
	}
	.overlay-scroll-thumb:hover {
		background: color-mix(in oklab, currentColor 45%, transparent);
	}
	.overlay-scroll-thumb--active {
		opacity: 1;
	}
</style>
