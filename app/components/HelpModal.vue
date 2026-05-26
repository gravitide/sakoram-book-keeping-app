<template>
	<UModal v-model:open="openModel" :ui="{ content: 'max-w-3xl' }" :title="topic.title">
		<template #body>
			<!-- Cap the body so very long topics scroll inside the
				modal rather than pushing the modal off-screen. The
				docs window is the right surface for serious reading
				— this modal is the quick-reference. -->
			<div class="max-h-[70vh] overflow-y-auto pr-1">
				<HelpTopicView :topic="topic" />
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end items-center gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="openModel = false">
					Close
				</UButton>
				<UButton
					color="primary"
					icon="i-lucide-external-link"
					trailing
					@click="openInWindow"
				>
					Open in docs window
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Contextual help modal. Surface for the per-page `?` button —
// quick-reference shape, not the "read for 5 minutes" shape.
//
// The escalation path is "Open in docs window" which spawns (or
// focuses) the separate Tauri WebviewWindow at the requested
// topic. There is no in-app help reader any more — the docs live
// exclusively in the popped-out window. See useHelpWindow.

	import type { HelpTopic } from "~/help";
	import { useHelpWindow } from "~/composables/useHelpWindow";

	const props = defineProps<{
		topic: HelpTopic
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const { openHelpWindow } = useHelpWindow();

	const openInWindow = async () => {
		await openHelpWindow({ slug: props.topic.slug });
		openModel.value = false;
	};
</script>
