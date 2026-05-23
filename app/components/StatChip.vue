<template>
	<!-- Joined-pill stat readout. Left half is the label, filled with
		the chosen semantic colour; right half holds the value with a
		matching outline only. Used to surface filtered totals at the
		top of every list table — quotes / invoices / bills / vouchers.

		Pass either a `value` string, or render whatever you want via
		the default slot (useful for vouchers' coloured +/− amounts).

		Each half rounds its own outer corners and the inner edges
		stay square — joining cleanly without relying on the parent's
		`overflow-hidden` to mask sub-pixel border bleeds. The bordered
		half drops its left border (`border-l-0`) so it joins the
		filled half on a single seam. -->
	<div class="inline-flex items-stretch text-sm">
		<span
			class="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider flex items-center text-white rounded-l-md"
			:class="bgClass"
		>
			{{ label }}
		</span>
		<span
			class="border border-l-0 px-2.5 py-0.5 font-medium text-(--ui-text) tabular-nums flex items-center whitespace-nowrap rounded-r-md"
			:class="borderClass"
		>
			<slot>{{ value }}</slot>
		</span>
	</div>
</template>

<script setup lang="ts">
	type StatChipColor = "primary" | "success" | "error" | "warning" | "info";

	interface Props {
		label: string
		color?: StatChipColor
		value?: string
	}

	const props = withDefaults(defineProps<Props>(), {
		color: "primary",
		value: ""
	});

	// Full strings so Tailwind's JIT can statically extract them. Map both
	// the filled background and the matching outline border in one go so
	// the two halves always line up colour-wise.
	const bgClass = computed(() => {
		switch (props.color) {
		case "success": return "bg-(--ui-success)";
		case "error": return "bg-(--ui-error)";
		case "warning": return "bg-(--ui-warning)";
		case "info": return "bg-(--ui-info)";
		default: return "bg-(--ui-primary)";
		}
	});

	const borderClass = computed(() => {
		switch (props.color) {
		case "success": return "border-(--ui-success)";
		case "error": return "border-(--ui-error)";
		case "warning": return "border-(--ui-warning)";
		case "info": return "border-(--ui-info)";
		default: return "border-(--ui-primary)";
		}
	});
</script>
