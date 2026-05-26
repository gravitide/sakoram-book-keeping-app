<template>
	<!-- Help-window layout — used when the user pops out a help topic
		into a separate Tauri WebviewWindow. Strips the main app
		chrome (no sidebar, no tenant switcher, no welcome modal, no
		nav tree) so the popout reads as a true docs window rather
		than a duplicated main app.

		Keeps the custom TitleBar (drag region + close/min/max
		buttons) so the window still behaves like every other
		Sakoram window on the OS. The sidebar-toggle button is
		hidden via the existing `show-sidebar-toggle="false"` prop. -->
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="false" />
		<main class="flex-1 min-w-0 overflow-auto">
			<!-- Same content cap + padding the default layout uses so
				the help reader inside the popout has the exact same
				type measure as it does in-app. -->
			<div class="p-4 max-w-[96rem] mx-auto">
				<slot />
			</div>
		</main>
	</div>
</template>

<script setup lang="ts">
// help-window layout. Switched into via setPageLayout('help-window')
// on the /help pages when route.query.popout === '1' — see
// app/pages/help/[slug].vue and app/pages/help/index.vue.
//
// No store loading, no tenant middleware concerns — the layout is
// just the titlebar + slot. Pinia state is independent per window
// in Tauri, so the popout doesn't share the main window's stores;
// the help content is pure components anyway so there's nothing to
// hydrate.
</script>
