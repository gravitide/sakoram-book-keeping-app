<template>
	<!-- The page designer's own window (usePageDesignerWindow): the app's
		TitleBar without the business-level buttons (lock, backup, sidebar —
		those belong to the main window), then the designer filling the rest. -->
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="false" :show-lock-button="false" :show-backup-button="false" />
		<main class="flex-1 min-h-0">
			<slot />
		</main>
	</div>
</template>

<script setup lang="ts">
	// Its own Nuxt app: apply the business's UI font, theme colour and light /
	// dark here too, or the designer shows the defaults.
	import { useAppTheme } from "~/composables/useAppTheme";

	useAppTheme();
</script>
