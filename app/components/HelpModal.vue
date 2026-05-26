<template>
	<UModal v-model:open="openModel" :ui="{ content: 'max-w-3xl' }" :title="topic.title">
		<template #body>
			<!-- Cap the body so very long topics scroll inside the
				modal rather than pushing the modal off-screen. The
				/help/[slug] page is the right surface for serious
				reading — this modal is the quick-reference. -->
			<div class="max-h-[70vh] overflow-y-auto pr-1">
				<HelpTopicView :topic="topic" />
			</div>
		</template>
		<template #footer>
			<div class="flex justify-between items-center gap-2 w-full">
				<NuxtLink :to="`/help/${topic.slug}`" class="text-xs text-(--ui-text-muted) hover:text-(--ui-text)">
					Tip: bookmark <span class="font-mono">/help</span> for the full library.
				</NuxtLink>
				<div class="flex gap-2">
					<UButton color="neutral" variant="outline" @click="openModel = false">
						Close
					</UButton>
					<!-- Pop-out: spawns a separate Tauri WebviewWindow so
						the user can park the docs on a second monitor.
						Outside Tauri (dev mode) it falls through to a
						same-window navigation, so the button stays
						useful in every environment. -->
					<UButton
						v-if="isTauri"
						color="neutral"
						variant="outline"
						icon="i-lucide-picture-in-picture"
						@click="popOut"
					>
						Pop out
					</UButton>
					<NuxtLink :to="`/help/${topic.slug}`" @click="openModel = false">
						<UButton color="primary" icon="i-lucide-external-link" trailing>
							Open full guide
						</UButton>
					</NuxtLink>
				</div>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Contextual help modal. Surface for the per-page `?` button —
// quick-reference shape, not the "read for 5 minutes" shape.
//
// Two escalation paths in the footer:
//   - "Open full guide" — in-app nav to /help/[slug]. Same window;
//     user leaves their current task.
//   - "Pop out" — spawns a separate Tauri WebviewWindow with the
//     same content. Current task stays intact in the main window;
//     the docs can park on a second monitor. Only renders when the
//     Tauri runtime is available — in dev mode (bun run dev outside
//     the shell) the button hides, since there's no way to spawn an
//     actual OS window without Tauri.

	import type { HelpTopic } from "~/help";
	import { useHelpWindow } from "~/composables/useHelpWindow";

	const props = defineProps<{
		topic: HelpTopic
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const { openHelpWindow, isTauri } = useHelpWindow();

	const popOut = async () => {
		await openHelpWindow({ slug: props.topic.slug });
		openModel.value = false;
	};
</script>
