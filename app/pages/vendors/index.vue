<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Vendors
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.activeCount }} active · {{ store.archivedCount }} archived
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newVendor">
				New vendor
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by name, email, contact, phone, tax ID…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<UCheckbox v-model="store.showArchived" label="Show archived" />
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading vendors…
			</div>

			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>

			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-store" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.vendors.length === 0">
					No vendors yet. Click <span class="font-medium">New vendor</span> to add the first one.
				</div>
				<div v-else>
					No vendors match your filters.
				</div>
			</div>

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<th class="py-2 pl-3 pr-2 font-medium">
							Name
						</th>
						<th class="py-2 px-2 font-medium">
							Contact
						</th>
						<th class="py-2 px-2 font-medium">
							Email
						</th>
						<th class="py-2 px-2 font-medium">
							Phone
						</th>
						<th class="py-2 px-2 font-medium">
							Tax ID
						</th>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="v in store.filtered"
						:key="v.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="openVendor(v)"
					>
						<td class="py-2 pl-3 pr-2 font-medium">
							<span class="flex items-center gap-2">
								{{ v.name }}
								<UBadge v-if="v.is_archived === 1" color="neutral" variant="subtle" size="sm">
									Archived
								</UBadge>
							</span>
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ v.contact_person || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ v.email || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ v.phone || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ v.tax_id || "—" }}
						</td>
						<td class="py-2 pl-2 pr-3 text-right" @click.stop>
							<UDropdownMenu :items="itemsFor(v)">
								<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
							</UDropdownMenu>
						</td>
					</tr>
				</tbody>
			</table>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { VendorRow } from "~/stores/vendors";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "Vendors" });

	const store = useVendorsStore();
	const toast = useToast();
	const router = useRouter();

	await store.load();

	const newVendor = () => router.push("/vendors/new");
	const openVendor = (v: VendorRow) => router.push(`/vendors/${v.id}`);

	const toggleArchive = async (v: VendorRow) => {
		const goingToArchive = v.is_archived === 0;
		try {
			await store.setArchived(v.id, goingToArchive);
			toast.add({
				title: goingToArchive ? "Vendor archived" : "Vendor restored",
				color: "info",
				icon: goingToArchive ? "i-lucide-archive" : "i-lucide-archive-restore"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Build the per-row dropdown items inline since they need the row.
	const itemsFor = (v: VendorRow) => [[
		{
			label: "Edit",
			icon: "i-lucide-pencil",
			onSelect: () => openVendor(v)
		},
		{
			label: v.is_archived === 0 ? "Archive" : "Restore",
			icon: v.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
			onSelect: () => toggleArchive(v)
		}
	]];
</script>
