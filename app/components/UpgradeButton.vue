<template>
	<UButton
		:to="`/upgrade${feature ? `?feature=${feature}` : ''}`"
		size="xs"
		color="primary"
		variant="soft"
		icon="i-lucide-sparkles"
		class="shrink-0"
	>
		{{ label ?? "Upgrade" }}
	</UButton>
</template>

<script setup lang="ts">
	defineProps<{ feature?: string, label?: string }>();
</script>
