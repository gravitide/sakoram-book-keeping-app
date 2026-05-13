<template>
	<UBadge :color="color" variant="subtle" :size="size">
		{{ label }}
	</UBadge>
</template>

<script setup lang="ts">
// Renders a coloured badge for any document status. Colour map below.

	interface Props {
		status: string
		size?: "sm" | "md"
	}
	const props = withDefaults(defineProps<Props>(), { size: "sm" });

	// All semantic colors — deliberately no `primary` here. The badge
	// meaning shouldn't shift just because the user changed their
	// accent in Settings → Appearance.
	type BadgeColor = "neutral" | "info" | "success" | "warning" | "error";

	const STATUS_COLOR: Record<string, BadgeColor> = {
		// quotes
		draft: "neutral",
		sent: "info",
		accepted: "success",
		rejected: "error",
		expired: "warning",
		converted: "success",
		// invoices add: partial, paid, overdue, cancelled
		partial: "warning",
		paid: "success",
		overdue: "error",
		cancelled: "neutral",
		// bills add: unpaid
		unpaid: "warning"
	};

	const color = computed<BadgeColor>(() => STATUS_COLOR[props.status] ?? "neutral");
	const label = computed(() => props.status.charAt(0).toUpperCase() + props.status.slice(1));
</script>
