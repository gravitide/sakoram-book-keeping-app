<template>
	<div class="w-full max-w-3xl select-none">
		<header class="text-center mb-8">
			<img
				:src="sakoramLogo"
				alt="Sakoram"
				class="h-20 w-auto mx-auto mb-5 dark:invert dark:hue-rotate-180"
			>
			<h1 class="text-2xl font-semibold">
				{{ tenants.tenants.length === 0 ? "Welcome to Sakoram - The desktop bookkeeper!" : "Pick a business" }}
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				{{
					tenants.tenants.length === 0
						? "Set up your first business to start managing quotes, invoices, bills, and vouchers."
						: "Each business has its own clients, document numbers, and settings."
				}}
			</p>
		</header>

		<!-- Existing businesses -->
		<div v-if="tenants.tenants.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
			<button
				v-for="t in tenants.tenants"
				:key="t.id"
				type="button"
				class="text-left p-4 bg-(--ui-bg) border border-(--ui-border) rounded-lg hover:border-(--ui-primary) transition flex items-center gap-3 group"
				:disabled="switchingId !== null"
				@click="switchTo(t.id)"
			>
				<div class="size-12 shrink-0 rounded-md bg-(--ui-bg-muted) border border-(--ui-border) flex items-center justify-center overflow-hidden">
					<img
						v-if="logoSrcs[t.id]"
						:src="logoSrcs[t.id]!"
						:alt="t.name"
						class="max-w-full max-h-full object-contain"
					>
					<UIcon v-else name="i-lucide-building-2" class="size-5 text-(--ui-text-muted)" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="font-medium truncate">
						{{ t.name }}
					</div>
					<div class="text-xs text-(--ui-text-muted) truncate">
						{{ t.id }}.db
					</div>
				</div>
				<UIcon
					v-if="switchingId === t.id"
					name="i-lucide-loader-circle"
					class="size-5 text-(--ui-text-muted) animate-spin"
				/>
				<UIcon v-else name="i-lucide-chevron-right" class="size-5 text-(--ui-text-muted) group-hover:text-(--ui-primary)" />
			</button>
		</div>

		<!-- First-run choice: empty state offers Create vs Try-demo as
			equal-weight side-by-side cards. Once a tenant exists this
			collapses back to the compact "add another" affordance. -->
		<div v-if="tenants.tenants.length === 0 && !showCreate" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<button
				type="button"
				class="text-left p-5 bg-(--ui-bg) border border-(--ui-border) rounded-lg hover:border-(--ui-primary) transition disabled:opacity-50 disabled:hover:border-(--ui-border)"
				:disabled="seedingDemo"
				@click="showCreate = true"
			>
				<div class="size-10 rounded-md bg-(--ui-primary)/10 flex items-center justify-center mb-3">
					<UIcon name="i-lucide-plus" class="size-5 text-(--ui-primary)" />
				</div>
				<div class="font-medium mb-1">
					Create your business
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					Start with an empty book — add your own clients, vendors, and documents.
				</div>
			</button>

			<button
				type="button"
				class="text-left p-5 bg-(--ui-bg) border border-(--ui-border) rounded-lg hover:border-(--ui-primary) transition disabled:opacity-50 disabled:hover:border-(--ui-border)"
				:disabled="seedingDemo"
				@click="onAddDemo"
			>
				<div class="size-10 rounded-md bg-(--ui-bg-muted) border border-(--ui-border) flex items-center justify-center mb-3">
					<UIcon
						:name="seedingDemo ? 'i-lucide-loader-circle' : 'i-lucide-sparkles'"
						class="size-5 text-(--ui-text-muted)"
						:class="{ 'animate-spin': seedingDemo }"
					/>
				</div>
				<div class="font-medium mb-1">
					{{ seedingDemo ? "Setting up demo data…" : "Try a demo business" }}
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					Pre-loaded clients, invoices, bills, and vouchers so you can explore right away.
				</div>
			</button>
		</div>

		<!-- Compact "add another" / create-form block once at least one
			tenant exists, or when the user opens the form from the empty
			state above. -->
		<div v-else class="bg-(--ui-bg) border border-(--ui-border) rounded-lg p-4">
			<div v-if="!showCreate" class="text-center space-y-3">
				<UButton
					icon="i-lucide-plus"
					variant="outline"
					:disabled="seedingDemo"
					@click="showCreate = true"
				>
					Add another business
				</UButton>
				<div class="text-xs text-(--ui-text-muted)">
					or
					<button
						type="button"
						class="text-(--ui-primary) hover:underline disabled:opacity-50 disabled:hover:no-underline"
						:disabled="seedingDemo"
						@click="onAddDemo"
					>
						<UIcon
							v-if="seedingDemo"
							name="i-lucide-loader-circle"
							class="size-3 inline-block animate-spin align-middle"
						/>
						{{ seedingDemo ? "Setting up demo data…" : "add a demo business with sample data" }}
					</button>
				</div>
			</div>

			<div v-else class="space-y-3">
				<UFormField label="Business name" required>
					<UInput
						v-model="newName"
						placeholder="e.g. Acme Co"
						autofocus
						@keydown.enter="onCreate"
					/>
				</UFormField>
				<div class="flex justify-end gap-2">
					<UButton
						color="neutral"
						variant="outline"
						:disabled="creating"
						@click="cancelCreate"
					>
						Cancel
					</UButton>
					<UButton
						:loading="creating"
						:disabled="!newName.trim() || creating"
						icon="i-lucide-plus"
						@click="onCreate"
					>
						Create
					</UButton>
				</div>
			</div>
		</div>

		<div class="text-center text-xs text-(--ui-text-muted) mt-6">
			v{{ pkg.version }}
		</div>

		<!-- Full-screen blocking overlay while the demo seed is running.
			Without this, tenants.create() inserts the partially-seeded
			tenant into the registry list visible on the welcome page and
			the user can click into it before the seed finishes — landing
			on a half-built dashboard. The overlay sits below the
			titlebar so window controls still work. -->
		<Teleport to="body">
			<div
				v-if="seedingDemo"
				class="fixed inset-0 z-40 flex items-center justify-center bg-(--ui-bg-muted)/95 backdrop-blur-sm"
			>
				<div class="text-center max-w-md px-6">
					<img
						:src="sakoramLogo"
						alt="Sakoram"
						class="h-16 w-auto mx-auto mb-6 dark:invert dark:hue-rotate-180"
					>
					<UIcon
						name="i-lucide-loader-circle"
						class="size-10 animate-spin text-(--ui-primary) mx-auto mb-4"
					/>
					<h2 class="text-xl font-semibold mb-2">
						Setting up your demo business
					</h2>
					<p class="text-sm text-(--ui-text-muted)">
						Seeding clients, vendors, employees, quotes, invoices,
						bills, vouchers, and payslips — this usually takes a few
						seconds. The dashboard will open automatically when it's
						ready.
					</p>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<script setup lang="ts">
