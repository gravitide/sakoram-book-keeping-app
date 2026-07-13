<template>
	<span
		class="inline-block size-2 rounded-full shrink-0"
		:style="{ backgroundColor: hex }"
		aria-hidden="true"
	/>
</template>

<script setup lang="ts">
// The bank-account colour marker — a small dot rendered in front of a
// bank's identity everywhere it appears (settings list, vouchers list,
// bank pickers, reconcile) so multiple accounts are recognisable at a
// glance without reading labels. Colour names are the 8 predefined
// THEME_COLORS swatches (business_banks.color, migration 0048);
// anything unknown falls back to a neutral grey rather than themeHex's
// red default, so a missing colour never masquerades as the red bank.

	import { isValidThemeColor, themeHex } from "~/lib/theme";

	const props = defineProps<{
		color?: string | null
	}>();

	const hex = computed(() =>
		(isValidThemeColor(props.color) ? themeHex(props.color) : "#9ca3af")
	);
</script>
