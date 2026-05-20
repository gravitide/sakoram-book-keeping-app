<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			vendors, not copying cell text out of the table. -->
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
					<div class="flex items-center gap-3">
						<UCheckbox v-model="store.showArchived" label="Show archived" />
						<UButton
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-table-columns-split"
							title="Auto-size columns to their content"
							@click="autoFitColumns"
						>
							Auto-fit columns
						</UButton>
					</div>
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

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="vendors-table"
				:row-actions="itemsFor"
				default-sort-field="name"
				:default-sort-order="1"
				@row-click="(row) => router.push(`/vendors/${row.id}`)"
			>
				<Column field="name" header="Name" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium flex items-center gap-2">
							{{ data.name }}
							<UBadge v-if="data.is_archived === 1" color="neutral" variant="subtle" size="sm">
								Archived
							</UBadge>
						</div>
					</template>
				</Column>
				<Column field="contact_person" header="Contact" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.contact_person || "—" }}
						</div>
					</template>
				</Column>
				<Column field="email" header="Email" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.email || "—" }}
						</div>
					</template>
				</Column>
				<Column field="phone" header="Phone" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.phone || "—" }}
						</div>
					</template>
				</Column>
				<Column field="tax_id" header="Tax ID" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.tax_id || "—" }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
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

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newVendor = () => router.push("/vendors/new");

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

	// Row-action callback consumed by ResizableDataTable's right-click
	// menu. Returns groups of `{ label, icon, onSelect }`; one separator
	// renders between each group.
	function itemsFor(v: VendorRow) {
		return [[
			{
				label: "Edit",
				icon: "i-lucide-pencil",
				onSelect: () => router.push(`/vendors/${v.id}`)
			},
			{
				label: v.is_archived === 0 ? "Archive" : "Restore",
				icon: v.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
				onSelect: () => {
					void toggleArchive(v);
				}
			}
		]];
	}
</script>
