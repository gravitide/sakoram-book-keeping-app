<template>
	<UCard>
		<template #header>
			<div class="flex items-start gap-3">
				<div class="size-9 rounded-lg bg-(--ui-primary)/10 text-(--ui-primary) flex items-center justify-center shrink-0">
					<UIcon :name="icon" class="size-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="font-medium leading-tight flex items-center gap-1">
						{{ title }}
						<!-- Optional inline extra beside the title — e.g. a HelpButton. -->
						<slot name="title-extra" />
					</div>
					<div v-if="subtitle" class="text-xs text-(--ui-text-muted) mt-0.5">
						{{ subtitle }}
					</div>
				</div>
			</div>
		</template>
		<div class="space-y-4">
			<slot />
		</div>
	</UCard>
</template>

<script setup lang="ts">
	defineProps<{
		icon: string
		title: string
		subtitle?: string
	}>();
</script>
