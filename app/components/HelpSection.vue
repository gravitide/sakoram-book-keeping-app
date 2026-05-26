<template>
	<section class="space-y-3">
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

	defineProps<{
		title: string
		/// Optional Lucide icon name (e.g. "i-lucide-receipt"). Renders
		/// left of the title at primary tone. Skip for plain headings.
		icon?: string
	}>();
</script>
