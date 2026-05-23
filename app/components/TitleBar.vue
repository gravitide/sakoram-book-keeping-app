<template>
	<!-- Custom titlebar replacing the OS chrome (see tauri.conf.json
	`decorations: false`). The drag region covers the whole bar except
	the buttons; double-clicking toggles maximize, the OS handles that
	via the drag-region attribute.

	Pixel-pinned sizing (h-[36px], w-[44px], text-[12px], etc.) — keeps
	the titlebar at its reference dimensions regardless of the user's
	UI zoom level (which scales the root font-size; everything
	rem-based inside the body would otherwise grow with it). -->
	<div
		class="h-[36px] shrink-0 flex items-stretch select-none bg-(--ui-bg-muted) text-(--ui-text-muted) text-[12px]"
		data-tauri-drag-region
	>
		<div class="flex items-stretch shrink-0">
			<button
				v-if="showSidebarToggle"
				type="button"
				class="w-[44px] flex items-center justify-center hover:bg-(--ui-bg-accented) transition"
				:title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
				:aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
				@click="toggleSidebar"
			>
				<UIcon :name="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-[16px]" />
			</button>
			<!-- Global back button: returns to the previous route via Vue
				Router's history stack. Disabled when there's nowhere to
				go back (fresh app start, or after returning to the very
				first entry) so it doesn't look broken or silently no-op. -->
			<button
				v-if="showSidebarToggle"
				type="button"
				class="w-[44px] flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
				:class="canGoBack ? 'hover:bg-(--ui-bg-accented) cursor-pointer' : ''"
				title="Go back"
				aria-label="Go back"
				:disabled="!canGoBack"
				@click="goBack"
			>
				<UIcon name="i-lucide-move-left" class="size-[20px]" />
			</button>
		</div>

		<div class="flex-1 flex items-center gap-[8px] px-[12px] min-w-0" data-tauri-drag-region>
			<img :src="sakoramIcon" alt="" class="size-[16px] shrink-0" data-tauri-drag-region>
			<span class="truncate" data-tauri-drag-region>{{ title }}</span>
		</div>

		<div class="flex items-stretch">
			<button
				type="button"
				class="w-[44px] flex items-center justify-center hover:bg-(--ui-bg-accented) transition"
				title="Minimize"
				aria-label="Minimize"
				@click="minimize"
			>
				<UIcon name="i-lucide-minus" class="size-[16px]" />
			</button>
			<button
				type="button"
				class="w-[44px] flex items-center justify-center hover:bg-(--ui-bg-accented) transition"
				:title="isMaximized ? 'Restore' : 'Maximize'"
				:aria-label="isMaximized ? 'Restore' : 'Maximize'"
				@click="toggleMaximize"
			>
				<UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-[14px]" />
			</button>
			<button
				type="button"
				class="w-[44px] flex items-center justify-center hover:bg-red-600 hover:text-white transition"
				title="Close"
				aria-label="Close"
				@click="close"
			>
				<UIcon name="i-lucide-x" class="size-[16px]" />
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import sakoramIcon from "~/assets/sakoram-icon.svg?url";
	import { useTenantsStore } from "~/stores/tenants";

	withDefaults(defineProps<{ showSidebarToggle?: boolean }>(), {
		showSidebarToggle: false
	});

	const { isMaximized } = useWindowState();
	const { sidebarCollapsed, toggleSidebar } = useUiState();
	const tenants = useTenantsStore();

	// "Can we go back?" derived from Vue Router's history-state position
	// counter (set on every nav via createWebHistory). Position 0 is the
	// landing entry — anything higher means there's somewhere to return
	// to. Recomputed after each navigation so the disabled state stays
	// in sync as the user moves around. `router.afterEach` returns a
	// teardown fn we keep around so the hook doesn't leak across
	// titlebar remounts (layout transitions).
	const router = useRouter();
	const canGoBack = ref(false);
	const refresh = () => {
		if (typeof window === "undefined") return;
		const pos = (window.history.state as { position?: number } | null)?.position;
		canGoBack.value = typeof pos === "number" && pos > 0;
	};
	let unhook: (() => void) | null = null;
	onMounted(() => {
		refresh();
		unhook = router.afterEach(() => nextTick(refresh));
	});
	onBeforeUnmount(() => {
		unhook?.();
	});

	const goBack = () => {
		if (!canGoBack.value) return;
		router.back();
	};

	const title = computed(() => {
		const name = tenants.activeTenant?.name;
		return name ? `${name} · Sakoram Bookkeeping` : "Sakoram Bookkeeping";
	});

	const minimize = () => {
		void getCurrentWindow().minimize();
	};
	const toggleMaximize = () => {
		void getCurrentWindow().toggleMaximize();
	};
	const close = () => {
		void getCurrentWindow().close();
	};
</script>
