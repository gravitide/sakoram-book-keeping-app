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
			<!-- Help topics sidebar — always visible. The popout window
				ships at 1280×800 with a minWidth of 1024 (see
				useHelpWindow) so there's always room for the
				sidebar; user can't drag the window below that floor.
				The topic links inside the page (See-also tiles,
				/help index hero/cards) all preserve the popout query
				so navigation stays in the popout-window layout
				regardless of which surface the user clicks. -->
			<HelpSidebar />
			<main class="flex-1 min-w-0 overflow-auto">
				<!-- max-w-5xl (1024px) caps the content for readable
					docs prose. The /help/[slug] article inside hits
					max-w-3xl (768px); the rest of the 1024 cap is
					room for the TOC nav rail beside it.
					Deliberately NO mx-auto — content is left-aligned
					so it stays anchored next to the topics sidebar.
					Centering content on a wide monitor (e.g. 4K
					maximized) would leave a giant gap between
					sidebar and content. Empty space on the right at
					super-wide windows is the docs convention. -->
				<div class="p-4 max-w-5xl">
					<slot />
				</div>
			</main>
		</div>
	</div>
</template>

<script setup lang="ts">
// help-window layout. Used by /help and /help/[slug] (always, via
// definePageMeta on those pages). The main app no longer has an
// in-app docs reader — the help library lives exclusively in this
// separate Tauri WebviewWindow.
//
// Listens for `help:navigate` events emitted from the spawner side
// (see useHelpWindow). When the main window's "Help" button is
// clicked while the help window is already open, the spawner
// focuses this window and emits the event with the requested slug;
// the listener below routes the help window to /help/[slug] (or
// /help if no slug was supplied).

	import { useUserPlatform } from "~/composables/useUserPlatform";

	const router = useRouter();
	const { platform } = useUserPlatform();

	onMounted(async () => {
		if (platform === "unknown") return; // Skip outside Tauri (dev).
		const { listen } = await import("@tauri-apps/api/event");
		const unlisten = await listen<{ slug: string | null }>("help:navigate", (event) => {
			const slug = event.payload?.slug;
			void router.push(slug ? `/help/${slug}` : "/help");
		});
		onBeforeUnmount(() => {
			unlisten();
		});
	});
</script>