// Welcome / business picker — the app's landing screen when no business
// is active (or when the user navigates here explicitly to switch).

	import { convertFileSrc } from "@tauri-apps/api/core";
	import pkg from "~~/package.json";
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { createDemoBusiness } from "~/lib/demo-seed";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({
		layout: "welcome",
		title: "Welcome"
	});

	const tenants = useTenantsStore();
	const toast = useToast();

	await tenants.ensureLoaded();

	// Cache of webview-safe URLs for each tenant's logo. We resolve them
	// once on mount via a Rust command (the registry stores filenames,
	// not absolute paths — Rust knows where logos/ lives).
	const logoSrcs = ref<Record<string, string | null>>({});
	onMounted(async () => {
		for (const t of tenants.tenants) {
			if (!t.logo_file) {
				logoSrcs.value[t.id] = null;
				continue;
			}
			try {
				const path = await tenants.logoPath(t.id);
				logoSrcs.value[t.id] = path ? convertFileSrc(path) : null;
			} catch {
				logoSrcs.value[t.id] = null;
			}
		}
	});

	const showCreate = ref(false);
	const newName = ref("");
	const creating = ref(false);
	const switchingId = ref<string | null>(null);

	const cancelCreate = () => {
		showCreate.value = false;
		newName.value = "";
	};

	// Hard reload on switch — wipes every Pinia store's in-memory state
	// so the dashboard re-hydrates against the new DB without any
	// per-store $reset() bookkeeping.
	const switchTo = async (id: string) => {
		if (switchingId.value) return;
		switchingId.value = id;
		try {
			await tenants.activate(id);
			window.location.assign("/");
		} catch (err) {
			switchingId.value = null;
			toast.add({
				title: "Could not open business",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// "Try with sample data" — creates a demo tenant with realistic
	// clients/vendors/quotes/invoices/bills/vouchers pre-loaded so the
	// dashboard, lists, and PDFs all have something interesting to show
	// the moment the user lands. Hard-reloads on success so every
	// store re-hydrates against the new DB.
	const seedingDemo = ref(false);
	const onAddDemo = async () => {
		if (seedingDemo.value) return;
		seedingDemo.value = true;
		try {
			const t = await createDemoBusiness();
			toast.add({
				title: `${t.name} created`,
				description: "Sample clients, invoices, bills, and vouchers are ready to explore.",
				color: "success",
				icon: "i-lucide-check"
			});
			window.location.assign("/");
		} catch (err) {
			seedingDemo.value = false;
			toast.add({
				title: "Could not create the demo business",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onCreate = async () => {
		const name = newName.value.trim();
		if (!name || creating.value) return;
		creating.value = true;
		try {
			const t = await tenants.create(name);
			toast.add({ title: `${t.name} created`, color: "success", icon: "i-lucide-check" });
			newName.value = "";
			showCreate.value = false;
			// Activate then route into the multi-step onboarding so the
			// user fills in company / contact / defaults / banking before
			// landing on an empty dashboard. The onboarding page has a
			// "Skip onboarding" link on step 1 for power users who want
			// the old fast path.
			await tenants.activate(t.id);
			window.location.assign("/onboarding");
		} catch (err) {
			toast.add({
				title: "Could not create business",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
