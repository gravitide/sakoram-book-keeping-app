<template>
	<UModal v-model:open="openModel" title="New invoice">
		<template #body>
			<!-- Body wrapped in a <form> so Enter inside any input submits.
				Footer's Create draft button references this form via the
				`form` attribute + type="submit" to share the submit flow.
				See NewQuoteModal for the rationale. -->
			<form id="new-invoice-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-4">
					A draft will be created with a number allocated. Edit details and add line items on the next screen.
				</p>
				<div class="space-y-4">
					<UFormField label="Client" required>
						<ClientPicker v-model="clientId" />
					</UFormField>

					<!-- Number is editable so the user can fill a gap left by
						an earlier deletion. See NewQuoteModal for the
						rationale. -->
					<UFormField label="Number" required>
						<template #help>
							<span v-if="docNum.numberTaken.value" class="text-(--ui-error)">
								{{ docNum.numberFormatted.value }} is already in use — pick another sequence.
							</span>
							<span v-else-if="docNum.numberFormatted.value">
								Will be saved as <span class="font-medium">{{ docNum.numberFormatted.value }}</span>
							</span>
						</template>
						<UInput
							v-model.number="docNum.sequence.value"
							type="number"
							min="1"
							step="1"
							placeholder="e.g. 1"
						/>
					</UFormField>

					<UFormField label="Project title" hint="The centred subtitle on the PDF (optional)">
						<UInput v-model="projectTitle" placeholder="e.g. Q3 retainer" />
					</UFormField>
				</div>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="creating" @click="cancel">
					Cancel
				</UButton>
				<UButton
					type="submit"
					form="new-invoice-form"
					:loading="creating"
					:disabled="clientId === null || !docNum.numberValid.value"
					icon="i-lucide-plus"
				>
					Create draft
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// New-invoice creation as a modal — supersedes the standalone
// /invoices/new page. Two fields (client + optional project title) is
// small enough that a page navigation felt heavy; the modal keeps the
// user on the invoices list and the freshly-created draft opens after
// submit.
//
// State is owned externally via `v-model:open`. On successful create
// we close the modal and navigate to the new draft's detail page. On
// cancel/close we just reset the form fields so the next open starts
// clean.

	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";

	// Optional initial issue_date — set by the list page when the user
	// arrived via "Create on this day" from the calendar. Plumbed
	// straight through to createDraft so the picked date becomes the
	// draft's issue_date (due_date derives from issue + settings'
	// payment terms).
	const props = defineProps<{
		issueDate?: string | null
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const invoices = useInvoicesStore();

	const clientId = ref<number | null>(null);
	const projectTitle = ref("");
	const creating = ref(false);

	// Editable number with live uniqueness check — see NewQuoteModal.
	const issueDateRef = computed(() => props.issueDate ?? null);
	const docNum = useDocumentNumber({
		type: "invoice",
		issueDate: issueDateRef,
		enabled: openModel
	});

	// Reset form whenever the modal closes so reopening starts from a
	// clean slate. Lazy-load the stores the form needs on first open so
	// we don't pay for them when the modal never appears.
	watch(openModel, async (open) => {
		if (open) {
			await Promise.all([settings.ensureLoaded(), clients.load()]);
		} else {
			clientId.value = null;
			projectTitle.value = "";
			creating.value = false;
			docNum.reset();
		}
	});

	const cancel = () => {
		openModel.value = false;
	};

	const create = async () => {
		if (clientId.value === null) {
			toast.add({ title: "Pick a client first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!docNum.numberValid.value) {
			toast.add({ title: "Pick an unused invoice number", color: "warning", icon: "i-lucide-circle-alert" });
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
				project_title: projectTitle.value.trim(),
				issue_date: props.issueDate ?? undefined,
				sequence: docNum.sequence.value ?? undefined
			});
			toast.add({ title: "Draft invoice created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/invoices/${id}`);
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
