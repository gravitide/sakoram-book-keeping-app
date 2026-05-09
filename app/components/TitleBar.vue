<template>
	<!-- Custom titlebar replacing the OS chrome (see tauri.conf.json
	`decorations: false`). The drag region covers the whole bar except
	the window-control buttons; double-clicking toggles maximize, the
	OS handles that via the drag-region attribute. -->
	<div
		class="h-9 shrink-0 flex items-stretch select-none bg-(--ui-bg-muted) text-(--ui-text-muted) text-xs"
		data-tauri-drag-region
	>
		<div class="flex-1 flex items-center gap-2 px-3 min-w-0" data-tauri-drag-region>
			<UIcon name="i-lucide-book-open-text" class="size-4 text-(--ui-primary) shrink-0" data-tauri-drag-region />
			<span class="truncate" data-tauri-drag-region>{{ title }}</span>
		</div>

		<div class="flex items-stretch">
			<button
				type="button"
				class="w-11 flex items-center justify-center hover:bg-(--ui-bg-accented) transition"
				title="Minimize"
				aria-label="Minimize"
				@click="minimize"
			>
				<UIcon name="i-lucide-minus" class="size-4" />
			</button>
			<button
				type="button"
				class="w-11 flex items-center justify-center hover:bg-(--ui-bg-accented) transition"
				:title="isMaximized ? 'Restore' : 'Maximize'"
				:aria-label="isMaximized ? 'Restore' : 'Maximize'"
				@click="toggleMaximize"
			>
				<UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-3.5" />
			</button>
			<button
				type="button"
				class="w-11 flex items-center justify-center hover:bg-red-600 hover:text-white transition"
				title="Close"
				aria-label="Close"
				@click="close"
			>
				<UIcon name="i-lucide-x" class="size-4" />
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { useTenantsStore } from "~/stores/tenants";

	const { isMaximized } = useWindowState();
	const tenants = useTenantsStore();

	const title = computed(() => {
		const name = tenants.activeTenant?.name;
		return name ? `${name} · Sakoram Book Keeping` : "Sakoram Book Keeping";
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
