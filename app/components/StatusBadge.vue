<template>
	<!-- min-w-24 + justify-center holds every status badge at a uniform
		width — picks up the longest label we'd render ("Cancelled" /
		"Converted") with comfortable side padding, so the column reads
		as a tidy stack of pills rather than a ragged-right alignment.
		Used on table rows, detail-page headers, payroll dashboards and
		linked-doc dropdowns — uniform width helps each surface. -->
	<UBadge :color="color" variant="subtle" :size="size" class="min-w-24 justify-center uppercase tracking-wider">
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
		// invoices add: partial, paid, credited, overdue, cancelled
		partial: "warning",
		paid: "success",
		// "credited" = closed out by a credit note rather than collected.
		// Neutral, not success: no money arrived, so it must not read as a
		// win. It shares the tone with "cancelled" deliberately — both mean
		// "off the books, nothing owed". `info` was the other candidate but
		// it belongs to "sent" (awaiting payment), which is the opposite
		// meaning, so sharing there would be actively misleading.
		credited: "neutral",
		overdue: "error",
		cancelled: "neutral",
		// bills add: unpaid
		unpaid: "warning",
		// credit notes use the simpler draft / issued / cancelled set;
		// "issued" reads as a successful publication action — same tone
		// as "paid" / "accepted" — to signal "this credit has taken effect".
		issued: "success",
		// recurring invoice templates: active (currently generating) /
		// paused (skip the upcoming cycle). Active reads green-ish to
		// signal "this template is healthy and running"; paused stays
		// neutral so the row doesn't look like a problem.
		active: "success",
		paused: "neutral"
	};

	const color = computed<BadgeColor>(() => STATUS_COLOR[props.status] ?? "neutral");
	const label = computed(() => props.status.charAt(0).toUpperCase() + props.status.slice(1));
</script>
