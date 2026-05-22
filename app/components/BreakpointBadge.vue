<template>
	<!-- Dev-only floating badge that shows the active Tailwind
		breakpoint + the live viewport width. Useful for designing
		responsive layouts ("at 1200px we're in lg…"). The
		breakpoint label is driven entirely by CSS — each span is
		visible only at its matching breakpoint via `hidden / inline`
		utility chains — so the label is always in sync with whatever
		Tailwind would actually be applying. The width readout uses
		VueUse's `useWindowSize` so it updates live as you drag the
		window. Renders only in dev (gated by `import.meta.dev`); the
		production build excludes the whole component. -->
	<div
		v-if="dev"
		class="fixed bottom-3 right-3 z-50 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-(--ui-bg-elevated) border-2 border-(--ui-primary)/40 shadow-lg text-xs font-medium tabular-nums select-none pointer-events-none"
	>
		<span class="text-(--ui-primary)">
			<span class="sm:hidden">XS</span>
			<span class="hidden sm:inline md:hidden">SM</span>
			<span class="hidden md:inline lg:hidden">MD</span>
			<span class="hidden lg:inline xl:hidden">LG</span>
			<span class="hidden xl:inline 2xl:hidden">XL</span>
			<span class="hidden 2xl:inline">2XL</span>
		</span>
		<span class="text-(--ui-text-muted)">{{ width }}px</span>
	</div>
</template>

<script setup lang="ts">
	import { useWindowSize } from "@vueuse/core";

	// `import.meta.dev` is true under `nuxt dev` and `bun run tauri:dev`,
	// false in the static production build — so the badge auto-disappears
	// from any installer-built artefact without us having to flag it.
	const dev = import.meta.dev;

	const { width } = useWindowSize();
</script>
