<template>
	<div class="select-none">
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Lists
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				The address books and lookups your documents reference —
				clients (who you invoice), vendors (who you pay), and the
				bill categories that group your expenses.
			</p>
		</header>

		<!-- One card per Lists surface. Same shape as the Reports +
			Payroll landings for consistency. The underlying pages stay
			at their existing top-level URLs (/clients, /vendors,
			/categories) — only the sidebar grouping says "Lists";
			this index just gives the group a proper landing. -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
			<NuxtLink
				v-for="r in sections"
				:key="r.to"
				:to="r.to"
				class="block group h-full"
			>
				<UCard class="h-full transition group-hover:border-(--ui-primary)">
					<div class="flex items-start gap-3">
						<div class="size-10 shrink-0 rounded-md bg-(--ui-primary)/15 flex items-center justify-center">
							<UIcon :name="r.icon" class="size-5 text-(--ui-primary)" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="font-medium">
								{{ r.label }}
							</div>
							<p class="text-xs text-(--ui-text-muted) mt-0.5">
								{{ r.description }}
							</p>
						</div>
					</div>
				</UCard>
			</NuxtLink>
		</div>
	</div>
</template>

<script setup lang="ts">
	definePageMeta({ title: "Lists" });

	interface ListTile {
		to: string
		label: string
		icon: string
		description: string
	}

	const sections: ListTile[] = [
		{
			to: "/clients",
			label: "Clients",
			icon: "i-lucide-users",
			description: "People and businesses you invoice. Quotes + invoices reference a client and snapshot their details at issue time."
		},
		{
			to: "/vendors",
			label: "Vendors",
			icon: "i-lucide-store",
			description: "Suppliers you pay. Bills reference a vendor and snapshot their details at create time."
		},
		{
			to: "/categories",
			label: "Bill categories",
			icon: "i-lucide-tags",
			description: "Managed lookup for grouping expenses — colour + icon per category, shows up on every bill and powers the expenses donut on the dashboard."
		}
	];
</script>
