<template>
	<SectionCard
		icon="i-lucide-panels-top-bottom"
		title="Header & footer images"
		subtitle="Two images of your own, one for the top of the page and one for the bottom. Each lands at full page width, flush to its edge; move and resize it in the Stationery editor. The content always stays 4 mm clear of them."
	>
		<p v-if="locked" class="mb-4 text-xs text-(--ui-warning)">
			{{ locked }} Images save the moment they change, placed on the paper picked now.
		</p>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div v-for="slot in HEADER_FOOTER_SLOTS" :key="slot" class="space-y-3">
				<div class="text-sm font-medium">
					{{ SLOT_LABEL[slot] }}
				</div>
				<!-- The image as uploaded, on white: it previews against the paper. -->
				<div
					class="relative h-24 rounded-md border-2 border-dashed overflow-hidden bg-white transition"
					:class="locked ? 'border-(--ui-border-accented) cursor-not-allowed opacity-60' : dragOver === slot ? 'border-(--ui-primary) scale-[1.01] cursor-pointer' : 'border-(--ui-border-accented) hover:border-(--ui-primary)/60 cursor-pointer'"
					:aria-disabled="locked ? true : undefined"
					role="button"
					tabindex="0"
					:aria-label="`Upload a ${slot} image`"
					@click="pick(slot)"
					@keydown.enter.prevent="pick(slot)"
					@keydown.space.prevent="pick(slot)"
					@dragover.prevent="dragOver = locked ? null : slot"
					@dragenter.prevent="dragOver = locked ? null : slot"
					@dragleave.prevent="dragOver = null"
					@drop.prevent="onDrop(slot, $event)"
				>
					<img
						v-if="previews[slot].url.value"
						:src="previews[slot].url.value!"
						:alt="SLOT_LABEL[slot]"
						class="absolute inset-0 w-full h-full object-contain p-1"
					>
					<div
						v-else-if="images[slot]"
						class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-500"
					>
						<UIcon :name="images[slot]!.ext === 'pdf' ? 'i-lucide-file-text' : 'i-lucide-image'" class="size-6" />
						<span class="text-[11px]">{{ images[slot]!.ext === "pdf" ? "PDF image (first page)" : "Image" }}</span>
					</div>
					<div
						v-else
						class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 px-3 text-center"
					>
						<UIcon name="i-lucide-upload" class="size-5" />
						<span class="text-[11px]">Drop an SVG, PDF, PNG or JPEG, or click to choose</span>
					</div>
					<div v-if="busy === slot" class="absolute inset-0 bg-white/70 flex items-center justify-center">
						<UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-zinc-500" />
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					<UButton icon="i-lucide-upload" size="sm" variant="soft" :loading="busy === slot" :disabled="!!locked" @click="pick(slot)">
						{{ images[slot] ? "Replace" : "Upload" }}
					</UButton>
					<UButton
						v-if="images[slot] && isRasterBackground(images[slot]!.ext)"
						icon="i-lucide-crop"
						size="sm"
						variant="soft"
						color="neutral"
						:disabled="busy !== null || !!locked"
						@click="openRecrop(slot)"
					>
						Crop
					</UButton>
					<UButton
						v-if="images[slot]"
						icon="i-lucide-trash-2"
						size="sm"
						variant="soft"
						color="error"
						:disabled="busy !== null || !!locked"
						@click="remove(slot)"
					>
						Remove
					</UButton>
				</div>

				<p v-if="!images[slot]" class="text-xs text-(--ui-text-muted)">
					No {{ slot }} image — that band is just your margin.
				</p>
				<p v-else-if="review?.[slot]" class="text-xs text-(--ui-warning)">
					Placed on {{ resolvePaperSize(review[slot]!).label }} — it keeps its size on {{ paperInfo.label }} and was moved onto the page. Check it in the Stationery editor (Apply keeps it).
				</p>
				<UAlert
					v-if="images[slot]?.ext === 'svg' && images[slot]!.live_text"
					color="warning"
					variant="subtle"
					icon="i-lucide-type"
					title="Convert the text to outlines"
					description="This SVG still contains live text. The PDF uses only Sakoram's bundled fonts, so its lettering may come out in a different typeface. Convert text to outlines in your design app and upload it again."
				/>
			</div>
		</div>

		<input
			ref="fileInput"
			type="file"
			accept=".svg,.pdf,.png,.jpg,.jpeg,image/svg+xml,application/pdf,image/png,image/jpeg"
			class="hidden"
			@change="onFileChange"
		>

		<ImageCropModal
			v-model:open="cropOpen"
			:image-blob="cropBlob"
			:initial-rect="cropInitial"
			:max-output="backgroundPixelSize(paper)"
			:output-type="cropExt === 'jpg' ? 'image/jpeg' : 'image/png'"
			:title="`Crop the ${cropSlot} image`"
			hint="Choose the part of your image to print. Your original upload is kept, so you can crop again later."
			@cropped="onCropped"
		/>
	</SectionCard>
