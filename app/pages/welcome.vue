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
					v-if="t.encrypted"
					name="i-lucide-lock"
					class="size-4 text-(--ui-text-muted)"
					title="Password-protected"
				/>
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

		<!-- Import a backup — always available, including when there are no
			businesses yet (you might be restoring one you removed). Imports as
			a new business; an encrypted backup prompts for its password. -->
		<div class="text-center mt-4">
			<button
				type="button"
				class="text-xs text-(--ui-text-muted) hover:text-(--ui-primary) hover:underline disabled:opacity-50 inline-flex items-center gap-1"
				:disabled="seedingDemo || importing"
				@click="onImportClick"
			>
				<UIcon name="i-lucide-upload" class="size-3" />
				Import a backup (.zip)
			</button>
		</div>

		<div class="text-center text-xs text-(--ui-text-muted) mt-6">
			v{{ pkg.version }}
		</div>

		<!-- Import backup modal — new-business mode only (the welcome screen
			has no active business to "replace"). -->
		<UModal v-model:open="showImport" title="Import a business backup" :dismissible="!importing">
			<template #body>
				<div v-if="importing" class="py-6 text-center space-y-3">
					<UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-(--ui-primary) mx-auto" />
					<div class="text-sm font-medium">
						Importing {{ importName.trim() || importManifest?.business_name }}…
					</div>
					<div class="text-xs text-(--ui-text-muted)">
						Restoring the backup — this can take a moment for a large business. Please don't close this window.
					</div>
				</div>
				<div v-else-if="!importManifest" class="text-sm text-(--ui-text-muted)">
					Reading bundle…
				</div>
				<div v-else class="space-y-4">
					<div class="bg-(--ui-bg-muted) border border-(--ui-border) rounded p-3 text-sm space-y-1">
						<div class="flex justify-between gap-3">
							<span class="text-(--ui-text-muted)">Business:</span>
							<span class="font-medium">{{ importManifest.business_name }}</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-(--ui-text-muted)">Exported on:</span>
							<span class="tabular-nums">{{ importManifest.exported_at.replace("T", " ").replace("Z", " UTC") }}</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-(--ui-text-muted)">From app version:</span>
							<span class="tabular-nums">v{{ importManifest.app_version }}</span>
						</div>
					</div>

					<UFormField label="Business name">
						<UInput v-model="importName" :placeholder="importManifest.business_name" />
						<template #help>
							This won't change the data — just what the imported business is called.
						</template>
					</UFormField>

					<UFormField v-if="importManifest.encrypted" label="Backup password" required>
						<PasswordInput v-model="importPassphrase" placeholder="Password this backup was encrypted with" @enter="confirmImport" />
						<template #help>
							This backup is password-protected. Enter the password used when it was exported.
						</template>
					</UFormField>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" :disabled="importing" @click="cancelImport">
						Cancel
					</UButton>
					<UButton :loading="importing" :disabled="!canImport" icon="i-lucide-plus" @click="confirmImport">
						Import
					</UButton>
				</div>
			</template>
		</UModal>

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
					<p class="text-sm text-(--ui-text-muted) mb-4">
						Seeding 18 months of clients, vendors, quotes, invoices,
						bills, vouchers, and payslips at real-business volume.
						This can take a couple of minutes — the dashboard will
						open automatically when it's ready.
					</p>
					<!-- Live stage label so the spinner has context. The seed
						callback updates this every few rows; values like
						"Seeding bills · 425 / 1000" tell the user how far
						along we are without needing a real progress bar. -->
					<div
						v-if="seedingStage"
						class="text-sm tabular-nums font-medium text-(--ui-primary)"
					>
						{{ seedingStage }}<span v-if="seedingTotal > 0"> · {{ seedingDone }} / {{ seedingTotal }}</span>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<script setup lang="ts">
// Welcome / business picker — the app's landing screen when no business
// is active (or when the user navigates here explicitly to switch).

	import type { Tenant } from "~/stores/tenants";
	import { convertFileSrc, invoke } from "@tauri-apps/api/core";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
	// Live progress label fed by the seed callback. Empty string while
	// setting up; cleared when the demo run finishes (we hard-reload
	// before the user sees it anyway).
	const seedingStage = ref("");
	const seedingDone = ref(0);
	const seedingTotal = ref(0);
	const onAddDemo = async () => {
		if (seedingDemo.value) return;
		seedingDemo.value = true;
		seedingStage.value = "";
		seedingDone.value = 0;
		seedingTotal.value = 0;
		try {
			const t = await createDemoBusiness(undefined, (p) => {
				seedingStage.value = p.stage;
				seedingDone.value = p.done;
				seedingTotal.value = p.total;
			});
			toast.add({
				title: `${t.name} created`,
				description: "Sample clients, invoices, bills, and vouchers are ready to explore.",
				color: "success",
				icon: "i-lucide-check"
			});
			window.location.assign("/");
		} catch (err) {
			seedingDemo.value = false;
			seedingStage.value = "";
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

	// ---- Import a backup ----
	// Available from the welcome screen so a backup can be restored even when
	// no business exists (e.g. you removed the one you'd backed up). Always
	// imports as a NEW business; an encrypted bundle prompts for its password.
	interface ExportManifest {
		business_name: string
		exported_at: string
		app_version: string
		encrypted?: boolean
	}

	const showImport = ref(false);
	const importing = ref(false);
	const importPath = ref("");
	const importManifest = ref<ExportManifest | null>(null);
	const importName = ref("");
	const importPassphrase = ref("");

	const canImport = computed(() => {
		if (!importManifest.value || importing.value) return false;
		if (importManifest.value.encrypted && !importPassphrase.value) return false;
		return !!importName.value.trim();
	});

	const cancelImport = () => {
		showImport.value = false;
		importManifest.value = null;
		importPath.value = "";
		importName.value = "";
		importPassphrase.value = "";
	};

	const onImportClick = async () => {
		if (importing.value) return;
		let chosen: string | null = null;
		try {
			const result = await openDialog({
				multiple: false,
				filters: [{ name: "Sakoram backup", extensions: ["zip"] }]
			});
			if (typeof result === "string") chosen = result;
			else if (Array.isArray(result) && result.length > 0) chosen = result[0] ?? null;
		} catch (err) {
			toast.add({ title: "Could not open file picker", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!chosen) return;
		try {
			const manifest = await invoke<ExportManifest>("peek_export_manifest", { inputPath: chosen });
			importPath.value = chosen;
			importManifest.value = manifest;
			importName.value = manifest.business_name;
			importPassphrase.value = "";
			showImport.value = true;
		} catch (err) {
			toast.add({ title: "Couldn't read backup", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const confirmImport = async () => {
		if (!importManifest.value || importing.value || !canImport.value) return;
		importing.value = true;
		try {
			const imported = await invoke<Tenant>("import_tenant_data", {
				inputPath: importPath.value,
				mode: "new",
				targetName: importName.value.trim() || importManifest.value.business_name,
				passphrase: importManifest.value.encrypted ? importPassphrase.value : null
			});
			await tenants.refresh();
			await tenants.activate(imported.id);
			window.location.assign("/");
		} catch (err) {
			importing.value = false;
			toast.add({ title: "Import failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
