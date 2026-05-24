<template>
	<UModal v-model:open="openModel" title="New bill">
		<template #body>
			<!-- Body wrapped in a <form> so Enter inside the Number field
				submits. Footer's Create bill button references this form
				via the `form` attribute + type="submit". -->
			<form id="new-bill-form" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted) mb-4">
					Pick the vendor who sent the bill — we'll snapshot their address and tax ID onto the bill so future edits to the vendor record don't rewrite history. Invoice number, due date, totals, and category go on the next screen.
				</p>
				<div class="space-y-4">
					<UFormField label="Vendor" required>
						<VendorPicker
							v-model="vendorId"
							required
							@select="onPick"
						/>
					</UFormField>
					<p class="text-xs text-(--ui-text-muted)">
						Don't see them? <NuxtLink
							to="/vendors/new"
							class="text-(--ui-primary) hover:underline"
							@click="openModel = false"
						>
							Add a new vendor
						</NuxtLink> and they'll appear in the picker.
					</p>

					<!-- Editable bill number with live uniqueness check. See
						NewQuoteModal for the gap-filling rationale. -->
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
							class="w-full"
						/>
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
					form="new-bill-form"
					:loading="creating"
					:disabled="vendorId === null || !docNum.numberValid.value"
					icon="i-lucide-plus"
				>
					Create bill
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Mirror of NewInvoiceModal for bills. Single field: vendor picker.
// Bills don't have a "draft" state — once recorded they're real
// obligations — but the minimum needed to allocate a number is a
// vendor reference + frozen snapshot. Everything else is filled on
// the editor that opens after submit.

	import type { VendorRow } from "~/stores/vendors";
	import { useBillsStore } from "~/stores/bills";
	import { useVendorsStore } from "~/stores/vendors";

	// Optional initial issue_date — set by the list page when the user
	// arrived via "Create on this day" from the calendar. Bills default
	// issue_date / due_date both to today; this overrides both with the
	// picked date (user can fine-tune due_date on the editor).
	const props = defineProps<{
		issueDate?: string | null
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const store = useBillsStore();
	const vendorsStore = useVendorsStore();

	const vendorId = ref<number | null>(null);
	const picked = ref<VendorRow | null>(null);
	const creating = ref(false);

	// Editable bill number with live uniqueness check — see NewQuoteModal.
	const issueDateRef = computed(() => props.issueDate ?? null);
	const docNum = useDocumentNumber({
		type: "bill",
		issueDate: issueDateRef,
		enabled: openModel
	});

	watch(openModel, async (open) => {
		if (open) {
			if (vendorsStore.vendors.length === 0) await vendorsStore.load();
		} else {
			vendorId.value = null;
			picked.value = null;
			creating.value = false;
			docNum.reset();
		}
	});

	const onPick = (v: VendorRow) => {
		picked.value = v;
	};

	const cancel = () => {
		openModel.value = false;
	};

	const create = async () => {
		if (vendorId.value === null) {
			toast.add({ title: "Pick a vendor first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!docNum.numberValid.value) {
			toast.add({ title: "Pick an unused bill number", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		// Resolve the picked row — picker emits on select but not on
		// manual clear; fall back to the store as source of truth.
		const v = picked.value ?? vendorsStore.vendors.find((x) => x.id === vendorId.value) ?? null;
		if (!v) {
			toast.add({ title: "Vendor not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await store.createBill({
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
				issue_date: props.issueDate ?? undefined,
				sequence: docNum.sequence.value ?? undefined
			});
			toast.add({ title: "Bill recorded", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/bills/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create bill",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
