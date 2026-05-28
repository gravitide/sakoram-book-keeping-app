<template>
	<UModal v-model:open="openModel" title="New recurring bill">
		<template #body>
			<form id="new-recurring-bill-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-5">
					Templates seed future bills. Line items, payment
					terms, and the category are set on the next screen —
					this modal is just enough to mint the row.
				</p>
				<!-- Field help text uses UFormField's `help` slot (block,
					below the input) instead of `hint` (inline, beside
					the label) so longer sentences don't squeeze the
					label sideways. Mirrors NewRecurringInvoiceModal. -->
				<div class="space-y-4">
					<UFormField
						label="Template name"
						required
						help="A short label so you can find this template later."
					>
						<UInput v-model="templateName" placeholder="e.g. Landlord LLC — monthly office rent" autofocus />
					</UFormField>

					<UFormField label="Vendor" required>
						<VendorPicker v-model="vendorId" required @select="onPick" />
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
							help="When the first bill is due."
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
					form="new-recurring-bill-form"
					:loading="creating"
					:disabled="!canSubmit"
					icon="i-lucide-plus"
				>
					Create template
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// New-recurring-bill modal. Mirrors NewRecurringInvoiceModal — small
// enough form that a full /new page would be heavier than the value.
// Template name + vendor + frequency + start date is everything we
// need to mint the row; line items + payment terms + VAT + category
// live on the detail page.

	import type { RecurringFrequency } from "~/stores/recurring_bills";
	import type { VendorRow } from "~/stores/vendors";
	import { useRecurringBillsStore } from "~/stores/recurring_bills";
	import { useSettingsStore } from "~/stores/settings";
	import { useVendorsStore } from "~/stores/vendors";

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const vendors = useVendorsStore();
	const recurring = useRecurringBillsStore();

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	const templateName = ref("");
	const vendorId = ref<number | null>(null);
	const picked = ref<VendorRow | null>(null);
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
		&& vendorId.value !== null
		&& startDate.value !== ""
	);

	watch(openModel, async (open) => {
		if (open) {
			await Promise.all([settings.ensureLoaded(), vendors.load()]);
		} else {
			templateName.value = "";
			vendorId.value = null;
			picked.value = null;
			frequency.value = "monthly";
			startDate.value = todayISO();
			creating.value = false;
		}
	});

	const onPick = (v: VendorRow) => {
		picked.value = v;
	};

	const cancel = () => {
		openModel.value = false;
	};

	const create = async () => {
		if (!canSubmit.value) return;
		// Resolve the picked row — picker emits on select but not on
		// manual clear; fall back to the store as source of truth.
		const v = picked.value ?? vendors.vendors.find((x) => x.id === vendorId.value) ?? null;
		if (!v) {
			toast.add({ title: "Vendor not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await recurring.create({
				template_name: templateName.value.trim(),
				vendor: {
					id: v.id,
					name: v.name,
					contact_person: v.contact_person,
					email: v.email,
					phone: v.phone,
					address_line1: v.address_line1,
					address_line2: v.address_line2,
					city: v.city,
					postal_code: v.postal_code,
					country: v.country,
					tax_id: v.tax_id
				},
				frequency: frequency.value,
				start_date: startDate.value
			});
			toast.add({ title: "Recurring template created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/recurring-bills/${id}`);
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
