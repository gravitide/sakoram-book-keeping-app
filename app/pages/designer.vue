<template>
	<div class="h-full flex flex-col select-none">
		<!-- Toolbar: history, zoom, which page, preview — then Discard / Save. -->
		<div class="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-(--ui-border) bg-(--ui-bg)">
			<UButton icon="i-lucide-undo-2" variant="ghost" color="neutral" size="sm" :disabled="!canUndo(history)" aria-label="Undo" title="Undo (Ctrl+Z)" @click="doUndo" />
			<UButton icon="i-lucide-redo-2" variant="ghost" color="neutral" size="sm" :disabled="!canRedo(history)" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" @click="doRedo" />
			<USeparator orientation="vertical" class="h-6 mx-1" />
			<UButton icon="i-lucide-zoom-out" variant="ghost" color="neutral" size="sm" aria-label="Zoom out" @click="zoom = stepZoom(zoom, -1)" />
			<UButton variant="ghost" color="neutral" size="sm" @click="zoom = 1">
				Fit
			</UButton>
			<UButton icon="i-lucide-zoom-in" variant="ghost" color="neutral" size="sm" aria-label="Zoom in" @click="zoom = stepZoom(zoom, 1)" />
			<span class="text-xs text-(--ui-text-muted) tabular-nums w-28">{{ actualSizePercent }}% of actual size</span>
			<USeparator orientation="vertical" class="h-6 mx-1" />
			<div class="flex rounded-md ring-1 ring-(--ui-border) overflow-hidden" role="group" aria-label="Page shown">
				<button
					v-for="p in [1, 2] as const"
					:key="p"
					type="button"
					class="px-3 h-7 text-xs font-medium transition"
					:class="page === p ? 'bg-(--ui-primary) text-white' : 'hover:bg-(--ui-bg-elevated)'"
					:aria-pressed="page === p"
					@click="page = p"
				>
					Page {{ p }}
				</button>
			</div>
			<UButton icon="i-lucide-file-search" variant="soft" size="sm" :loading="samplePreview.state.rendering" @click="samplePreview.open()">
				Preview as PDF
			</UButton>
			<div class="flex-1" />
			<span v-if="dirty" class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
				<span class="size-1.5 rounded-full bg-(--ui-warning)" aria-hidden="true" /> Unsaved changes
			</span>
			<UButton variant="ghost" color="neutral" size="sm" :disabled="!dirty || saving" @click="discard()">
				Discard
			</UButton>
			<UButton icon="i-lucide-save" size="sm" :disabled="!dirty" :loading="saving" @click="save()">
				Save
			</UButton>
		</div>

		<div class="flex-1 min-h-0 flex">
			<div class="flex-1 min-w-0">
				<PageDesignerCanvas
					:design="shownDesign"
					:selected-id="selectedId"
					:render-url="preview.url.value"
					:rendering="preview.loading.value"
					:error="preview.error.value"
					:page="page"
					:zoom="zoom"
					@select="selectedId = $event"
					@change="live = $event"
					@commit="commitLive"
					@drop="addFile"
					@scale="scale = $event"
				/>
			</div>

			<aside class="w-80 shrink-0 overflow-y-auto border-l border-(--ui-border) bg-(--ui-bg) p-4 space-y-6">
				<!-- The selected item -->
				<section v-if="selected" aria-labelledby="designer-selected">
					<h2 id="designer-selected" class="text-sm font-semibold mb-3">
						{{ KIND_LABEL[selected.type] }}
					</h2>
					<div class="grid grid-cols-2 gap-2">
						<UFormField label="X (mm)">
							<UInputNumber :model-value="round1(selected.x)" :min="0" :step="0.5" @update:model-value="setField('x', $event)" />
						</UFormField>
						<UFormField label="Y (mm)">
							<UInputNumber :model-value="round1(selected.y)" :min="0" :step="0.5" @update:model-value="setField('y', $event)" />
						</UFormField>
						<UFormField v-if="selected.type !== 'line'" label="Width (mm)">
							<UInputNumber :model-value="round1(selected.w)" :min="5" :step="0.5" @update:model-value="setField('w', $event)" />
						</UFormField>
						<UFormField v-if="selected.type === 'line'" label="Length (mm)">
							<UInputNumber :model-value="round1(selected.length)" :min="5" :step="0.5" @update:model-value="setField('length', $event)" />
						</UFormField>
					</div>
					<div class="flex flex-wrap gap-2 mt-3">
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-bring-to-front" @click="apply((d) => reorderItem(d, selected!.id, 'forward'))">
							Forward
						</UButton>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-send-to-back" @click="apply((d) => reorderItem(d, selected!.id, 'backward'))">
							Back
						</UButton>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-copy" @click="duplicateSelected()">
							Duplicate
						</UButton>
						<UButton size="xs" variant="soft" color="error" icon="i-lucide-trash-2" @click="deleteSelected">
							Delete
						</UButton>
					</div>
					<div v-if="selected.type === 'image'" class="flex flex-wrap gap-2 mt-2">
						<UButton size="xs" variant="soft" icon="i-lucide-replace" @click="replaceInput?.click()">
							Replace…
						</UButton>
						<UButton v-if="selectedFileExt && isRasterArtwork(selectedFileExt)" size="xs" variant="soft" icon="i-lucide-crop" @click="cropSelected">
							Crop…
						</UButton>
					</div>
					<p v-else class="text-xs text-(--ui-text-muted) mt-3">
						Editing its text and style comes with the next update.
					</p>
				</section>
				<p v-else class="text-xs text-(--ui-text-muted)">
					Click something on the page to select it. Drag to move it; drag a handle to resize it.
				</p>

				<!-- Add -->
				<section aria-labelledby="designer-add">
					<h2 id="designer-add" class="text-sm font-semibold mb-2">
						Add
					</h2>
					<UButton icon="i-lucide-image-plus" variant="soft" @click="addInput?.click()">
						Add image
					</UButton>
					<p class="text-xs text-(--ui-text-muted) mt-1.5">
						or drop a PNG, JPEG, SVG or PDF on the page.
					</p>
				</section>

				<!-- Page -->
				<section aria-labelledby="designer-page">
					<h2 id="designer-page" class="text-sm font-semibold mb-2">
						Page
					</h2>
					<div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Paper size">
						<button
							v-for="p in PAPER_SIZES"
							:key="p.key"
							type="button"
							class="px-2 py-1.5 rounded-md border text-left text-xs transition"
							:class="draft.design.paper === p.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/50'"
							:aria-pressed="draft.design.paper === p.key"
							@click="setPaper(p.key)"
						>
							<span class="font-medium">{{ p.label }}</span>
							<span class="block text-(--ui-text-muted) tabular-nums">{{ p.widthMm }} × {{ p.heightMm }} mm</span>
						</button>
					</div>
					<div class="text-xs font-medium mt-4 mb-1.5">
						Safe area (mm)
					</div>
					<div class="grid grid-cols-2 gap-2">
						<UFormField v-for="side in SIDES" :key="side.key" :label="side.label">
							<UInputNumber :model-value="round1(draft.design.margins[side.key])" :min="0" :step="0.5" @update:model-value="setMargin(side.key, $event)" />
						</UFormField>
					</div>
					<div class="space-y-2 text-xs text-(--ui-text-muted) mt-3">
						<div class="flex items-start gap-2">
							<span class="mt-0.5 size-3.5 shrink-0 border border-dashed border-(--ui-primary)" aria-hidden="true" />
							<span>Safe area — where the document itself goes. Drag its guides on the page, or type the margins.</span>
						</div>
						<div class="flex items-start gap-2">
							<span class="mt-0.5 size-3.5 shrink-0 legend-printer-band ring-1 ring-red-400/40" aria-hidden="true" />
							<span>Most printers can't print within 5 mm of the edge. Shown for reference only — artwork may run into it.</span>
						</div>
					</div>
				</section>

				<!-- Document -->
				<section aria-labelledby="designer-document">
					<h2 id="designer-document" class="text-sm font-semibold mb-2">
						Document
					</h2>
					<div class="text-xs font-medium mb-1.5">
						Document style
					</div>
					<div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Document style">
						<button
							v-for="l in PDF_LAYOUTS"
							:key="l.key"
							type="button"
							:title="l.description"
							class="px-2 py-1.5 rounded-md border text-left text-xs font-medium transition"
							:class="draft.layout === l.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/50'"
							:aria-pressed="draft.layout === l.key"
							@click="apply((d) => d, { layout: l.key })"
						>
							{{ l.label }}
						</button>
					</div>
					<div class="mt-4">
						<PdfColorRow :model-value="draft.accent" @update:model-value="apply((d) => d, { accent: $event })" />
					</div>
					<UFormField label="Font" class="mt-4">
						<USelectMenu
							:model-value="draft.font"
							:items="fontOptions"
							value-key="value"
							label-key="label"
							class="w-full"
							@update:model-value="apply((d) => d, { font: $event as string })"
						/>
					</UFormField>
				</section>

				<!-- Templates -->
				<section aria-labelledby="designer-templates">
					<h2 id="designer-templates" class="text-sm font-semibold mb-2">
						Start from a template
					</h2>
					<div class="flex flex-col gap-1.5">
						<button
							v-for="t in DESIGN_TEMPLATES"
							:key="t.key"
							type="button"
							class="px-2.5 py-2 rounded-md border border-(--ui-border) text-left transition hover:border-(--ui-primary)/50 disabled:opacity-60"
							:disabled="applying !== null"
							@click="pendingTemplate = t"
						>
							<span class="flex items-center gap-1.5 text-xs font-medium">
								{{ t.label }}
								<UIcon v-if="applying === t.key" name="i-lucide-loader-circle" class="size-3 animate-spin" />
							</span>
							<span class="block text-xs text-(--ui-text-muted)">{{ t.description }}</span>
						</button>
					</div>
				</section>
			</aside>
		</div>

		<input ref="addInput" type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf" class="hidden" @change="onAddInput">
		<input ref="replaceInput" type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf" class="hidden" @change="onReplaceInput">

		<ImageCropModal
			v-model:open="uploader.crop.open"
			:image-blob="uploader.crop.blob"
			:max-output="uploader.crop.maxOutput"
			:output-type="uploader.crop.outputType"
			title="Crop the image"
			hint="Drag the corners to keep only the part you want. It's stored at print resolution."
			@cropped="uploader.onCropped"
			@cancel="uploader.onCropCancel"
		/>

		<UModal :open="pendingTemplate !== null" :title="`Use ${pendingTemplate?.label ?? ''}?`" @update:open="(o) => { if (!o) pendingTemplate = null }">
			<template #body>
				<p class="text-sm">
					This replaces your design with the {{ pendingTemplate?.label }} template. You can undo it.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton variant="ghost" color="neutral" @click="pendingTemplate = null">
						Cancel
					</UButton>
					<UButton icon="i-lucide-layout-template" @click="useTemplate">
						Replace design
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="closeAsk" title="Save changes before closing?">
			<template #body>
				<p class="text-sm">
					Your changes to the page design haven't been saved.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton variant="ghost" color="neutral" @click="closeAsk = false">
						Cancel
					</UButton>
					<UButton variant="soft" color="error" @click="closeAfter(false)">
						Discard
					</UButton>
					<UButton icon="i-lucide-save" :loading="saving" @click="closeAfter(true)">
						Save
					</UButton>
				</div>
			</template>
		</UModal>

		<PdfPreviewModal
			v-model:open="samplePreview.state.open"
			:asset-url="samplePreview.state.assetUrl"
			:temp-path="samplePreview.state.tempPath"
			:suggested-file-name="samplePreview.state.suggestedFileName"
			:saving="samplePreview.state.saving"
			title="Sample invoice"
			@save="samplePreview.onSave"
			@cancel="samplePreview.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { History } from "~/lib/design-history";
	// The page designer (its own window — usePageDesignerWindow). It edits a
	// DRAFT of the business's page design plus its paper, Document style,
	// accent and font, entirely in memory with undo / redo, and writes the
	// database only on Save. Images go into the business folder as they are
	// added (fresh ids, never over a saved file); Save and Discard delete the
	// ones nothing uses (design-draft filesToRemove). On Save the main window
	// is told to reload its settings (page-design-sync.client.ts).
	//
	// Spec: docs/superpowers/specs/2026-11-27-page-designer-design.md.
	import type { DesignTemplateKey } from "~/lib/design-templates";
	import type { DesignItem, ImageExt, MarginsMm, PageDesign } from "~/lib/page-design";
	import type { PaperSize } from "~/lib/paper-sizes";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useDesignImageUpload } from "~/composables/useDesignImageUpload";
	import { useLivePagePreview } from "~/composables/useLivePagePreview";
	import { usePageDesign } from "~/composables/usePageDesign";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { itemAssetKind, readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { addImage, deleteItem, duplicateItem, fileCopyForDuplicate, filesToRemove, reorderItem, replaceImage, setMargins, updateItem } from "~/lib/design-draft";
	import { afterSave, canRedo, canUndo, record, redo, startHistory, undo } from "~/lib/design-history";
	import { DESIGN_TEMPLATES } from "~/lib/design-templates";
	import { clampItem, CSS_PX_PER_MM, setMarginValue, stepZoom } from "~/lib/designer-geometry";
	import { designerShortcutsAllowed } from "~/lib/designer-keys";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { newItemId, parsePageDesign, scaleDesign } from "~/lib/page-design";
	import { effectiveDesign, PAPER_SIZES } from "~/lib/page-settings";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { isRasterArtwork } from "~/lib/stationery-artwork";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ layout: "designer-window", title: "Page designer" });

	interface Draft { design: PageDesign, layout: PdfLayoutKey, accent: string, font: string }

	const KIND_LABEL: Record<DesignItem["type"], string> = { image: "Image", text: "Text", page_number: "Page number", line: "Line" };
	const SIDES: { key: keyof MarginsMm, label: string }[] = [
		{ key: "top", label: "Top" },
		{ key: "bottom", label: "Bottom" },
		{ key: "left", label: "Left" },
		{ key: "right", label: "Right" }
	];

	const settings = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();
	const pageDesign = usePageDesign();
	const uploader = useDesignImageUpload();
	const currency = useActiveCurrency();

	await settings.ensureLoaded();

	// ---- draft, history, what's saved -------------------------------------------
	const draftFromSettings = (): Draft => {
		const s = settings.settings;
		return {
			design: effectiveDesign(s),
			layout: resolveLayoutKey(s?.pdf_layout),
			accent: s?.pdf_theme_color ?? s?.theme_color ?? "green",
			font: s?.pdf_font || "Akt"
		};
	};

	// The stored design (null = never chosen): which files a Save / Discard may delete.
	const savedDesign = shallowRef<PageDesign | null>(parsePageDesign(settings.settings?.pdf_design));
	const baseline = shallowRef<Draft>(draftFromSettings());
	const history = shallowRef<History<Draft>>(startHistory(baseline.value));
	const uploaded = ref<string[]>([]);
	const draft = computed(() => history.value.present);
	const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value));

	// A drag in progress shows live but only enters the history when it ends.
	const live = shallowRef<PageDesign | null>(null);
	const shownDesign = computed(() => live.value ?? draft.value.design);

	/** Record one change: a new design (from the current one) and/or other draft fields. */
	const apply = (fn: (d: PageDesign) => PageDesign, rest: Partial<Omit<Draft, "design">> = {}) => {
		const now = history.value.present;
		history.value = record(history.value, { ...now, ...rest, design: fn(now.design) });
	};
	const commitLive = () => {
		const next = live.value;
		live.value = null;
		if (next) apply(() => next);
	};
	const doUndo = () => {
		live.value = null;
		history.value = undo(history.value);
	};
	const doRedo = () => {
		live.value = null;
		history.value = redo(history.value);
	};

	// ---- selection ------------------------------------------------------------------
	const selectedId = ref<string | null>(null);
	const selected = computed(() => shownDesign.value.items.find((i) => i.id === selectedId.value) ?? null);
	const selectedFileExt = computed<ImageExt | null>(() =>
		(selected.value?.type === "image" && selected.value.src?.kind === "file" ? selected.value.src.ext : null));
	const round1 = (n: number) => Math.round(n * 10) / 10;

	const setField = (field: "x" | "y" | "w" | "length", value: number | null | undefined) => {
		const item = selected.value;
		if (!item || typeof value !== "number" || !Number.isFinite(value)) return;
		const next = { ...item, [field]: Math.max(0, value) } as DesignItem;
		// Images keep their proportions when the width is typed.
		if (field === "w" && item.type === "image") (next as typeof item).h = value * (item.h / item.w);
		// A typed value obeys the same page limits as a drag.
		apply((d) => updateItem(d, clampItem(next, d)));
	};
	const duplicateSelected = async () => {
		const original = selected.value;
		if (!original) return;
		const id = newItemId();
		// Item ids name the image files: a copied image needs its own file.
		const copy = fileCopyForDuplicate(original, id);
		if (copy) {
			const tenantId = tenants.activeTenantId;
			if (!tenantId) return;
			try {
				const [, bytes] = await readBusinessAsset(tenantId, itemAssetKind(copy.fromId));
				await saveBusinessAsset(tenantId, itemAssetKind(copy.toId), copy.ext, bytes);
			} catch (e) {
				toast.add({ title: "Couldn't duplicate the image", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
				return;
			}
			uploaded.value = [...uploaded.value, id];
		}
		apply((d) => duplicateItem(d, original.id, id));
		selectedId.value = id;
	};
	const deleteSelected = () => {
		if (!selected.value) return;
		const id = selected.value.id;
		apply((d) => deleteItem(d, id));
		selectedId.value = null;
	};

	// ---- page & document ------------------------------------------------------------
	const setPaper = (paper: PaperSize) => {
		if (draft.value.design.paper !== paper) apply((d) => scaleDesign(d, paper));
	};
	const setMargin = (side: keyof MarginsMm, value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return;
		apply((d) => setMargins(d, setMarginValue(d.margins, side, value, d.paper)));
	};
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[{ type: "label", label: "Bundled" }, ...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name }))],
			[{ type: "label", label: "Monospaced" }, ...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name }))]
		];
		if (draft.value.font && !isBundledFont(draft.value.font)) {
			groups.push([{ type: "label", label: "Not bundled" }, { label: `${draft.value.font} (custom)`, value: draft.value.font }]);
		}
		return groups;
	});

	// ---- images ----------------------------------------------------------------------
	const addInput = useTemplateRef<HTMLInputElement>("addInput");
	const replaceInput = useTemplateRef<HTMLInputElement>("replaceInput");

	const addFile = async (file: File) => {
		const added = await uploader.upload(file, draft.value.design.paper);
		if (!added) return;
		uploaded.value = [...uploaded.value, added.id];
		apply((d) => addImage(d, added.id, added.ext, added.aspect));
		selectedId.value = added.id;
	};
	const onAddInput = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await addFile(file);
	};
	const swapSelected = (added: { id: string, ext: ImageExt, aspect: number } | null) => {
		if (!added) return;
		// Tracked first, so a file whose item is gone still gets cleaned up.
		uploaded.value = [...uploaded.value, added.id];
		const old = selected.value;
		if (!old) return;
		apply((d) => replaceImage(d, old.id, added.id, added.ext, added.aspect));
		selectedId.value = added.id;
	};
	const onReplaceInput = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) swapSelected(await uploader.upload(file, draft.value.design.paper));
	};
	const cropSelected = async () => {
		if (!selected.value || !selectedFileExt.value) return;
		swapSelected(await uploader.cropExisting(selected.value.id, selectedFileExt.value, draft.value.design.paper));
	};

	// ---- templates -------------------------------------------------------------------
	const pendingTemplate = ref<(typeof DESIGN_TEMPLATES)[number] | null>(null);
	const applying = ref<DesignTemplateKey | null>(null);
	const useTemplate = async () => {
		const t = pendingTemplate.value;
		pendingTemplate.value = null;
		if (!t) return;
		applying.value = t.key;
		try {
			const prepared = await pageDesign.prepareTemplate(t.key, draft.value.design.paper);
			uploaded.value = [...uploaded.value, ...prepared.uploaded];
			apply(() => prepared.design, prepared.documentStyle ? { layout: prepared.documentStyle } : {});
			selectedId.value = null;
		} catch (e) {
			toast.add({ title: "Couldn't use the template", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			applying.value = null;
		}
	};

	// ---- preview ----------------------------------------------------------------------
	const page = ref<1 | 2>(1);
	const zoom = ref(1);
	const scale = ref(CSS_PX_PER_MM);
	const actualSizePercent = computed(() => Math.round((scale.value / CSS_PX_PER_MM) * 100));

	const draftSettings = computed(() => (settings.settings
		? {
			...settings.settings,
			pdf_design: JSON.stringify(shownDesign.value),
			pdf_paper_size: shownDesign.value.paper,
			pdf_layout: draft.value.layout,
			pdf_theme_color: draft.value.accent,
			pdf_font: draft.value.font
		}
		: null));
	const samplePayload = () => (draftSettings.value ? sampleStationeryPreviewPayload(draftSettings.value, currency.value, draft.value.layout) : null);
	const preview = useLivePagePreview(samplePayload, {
		page: () => page.value,
		ppiFn: () => Math.min(150, Math.max(20, Math.round(scale.value * 25.4 * (window.devicePixelRatio || 1)))),
		deps: () => uploaded.value.length
	});
	const samplePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => samplePayload() ?? {},
		fileName: () => "sample-invoice.pdf",
		title: "Sample invoice"
	});

	// ---- save / discard / close ---------------------------------------------------------
	const saving = ref(false);
	const removeFiles = async (ids: string[]) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		for (const id of ids) {
			// Best effort: an orphaned file is harmless, a failed save isn't.
			await removeBusinessAsset(tenantId, itemAssetKind(id)).catch((e) => console.warn("[designer] couldn't remove", id, e));
		}
	};

	const save = async (): Promise<boolean> => {
		saving.value = true;
		try {
			// A never-chosen design still points at the company logo: copy it in
			// now, as a template would (spec: a copy, not a link).
			const filled = await pageDesign.fillLogoSpots(draft.value.design);
			const final: Draft = { ...draft.value, design: filled.design };
			await settings.save({
				pdf_design: JSON.stringify(final.design),
				pdf_paper_size: final.design.paper,
				pdf_layout: final.layout,
				pdf_theme_color: final.accent,
				pdf_font: final.font
			});
			await removeFiles(filesToRemove({ saved: savedDesign.value, draft: final.design, uploaded: uploaded.value, outcome: "save" }));
			savedDesign.value = final.design;
			uploaded.value = [];
			baseline.value = final;
			// A fresh history: the files this save deleted can't be undone back.
			history.value = afterSave(final);
			if ("__TAURI_INTERNALS__" in window) {
				const { emitTo } = await import("@tauri-apps/api/event");
				await emitTo("main", "page-design:saved").catch(() => { /* main may be closing */ });
			}
			toast.add({ title: "Page design saved", color: "success", icon: "i-lucide-check" });
			return true;
		} catch (e) {
			toast.add({ title: "Save failed", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
			return false;
		} finally {
			saving.value = false;
		}
	};

	const discard = async () => {
		await removeFiles(filesToRemove({ saved: savedDesign.value, draft: draft.value.design, uploaded: uploaded.value, outcome: "discard" }));
		uploaded.value = [];
		live.value = null;
		history.value = startHistory(baseline.value);
		selectedId.value = null;
	};

	const closeAsk = ref(false);
	const destroyWindow = async () => {
		if (!("__TAURI_INTERNALS__" in window)) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().destroy();
	};
	const closeAfter = async (doSave: boolean) => {
		if (doSave && !(await save())) return;
		if (!doSave) await discard();
		closeAsk.value = false;
		await destroyWindow();
	};

	// Closing: from this window's own close button, or when the main window is
	// asked to close while the designer is open (lock-on-close.client.ts sends
	// `page-designer:close-request` instead of closing over unsaved work).
	const requestClose = async () => {
		if (dirty.value) {
			closeAsk.value = true;
			return;
		}
		// Nothing to keep: drop anything uploaded and then undone.
		await discard();
		await destroyWindow();
	};

	const unlisten: Array<() => void> = [];
	onMounted(async () => {
		if (!("__TAURI_INTERNALS__" in window)) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		const win = getCurrentWindow();
		// Main closes over an open designer only after asking it (lock-on-close.client.ts).
		const { emitTo } = await import("@tauri-apps/api/event");
		await emitTo("main", "page-designer:open", true).catch(() => {});
		unlisten.push(await win.onCloseRequested((event) => {
			event.preventDefault();
			void requestClose();
		}));
		unlisten.push(await win.listen("page-designer:close-request", async () => {
			await win.setFocus().catch(() => {});
			await requestClose();
		}));
	});

	// ---- keys ---------------------------------------------------------------------------
	const typing = (e: KeyboardEvent) => !designerShortcutsAllowed(e.target as HTMLElement | null);
	const onKey = (e: KeyboardEvent) => {
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		// Nothing here acts while a dialog (crop, confirm) is open or a field has focus,
		// except Save.
		if (mod && key === "s") {
			e.preventDefault();
			if (dirty.value) void save();
			return;
		}
		if (typing(e)) return;
		if (mod && key === "z") {
			e.preventDefault();
			if (e.shiftKey) doRedo();
			else doUndo();
		} else if (mod && key === "y") {
			e.preventDefault();
			doRedo();
		} else if (mod && key === "d") {
			e.preventDefault();
			void duplicateSelected();
		} else if (e.key === "Delete" || e.key === "Backspace") {
			if (selected.value) {
				e.preventDefault();
				deleteSelected();
			}
		} else if (e.key === "Escape") {
			selectedId.value = null;
		}
	};
	onMounted(() => window.addEventListener("keydown", onKey));
	onBeforeUnmount(() => {
		window.removeEventListener("keydown", onKey);
		for (const off of unlisten) off();
	});
</script>

<style scoped>
	.legend-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.3) 0 2px, transparent 2px 4px);
	}
</style>
