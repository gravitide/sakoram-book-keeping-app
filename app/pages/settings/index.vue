<template>
	<div />
</template>

<script setup lang="ts">
// Settings root → first child. Keeps any old /settings link still working.
//
// A ROUTER-level redirect, not `router.replace()` in setup: this page is kept
// alive, so setup ran once per session. The sidebar's "Business" group header
// links here — the second click re-activated the cached empty <div /> and
// showed a blank page with no redirect. `redirect` in the page meta resolves
// before any component renders, so there's nothing to cache.
	definePageMeta({ title: "Settings", redirect: "/settings/company" });
</script>
