<template>
	<!-- Help-window layout — used when the user pops out a help topic
		into a separate Tauri WebviewWindow. Strips the main app
		chrome (no app sidebar, no tenant switcher, no welcome modal)
		and substitutes a docs-style topic sidebar so the popout
		reads as a true docs reader.

		Keeps the custom TitleBar (drag region + close/min/max
		buttons) so the window still behaves like every other
		Sakoram window on the OS. The app-sidebar-toggle button is
		hidden via the existing `show-sidebar-toggle="false"` prop. -->
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="false" />
		<div class="flex-1 min-h-0 flex">
			<!-- Help topics sidebar — visible at lg+ (the popout window
				ships at 1000×760 by default, plenty of room). Below
				lg the sidebar hides; the main column takes the full
				width so the docs are still readable in a narrower
				popout the user resized down. The topic links inside
				the page (See-also tiles, /help index hero/cards) all
				preserve the popout query, so navigation stays in
				the popout-window layout regardless of which surface
				the user clicks. -->
			<HelpSidebar class="hidden lg:block" />
			<main class="flex-1 min-w-0 overflow-auto">
				<!-- Same content cap + padding the default layout uses
					so the help reader inside the popout has the
					exact same type measure as it does in-app. -->
				<div class="p-4 max-w-[96rem] mx-auto">
					<slot />
				</div>
			</main>
		</div>
	</div>
</template>

<script setup lang="ts">
// help-window layout. Switched into via setPageLayout('help-window')
// on the /help pages when route.query.popout === '1' — see
// app/pages/help/[slug].vue and app/pages/help/index.vue.
//
// No store loading, no tenant middleware concerns — the layout is
// just the titlebar + topics sidebar + slot. Pinia state is
// independent per window in Tauri, so the popout doesn't share the
// main window's stores; the help content is pure components anyway
// so there's nothing to hydrate.
</script>
