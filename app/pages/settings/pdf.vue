<template>
	<div>
		<!-- Same narrow-and-centered shape as Settings → Appearance: this
			page only has a handful of inputs and would look stretched at
			the wider main-content width the data tables use. -->
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				PDF
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Header logo and footer notes printed on every generated quote, invoice, bill, and voucher.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-2xl mx-auto"
			@submit="onSubmit"
		>
			<SectionCard
				icon="i-lucide-type"
				title="Font"
				subtitle="Used when rendering quotes, invoices, bills, and vouchers. Pick a bundled font for guaranteed availability — Typst falls back to Inter if it can't resolve your choice."
			>
				<UFormField label="Font family" name="pdf_font">
					<UInput v-model="form.pdf_font" placeholder="e.g. Inter" />
				</UFormField>

				<div>
					<div class="text-xs text-(--ui-text-muted) mb-2">
						Bundled fonts:
					</div>
					<div class="flex flex-wrap gap-2">
						<UButton
							v-for="suggestion in bundledFonts"
							:key="suggestion"
							size="xs"
							variant="soft"
							color="primary"
							@click="form.pdf_font = suggestion"
						>
							{{ suggestion }}
						</UButton>
					</div>
				</div>

				<div class="p-4 border border-(--ui-border) rounded-md bg-(--ui-bg-muted)">
					<div class="text-xs text-(--ui-text-muted) uppercase tracking-wide mb-2">
						Preview (the PDF pulls the same TTF, so it'll look identical)
					</div>
					<div :style="{ fontFamily: pdfPreviewFontStack }" class="space-y-1">
						<div class="text-2xl font-semibold">
							INVOICE INV-2026-0042
						</div>
						<div class="text-sm tabular-nums">
							Total: 12,345.00 — due 2026-06-15
						</div>
					</div>
				</div>
			</SectionCard>

			<div class="mt-6">
				<SectionCard
					icon="i-lucide-image"
					title="Header logo"
					subtitle="Letterhead-style PNG, JPG, or SVG. Different from the square Company logo, which is only used in the sidebar."
				>
					<div class="flex flex-col sm:flex-row sm:items-center gap-4">
						<div
							class="group relative h-28 w-80 shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition cursor-pointer"
							:class="[
								pdfLogoDragOver
									? 'border-(--ui-primary) bg-(--ui-primary)/5 scale-[1.01]'
									: 'border-(--ui-border) bg-(--ui-bg-muted) hover:border-(--ui-primary)/60'
							]"
							role="button"
							tabindex="0"
							aria-label="Upload PDF header logo"
							@click="pickPdfLogo"
							@keydown.enter.prevent="pickPdfLogo"
							@keydown.space.prevent="pickPdfLogo"
							@dragover.prevent="pdfLogoDragOver = true"
							@dragenter.prevent="pdfLogoDragOver = true"
							@dragleave.prevent="pdfLogoDragOver = false"
							@drop.prevent="onPdfLogoDrop"
						>
							<input
								ref="pdfLogoInput"
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								class="hidden"
								@change="onPdfLogoFileChange"
							>
							<img
								v-if="store.pdfHeaderLogoSrc"
								:src="store.pdfHeaderLogoSrc"
								alt="PDF header logo"
								class="max-w-full max-h-full object-contain p-3"
							>
							<div v-else class="flex flex-col items-center gap-1 text-(--ui-text-muted)">
								<UIcon name="i-lucide-image-up" class="size-7" />
								<div class="text-[10px] uppercase tracking-wider">
									Drop wide logo
								</div>
							</div>
							<div
								v-if="store.pdfHeaderLogoSrc"
								class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
							>
								<UIcon name="i-lucide-upload" class="size-5 text-white" />
								<span class="text-[10px] uppercase tracking-wider text-white">
									Replace
								</span>
							</div>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<UButton
								v-if="store.settings?.pdf_header_logo_path"
								icon="i-lucide-trash-2"
								size="xs"
								variant="ghost"
								color="neutral"
								@click="removePdfLogo"
							>
								Remove
							</UButton>
							<UButton
								v-else
								icon="i-lucide-upload"
								size="xs"
								variant="soft"
								@click="pickPdfLogo"
							>
								Upload header
							</UButton>
							<span v-if="pdfLogoFileName" class="text-xs text-(--ui-text-muted) truncate">
								{{ pdfLogoFileName }}
							</span>
						</div>
					</div>
				</SectionCard>
			</div>

			<div class="mt-6">
				<SectionCard
					icon="i-lucide-file-text"
					title="Footer notes"
					subtitle="Appended at the bottom of generated documents — payment instructions, thanks, fine print."
				>
					<!-- Stacked vertically instead of side-by-side: at the
						narrower max-w-2xl page width a two-column textarea
						grid is too cramped. The two fields rarely need to be
						compared at a glance, so a single column reads cleaner. -->
					<UFormField label="Invoice footer" name="invoice_footer_notes">
						<UTextarea v-model="form.invoice_footer_notes" :rows="5" autoresize class="w-full" />
					</UFormField>
					<UFormField label="Quote footer" name="quote_footer_notes">
						<UTextarea v-model="form.quote_footer_notes" :rows="5" autoresize class="w-full" />
					</UFormField>
				</SectionCard>
			</div>

			<!-- Sticky save bar — same shape as the one on /settings/company.
				Only appears when textarea contents differ from the loaded
				settings; logo upload/remove writes immediately so the user
				doesn't have to chase a save button afterwards. -->
			<div
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="store.saving || !dirty"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="store.saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							Save changes
						</UButton>
					</div>
				</div>
			</div>
		</UForm>
	</div>
