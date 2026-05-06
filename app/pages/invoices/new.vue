<template>
	<div class="max-w-2xl">
		<header class="mb-6">
			<NuxtLink to="/invoices" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to invoices
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New invoice
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				A draft will be created with a number allocated. Edit details, add line items, then send it.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Client" required>
					<ClientPicker v-model="clientId" />
				</UFormField>

				<UFormField label="Project title" hint="The centred subtitle on the PDF (optional)">
					<UInput v-model="projectTitle" />
				</UFormField>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/invoices')">
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
// Pick a client + optional project title, click create → redirected to the
// editor for the freshly minted draft invoice. Mirrors quotes/new.

	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "New invoice" });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const invoices = useInvoicesStore();

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
			const id = await invoices.createDraft({
				client: { ...client, id: client.id },
				project_title: projectTitle.value.trim()
			});
			toast.add({ title: "Draft invoice created", color: "success", icon: "i-lucide-check" });
			await router.replace(`/invoices/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create invoice",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
