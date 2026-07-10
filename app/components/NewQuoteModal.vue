<template>
	<UModal v-model:open="openModel" title="New quote">
		<template #body>
			<!-- The body content is wrapped in a <form> so pressing Enter
				inside any input submits the draft. The Create draft button
				lives in the footer slot (rendered outside this form by
				UModal's portal), so it references the form via the `form`
				attribute + type="submit" to participate in the same submit
				flow. Cancel keeps type="button" so Enter never accidentally
				dismisses. -->
			<form id="new-quote-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-4">
					A draft will be created with a number allocated. Edit details and add line items on the next screen.
				</p>
				<div class="space-y-4">
					<UFormField label="Client" required>
						<ClientPicker v-model="clientId" @create-new="openModel = false" />
					</UFormField>

					<!-- Issue date drives the document number's YEAR (the number
						is PREFIX-YEAR-SEQUENCE). Defaults to today, so a normal
						quote needs no thought; back-date it to file an old quote
						and the number's year + the preview below follow. -->
					<UFormField label="Issue date" help="Sets the quote's year. Leave as today, or back-date to file an old quote.">
						<DateField v-model="issueDate" />
					</UFormField>

					<!-- Number is editable so the user can fill a gap left by
						an earlier deletion. The default is whatever the
						auto-allocator would mint next. Live preview below
						shows the full formatted number; turns red if a
						quote already uses it. -->
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
						<UInput v-model="projectTitle" placeholder="e.g. Website redesign — Phase 1" />
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
					form="new-quote-form"
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
// Mirror of NewInvoiceModal but for quotes. Same shape: pick a client +
// optional project title, get redirected to the freshly minted draft's
// editor. See NewInvoiceModal for the v-model:open contract and form
// reset behaviour — identical here.

	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";

	// Optional initial issue_date — set by the list page when the user
	// arrived via "Create on this day" from the calendar. Plumbed
	// straight through to createDraft so the picked date becomes the
	// draft's issue_date (valid_until derives from issue + settings).
	const props = defineProps<{
		issueDate?: string | null
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const quotes = useQuotesStore();

	const clientId = ref<number | null>(null);
	const projectTitle = ref("");
	const creating = ref(false);

	// Local YYYY-MM-DD "today" (not UTC — toISOString would drift a day near
	// midnight for +ve timezones).
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Editable issue date. Defaults to today (or the calendar-picked date via
	// props), and drives the document number's fiscal year — back-dating it
	// re-years the number preview below.
	const issueDate = ref<string>(todayISO());

	// Editable number with live uniqueness check. Defaults to the
	// auto-allocator's next sequence on open; the user can override to
	// fill a gap left by a deletion. See `useDocumentNumber` for the
	// reactive contract.
	const docNum = useDocumentNumber({
		type: "quote",
		enabled: openModel
	});

	watch(openModel, async (open) => {
		if (open) {
			issueDate.value = props.issueDate ?? todayISO();
			await Promise.all([settings.ensureLoaded(), clients.load()]);
		} else {
			clientId.value = null;
			projectTitle.value = "";
			issueDate.value = todayISO();
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
			toast.add({ title: "Pick an unused quote number", color: "warning", icon: "i-lucide-circle-alert" });
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
				project_title: projectTitle.value.trim(),
				issue_date: issueDate.value || undefined,
				sequence: docNum.sequence.value ?? undefined
			});
			toast.add({ title: "Draft created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/quotes/${id}`);
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