</template>

<script setup lang="ts">
	import type { SettingsUpdate } from "~/stores/settings";
	import { appDataDir, join } from "@tauri-apps/api/path";
	import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Only the PDF-flavoured fields live on this page. Logo paths are kept on
	// the form so dirty-tracking can spot a removal/upload that would otherwise
	// only mutate the store.
	type PdfForm = Pick<SettingsUpdate, "invoice_footer_notes" | "quote_footer_notes" | "pdf_header_logo_path" | "pdf_font">;

	const form = reactive<PdfForm>({
		invoice_footer_notes: "",
		quote_footer_notes: "",
		pdf_header_logo_path: null,
		pdf_font: "Inter"
	});

	// Same curated list the Appearance page used. The Typst template falls
	// through these for any missing glyph; free-text input lets the user pick
	// any face installed on their machine, but only the bundled five are
	// guaranteed to render identically across machines.
	const bundledFonts = ["Inter", "Inter Tight", "Stack Sans Text", "Miriam Libre", "Amarna"];

	const pdfPreviewFontStack = computed(() =>
		`'${form.pdf_font || "Inter"}', 'Inter', serif`
	);

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.invoice_footer_notes = s.invoice_footer_notes ?? "";
		form.quote_footer_notes = s.quote_footer_notes ?? "";
		form.pdf_header_logo_path = s.pdf_header_logo_path;
		form.pdf_font = s.pdf_font || "Inter";
	};

	await store.ensureLoaded();
	hydrate();

	// Dirty tracking via JSON snapshot. Same shape as company.vue.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const onSubmit = async () => {
		try {
			await store.save({
				invoice_footer_notes: form.invoice_footer_notes,
				quote_footer_notes: form.quote_footer_notes,
				pdf_font: form.pdf_font.trim() || "Inter"
			});
			refreshBaseline();
			toast.add({ title: "PDF settings saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onDiscard = () => {
		hydrate();
		refreshBaseline();
		toast.add({
			title: "Changes discarded",
			color: "info",
			icon: "i-lucide-rotate-ccw"
		});
	};

	// ----- PDF header logo handling --------------------------------------------
	// Writes into pdf-headers/ under app data so the wide image doesn't stomp
	// the square identity logo in logos/. Crucially we do NOT touch
	// tenants.json — that registry is only for the sidebar / tenant switcher,
	// which uses the identity logo.

	const pdfLogoInput = useTemplateRef<HTMLInputElement>("pdfLogoInput");
	const pdfLogoDragOver = ref(false);
	const pickPdfLogo = () => pdfLogoInput.value?.click();

	const pdfLogoFileName = computed(() => {
		const p = store.settings?.pdf_header_logo_path;
		if (!p) return null;
		return p.split(/[\\/]/).pop() ?? p;
	});

	const uploadPdfLogo = async (file: File) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const appData = await appDataDir();
			const dir = await join(appData, "pdf-headers");
			await mkdir(dir, { recursive: true }).catch(() => { /* already exists */ });
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
			const fileName = `${tenantId}.${ext}`;
			const target = await join(dir, fileName);
			await writeFile(target, bytes);
			await store.save({ pdf_header_logo_path: target });
			form.pdf_header_logo_path = target;
			refreshBaseline();
			toast.add({ title: "PDF header updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "PDF header upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onPdfLogoFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await uploadPdfLogo(file);
	};

	const onPdfLogoDrop = async (event: DragEvent) => {
		pdfLogoDragOver.value = false;
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.add({
				title: "Only image files are accepted",
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		await uploadPdfLogo(file);
	};

	const removePdfLogo = async () => {
		await store.save({ pdf_header_logo_path: null });
		form.pdf_header_logo_path = null;
		refreshBaseline();
		toast.add({ title: "PDF header removed", color: "info", icon: "i-lucide-image-off" });
	};
</script>
