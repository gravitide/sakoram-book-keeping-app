<template>
	<div class="max-w-2xl">
		<header class="mb-6">
			<NuxtLink to="/quotes" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to quotes
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New quote
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				A draft will be created with a number allocated. You can edit details, add line items, and send it from the next screen.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Client" required>
					<ClientPicker v-model="clientId" />
				</UFormField>

				<UFormField label="Project title" hint="The centred subtitle on the PDF (optional)">
					<UInput v-model="projectTitle" placeholder="e.g. Travcal Web App Development - Improvements" />
				</UFormField>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/quotes')">
						Cancel
					</UButton>
					<UButton :loading="creating" :disabled="clientId === null" icon="i-lucide-plus" @click="create">
						Create draft
					</UButton>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
// "New quote" is a one-shot screen: pick a client, click create, get
// redirected to the editor for the freshly minted draft. Allocating the
// number eagerly matches the spec ("number NOT NULL"). Drafts can be
// deleted from the editor if the user changes their mind.

	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "New quote" });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const quotes = useQuotesStore();

	await Promise.all([settings.ensureLoaded(), clients.load()]);

	const clientId = ref<number | null>(null);
	const projectTitle = ref("");
	const creating = ref(false);

	const create = async () => {
		if (clientId.value === null) {
			toast.add({ title: "Pick a client first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		const client: ClientRow | undefined = clients.clients.find((c) => c.id === clientId.value);
		if (!client) {
			toast.add({ title: "Client not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await quotes.createDraft({
				client: { ...client, id: client.id },
				project_title: projectTitle.value.trim()
			});
			toast.add({ title: "Draft created", color: "success", icon: "i-lucide-check" });
			await router.replace(`/quotes/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create quote",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
