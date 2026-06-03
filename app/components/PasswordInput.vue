<template>
	<UInput
		v-model="model"
		:type="show ? 'text' : 'password'"
		:placeholder="placeholder"
		:disabled="disabled"
		:autofocus="autofocus"
		@keydown.enter="emit('enter')"
	>
		<template #trailing>
			<UButton
				color="neutral"
				variant="link"
				size="sm"
				tabindex="-1"
				:icon="show ? 'i-lucide-eye-off' : 'i-lucide-eye'"
				:aria-label="show ? 'Hide password' : 'Show password'"
				:disabled="disabled"
				@click="show = !show"
			/>
		</template>
	</UInput>
</template>

<script setup lang="ts">
	defineProps<{
		placeholder?: string
		disabled?: boolean
		autofocus?: boolean
	}>();

	const emit = defineEmits<{ enter: [] }>();

	// Password text input with a show/hide eye toggle in the trailing slot.
	// Thin wrapper around UInput — v-model passes through; emits `enter` so
	// callers can submit on Return (the eye button is tabindex=-1 so it stays
	// out of the tab order between fields).

	const model = defineModel<string>({ default: "" });

	const show = ref(false);
</script>
