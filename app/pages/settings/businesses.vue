<template>
	<div>
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Businesses
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Each business has its own database — clients, document numbers, settings, and PDFs are isolated.
				</p>
			</div>
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
				<UButton icon="i-lucide-plus" @click="goWelcome">
					Add business
				</UButton>
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
							@click="onExport(t)"
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
		<UModal v-model:open="showImport" title="Import a business backup">
			<template #body>
				<div v-if="!importManifest" class="text-sm text-(--ui-text-muted)">
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
					<UButton color="neutral" variant="outline" @click="cancelImport">
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
					Type <span class="font-mono text-(--ui-text)">{{ deleteTarget?.name }}</span> to confirm:
				</p>
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
	}

	definePageMeta({ title: "Businesses" });

	const tenants = useTenantsStore();
	const router = useRouter();
	const toast = useToast();

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

	const goWelcome = () => router.push("/welcome");

	// ---- Add demo business ----
	// Spins up a fresh tenant pre-loaded with sample clients, vendors,
	// quotes, invoices, bills, and vouchers so the user has something
	// concrete to demo / explore. Hard-reloads on success so every
	// store re-hydrates against the new DB.
	const seedingDemo = ref(false);
	const onAddDemo = async () => {
		if (seedingDemo.value) return;
		seedingDemo.value = true;
		try {
			const t = await createDemoBusiness();
			toast.add({
				title: `${t.name} created`,
				description: "Sample data ready to explore.",
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

	const askDelete = (t: Tenant) => {
		deleteTarget.value = t;
		deleteConfirmText.value = "";
		showDelete.value = true;
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

	// ---- Export ----
	const exportingId = ref<string | null>(null);

	const onExport = async (t: Tenant) => {
		if (exportingId.value) return;
		const defaultName = `${t.id}-backup-${new Date().toISOString().slice(0, 10)}.zip`;
		let chosen: string | null = null;
		try {
			chosen = await saveDialog({
				defaultPath: defaultName,
				filters: [{ name: "Sakoram backup", extensions: ["zip"] }]
			});
		} catch (err) {
			toast.add({
				title: "Could not open save dialog",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		if (!chosen) return;

		exportingId.value = t.id;
		try {
			await invoke("export_tenant_data", { tenantId: t.id, outputPath: chosen });
			toast.add({
				title: `Exported ${t.name}`,
				description: chosen,
				color: "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			toast.add({
				title: "Export failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
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

	const importModeOptions = [
		{ value: "new", label: "Import as a new business (recommended)" },
		{ value: "replace", label: "Replace an existing business" }
	];

	const replaceTargetOptions = computed(() =>
		tenants.tenants.map((t) => ({ value: t.id, label: t.name }))
	);

	const canImport = computed(() => {
		if (!importManifest.value || importing.value) return false;
		if (importMode.value === "new") return true;
		return !!importReplaceTargetId.value;
	});

	const cancelImport = () => {
		showImport.value = false;
		importManifest.value = null;
		importPath.value = "";
		importNewName.value = "";
		importReplaceTargetId.value = "";
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
				mode: importMode.value
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