</template>

<script setup lang="ts">
	// Header & footer images Stationery: upload / crop / remove the two images.
	// Where each sits and the bands around them are set in the Stationery
	// editor (StationeryEditorModal); this card only places a NEW image where
	// it starts — full page width, flush to its edge — with its band following
	// it (stationery-geometry.ts defaultImageRect + followImage).
	//
	// Files go through Rust commands only (a business folder can live on any
	// drive — see CLAUDE.md): stationery/<slot>.<ext> is what PDFs render;
	// stationery/<slot>-original.<ext> keeps an untouched raster upload for
	// Crop. company_settings.pdf_stationery records each image's format,
	// proportions, place, crop and live-text flag — never a path.
	//
	// Image changes save immediately (like the background); the page's form
	// learns about them through `placed`, so its unsaved edits survive.
	import type { BusinessAssetKind } from "~/lib/business-assets";
	import type { CropRect } from "~/lib/crop-rect";
	import type { PaperSize } from "~/lib/page-settings";
	import type { BackgroundExt, HeaderFooterImage, HeaderFooterSlot, StationeryMarginsMm } from "~/lib/stationery";
	import type { HeaderFooterRects, MmRect, StationeryReview } from "~/lib/stationery-geometry";
	import { invoke } from "@tauri-apps/api/core";
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { encodeImage } from "~/lib/canvas-image";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { HEADER_FOOTER_SLOTS, parseStationery, setHeaderFooterImage, setHeaderFooterMargins } from "~/lib/stationery";
	import { backgroundFormatOf, backgroundMimeOf, backgroundPixelSize, downscaleSize, isRasterBackground, svgAspect, svgHasLiveText } from "~/lib/stationery-artwork";
	import { clampImageRect, defaultImageRect, followImage } from "~/lib/stationery-geometry";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	const props = defineProps<{
		/** The business's Paper size as currently picked on the page (maybe unsaved). */
		paper: PaperSize
		/** The page form's live margins (the bands a new image's band is measured against). */
		margins: StationeryMarginsMm
		/**
		 * The page form's live image places — re-fitted when the Paper size is
		 * picked, so they can differ from the stored ones until Save.
		 */
		rects?: HeaderFooterRects
		/** Images placed on another sheet (from the page's live form). */
		review?: Pick<StationeryReview, "header" | "footer">
		/**
		 * Why the images can't change right now (an unsaved Paper size change —
		 * stationery-artwork.ts artworkPaperLock), or null.
		 */
		locked?: string | null
	}>();
	const emit = defineEmits<{
		/** An image was added, cropped or removed and saved: its new place (null = gone) and the margins after its band followed it. */
		placed: [slot: HeaderFooterSlot, rect: MmRect | null, margins: StationeryMarginsMm]
	}>();

	const SLOT_LABEL: Record<HeaderFooterSlot, string> = { header: "Header image", footer: "Footer image" };
	const ASSET: Record<HeaderFooterSlot, BusinessAssetKind> = { header: "stationery-header", footer: "stationery-footer" };
	const ORIGINAL: Record<HeaderFooterSlot, BusinessAssetKind> = { header: "stationery-header-original", footer: "stationery-footer-original" };
	const EDGE = { header: "top", footer: "bottom" } as const;

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const images = computed(() => parseStationery(store.settings?.pdf_stationery).header_footer);
	/** Where an image sits now: the form's live place, else the stored one. */
	const placeOf = (slot: HeaderFooterSlot): MmRect | null => props.rects?.[slot] ?? images.value[slot]?.rect ?? null;
	const previews = { header: useStationeryArtwork("header"), footer: useStationeryArtwork("footer") };

	const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
	const pickingFor = ref<HeaderFooterSlot>("header");
	const dragOver = ref<HeaderFooterSlot | null>(null);
	const busy = ref<HeaderFooterSlot | null>(null);
	const pick = (slot: HeaderFooterSlot) => {
		if (props.locked) return;
		pickingFor.value = slot;
		fileInput.value?.click();
	};

	const fail = (title: string, err: unknown) => toast.add({
		title,
		description: err instanceof Error ? err.message : String(err),
		color: "error",
		icon: "i-lucide-circle-alert"
	});

	const activeId = () => {
		if (!tenants.activeTenantId) throw new Error("No active business.");
		return tenants.activeTenantId;
	};

	const loadImage = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("That image couldn't be read."));
		};
		img.src = url;
	});

	/**
	 * Record an image (or its removal) and save. Its band follows it from
	 * `before`; only that one band is written back, so unsaved edits to the
	 * other margins stay on the page's form.
	 */
	const record = async (slot: HeaderFooterSlot, image: HeaderFooterImage | null, before: MmRect | null) => {
		const followed = followImage(paperInfo.value, slot, before, image?.rect ?? null, props.margins);
		const stored = parseStationery(store.settings?.pdf_stationery).header_footer.margins;
		const edge = EDGE[slot];
		let json = setHeaderFooterImage(store.settings?.pdf_stationery, slot, image);
		if (image) json = setHeaderFooterMargins(json, { ...stored, [edge]: followed[edge] });
		await store.save({ pdf_stationery: json });
		await previews[slot].reload();
		emit("placed", slot, image ? { ...image.rect } : null, followed);
	};

	/** The proportions of an uploaded vector: an SVG's own size, a PDF's first page as Typst renders it. */
	const vectorAspect = async (slot: HeaderFooterSlot, ext: BackgroundExt, bytes: Uint8Array): Promise<number> => {
		if (ext === "svg") {
			const fromMarkup = svgAspect(new TextDecoder().decode(bytes));
			if (fromMarkup) return fromMarkup;
			const img = await loadImage(new Blob([new Uint8Array(bytes)], { type: "image/svg+xml" }));
			return img.naturalWidth / img.naturalHeight;
		}
		const png = await invoke<number[]>("render_stationery_artwork_png", { ppi: 30, artwork: slot });
		const img = await loadImage(new Blob([new Uint8Array(png)], { type: "image/png" }));
		return img.naturalWidth / img.naturalHeight;
	};

	const upload = async (slot: HeaderFooterSlot, file: File) => {
		if (props.locked) return;
		const ext = backgroundFormatOf(file.name);
		if (!ext) {
			toast.add({ title: "Use an SVG, PDF, PNG or JPEG file", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		busy.value = slot;
		try {
			const id = activeId();
			const bytes = new Uint8Array(await file.arrayBuffer());
			const before = placeOf(slot);
			let aspect: number;
			let liveText = false;
			if (isRasterBackground(ext)) {
				const img = await loadImage(new Blob([bytes], { type: backgroundMimeOf(ext) }));
				aspect = img.naturalWidth / img.naturalHeight;
				// ~300 DPI at full page width at most (never enlarged).
				const out = downscaleSize(img.naturalWidth, img.naturalHeight, backgroundPixelSize(props.paper));
				const derivative = await encodeImage(img, out, backgroundMimeOf(ext));
				await saveBusinessAsset(id, ORIGINAL[slot], ext, bytes);
				await saveBusinessAsset(id, ASSET[slot], ext, new Uint8Array(await derivative.arrayBuffer()));
			} else {
				liveText = ext === "svg" && svgHasLiveText(new TextDecoder().decode(bytes));
				await saveBusinessAsset(id, ASSET[slot], ext, bytes);
				await removeBusinessAsset(id, ORIGINAL[slot]);
				aspect = await vectorAspect(slot, ext, bytes);
			}
			if (!Number.isFinite(aspect) || aspect <= 0) throw new Error("Couldn't tell how big that image is.");
			const rect = defaultImageRect(paperInfo.value, slot, aspect, props.margins);
			// A replacement starts afresh at its edge; the band follows from the old image.
			await record(slot, { ext, aspect, rect, paper: props.paper, crop: null, live_text: liveText }, before);
			toast.add(liveText
				? { title: `${SLOT_LABEL[slot]} updated — its text isn't outlined`, description: "See the note under the buttons.", color: "warning", icon: "i-lucide-type" }
				: { title: `${SLOT_LABEL[slot]} updated`, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail(`${SLOT_LABEL[slot]} upload failed`, err);
		} finally {
			busy.value = null;
		}
	};

	const onFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await upload(pickingFor.value, file);
	};

	const onDrop = async (slot: HeaderFooterSlot, event: DragEvent) => {
		dragOver.value = null;
		const file = event.dataTransfer?.files?.[0];
		if (file) await upload(slot, file);
	};

	// ---- crop ----------------------------------------------------------
	// Free-form: a header or footer image has no fixed shape. Cropping
	// changes its proportions, so it keeps its place and width and takes the
	// new height (made to fit), its band following.
	const cropOpen = ref(false);
	const cropSlot = ref<HeaderFooterSlot>("header");
	const cropBlob = ref<Blob | null>(null);
	const cropInitial = ref<CropRect | null>(null);
	const cropExt = ref<BackgroundExt>("png");

	const openRecrop = async (slot: HeaderFooterSlot) => {
		const image = images.value[slot];
		if (props.locked || !image || !tenants.activeTenantId) return;
		try {
			let ext: string;
			let bytes: number[];
			let initial = image.crop;
			try {
				[ext, bytes] = await readBusinessAsset(tenants.activeTenantId, ORIGINAL[slot]);
			} catch {
				// No original (e.g. after a backup from an older build): crop the image itself.
				[ext, bytes] = await readBusinessAsset(tenants.activeTenantId, ASSET[slot]);
				initial = null;
			}
			cropSlot.value = slot;
			cropExt.value = backgroundFormatOf(`x.${ext}`) ?? "png";
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: backgroundMimeOf(cropExt.value) });
			cropInitial.value = initial;
			cropOpen.value = true;
		} catch (err) {
			fail("Couldn't open crop", err);
		}
	};

	const onCropped = async (crop: CropRect, blob: Blob) => {
		const slot = cropSlot.value;
		const image = images.value[slot];
		if (!image) return;
		busy.value = slot;
		try {
			await saveBusinessAsset(activeId(), ASSET[slot], cropExt.value, new Uint8Array(await blob.arrayBuffer()));
			const aspect = crop.w / crop.h;
			const place = placeOf(slot) ?? image.rect;
			const rect = clampImageRect(paperInfo.value, slot, { ...place, h: place.w / aspect }, props.margins);
			// Re-placed on the sheet picked now.
			await record(slot, { ...image, ext: cropExt.value, aspect, rect, paper: props.paper, crop: { ...crop } }, place);
			toast.add({ title: `${SLOT_LABEL[slot]} cropped`, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail("Crop failed", err);
		} finally {
			busy.value = null;
		}
	};

	// Kept-alive page: never come back to an open crop.
	onDeactivated(() => {
		cropOpen.value = false;
		cropBlob.value = null;
		cropInitial.value = null;
		dragOver.value = null;
	});

	// Remove deletes that image and its original only — the other image, and
	// both bands, stay as they are. Switching modes never deletes anything.
	const remove = async (slot: HeaderFooterSlot) => {
		if (props.locked || !tenants.activeTenantId) return;
		busy.value = slot;
		try {
			await removeBusinessAsset(tenants.activeTenantId, ASSET[slot]);
			await removeBusinessAsset(tenants.activeTenantId, ORIGINAL[slot]);
			await record(slot, null, placeOf(slot));
			toast.add({ title: `${SLOT_LABEL[slot]} removed`, color: "info", icon: "i-lucide-image-off" });
		} catch (err) {
			fail(`Couldn't remove the ${slot} image`, err);
		} finally {
			busy.value = null;
		}
	};
</script>
