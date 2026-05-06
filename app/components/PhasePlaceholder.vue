<template>
	<div>
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				{{ title }}
			</h1>
		</header>
		<UCard>
			<div class="text-sm text-(--ui-text-muted)">
				This screen ships in <span class="font-medium text-(--ui-text)">{{ phase }}</span>.
			</div>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	defineProps<{
		title: string
		phase: string
	}>();
</script>
