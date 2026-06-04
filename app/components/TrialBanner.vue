<template>
	<div
		v-if="show"
		class="px-4 py-1.5 text-xs flex items-center justify-center gap-2 bg-(--ui-primary)/10 text-(--ui-primary) border-b border-(--ui-primary)/20"
	>
		<UIcon name="i-lucide-sparkles" class="size-3.5" />
		<span>Trial: <b>{{ license.trialDaysLeft }}</b> day{{ license.trialDaysLeft === 1 ? "" : "s" }} left — you're trying Premium.</span>
		<UpgradeButton label="Get a license" />
	</div>
</template>

<script setup lang="ts">
	import { useLicenseStore } from "~/stores/license";

	const license = useLicenseStore();
	const show = computed(() => license.isTrial && license.trialDaysLeft > 0);
</script>
