<template>
	<UModal v-model:open="openModel" title="New bill">
		<template #body>
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
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="creating" @click="cancel">
					Cancel
				</UButton>
				<UButton :loading="creating" :disabled="vendorId === null" icon="i-lucide-plus" @click="create">
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

	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const store = useBillsStore();
	const vendorsStore = useVendorsStore();

	const vendorId = ref<number | null>(null);
	const picked = ref<VendorRow | null>(null);
	const creating = ref(false);

	watch(openModel, async (open) => {
		if (open) {
			if (vendorsStore.vendors.length === 0) await vendorsStore.load();
		} else {
			vendorId.value = null;
			picked.value = null;
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
		if (vendorId.value === null) {
			toast.add({ title: "Pick a vendor first", color: "warning", icon: "i-lucide-circle-alert" });
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
				}
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
