<template>
	<div>
		<!-- min-w-72 so the popover doesn't get cramped at ~210px on
			narrow detail-page columns; matches the trigger when wider. -->
		<UPopover v-model:open="open" :ui="{ content: 'min-w-72 w-(--reka-popper-anchor-width)' }">
			<UButton
				color="neutral"
				variant="outline"
				class="w-full justify-between"
				:disabled="disabled"
				trailing-icon="i-lucide-chevrons-up-down"
			>
				<span v-if="selected" class="truncate">{{ selected.name }}</span>
				<span v-else class="text-(--ui-text-muted)">Select a client…</span>
			</UButton>
			<template #content>
				<div class="p-2 border-b border-(--ui-border)">
					<UInput
						v-model="search"
						placeholder="Search clients…"
						icon="i-lucide-search"
						autofocus
					/>
				</div>
				<div class="max-h-72 overflow-auto">
					<div v-if="items.length === 0" class="p-4 text-sm text-(--ui-text-muted) text-center">
						<div v-if="store.clients.length === 0">
							No clients yet.
						</div>
						<div v-else>
							No matches.
						</div>
					</div>
					<button
						v-for="c in items"
						:key="c.id"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm"
						:class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': c.id === modelValue }"
						@click="select(c)"
					>
						<div class="font-medium">
							{{ c.name }}
						</div>
						<div v-if="c.contact_person || c.email" class="text-xs text-(--ui-text-muted) truncate">
							{{ [c.contact_person, c.email].filter(Boolean).join(" · ") }}
						</div>
					</button>
				</div>
				<div class="p-2 border-t border-(--ui-border) flex justify-between">
					<button
						type="button"
						class="text-xs text-(--ui-primary) hover:underline"
						@click="createNew"
					>
						+ New client
					</button>
					<button
						v-if="modelValue !== null && !required"
						type="button"
						class="text-xs text-(--ui-text-muted) hover:text-(--ui-error)"
						@click="clear"
					>
						Clear
					</button>
				</div>
			</template>
		</UPopover>
	</div>
</template>

<script setup lang="ts">
	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";

	// v-model = client_id (number) or null when nothing selected.

	interface Props {
		modelValue: number | null
		disabled?: boolean
		required?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false, required: false });
	const emit = defineEmits<{
		"update:modelValue": [value: number | null]
		select: [client: ClientRow]
		createNew: []
	}>();

	const store = useClientsStore();
	onMounted(async () => {
		if (store.clients.length === 0) await store.load();
	});

	const open = ref(false);
	const search = ref("");

	const items = computed(() => {
		const q = search.value.trim().toLowerCase();
		const active = store.clients.filter((c) => c.is_archived === 0);
		if (!q) return active;
		return active.filter((c) =>
			c.name.toLowerCase().includes(q)
			|| (c.email ?? "").toLowerCase().includes(q)
			|| (c.contact_person ?? "").toLowerCase().includes(q)
		);
	});

	const selected = computed(() => store.clients.find((c) => c.id === props.modelValue) ?? null);

	const select = (c: ClientRow) => {
		emit("update:modelValue", c.id);
		emit("select", c);
		open.value = false;
		search.value = "";
	};

	const clear = () => {
		emit("update:modelValue", null);
	};

	// "+ New client" — close the popover, ask the host modal to close (so the
	// dialog dismisses cleanly), then navigate. Without closing the modal
	// first it stays stuck over the new-client page.
	const createNew = async () => {
		open.value = false;
		emit("createNew");
		await nextTick();
		await navigateTo("/clients/new");
	};
</script>
