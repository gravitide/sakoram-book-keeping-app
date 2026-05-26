<template>
	<div v-if="topic" class="select-text">
		<!-- Same top-toolbar pattern the reports / detail pages use:
			back link on the left, no right cluster. Help pages are
			read-only content — no actions to surface. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/help" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				All help topics
			</NuxtLink>
		</div>

		<!-- max-w-3xl: long-form prose reads better at ~65-75ch.
			Wider lines tax the eye on a desktop monitor. -->
		<article class="max-w-3xl">
			<HelpTopicView :topic="topic" />
		</article>
	</div>
	<div v-else class="select-none py-12 text-center text-sm text-(--ui-text-muted)">
		<UIcon name="i-lucide-circle-help" class="size-10 mx-auto mb-2 opacity-50" />
		<div class="font-medium mb-1">
			Help topic not found
		</div>
		<div class="mb-4">
			"{{ slug }}" isn't a registered topic.
		</div>
		<NuxtLink to="/help" class="text-(--ui-primary) hover:underline text-sm">
			Browse all topics
		</NuxtLink>
	</div>
</template>

<script setup lang="ts">
// Per-topic full-page reading view. Same content as the HelpModal
// shows but in a wider, addressable, bookmarkable surface — the
// shape for "read carefully", vs the modal's "quick reference".
//
// select-text on the root so the user can copy snippets out of the
// help (in contrast to most app surfaces which set select-none).
// Reference docs that you can't copy from are annoying.

	import { HELP_TOPICS_BY_SLUG } from "~/help";

	const route = useRoute();
	const slug = computed(() => String(route.params.slug ?? ""));

	const topic = computed(() => HELP_TOPICS_BY_SLUG[slug.value]);

	definePageMeta({ title: "Help" });

	// Update document title with the topic name once resolved so window
	// title + breadcrumb-y experiences stay in sync.
	watchEffect(() => {
		if (topic.value) {
			useHead({ title: `Help — ${topic.value.title}` });
		}
	});
</script>
