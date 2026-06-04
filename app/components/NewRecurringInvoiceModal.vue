<template>
	<UModal v-model:open="openModel" title="New recurring invoice">
		<template #body>
			<form id="new-recurring-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-5">
					Templates seed future invoices. Line items, payment
					terms, and the bank account are set on the next
					screen — this modal is just enough to mint the row.
				</p>
				<!-- Field help text uses UFormField's `help` slot — renders
					small muted text *below* the input. NuxtUI's `hint`
					prop renders inline with the label and is meant for
					tiny annotations (e.g. "Optional"); using it for a
					full sentence pushes the label sideways and breaks
					the column rhythm. -->
				<div class="space-y-4">
					<UFormField
						label="Template name"
						required
						help="A short label so you can find this template later."
					>
						<UInput v-model="templateName" placeholder="e.g. Acme — monthly retainer" autofocus />
					</UFormField>

					<UFormField label="Client" required>
						<ClientPicker v-model="clientId" />
					</UFormField>

					<div class="grid grid-cols-2 gap-3">
						<UFormField
							label="Frequency"
							required
							help="How often to issue."
						>
							<USelect
								v-model="frequency"
								:items="FREQUENCY_OPTIONS"
								value-key="value"
								class="w-full"
							/>
						</UFormField>
						<UFormField
							label="Start date"
							required
							help="When the first invoice is due."
						>
							<DateField v-model="startDate" />
						</UFormField>
					</div>
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
					form="new-recurring-form"
					:loading="creating"
					:disabled="!canSubmit || !license.hasFeature('recurring')"
					icon="i-lucide-plus"
				>
					Create template
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// New-recurring-invoice modal. Mirrors NewInvoiceModal — small enough
// form that a full /new page would be heavier than the value. Template
// name + client + frequency + start date is everything we need to mint
// the row; line items + payment terms + VAT live on the detail page.

	import type { ClientRow } from "~/stores/clients";
	import type { RecurringFrequency } from "~/stores/recurring_invoices";
	import { useClientsStore } from "~/stores/clients";
	import { useLicenseStore } from "~/stores/license";
	import { useRecurringInvoicesStore } from "~/stores/recurring_invoices";
	import { useSettingsStore } from "~/stores/settings";

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const license = useLicenseStore();
	const settings = useSettingsStore();
	const clients = useClientsStore();
	const recurring = useRecurringInvoicesStore();

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	const templateName = ref("");
	const clientId = ref<number | null>(null);
	const frequency = ref<RecurringFrequency>("monthly");
	const startDate = ref(todayISO());
	const creating = ref(false);

	const FREQUENCY_OPTIONS: { label: string, value: RecurringFrequency }[] = [
		{ label: "Weekly", value: "weekly" },
		{ label: "Monthly", value: "monthly" },
		{ label: "Quarterly", value: "quarterly" },
		{ label: "Yearly", value: "yearly" }
	];

	const canSubmit = computed(() =>
		templateName.value.trim() !== ""
		&& clientId.value !== null
		&& startDate.value !== ""
	);

	watch(openModel, async (open) => {
		if (open) {
			await Promise.all([settings.ensureLoaded(), clients.load()]);
		} else {
			templateName.value = "";
			clientId.value = null;
			frequency.value = "monthly";
			startDate.value = todayISO();
			creating.value = false;
		}
	});

	const cancel = () => {
		openModel.value = false;
	};

	const create = async () => {
		if (!license.hasFeature("recurring")) {
			await navigateTo("/upgrade?feature=recurring");
			return;
		}
		if (!canSubmit.value) return;
		const client: ClientRow | undefined = clients.clients.find((c) => c.id === clientId.value);
		if (!client) {
			toast.add({ title: "Client not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await recurring.create({
				template_name: templateName.value.trim(),
				client: { ...client, id: client.id },
				frequency: frequency.value,
				start_date: startDate.value
			});
			toast.add({ title: "Recurring template created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/recurring-invoices/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create template",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
