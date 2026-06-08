<template>
	<UModal v-model:open="openModel" title="New credit note">
		<template #body>
			<form id="new-credit-note-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-4">
					A draft will be created with a number allocated. Edit the lines and project on the next screen.
				</p>
				<div class="space-y-4">
					<UFormField label="Client" required>
						<ClientPicker v-model="clientId" @create-new="openModel = false" />
					</UFormField>

					<UFormField label="Number" required>
						<template #help>
							<span v-if="docNum.numberTaken.value" class="text-(--ui-error)">
								{{ docNum.numberFormatted.value }} is already in use — pick another sequence.
							</span>
							<span v-else-if="docNum.numberFormatted.value">
								Will be saved as <span class="font-medium">{{ docNum.numberFormatted.value }}</span>
							</span>
						</template>
						<UInputNumber
							v-model="docNum.sequence.value"
							:min="1"
							:step="1"
							class="w-1/2"
						/>
					</UFormField>

					<UFormField label="Project title" hint="The centred subtitle on the PDF (optional)">
						<UInput v-model="projectTitle" placeholder="e.g. Refund for damaged item" />
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
					form="new-credit-note-form"
					:loading="creating"
					:disabled="clientId === null || !docNum.numberValid.value || !license.hasFeature('credit_notes')"
					icon="i-lucide-plus"
				>
					Create draft
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Same shape as NewInvoiceModal — client + optional project title +
// editable number with live uniqueness check. The new draft opens on
// /credit-notes/[id] after creation.

	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useCreditNotesStore } from "~/stores/credit_notes";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";

	const props = defineProps<{
		issueDate?: string | null
		/// Optional FK to a source invoice — set when the user arrived here
		/// from the "Convert to credit note" button on an invoice detail
		/// page (future work). For v1 the modal doesn't surface a UI
		/// selector for this; it's only set programmatically.
		sourceInvoiceId?: number | null
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const license = useLicenseStore();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const creditNotes = useCreditNotesStore();

	const clientId = ref<number | null>(null);
	const projectTitle = ref("");
	const creating = ref(false);

	const issueDateRef = computed(() => props.issueDate ?? null);
	const docNum = useDocumentNumber({
		type: "credit_note",
		issueDate: issueDateRef,
		enabled: openModel
	});

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
		if (!license.hasFeature("credit_notes")) {
			await navigateTo("/upgrade?feature=credit_notes");
			return;
		}
		if (clientId.value === null) {
			toast.add({ title: "Pick a client first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!docNum.numberValid.value) {
			toast.add({ title: "Pick an unused credit note number", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		const client: ClientRow | undefined = clients.clients.find((c) => c.id === clientId.value);
		if (!client) {
			toast.add({ title: "Client not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await creditNotes.createDraft({
				client: { ...client, id: client.id },
				project_title: projectTitle.value.trim(),
				source_invoice_id: props.sourceInvoiceId ?? null,
				issue_date: props.issueDate ?? undefined,
				sequence: docNum.sequence.value ?? undefined
			});
			toast.add({ title: "Draft credit note created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/credit-notes/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create credit note",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
