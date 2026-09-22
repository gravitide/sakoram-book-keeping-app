<template>
	<!-- Help-window layout — used when the user pops out a help topic
		into a separate Tauri WebviewWindow. Strips the main app
		chrome (no app sidebar, no tenant switcher, no welcome modal)
		and substitutes a docs-style topic sidebar so the popout
		reads as a true docs reader.

		Visually mirrors layouts/default.vue: same TitleBar, same
		floating-card sidebar (HelpSidebar carries the same `m-2 mt-0
		rounded-lg border bg shadow` chrome the main sidebar uses),
		same main-scroll container — just a different sidebar
		component and a slightly narrower content cap. -->
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="false" :show-help-button="false" :show-lock-button="false" :show-backup-button="false" />
		<div class="flex-1 min-h-0 flex">
			<!-- Help topics sidebar — always visible. The popout window
				ships at 1280×800 with a minWidth of 1024 (see
				useHelpWindow) so there's always room for the
				sidebar; user can't drag the window below that floor.
				HelpSidebar is itself a floating card (`m-2 mt-0 ...`)
				so the chrome matches layouts/default.vue. -->
			<HelpSidebar />
			<main class="flex-1 min-w-0 overflow-auto">
				<!-- max-w-5xl (1024px) caps the content for readable
					docs prose. The /help/[slug] article inside hits
					max-w-3xl (768px); the rest of the 1024 cap is
					room for the TOC nav rail beside it.
					Bottom pad matches the sidebar's m-2 floor gap so
					the lower edges of both surfaces line up.
					Deliberately NO mx-auto — content is left-aligned
					so it stays anchored next to the topics sidebar. -->
				<div class="p-4 pb-2 max-w-5xl">
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
