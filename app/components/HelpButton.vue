<template>
	<template v-if="topic">
		<UButton
			:size="size"
			color="neutral"
			variant="ghost"
			icon="i-lucide-circle-help"
			:title="`Help: ${topic.title}`"
			:aria-label="`Help: ${topic.title}`"
			@click="open"
		/>
		<HelpModal v-model:open="modalOpen" :topic="topic" />
	</template>
</template>

<script setup lang="ts">
// The "?" icon button that drops into any page header. Clicking it
// opens HelpModal with the matching topic. If the slug doesn't
// resolve to a registered topic (typo / topic not written yet) the
// button renders nothing — graceful degrade so an in-progress page
// stub doesn't crash production.

	import type { HelpTopic } from "~/help";
	import { HELP_TOPICS_BY_SLUG } from "~/help";

	const props = withDefaults(defineProps<{
		/// Topic slug, e.g. "credit-notes". Must match a registered topic
		/// in `app/help/index.ts`. Renders nothing if missing.
		slug: string
		size?: "xs" | "sm" | "md"
	}>(), {
		size: "sm"
	});

	const topic = computed<HelpTopic | undefined>(() => HELP_TOPICS_BY_SLUG[props.slug]);

	const modalOpen = ref(false);
	const open = () => {
		modalOpen.value = true;
	};
</script>
