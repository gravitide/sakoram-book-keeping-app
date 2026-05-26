<template>
	<!-- scroll-mt-6 keeps the section header off the very top edge
		when scrolled to via an anchor click from the TOC. -->
	<section :id="sectionId" class="space-y-3 scroll-mt-6">
		<div class="flex items-center gap-2">
			<UIcon v-if="icon" :name="icon" class="size-4 text-(--ui-primary)" />
			<h2 class="text-base font-semibold tracking-tight">
				{{ title }}
			</h2>
		</div>
		<div class="text-sm leading-relaxed space-y-3 text-(--ui-text)">
			<slot />
		</div>
	</section>
</template>

<script setup lang="ts">
// Help-topic section header. One per major part of a topic (What is
// it? / When do you use it? / How to use in Sakoram / etc). Topic
// components compose multiple of these — see app/help/topics/.
//
// When rendered inside /help/[slug] (which provides HelpTocKey), the
// section auto-registers with the TOC so the left-rail nav can
// build itself. The modal surface doesn't provide the context — the
// inject returns null and registration is silently skipped.

	import { HelpTocKey, slugifyTitle } from "~/help/toc";

	// title  — section heading text rendered in the H2 + used to
	//          derive the default anchor id.
	// icon   — optional Lucide name shown left of the title at
	//          primary tone (e.g. i-lucide-info).
	// id     — explicit anchor id. Auto-derived via slugifyTitle
	//          when omitted, so "What is it?" becomes "what-is-it".
	const props = defineProps<{
		title: string
		icon?: string
		id?: string
	}>();

	const sectionId = computed(() => props.id ?? slugifyTitle(props.title));

	// Register with the page-level TOC, if one's been provided. Null
	// in the modal surface — that's fine, registration just no-ops.
	const toc = inject(HelpTocKey, null);
	onMounted(() => {
		toc?.register({ id: sectionId.value, title: props.title, icon: props.icon });
	});
	onBeforeUnmount(() => {
		toc?.unregister(sectionId.value);
	});
</script>
