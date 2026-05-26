<template>
	<!-- Help-topic sidebar — surfaced inside the popout window so the
		user can switch between topics without back-tracking through
		the /help index. Topics are grouped by category with the
		currently-active one highlighted. -->
	<aside class="app-chrome w-56 shrink-0 border-r border-(--ui-border) bg-(--ui-bg) overflow-y-auto">
		<!-- "All topics" header link — same target as the /help/[slug]
			page's back link, just always visible. -->
		<NuxtLink
			to="/help"
			class="block px-4 py-3 border-b border-(--ui-border) text-sm font-medium hover:bg-(--ui-bg-elevated) transition flex items-center gap-2"
			:class="isOnIndex ? 'text-(--ui-primary) bg-(--ui-primary)/8' : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
		>
			<UIcon name="i-lucide-book-open" class="size-4" />
			All help topics
		</NuxtLink>

		<nav class="p-2">
			<!-- Each group after the first gets a top divider + extra
				breathing room so the category headers don't blur into
				the previous group's last topic link. The header
				itself is now bolder + uppercase + wider tracking so
				it reads as a label, not just "another item." -->
			<div
				v-for="(group, i) in grouped"
				:key="group.category"
				:class="i > 0 ? 'mt-4 pt-4 border-t border-(--ui-border)' : ''"
			>
				<div class="flex items-center gap-2 px-2 mb-1.5 text-[11px] uppercase tracking-wider text-(--ui-text-muted) font-semibold">
					<UIcon :name="group.icon" class="size-3" />
					{{ group.label }}
				</div>
				<div class="space-y-0.5">
					<NuxtLink
						v-for="t in group.topics"
						:key="t.slug"
						:to="`/help/${t.slug}`"
						class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition"
						:class="t.slug === activeSlug
							? 'bg-(--ui-primary)/10 text-(--ui-primary) font-medium'
							: 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)'"
					>
						<UIcon
							:name="t.icon"
							class="size-3.5 shrink-0"
							:class="t.slug === activeSlug ? 'text-(--ui-primary)' : 'text-(--ui-text-muted)/70'"
						/>
						<span class="truncate">{{ t.title }}</span>
					</NuxtLink>
				</div>
			</div>
		</nav>
	</aside>
</template>

<script setup lang="ts">
// Help topics sidebar shown inside the popout WebviewWindow.
//
// Rendered by layouts/help-window.vue — the layout the docs window
// uses for all /help routes. Lets the user navigate between topics
// like a real docs site. The main-app default layout has its own
// sidebar (the app's nav), so this component is scoped to the
// help-window layout only.

	import { groupedByCategory } from "~/help";

	const route = useRoute();

	// route.params.slug works on /help/[slug] but is undefined on
	// /help — coerce to a string so the comparison is straightforward.
	const activeSlug = computed<string>(() => {
		const raw = route.params.slug;
		return typeof raw === "string" ? raw : "";
	});

	// Highlight the "All help topics" header link when sitting on /help.
	const isOnIndex = computed(() => route.path === "/help");

	const grouped = computed(() => groupedByCategory());
</script>
