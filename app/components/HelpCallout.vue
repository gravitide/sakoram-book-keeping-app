<template>
	<div
		class="rounded-md border-l-4 p-3 text-sm space-y-1"
		:class="containerClasses"
	>
		<div v-if="title" class="flex items-center gap-2 font-medium">
			<UIcon :name="iconName" class="size-4" />
			{{ title }}
		</div>
		<div :class="title ? 'text-(--ui-text)' : 'flex items-start gap-2'">
			<UIcon v-if="!title" :name="iconName" class="size-4 mt-0.5 shrink-0" :class="iconColor" />
			<div class="leading-relaxed">
				<slot />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Coloured callout box used inside HelpSection. Variants:
//
//   tip       — green; "here's a useful pointer"
//   info      — blue;  "context worth knowing"
//   warning   — amber; "watch out for this"
//   tax       — purple; SL IRD / tax-treatment context
//
// Topic components use these to call out important bits without
// having to re-style every time:
//
//   <HelpCallout variant="warning" title="Common mistake">
//     Don't cancel an issued credit note that has a refund voucher
//     against it — delete the voucher first.
//   </HelpCallout>

	type Variant = "tip" | "info" | "warning" | "tax";

	const props = withDefaults(defineProps<{
		variant?: Variant
		title?: string
	}>(), {
		variant: "info",
		title: undefined
	});

	const containerClasses = computed(() => {
		switch (props.variant) {
		case "tip":
			return "border-(--ui-success) bg-(--ui-success)/8";
		case "warning":
			return "border-(--ui-warning) bg-(--ui-warning)/8";
		case "tax":
			// Use info tone as the closest semantic primary-flavour
			// since there's no dedicated "tax" palette token.
			return "border-(--ui-primary) bg-(--ui-primary)/8";
		case "info":
		default:
			return "border-(--ui-info) bg-(--ui-info)/8";
		}
	});

	const iconName = computed(() => {
		switch (props.variant) {
		case "tip": return "i-lucide-lightbulb";
		case "warning": return "i-lucide-triangle-alert";
		case "tax": return "i-lucide-landmark";
		case "info":
		default: return "i-lucide-info";
		}
	});

	const iconColor = computed(() => {
		switch (props.variant) {
		case "tip": return "text-(--ui-success)";
		case "warning": return "text-(--ui-warning)";
		case "tax": return "text-(--ui-primary)";
		case "info":
		default: return "text-(--ui-info)";
		}
	});
</script>
