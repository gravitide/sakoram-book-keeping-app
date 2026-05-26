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
// quick-reference shape, not the "read for 5 minutes" shape. The
// "Open full guide" link in the footer escalates to /help/[slug]
// which is the proper reading surface (wider layout, no modal
// scroll constraint, addressable URL the user can bookmark).
//
// Phase 3 (future): the Open full guide link can also be wired to
// spawn a separate Tauri WebviewWindow so the help opens as an
// independent OS window the user can park on a second monitor.

	import type { HelpTopic } from "~/help";

	defineProps<{
		topic: HelpTopic
	}>();

	const openModel = defineModel<boolean>("open", { default: false });
</script>
