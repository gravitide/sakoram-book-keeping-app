<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; form fields stay selectable via the input rule
			in main.css. -->
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Businesses
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Each business has its own database — clients, document numbers, settings, and PDFs are isolated.
				</p>
			</div>
			<div class="flex flex-col items-end gap-2">
				<div class="flex gap-2">
					<UButton
						color="neutral"
						variant="outline"
						icon="i-lucide-sparkles"
						:loading="seedingDemo"
						:disabled="seedingDemo"
						title="Create a new business pre-filled with realistic sample data"
						@click="onAddDemo"
					>
						Add demo business
					</UButton>
					<UButton color="neutral" variant="outline" icon="i-lucide-upload" @click="onImportClick">
						Import
					</UButton>
					<UButton icon="i-lucide-plus" :disabled="!license.canCreateBusiness(tenants.tenants.length)" @click="goWelcome">
						Add business
					</UButton>
				</div>
				<p v-if="!license.canCreateBusiness(tenants.tenants.length)" class="text-xs text-(--ui-text-muted)">
					Basic is limited to 2 businesses — <NuxtLink to="/upgrade?feature=businesses" class="text-(--ui-primary) underline">
						upgrade
					</NuxtLink> for more.
				</p>
			</div>
		</header>

		<UCard>
			<ul class="divide-y divide-(--ui-border)">
				<li
					v-for="t in tenants.tenants"
					:key="t.id"
					class="py-3 flex items-center gap-3"
				>
					<div class="size-10 shrink-0 rounded-md bg-(--ui-bg-muted) border border-(--ui-border) flex items-center justify-center overflow-hidden">
						<img
							v-if="logoSrcs[t.id]"
							:src="logoSrcs[t.id]!"
							:alt="t.name"
							class="max-w-full max-h-full object-contain"
						>
						<UIcon v-else name="i-lucide-building-2" class="size-5 text-(--ui-text-muted)" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="font-medium flex items-center gap-2 flex-wrap">
							<span class="truncate">{{ t.name }}</span>
							<UBadge v-if="t.id === tenants.activeTenantId" color="primary" variant="subtle" size="sm">
								Active
							</UBadge>
						</div>
						<div class="text-xs text-(--ui-text-muted) truncate">
							{{ t.id }}.db
						</div>
					</div>
					<div class="flex gap-1">
						<UButton
							v-if="t.id !== tenants.activeTenantId"
							size="xs"
							variant="ghost"
							icon="i-lucide-log-in"
							:title="`Switch to ${t.name}`"
							@click="onSwitch(t.id)"
						>
							Switch
						</UButton>
						<UButton
							size="xs"
							variant="ghost"
							icon="i-lucide-download"
							:title="`Export ${t.name} as a backup .zip`"
							:loading="exportingId === t.id"
							:disabled="exportingId !== null"
							@click="askExport(t)"
						>
							Export
						</UButton>
						<UButton
							size="xs"
							variant="ghost"
							icon="i-lucide-pencil"
							:title="`Rename ${t.name}`"
							@click="askRename(t)"
						/>
						<UButton
							size="xs"
							variant="ghost"
							color="error"
							icon="i-lucide-trash-2"
							:title="`Delete ${t.name}`"
							@click="askDelete(t)"
						/>
					</div>
				</li>
			</ul>
		</UCard>

		<!-- Rename modal -->
		<UModal v-model:open="showRename" title="Rename business">
			<template #body>
				<UFormField label="Name" required>
					<UInput v-model="renameValue" autofocus @keydown.enter="confirmRename" />
				</UFormField>
				<p class="text-xs text-(--ui-text-muted) mt-2">
					This updates the display name only — the database file ({{ renameTarget?.id }}.db) keeps its current filename.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showRename = false">
						Cancel
					</UButton>
					<UButton :loading="saving" :disabled="!renameValue.trim() || saving" icon="i-lucide-check" @click="confirmRename">
						Save
					</UButton>
				</div>
			</template>
		</UModal>

		<!-- Import modal -->
		<UModal v-model:open="showImport" title="Import a business backup" :dismissible="!importing" :close="!importing">
			<template #body>
				<div v-if="importing" class="py-6 text-center space-y-3">
					<UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-(--ui-primary) mx-auto" />
					<div class="text-sm font-medium">
						{{ importMode === "replace" ? "Overwriting" : "Importing" }} {{ importManifest?.business_name }}…
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

					<UFormField v-if="importManifest.encrypted" label="Backup password" required>
						<PasswordInput v-model="importPassphrase" placeholder="Password this backup was encrypted with" @enter="confirmImport" />
						<template #help>
							This backup is password-protected. Enter the password used when it was exported.
						</template>
					</UFormField>

					<URadioGroup v-model="importMode" :items="importModeOptions" />

					<UFormField v-if="importMode === 'new'" label="Business name">
						<UInput v-model="importNewName" :placeholder="importManifest.business_name" />
						<template #help>
							This won't change the data — just what the new business is called in the app.
						</template>
					</UFormField>

					<UFormField v-if="importMode === 'replace'" label="Replace which business?">
						<USelect
							v-model="importReplaceTargetId"
							:items="replaceTargetOptions"
							value-key="value"
							class="w-full"
						/>
					</UFormField>

					<div v-if="importMode === 'replace'" class="text-sm text-(--ui-error)/90 bg-(--ui-error)/10 border border-(--ui-error)/30 rounded p-3 flex gap-2">
						<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
						<div>
							This <span class="font-semibold">permanently overwrites</span> the target's clients, quotes, invoices, bills, vouchers, settings, and document number sequences. There's no undo.
						</div>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" :disabled="importing" @click="cancelImport">
						Cancel
					</UButton>
					<UButton
						:loading="importing"
						:disabled="!canImport"
						:icon="importMode === 'new' ? 'i-lucide-plus' : 'i-lucide-replace'"
						:color="importMode === 'replace' ? 'error' : 'primary'"
						@click="confirmImport"
					>
						{{ importMode === "new" ? "Import as new" : "Overwrite" }}
					</UButton>
				</div>
			</template>
		</UModal>

		<!-- Export options -->
		<UModal v-model:open="showExportOptions" :title="`Export ${exportTarget?.name ?? ''}`">
			<template #body>
				<div class="space-y-4">
					<UCheckbox v-model="exportEncrypt" label="Encrypt this backup with a password" />

					<template v-if="exportEncrypt">
						<UFormField label="Backup password" required>
							<PasswordInput v-model="exportPw" placeholder="Choose a password for this file" />
						</UFormField>
						<UFormField label="Confirm password" required :error="exportPwMismatch ? 'Passwords don\'t match' : undefined">
							<PasswordInput v-model="exportPw2" placeholder="Re-enter the password" @enter="confirmExport" />
						</UFormField>
						<p class="text-xs text-(--ui-text-muted)">
							You'll need this password to import the backup. There's no recovery — if you forget it, just export again.
						</p>
					</template>

					<div
						v-else-if="exportTarget?.encrypted"
						class="text-sm text-(--ui-warning) bg-(--ui-warning)/10 border border-(--ui-warning)/30 rounded p-3 flex gap-2"
					>
						<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
						<span>
							This business is encrypted, but the backup will <span class="font-semibold">not</span> be —
							anyone with the file could read its data. Add a password unless you have a reason not to.
						</span>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showExportOptions = false">
						Cancel
					</UButton>
					<UButton
						icon="i-lucide-download"
						:disabled="exportEncrypt && (!exportPw || exportPwMismatch)"
						@click="confirmExport"
					>
						Export
					</UButton>
				</div>
			</template>
		</UModal>

		<!-- Delete modal -->
		<UModal v-model:open="showDelete" :title="`Delete ${deleteTarget?.name ?? ''}?`">
			<template #body>
				<p class="text-sm text-(--ui-text-muted)">
					This <span class="font-semibold text-(--ui-error)">permanently deletes</span> the database for
					<span class="font-medium text-(--ui-text)">{{ deleteTarget?.name }}</span> — all its clients, quotes, invoices, bills, vouchers, and settings. This cannot be undone.
				</p>
				<div
					v-if="deleteTarget?.id === tenants.activeTenantId"
					class="text-sm text-(--ui-error)/90 bg-(--ui-error)/10 border border-(--ui-error)/30 rounded p-3 mt-3 flex gap-2"
				>
					<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
					<div>
						This is the <span class="font-semibold">active business</span>. After deleting, you'll be returned to the welcome screen to pick or create another.
					</div>
				</div>
				<p class="text-sm text-(--ui-text-muted) mt-3">
					Type the business name to confirm — click it to copy:
				</p>
				<button
					type="button"
					class="mt-1 inline-flex items-center gap-2 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-2.5 py-1 font-mono text-sm text-(--ui-text) select-text hover:border-(--ui-primary) transition cursor-pointer"
					:title="`Copy “${deleteTarget?.name}”`"
					@click="copyDeleteName"
				>
					{{ deleteTarget?.name }}
					<UIcon
						:name="deleteNameCopied ? 'i-lucide-check' : 'i-lucide-copy'"
						class="size-3.5 shrink-0"
						:class="deleteNameCopied ? 'text-(--ui-success)' : 'text-(--ui-text-muted)'"
					/>
				</button>
				<UInput v-model="deleteConfirmText" :placeholder="deleteTarget?.name" autofocus class="mt-2" />
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDelete = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						icon="i-lucide-trash-2"
						:loading="saving"
						:disabled="deleteConfirmText.trim() !== deleteTarget?.name || saving"
						@click="confirmDelete"
					>
						Delete forever
					</UButton>
				</div>
			</template>
		</UModal>

		<!-- Full-screen progress overlay during demo seeding. Matches the
			welcome page's pattern — the seed can run for 2-3 minutes at
			real-business volume so a frozen "Loading" spinner would
			be misleading. -->
		<Teleport to="body">
			<div
				v-if="seedingDemo"
				class="fixed inset-0 z-40 flex items-center justify-center bg-(--ui-bg-muted)/95 backdrop-blur-sm"
			>
				<div class="text-center max-w-md px-6">
					<UIcon
						name="i-lucide-loader-circle"
						class="size-10 animate-spin text-(--ui-primary) mx-auto mb-4"
					/>
					<h2 class="text-xl font-semibold mb-2">
						Setting up your demo business
					</h2>
					<p class="text-sm text-(--ui-text-muted) mb-4">
						Seeding 18 months of data at real-business volume — this can take a couple of minutes.
					</p>
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
// Manage businesses (tenants). Add lives on /welcome (so the existing
// onboarding flow handles the empty-state path); rename and delete are
// handled here. Switching is also offered as a per-row "Switch" button
// for completeness, but most users will use the sidebar dropdown.

	import type { Tenant } from "~/stores/tenants";
	import { convertFileSrc, invoke } from "@tauri-apps/api/core";
	import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
	import { createDemoBusiness } from "~/lib/demo-seed";
	import { useLicenseStore } from "~/stores/license";
	import { useTenantsStore } from "~/stores/tenants";

	interface ExportManifest {
		format: string
		format_version: number
		schema_version: number
		app_version: string
		exported_at: string
		business_name: string
		tenant_id: string
		logo_asset: string | null
		encrypted?: boolean
	}

	definePageMeta({ title: "Businesses" });

	const tenants = useTenantsStore();
	const license = useLicenseStore();
	const router = useRouter();
	const toast = useToast();
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	await tenants.ensureLoaded();

	const logoSrcs = ref<Record<string, string | null>>({});
	const refreshLogos = async () => {
		for (const t of tenants.tenants) {
			if (!t.logo_file) {
				logoSrcs.value[t.id] = null;
				continue;
			}
			const path = await tenants.logoPath(t.id);
			logoSrcs.value[t.id] = path ? convertFileSrc(path) : null;
		}
	};
	onMounted(refreshLogos);

	const goWelcome = async () => {
		if (!license.canCreateBusiness(tenants.tenants.length)) {
			await navigateTo("/upgrade?feature=businesses");
			return;
		}
		router.push("/welcome");
	};

	// ---- Add demo business ----
	// Spins up a fresh tenant pre-loaded with ~18 months of clients,
	// vendors, quotes, invoices, bills, vouchers, payslips, and a
	// handful of attachments at real-business volume so the user has
	// something concrete to demo / explore. Hard-reloads on success
	// so every store re-hydrates against the new DB. The progress
	// overlay drives off these three refs — kept in lock-step with
	// the welcome page so both entry points look the same.
	const seedingDemo = ref(false);
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
				description: "Sample data ready to explore.",
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

	// ---- Switch ----
	const onSwitch = async (id: string) => {
		try {
			await tenants.activate(id);
			window.location.assign("/");
		} catch (err) {
			toast.add({
				title: "Could not switch business",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// ---- Rename ----
	const showRename = ref(false);
	const renameTarget = ref<Tenant | null>(null);
	const renameValue = ref("");
	const saving = ref(false);

	const askRename = (t: Tenant) => {
		renameTarget.value = t;
		renameValue.value = t.name;
		showRename.value = true;
	};

	const confirmRename = async () => {
		const t = renameTarget.value;
		const name = renameValue.value.trim();
		if (!t || !name || saving.value) return;
		saving.value = true;
		try {
			await tenants.rename(t.id, name);
			toast.add({ title: "Business renamed", color: "success", icon: "i-lucide-check" });
			showRename.value = false;
		} catch (err) {
			toast.add({
				title: "Rename failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	// ---- Delete ----
	const showDelete = ref(false);
	const deleteTarget = ref<Tenant | null>(null);
	const deleteConfirmText = ref("");
	const deleteNameCopied = ref(false);

	const askDelete = (t: Tenant) => {
		deleteTarget.value = t;
		deleteConfirmText.value = "";
		deleteNameCopied.value = false;
		showDelete.value = true;
	};

	// Click-to-copy the exact business name so the user can paste it into the
	// confirm field (the page is select-none, so plain selection is awkward).
	const copyDeleteName = async () => {
		const name = deleteTarget.value?.name;
		if (!name) return;
		try {
			await navigator.clipboard.writeText(name);
			deleteNameCopied.value = true;
			setTimeout(() => {
				deleteNameCopied.value = false;
			}, 1500);
		} catch {
			// Clipboard blocked — the chip is select-text, so manual copy works.
		}
	};

	const confirmDelete = async () => {
		const t = deleteTarget.value;
		if (!t || saving.value) return;
		if (deleteConfirmText.value.trim() !== t.name) return;
		const wasActive = t.id === tenants.activeTenantId;
		saving.value = true;
		try {
			await tenants.remove(t.id);
			toast.add({ title: `${t.name} deleted`, color: "info", icon: "i-lucide-trash-2" });
			showDelete.value = false;
			// Active business gone → hard-reload so the global tenant
			// middleware redirects to /welcome and every Pinia store
			// drops its in-memory state from the now-deleted DB.
			if (wasActive) {
				window.location.assign("/");
			}
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	// ---- Export options (encryption) ----
	const showExportOptions = ref(false);
	const exportTarget = ref<Tenant | null>(null);
	const exportEncrypt = ref(false);
	const exportPw = ref("");
	const exportPw2 = ref("");
	const exportPwMismatch = computed(() => !!exportPw2.value && exportPw.value !== exportPw2.value);

	const askExport = (t: Tenant) => {
		exportTarget.value = t;
		// Default ON for an encrypted business; the warning nudges them to keep it.
		exportEncrypt.value = !!t.encrypted;
		exportPw.value = "";
		exportPw2.value = "";
		showExportOptions.value = true;
	};

	const exportingId = ref<string | null>(null);

	const confirmExport = async () => {
		const t = exportTarget.value;
		if (!t) return;
		if (exportEncrypt.value && (!exportPw.value || exportPwMismatch.value)) return;
		showExportOptions.value = false;

		const suffix = exportEncrypt.value ? "-encrypted" : "";
		const defaultName = `${t.id}-backup-${new Date().toISOString().slice(0, 10)}${suffix}.zip`;
		let chosen: string | null = null;
		try {
			chosen = await saveDialog({
				defaultPath: defaultName,
				filters: [{ name: "Sakoram backup", extensions: ["zip"] }]
			});
		} catch (err) {
			toast.add({ title: "Could not open save dialog", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!chosen) return;

		exportingId.value = t.id;
		try {
			await invoke("export_tenant_data", { tenantId: t.id, outputPath: chosen, encrypt: exportEncrypt.value, passphrase: exportEncrypt.value ? exportPw.value : null });
			toast.add({ title: `Exported ${t.name}`, description: chosen, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Export failed", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			exportingId.value = null;
		}
	};

	// ---- Import ----
	const showImport = ref(false);
	const importing = ref(false);
	const importPath = ref<string>("");
	const importManifest = ref<ExportManifest | null>(null);
	const importMode = ref<"new" | "replace">("new");
	const importNewName = ref("");
	const importReplaceTargetId = ref<string>("");

	const importPassphrase = ref("");

	const importModeOptions = [
		{ value: "new", label: "Import as a new business (recommended)" },
		{ value: "replace", label: "Replace an existing business" }
	];

	const replaceTargetOptions = computed(() =>
		tenants.tenants.map((t) => ({ value: t.id, label: t.name }))
	);

	const canImport = computed(() => {
		if (!importManifest.value || importing.value) return false;
		if (importManifest.value.encrypted && !importPassphrase.value) return false;
		if (importMode.value === "new") return true;
		return !!importReplaceTargetId.value;
	});

	const cancelImport = () => {
		showImport.value = false;
		importManifest.value = null;
		importPath.value = "";
		importNewName.value = "";
		importReplaceTargetId.value = "";
		importPassphrase.value = "";
		importing.value = false;
	};

	const onImportClick = async () => {
		let chosen: string | null = null;
		try {
			const result = await openDialog({
				multiple: false,
				filters: [{ name: "Sakoram backup", extensions: ["zip"] }]
			});
			if (typeof result === "string") chosen = result;
			else if (Array.isArray(result) && result.length > 0) chosen = result[0] ?? null;
		} catch (err) {
			toast.add({
				title: "Could not open file picker",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		if (!chosen) return;

		// Peek the manifest first so we can show the user what they're about
		// to import (and surface a friendly error for incompatible bundles).
		try {
			const manifest = await invoke<ExportManifest>("peek_export_manifest", { inputPath: chosen });
			importPath.value = chosen;
			importManifest.value = manifest;
			importNewName.value = manifest.business_name;
			importMode.value = "new";
			importReplaceTargetId.value = "";
			importPassphrase.value = "";
			// Start a fresh import flow — never inherit a stale "importing"
			// flag from a previous restore that was navigated away from.
			importing.value = false;
			showImport.value = true;
		} catch (err) {
			toast.add({
				title: "Couldn't read backup",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const confirmImport = async () => {
		if (!importManifest.value || importing.value) return;
		importing.value = true;
		try {
			const args: Record<string, unknown> = {
				inputPath: importPath.value,
				mode: importMode.value,
				passphrase: importManifest.value.encrypted ? importPassphrase.value : null
			};
			if (importMode.value === "new") {
				const name = importNewName.value.trim() || importManifest.value.business_name;
				args.targetName = name;
			} else {
				args.targetTenantId = importReplaceTargetId.value;
			}
			const imported = await invoke<Tenant>("import_tenant_data", args);

			// Refresh registry + logos after either flow.
			await tenants.refresh();
			await refreshLogos();

			showImport.value = false;
			importPassphrase.value = "";
			toast.add({
				title: importMode.value === "new" ? "Business imported" : "Business overwritten",
				description: imported.name,
				color: "success",
				icon: "i-lucide-check"
			});

			// If we replaced the active business, hard-reload so every
			// store re-hydrates against the freshly-restored DB.
			if (importMode.value === "replace" && imported.id === tenants.activeTenantId) {
				window.location.assign("/");
			}
		} catch (err) {
			toast.add({
				title: "Import failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			importing.value = false;
		}
	};
</script>
