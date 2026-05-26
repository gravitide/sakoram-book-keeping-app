<template>
	<!-- Help-topic sidebar — shown inside the docs WebviewWindow.
		Mirrors the visual language of the main app sidebar
		(layouts/default.vue): same floating-card chrome, same link
		styles, same uppercase footer wordmark. Topics are grouped
		by category with the currently-active one highlighted using
		the same primary tint the main sidebar uses for the active
		route. -->
	<aside class="app-chrome w-60 shrink-0 m-2 mt-0 rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-md shadow-black/10 flex flex-col overflow-hidden">
		<!-- Top header — mirrors the business-switcher's shape on the
			main sidebar (icon tile + two-line label) so the eye reads
			it as "the same kind of surface, different window." Not a
			menu trigger here; it's a link back to the /help index. -->
		<NuxtLink
			to="/help"
			class="w-full px-4 py-3 border-b border-(--ui-border) flex items-center gap-2 min-w-0 hover:bg-(--ui-bg-accented) transition text-left"
			:class="isOnIndex ? 'bg-(--ui-primary)/8' : ''"
		>
			<div class="size-9 shrink-0 rounded-md bg-(--ui-primary)/15 flex items-center justify-center">
				<UIcon name="i-lucide-book-open" class="size-5 text-(--ui-primary)" />
			</div>
			<div class="leading-tight min-w-0 flex-1">
				<div class="font-semibold text-sm truncate" :class="isOnIndex ? 'text-(--ui-primary)' : ''">
					Help &amp; Guides
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					All topics
				</div>
			</div>
		</NuxtLink>

		<nav class="flex-1 p-2 space-y-1 overflow-y-auto">
			<!-- Each category renders as a divider + small uppercase
				label + topic list. Matches the divider-led grouping
				on the main sidebar but adds a label here because the
				help library has too many items to identify by
				position alone. -->
			<template v-for="(group, i) in grouped" :key="group.category">
				<div
					v-if="i > 0"
					class="my-2 border-t border-(--ui-border)"
					aria-hidden="true"
				/>
				<div class="flex items-center gap-2 px-3 pt-1 pb-1 text-[11px] uppercase tracking-wider text-(--ui-text-muted) font-semibold">
					<UIcon :name="group.icon" class="size-3" />
					{{ group.label }}
				</div>
				<NuxtLink
					v-for="t in group.topics"
					:key="t.slug"
					:to="`/help/${t.slug}`"
					class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
					:class="t.slug === activeSlug ? '!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium' : ''"
				>
					<UIcon :name="t.icon" class="size-3.5 shrink-0" />
					<span class="truncate">{{ t.title }}</span>
				</NuxtLink>
			</template>
		</nav>

		<!-- Footer — same wordmark + version readout as the main app
			sidebar so the docs window feels like a continuation of
			the same product. -->
		<div class="px-4 py-3 border-t border-(--ui-border) flex items-center justify-between gap-2">
			<img
				:src="sakoramLogo"
				alt="Sakoram"
				:title="`Sakoram - The desktop bookkeeper! · v${appVersion}`"
				class="h-5 w-auto select-none dark:invert dark:hue-rotate-180"
				draggable="false"
			>
			<span class="text-xs text-(--ui-text-muted) tabular-nums">
				v{{ appVersion }}
			</span>
		</div>
	</aside>
</template>

<script setup lang="ts">
// Help topics sidebar shown inside the popout WebviewWindow.
//
// Rendered by layouts/help-window.vue — the layout the docs window
// uses for all /help routes. Lets the user navigate between topics
// like a real docs site. Designed to mirror the main app's sidebar
// chrome so the docs window doesn't feel like a different product.

	import pkg from "~~/package.json";
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { groupedByCategory } from "~/help";

	const route = useRoute();
	const appVersion = pkg.version;

	// route.params.slug works on /help/[slug] but is undefined on
	// /help — coerce to a string so the comparison is straightforward.
	const activeSlug = computed<string>(() => {
		const raw = route.params.slug;
		return typeof raw === "string" ? raw : "";
	});

	// Highlight the header link when the user is on the /help index.
	const isOnIndex = computed(() => route.path === "/help");

	const grouped = computed(() => groupedByCategory());
</script>
