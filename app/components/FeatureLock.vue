<template>
	<div class="rounded-lg border border-(--ui-primary)/30 bg-(--ui-primary)/5 p-4 flex items-start gap-3 mb-4">
		<UIcon name="i-lucide-lock" class="size-5 text-(--ui-primary) mt-0.5 shrink-0" />
		<div class="min-w-0 flex-1">
			<div class="font-medium">
				{{ title }} is a {{ tierLabel }} feature
			</div>
			<p class="text-sm text-(--ui-text-muted) mt-0.5">
				<slot>Upgrade to unlock it. Anything you created during your trial stays viewable below.</slot>
			</p>
		</div>
		<UpgradeButton :feature="feature" label="See plans" />
	</div>
</template>

<script setup lang="ts">
	defineProps<{ title: string, tierLabel: string, feature: string }>();
</script>
