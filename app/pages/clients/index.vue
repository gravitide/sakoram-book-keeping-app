<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Clients
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.activeCount }} active · {{ store.archivedCount }} archived
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newClient">
				New client
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
				Loading clients…
			</div>

			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>

			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.clients.length === 0">
					No clients yet. Click <span class="font-medium">New client</span> to add the first one.
				</div>
				<div v-else>
					No clients match your filters.
				</div>
			</div>

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<th class="py-2 pr-2 font-medium">
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
						<th class="py-2 pl-2 w-10" />
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="c in store.filtered"
						:key="c.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="openClient(c)"
					>
						<td class="py-2 pr-2 font-medium">
							<span class="flex items-center gap-2">
								{{ c.name }}
								<UBadge v-if="c.is_archived === 1" color="neutral" variant="subtle" size="sm">
									Archived
								</UBadge>
							</span>
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ c.contact_person || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ c.email || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ c.phone || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ c.tax_id || "—" }}
						</td>
						<td class="py-2 pl-2 text-right" @click.stop>
							<UDropdownMenu :items="itemsFor(c)">
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
	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";

	definePageMeta({ title: "Clients" });

	const store = useClientsStore();
	const toast = useToast();
	const router = useRouter();

	await store.load();

	const newClient = () => router.push("/clients/new");
	const openClient = (c: ClientRow) => router.push(`/clients/${c.id}`);

	const toggleArchive = async (c: ClientRow) => {
		const goingToArchive = c.is_archived === 0;
		try {
			await store.setArchived(c.id, goingToArchive);
			toast.add({
				title: goingToArchive ? "Client archived" : "Client restored",
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
	const itemsFor = (c: ClientRow) => [[
		{
			label: "Edit",
			icon: "i-lucide-pencil",
			onSelect: () => openClient(c)
		},
		{
			label: c.is_archived === 0 ? "Archive" : "Restore",
			icon: c.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
			onSelect: () => toggleArchive(c)
		}
	]];
</script>
