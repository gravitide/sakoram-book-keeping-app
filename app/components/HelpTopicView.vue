<template>
	<div class="space-y-6">
		<!-- Topic header — title + summary. Same shape in both the
			modal surface and the /help/[slug] page so the topic body
			can stay focused on the actual content. -->
		<header>
			<div class="flex items-center gap-3">
				<div class="size-10 shrink-0 rounded-md bg-(--ui-primary)/15 flex items-center justify-center">
					<UIcon :name="topic.icon" class="size-5 text-(--ui-primary)" />
				</div>
				<div>
					<h1 class="text-xl font-semibold leading-tight">
						{{ topic.title }}
					</h1>
					<p class="text-sm text-(--ui-text-muted) mt-0.5">
						{{ topic.summary }}
					</p>
				</div>
			</div>
		</header>

		<!-- The topic component itself. Loaded lazily via the registry's
			dynamic import so we only pay for content that's actually
			opened, not every topic on every route. -->
		<div v-if="loading" class="py-10 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mx-auto mb-2" />
			Loading…
		</div>
		<div v-else-if="error" class="py-10 text-center text-sm text-(--ui-error)">
			Couldn't load help topic: {{ error }}
		</div>
		<component :is="topicComponent" v-else-if="topicComponent" />

		<!-- "See also" — related topics surfaced at the bottom. Only
			rendered when the topic actually lists relatedSlugs. -->
		<section v-if="relatedTopics.length > 0" class="pt-4 border-t border-(--ui-border)">
			<h2 class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-2">
				See also
			</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
				<!-- Route object instead of string so we can preserve the
					`popout=1` query when the user is reading inside a
					popout window — without it, clicking a See-also tile
					navigates the popout to /help/<slug> with no query,
					which would drop us out of the help-window layout
					back into the full-app layout mid-window. -->
				<NuxtLink
					v-for="r in relatedTopics"
					:key="r.slug"
					:to="{ path: `/help/${r.slug}`, query: linkQuery }"
					class="block group"
				>
					<div class="border border-(--ui-border) rounded-md px-3 py-2 hover:border-(--ui-primary) transition flex items-center gap-2">
						<UIcon :name="r.icon" class="size-4 text-(--ui-primary) shrink-0" />
						<div class="min-w-0">
							<div class="text-sm font-medium truncate">
								{{ r.title }}
							</div>
							<div class="text-xs text-(--ui-text-muted) truncate">
								{{ r.summary }}
							</div>
						</div>
					</div>
				</NuxtLink>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
	import type { Component } from "vue";
	import type { HelpTopic } from "~/help";
	import { HELP_TOPICS_BY_SLUG } from "~/help";

	const props = defineProps<{
		topic: HelpTopic
	}>();

	const topicComponent = shallowRef<Component | null>(null);
	const loading = ref(true);
	const error = ref<string | null>(null);

	// Re-load whenever the topic prop changes — the modal swaps topics
	// inline (e.g. clicking a "see also" tile inside the modal), and the
	// /help/[slug] page rebuilds when the route param flips.
	watch(
		() => props.topic.slug,
		async () => {
			loading.value = true;
			error.value = null;
			topicComponent.value = null;
			try {
				const mod = await props.topic.component();
				topicComponent.value = mod.default;
			} catch (err) {
				error.value = err instanceof Error ? err.message : String(err);
			} finally {
				loading.value = false;
			}
		},
		{ immediate: true }
	);

	const relatedTopics = computed<HelpTopic[]>(() =>
		(props.topic.relatedSlugs ?? [])
			.map((slug) => HELP_TOPICS_BY_SLUG[slug])
			.filter((t): t is HelpTopic => t !== undefined)
	);

	// Preserve the `popout=1` query on See-also tile clicks so the
	// popout window stays in the help-window layout when the user
	// navigates between topics. In the main app window (or inside
	// the modal), the route has no popout query and linkQuery is
	// empty — natural same-window behaviour.
	const route = useRoute();
	const linkQuery = computed<Record<string, string>>(() =>
		route.query.popout === "1" ? { popout: "1" } : {}
	);
</script>
