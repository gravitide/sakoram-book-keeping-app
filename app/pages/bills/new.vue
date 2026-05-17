<template>
	<div class="max-w-2xl mx-auto">
		<header class="mb-6">
			<NuxtLink to="/bills" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to bills
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New bill
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Pick the vendor who sent the bill — we'll snapshot their address
				and tax ID onto the bill so future edits to the vendor record
				don't rewrite history. Vendor invoice number, due date, totals,
				and category are filled in on the next screen.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Vendor" required>
					<VendorPicker
						v-model="vendorId"
						required
						@select="onPick"
					/>
				</UFormField>
				<p class="text-xs text-(--ui-text-muted)">
					Don't see them? <NuxtLink to="/vendors/new" class="text-(--ui-primary) hover:underline">
						Add a new vendor
					</NuxtLink> and they'll appear in the picker.
				</p>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/bills')">
						Cancel
					</UButton>
					<UButton :loading="creating" :disabled="vendorId === null" icon="i-lucide-plus" @click="create">
						Create bill
					</UButton>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
// Pick a saved vendor, click create → editor for the freshly-allocated
// bill. Bills don't have a "draft" state — once recorded, they're real
// vendor obligations. The minimum to allocate a number is a vendor
// reference + a frozen snapshot of their info.

	import type { VendorRow } from "~/stores/vendors";
	import { useBillsStore } from "~/stores/bills";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "New bill" });

	const router = useRouter();
	const toast = useToast();
	const store = useBillsStore();
	const vendorsStore = useVendorsStore();

	// Preload so the picker is instant even on cold open.
	if (vendorsStore.vendors.length === 0) {
		await vendorsStore.load();
	}

	const vendorId = ref<number | null>(null);
	const picked = ref<VendorRow | null>(null);
	const creating = ref(false);

	const onPick = (v: VendorRow) => {
		picked.value = v;
	};

	const create = async () => {
		if (vendorId.value === null) {
			toast.add({ title: "Pick a vendor first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		// Resolve the picked row (the picker emits on select but not when the
		// user manually clears — re-fetch from the store as the source of truth).
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
			await router.replace(`/bills/${id}`);
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
