<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; form fields stay selectable via the input rule
			in main.css. -->
		<header class="mb-6 max-w-5xl mx-auto">
			<h1 class="text-2xl font-semibold">
				PDF
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Font, colour, header logo, and templates for your generated PDFs.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<!-- Layout: Font + Header logo sit side by side on top (both are
				compact), then Footer notes and Document protection each span
				the full width below — those have wider content (textareas, a
				password field + a row of toggles) that reads better wide.
				items-start keeps the top row from stretching to equal height. -->
			<div class="space-y-6">
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
					<div id="font" class="scroll-mt-6">
						<SectionCard
							icon="i-lucide-type"
							title="Font"
							subtitle="Used for every PDF this app generates. All fonts here are bundled with the app, so your documents look identical on any machine."
						>
							<UFormField label="Font family" name="pdf_font">
								<USelectMenu
									v-model="form.pdf_font"
									:items="fontOptions"
									value-key="value"
									label-key="label"
									icon="i-lucide-type"
									class="w-full"
									:search-input="{ placeholder: 'Search fonts…' }"
								>
									<template #item-label="{ item }">
										<span :style="{ fontFamily: `'${item.value}', ${item.mono ? 'monospace' : 'sans-serif'}` }">
											{{ item.label }}
										</span>
									</template>
								</USelectMenu>
							</UFormField>

							<div class="p-4 border border-(--ui-border) rounded-md bg-(--ui-bg-muted)">
								<div class="text-xs text-(--ui-text-muted) uppercase tracking-wide mb-2">
									Preview
								</div>
								<!-- Heading, body prose, and a figures row — the three things a
									document font has to get right. Figures use tabular-nums
									because money columns have to align in the PDF. -->
								<div :style="{ fontFamily: pdfPreviewFontStack }" class="space-y-1.5">
									<div class="text-2xl font-semibold">
										INVOICE INV-2026-0042
									</div>
									<div class="text-sm">
										Payment is due within 30 days of the invoice date.
									</div>
									<div class="text-sm tabular-nums">
										Subtotal 10,500.00 · VAT 1,845.00 · Total 12,345.00
									</div>
								</div>
							</div>
						</SectionCard>
					</div>

					<div id="header-logo" class="scroll-mt-6">
						<SectionCard
							icon="i-lucide-image"
							title="Header logo"
							subtitle="Letterhead-style PNG, JPG, or SVG. Different from the square Company logo, which is only used in the sidebar."
						>
							<div class="flex flex-col gap-3">
								<div
									class="group relative h-28 w-full rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition cursor-pointer"
									:class="[
										pdfLogoDragOver
											? 'border-(--ui-primary) bg-(--ui-primary)/5 scale-[1.01]'
											: 'border-(--ui-border-accented) bg-(--ui-bg-muted) hover:border-(--ui-primary)/60'
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
				</div>

				<div id="color" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-palette"
						title="Colour"
						subtitle="The accent used for the header rule and highlights on your generated PDFs. Independent of the app's theme colour — set it here to print, say, red invoices from a green app."
					>
						<div class="grid grid-cols-4 sm:grid-cols-8 gap-3">
							<button
								v-for="c in colors"
								:key="c.value"
								type="button"
								class="group flex flex-col items-center gap-1.5"
								:title="c.label"
								@click="form.pdf_theme_color = c.value"
							>
								<span
									class="size-10 rounded-full border-2 transition"
									:class="form.pdf_theme_color === c.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) group-hover:border-(--ui-text-muted)'"
									:style="{ backgroundColor: c.hex }"
								/>
								<span class="text-xs" :class="form.pdf_theme_color === c.value ? 'text-(--ui-text) font-medium' : 'text-(--ui-text-muted)'">
									{{ c.label }}
								</span>
							</button>
						</div>
					</SectionCard>
				</div>

				<div id="templates" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-layout-template"
						title="Templates"
						subtitle="Pick one layout for your quote, invoice, bill, and payslip PDFs. Your theme colour, font, and header logo apply to every template — only the layout changes."
					>
						<FeatureLock
							v-if="!entitledToTemplates"
							title="PDF templates"
							tier-label="Plus"
							feature="pdf_templates"
						/>

						<div>
							<div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
								<div class="text-sm font-medium">
									PDF template
								</div>
								<div class="flex items-center gap-2">
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="invoicePreview.state.rendering"
										@click="invoicePreview.open()"
									>
										Invoice
									</UButton>
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="quotePreview.state.rendering"
										@click="quotePreview.open()"
									>
										Quote
									</UButton>
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="payslipPreview.state.rendering"
										@click="payslipPreview.open()"
									>
										Payslip
									</UButton>
								</div>
							</div>
							<div class="grid grid-cols-5 gap-3">
								<button
									v-for="t in TEMPLATES"
									:key="t.key"
									type="button"
									:disabled="!canPick(t.key)"
									:title="t.description"
									class="p-2 rounded-md border text-left transition"
									:class="[
										form.pdf_template === t.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)',
										canPick(t.key) ? 'cursor-pointer hover:border-(--ui-primary)/50' : 'opacity-50 cursor-not-allowed'
									]"
									@click="form.pdf_template = t.key"
								>
									<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
										<PdfTemplateThumb :template-key="t.key" :color="themeColor" />
									</div>
									<div class="text-xs font-medium flex items-center gap-1">
										{{ t.label }}
										<UIcon v-if="!canPick(t.key)" name="i-lucide-lock" class="size-3 text-(--ui-text-muted)" />
									</div>
								</button>
							</div>
						</div>
					</SectionCard>
				</div>

				<!-- Not a SectionCard: this is a signpost to the Security page, not a
					setting you change here. A compact row keeps it from reading as
					another block of PDF configuration. -->
				<div class="flex items-center gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3">
					<UIcon name="i-lucide-shield-check" class="size-5 text-(--ui-text-muted) shrink-0" />
					<div class="text-sm min-w-0 flex-1">
						<span class="font-medium">Document protection</span>
						<span class="text-(--ui-text-muted)"> — password-protect generated PDFs against editing and copying.</span>
					</div>
					<UButton
						to="/settings/security#pdf-protection"
						variant="soft"
						trailing-icon="i-lucide-arrow-right"
						size="xs"
						class="shrink-0"
					>
						Open
					</UButton>
				</div>
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

		<PdfPreviewModal
			v-model:open="invoicePreview.state.open"
			:asset-url="invoicePreview.state.assetUrl"
			:temp-path="invoicePreview.state.tempPath"
			:suggested-file-name="invoicePreview.state.suggestedFileName"
			:saving="invoicePreview.state.saving"
			title="Invoice template preview"
			@save="invoicePreview.onSave"
			@cancel="invoicePreview.onCancel"
		/>
		<PdfPreviewModal
			v-model:open="quotePreview.state.open"
			:asset-url="quotePreview.state.assetUrl"
			:temp-path="quotePreview.state.tempPath"
			:suggested-file-name="quotePreview.state.suggestedFileName"
			:saving="quotePreview.state.saving"
			title="Quote template preview"
			@save="quotePreview.onSave"
			@cancel="quotePreview.onCancel"
		/>
		<PdfPreviewModal
			v-model:open="payslipPreview.state.open"
			:asset-url="payslipPreview.state.assetUrl"
			:temp-path="payslipPreview.state.tempPath"
			:suggested-file-name="payslipPreview.state.suggestedFileName"
			:saving="payslipPreview.state.saving"
			title="Payslip template preview"
			@save="payslipPreview.onSave"
			@cancel="payslipPreview.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { SettingsUpdate } from "~/stores/settings";
	import { invoke } from "@tauri-apps/api/core";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { PDF_TEMPLATES } from "~/lib/pdf-templates";
	import { sampleInvoicePayload, samplePayslipPayload, sampleQuotePayload } from "~/lib/sample-pdf";
	import { THEME_COLORS, themeHex } from "~/lib/theme";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Only the PDF-flavoured fields live on this page. Logo paths are kept on
	// the form so dirty-tracking can spot a removal/upload that would otherwise
	// only mutate the store. (Document protection moved to /settings/security.)
	type PdfForm = Pick<SettingsUpdate, "pdf_header_logo_path" | "pdf_font" | "pdf_theme_color" | "pdf_template">;

	const form = reactive<PdfForm>({
		pdf_header_logo_path: null,
		pdf_font: "Akt",
		pdf_theme_color: "green",
		pdf_template: "classic"
	});

	// PDF templates are a Plus feature. Basic users see the pickers but can
	// only select Classic; rendering also forces Classic when not entitled.
	const license = useLicenseStore();
	const entitledToTemplates = computed(() => license.hasFeature("pdf_templates"));
	const currency = useActiveCurrency();
	const TEMPLATES = PDF_TEMPLATES;
	const canPick = (key: string) => entitledToTemplates.value || key === "classic";
	const colors = THEME_COLORS;
	// Accent colour for the schematic thumbnails — tracks the live (unsaved)
	// PDF colour selection so picking a swatch updates the previews instantly.
	const themeColor = computed(() => themeHex(form.pdf_theme_color));

	// Live preview: render a sample invoice / quote with the currently-selected
	// template through the real Typst pipeline (PdfPreviewModal).
	const invoicePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => sampleInvoicePayload(store.settings, currency.value, form.pdf_template),
		fileName: () => "sample-invoice.pdf",
		title: "Invoice template preview"
	});
	const quotePreview = usePdfPreview({
		command: "export_quote_pdf",
		buildPayload: () => sampleQuotePayload(store.settings, currency.value, form.pdf_template),
		fileName: () => "sample-quote.pdf",
		title: "Quote template preview"
	});
	const payslipPreview = usePdfPreview({
		command: "export_payslip_pdf",
		buildPayload: () => samplePayslipPayload(store.settings, currency.value, form.pdf_template),
		fileName: () => "sample-payslip.pdf",
		title: "Payslip template preview"
	});

	// Same curated list the Appearance page used. The Typst template falls
	// through these for any missing glyph; free-text input lets the user pick
	// any face installed on their machine, but only the bundled faces are
	// guaranteed to render identically across machines. Iosevka Charon Mono
	// is the bundled monospace (good for figure-aligned numbers).
	// Grouped options for the font dropdown. NuxtUI 4 renders an array of
	// arrays as separate ComboboxGroups, and `type: "label"` rows as inert
	// group headings (they're excluded from filtering and selection).
	//
	// A stored pdf_font that isn't bundled — from back when this was a
	// free-text field — is preserved as its own "(custom)" group so that
	// opening this page never silently rewrites someone's PDF typeface.
	// Once they pick a bundled face, the custom row disappears.
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[
				{ type: "label", label: "Bundled" },
				...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name, mono: false }))
			],
			[
				{ type: "label", label: "Monospaced" },
				...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name, mono: true }))
			]
		];
		const current = form.pdf_font;
		if (current && !isBundledFont(current)) {
			groups.push([
				{ type: "label", label: "Not bundled" },
				{ label: `${current} (custom)`, value: current, mono: false }
			]);
		}
		return groups;
	});

	const pdfPreviewFontStack = computed(() =>
		`'${form.pdf_font || "Akt"}', 'Akt', 'Inter', serif`
	);

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.pdf_header_logo_path = s.pdf_header_logo_path;
		form.pdf_font = s.pdf_font || "Akt";
		// Fall back to the UI theme colour for businesses that predate the
		// split (0039 seeds it, but a defensive fallback keeps a null safe).
		form.pdf_theme_color = s.pdf_theme_color ?? s.theme_color ?? "green";
		form.pdf_template = s.pdf_template || "classic";
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
				pdf_font: form.pdf_font.trim() || "Akt",
				pdf_theme_color: form.pdf_theme_color,
				pdf_template: form.pdf_template
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
			const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
			// The wide letterhead lives at the business-folder root as
			// pdf-header.<ext>. Written by the Rust `save_business_asset` command
			// (std::fs, unscoped) so it works on any drive the folder lives on.
			const target = await invoke<string>("save_business_asset", {
				id: tenantId,
				kind: "pdf-header",
				ext,
				bytes
			});
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
