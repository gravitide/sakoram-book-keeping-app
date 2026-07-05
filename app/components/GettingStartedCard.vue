<template>
	<!-- First-run "Getting started" checklist for the dashboard. Every task's
		done-state is derived from real data (row counts), so it can never
		disagree with what the user has actually done — there's no manual
		ticking. Auto-hides once all tasks are complete; the Hide button
		dismisses it early (persisted per-tenant in localStorage), and a slim
		"Resume" bar lets the user reopen it. Rendered nothing at all once the
		business has done everything, so established / demo businesses never
		see it. -->
	<div v-if="!allComplete">
		<!-- Expanded checklist -->
		<UCard v-if="!dismissed" class="mb-6">
			<template #header>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="font-medium flex items-center gap-2">
							<UIcon name="i-lucide-rocket" class="size-4 text-(--ui-primary)" />
							Getting started
						</div>
						<p class="text-xs text-(--ui-text-muted) mt-0.5">
							A few first steps to set your books in motion.
						</p>
					</div>
					<UButton
						size="xs"
						variant="ghost"
						color="neutral"
						icon="i-lucide-x"
						aria-label="Hide getting-started guide"
						@click="dismiss"
					>
						Hide
					</UButton>
				</div>
			</template>

			<!-- Progress -->
			<div class="mb-4">
				<div class="flex items-center justify-between text-xs text-(--ui-text-muted) mb-1.5 tabular-nums">
					<span>{{ completedCount }} of {{ tasks.length }} done</span>
					<span>{{ progressPct }}%</span>
				</div>
				<div class="h-1.5 rounded-full bg-(--ui-bg-muted) overflow-hidden">
					<div class="h-full bg-(--ui-primary) transition-all duration-300" :style="{ width: `${progressPct}%` }" />
				</div>
			</div>

			<!-- Tasks -->
			<ul class="space-y-2">
				<li
					v-for="t in tasks"
					:key="t.key"
					class="flex items-center gap-3 rounded-md border px-3 py-2.5 transition"
					:class="t.done ? 'border-(--ui-border) bg-(--ui-bg-muted)/40' : 'border-(--ui-border)'"
				>
					<span
						class="flex size-6 shrink-0 items-center justify-center rounded-full"
						:class="t.done ? 'bg-(--ui-success)/15 text-(--ui-success)' : 'bg-(--ui-primary)/10 text-(--ui-primary)'"
					>
						<UIcon :name="t.done ? 'i-lucide-check' : t.icon" class="size-3.5" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium" :class="t.done ? 'text-(--ui-text-muted)' : 'text-(--ui-text)'">
							{{ t.label }}
						</div>
						<div class="text-xs text-(--ui-text-muted) truncate">
							{{ t.blurb }}
						</div>
					</div>
					<UButton
						v-if="!t.done"
						size="xs"
						:to="t.to"
						trailing-icon="i-lucide-arrow-right"
						class="w-24 shrink-0 justify-center"
					>
						{{ t.cta }}
					</UButton>
					<span v-else class="text-xs font-medium text-(--ui-success) shrink-0 inline-flex items-center gap-1">
						<UIcon name="i-lucide-check" class="size-3.5" />
						Done
					</span>
				</li>
			</ul>
		</UCard>

		<!-- Collapsed bar — dismissed but not yet complete, so the user can
			pick the guide back up. -->
		<button
			v-else
			type="button"
			class="mb-6 w-full flex items-center gap-2 rounded-md border border-(--ui-border) bg-(--ui-bg-muted)/40 px-3 py-2 text-xs text-(--ui-text-muted) hover:text-(--ui-text) hover:border-(--ui-primary)/40 transition"
			@click="resume"
		>
			<UIcon name="i-lucide-rocket" class="size-3.5 text-(--ui-primary)" />
			<span class="tabular-nums">Getting started — {{ completedCount }} of {{ tasks.length }} done</span>
			<span class="ml-auto inline-flex items-center gap-1 font-medium text-(--ui-primary)">
				Resume
				<UIcon name="i-lucide-chevron-right" class="size-3.5" />
			</span>
		</button>
	</div>
</template>

<script setup lang="ts">
	import { selectOne } from "~/lib/db";
	import { useTenantsStore } from "~/stores/tenants";

	const tenants = useTenantsStore();

	// Live row counts driving each task's done-state. A single round trip.
	const counts = ref({ clients: 0, invoices: 0, bills: 0, vouchers: 0 });

	const fetchCounts = async () => {
		try {
			const row = await selectOne<{ clients: number, invoices: number, bills: number, vouchers: number }>(
				`SELECT (SELECT COUNT(*) FROM clients) AS clients,
				        (SELECT COUNT(*) FROM invoices) AS invoices,
				        (SELECT COUNT(*) FROM bills) AS bills,
				        (SELECT COUNT(*) FROM vouchers) AS vouchers`
			);
			if (row) counts.value = row;
		} catch { /* non-fatal — the card just stays at 0/4 */ }
	};

	// Dismissal is per-business (a fresh tenant should get the guide again),
	// stored in localStorage like the other UI prefs — no DB migration.
	const dismissKey = computed(() => `sakoram.ui.gettingStarted.dismissed.${tenants.activeTenantId ?? "none"}`);
	const dismissed = ref(false);
	const readDismissed = () => {
		try {
			dismissed.value = localStorage.getItem(dismissKey.value) === "1";
		} catch {
			dismissed.value = false;
		}
	};
	const dismiss = () => {
		dismissed.value = true;
		try {
			localStorage.setItem(dismissKey.value, "1");
		} catch { /* private mode — fine */ }
	};
	const resume = () => {
		dismissed.value = false;
		try {
			localStorage.removeItem(dismissKey.value);
		} catch { /* private mode — fine */ }
	};

	const tasks = computed(() => [
		{ key: "client", label: "Add your first client", blurb: "The businesses and people you invoice.", icon: "i-lucide-users", to: "/clients", cta: "Add", done: counts.value.clients > 0 },
		{ key: "invoice", label: "Create your first invoice", blurb: "Bill a client for your work.", icon: "i-lucide-receipt", to: "/invoices?new=1", cta: "Create", done: counts.value.invoices > 0 },
		{ key: "bill", label: "Record a bill", blurb: "Track an expense you owe a vendor.", icon: "i-lucide-file-input", to: "/bills?new=1", cta: "Add", done: counts.value.bills > 0 },
		{ key: "voucher", label: "Record a payment", blurb: "Log money received or paid out.", icon: "i-lucide-wallet", to: "/vouchers/new", cta: "Record", done: counts.value.vouchers > 0 }
	]);
	const completedCount = computed(() => tasks.value.filter((t) => t.done).length);
	const allComplete = computed(() => completedCount.value === tasks.value.length);
	const progressPct = computed(() => Math.round((completedCount.value / tasks.value.length) * 100));

	onMounted(() => {
		readDismissed();
		void fetchCounts();
	});

	// The dashboard is kept alive, so setup/onMounted run once. Refresh counts
	// when the user navigates back after creating a client / invoice / etc.
	// (skip the first activation — onMounted already ran).
	let firstActivation = true;
	onActivated(() => {
		if (firstActivation) {
			firstActivation = false;
			return;
		}
		readDismissed();
		void fetchCounts();
	});
</script>
