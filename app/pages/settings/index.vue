<template>
	<div />
</template>

<script setup lang="ts">
// Settings root → first child. Keeps any old /settings link still working.
	definePageMeta({ title: "Settings" });

	const router = useRouter();
	router.replace("/settings/company");
</script>
