<template>
	<div class="max-w-2xl">
		<header class="mb-6">
			<NuxtLink to="/bills" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to bills
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New bill
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				A bill is recorded with a fresh BIL number. You can fill in the vendor's invoice number, due date, totals, and category on the next screen.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Vendor" required hint="Whoever sent you the bill (e.g. 'Hatton National Bank').">
					<UInput v-model="vendorName" placeholder="Vendor name" autofocus />
				</UFormField>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/bills')">
						Cancel
					</UButton>
					<UButton :loading="creating" :disabled="vendorName.trim() === ''" icon="i-lucide-plus" @click="create">
						Create bill
					</UButton>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
// Pick a vendor name, click create → editor for the freshly-allocated
// bill. Bills don't have a "draft" state — once recorded, they're real
// vendor obligations. The minimum to allocate a number is the vendor name.

	import { useBillsStore } from "~/stores/bills";

	definePageMeta({ title: "New bill" });

	const router = useRouter();
	const toast = useToast();
	const store = useBillsStore();

	const vendorName = ref("");
	const creating = ref(false);

	const create = async () => {
		const name = vendorName.value.trim();
		if (!name) {
			toast.add({ title: "Vendor name is required", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await store.createBill({ vendor_name: name });
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
