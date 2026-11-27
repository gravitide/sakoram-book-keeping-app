<template>
	<SectionCard
		icon="i-lucide-file-image"
		title="Full-page background"
		subtitle="One page-sized artwork drawn behind every page. SVG and PDF stay sharp at any size; PNG and JPEG are cropped to the paper at print resolution."
	>
		<!-- Three inset panels, like the Header & footer images card: the artwork
			(sheet + its buttons) on the left, then the Safe area and the colour
			(the page's named slots) on the right. Below md the panels stack. -->
		<div class="grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 items-start">
			<section :class="PANEL" aria-labelledby="bg-artwork-heading">
				<div class="flex flex-wrap items-baseline gap-x-2 mb-3">
					<h3 id="bg-artwork-heading" class="text-sm font-medium">
						Artwork
					</h3>
					<span class="text-xs text-(--ui-text-muted)">Drawn behind every page</span>
				</div>
				<div class="flex flex-wrap items-start gap-4">
					<!-- The artwork, to scale on the paper. White in both themes: it
						previews against the paper. Dashed only while it is an empty
						drop target; with artwork in place it is just the sheet. -->
					<div class="flex flex-col items-center gap-2">
						<div
							class="relative w-36 rounded-md overflow-hidden bg-white transition"
							:class="[
								artwork.ext ? 'border' : 'border-2 border-dashed',
								locked ? 'border-(--ui-border-accented) cursor-not-allowed opacity-60' : dragOver ? 'border-(--ui-primary) scale-[1.01] cursor-pointer' : 'border-(--ui-border-accented) hover:border-(--ui-primary)/60 cursor-pointer'
							]"
							:aria-disabled="locked ? true : undefined"
							:style="{ aspectRatio: `${paperInfo.widthMm} / ${paperInfo.heightMm}` }"
							role="button"
							tabindex="0"
							aria-label="Upload a full-page background"
							@click="pick"
							@keydown.enter.prevent="pick"
							@keydown.space.prevent="pick"
							@dragover.prevent="dragOver = !locked"
							@dragenter.prevent="dragOver = !locked"
							@dragleave.prevent="dragOver = false"
							@drop.prevent="onDrop"
						>
							<input
								ref="fileInput"
								type="file"
								accept=".svg,.pdf,.png,.jpg,.jpeg,image/svg+xml,application/pdf,image/png,image/jpeg"
								class="hidden"
								@change="onFileChange"
							>
							<img
								v-if="artworkPreview.url.value"
								:src="artworkPreview.url.value"
								alt="Full-page background"
								class="absolute inset-0 w-full h-full object-cover"
							>
							<div
								v-else-if="artwork.ext === 'pdf'"
								class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-500"
							>
								<UIcon name="i-lucide-file-text" class="size-8" />
								<span class="text-[11px]">PDF background (first page)</span>
							</div>
							<div
								v-else
								class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 px-3 text-center"
							>
								<UIcon name="i-lucide-upload" class="size-6" />
								<span class="text-[11px]">Drop an SVG, PDF, PNG or JPEG, or click to choose</span>
							</div>
							<div v-if="busy" class="absolute inset-0 bg-white/70 flex items-center justify-center">
								<UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-zinc-500" />
							</div>
						</div>
						<div class="text-[11px] text-(--ui-text-muted)">
							{{ paperInfo.label }}
						</div>
					</div>

					<div class="flex flex-col gap-3 min-w-0 flex-1">
						<div>
							<div class="flex flex-wrap gap-2">
								<UButton
									icon="i-lucide-upload"
									size="sm"
									variant="soft"
									:loading="busy"
									:disabled="!!locked"
									@click="pick"
								>
									{{ artwork.ext ? "Replace" : "Upload" }}
								</UButton>
								<UButton
									v-if="canRecrop"
									icon="i-lucide-crop"
									size="sm"
									variant="soft"
									:color="review?.recrop ? 'warning' : 'neutral'"
									:disabled="busy || !!locked"
									@click="openRecrop"
								>
									Re-crop
								</UButton>
								<UButton
									v-if="artwork.ext"
									icon="i-lucide-trash-2"
									size="sm"
									variant="soft"
									color="error"
									:disabled="busy || !!locked"
									@click="remove"
								>
									Remove
								</UButton>
							</div>

							<p v-if="locked" class="text-xs text-(--ui-warning)">
								{{ locked }} The background saves the moment it changes, for the paper it was made for.
							</p>
							<p v-if="!artwork.ext" class="text-xs text-(--ui-text-muted)">
								No background yet — documents print with blank margins until you upload one.
							</p>
							<UAlert
								v-else-if="review?.recrop"
								color="warning"
								variant="subtle"
								icon="i-lucide-crop"
								:title="`Re-crop for ${paperInfo.label}`"
								:description="`This image was cropped to ${paperLabel(review.preparedFor)}'s shape, so on ${paperInfo.label} it is scaled to cover the page and its edges are cut off. Re-crop starts from your original upload.`"
							/>
							<p v-else-if="review" class="text-xs text-(--ui-warning)">
								This artwork was prepared for {{ paperLabel(review.preparedFor) }} — it is scaled to cover {{ paperInfo.label }}, so its edges may be cut off. Check it in the Stationery editor (Apply keeps it), or upload artwork made for {{ paperInfo.label }}.
							</p>

							<UAlert
								v-if="artwork.ext === 'svg' && artwork.live_text"
								color="warning"
								variant="subtle"
								icon="i-lucide-type"
								title="Convert the text to outlines"
								description="This SVG still contains live text. The PDF uses only Sakoram's bundled fonts, so your letterhead's lettering may come out in a different typeface. In your design app, convert text to outlines (paths) and upload it again."
							/>
						</div>
					</div>
				</div>
			</section>

			<!-- The page's own controls for this mode, each in its own panel: the
				way into the Stationery editor (the Safe area) and the PDF colour. -->
			<div class="flex flex-col gap-3 min-w-0">
				<section v-if="$slots['safe-area']" :class="PANEL">
					<slot name="safe-area" />
				</section>
				<section v-if="$slots.colour" :class="PANEL">
					<slot name="colour" />
				</section>
			</div>
		</div>

		<ImageCropModal
			v-model:open="cropOpen"
			:image-blob="cropBlob"
			:initial-rect="cropInitial"
			:aspect="paperInfo.widthMm / paperInfo.heightMm"
			:max-output="artworkPixelSize(paper)"
			:output-type="cropExt === 'jpg' ? 'image/jpeg' : 'image/png'"
			title="Crop background to the page"
			:hint="`Your image isn't ${paperInfo.label}-shaped. Choose the part that fills the page; the crop is locked to the paper's proportions. Your original upload is kept.`"
			@cropped="onCropped"
		/>
	</SectionCard>
</template>

<script setup lang="ts">
	// Full-page background Stationery: upload / crop / downscale / remove the
	// artwork. Its four Safe-area margins are set in the Stationery editor
	// (StationeryEditorModal, opened by the page from this card's default slot).
	//
	// Files go through Rust commands only (a business folder can live on any
	// drive — see CLAUDE.md): stationery/background.<ext> is what PDFs render;
	// stationery/background-original.<ext> keeps an untouched raster upload for
	// Re-crop. company_settings.pdf_stationery records only the format, the
	// paper it was prepared for, the crop and the live-text flag — never a path.
	//
	// Artwork changes save immediately (like the header logo).

	import type { CropRect } from "~/lib/crop-rect";
	import type { PaperSize } from "~/lib/page-settings";
	import type { ArtworkExt, BackgroundArtwork, StationeryReview } from "~/lib/stationery";
	import { useRasterArtwork } from "~/composables/useRasterArtwork";
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { clearBackgroundArtwork, isRasterArtwork, parseStationery, setBackgroundArtwork } from "~/lib/stationery";
	import { artworkFormatOf, artworkMimeOf, artworkPixelSize, matchesPaperAspect, svgHasLiveText } from "~/lib/stationery-artwork";
	import { useSettingsStore } from "~/stores/settings";

	const props = defineProps<{
		/** The business's Paper size as currently picked on the page (maybe unsaved). */
		paper: PaperSize
		/** Prepared for another sheet (from the page's live form), or null. */
		review?: StationeryReview["background"]
		/**
		 * Why the artwork can't change right now (an unsaved Paper size change —
		 * stationery-artwork.ts artworkPaperLock), or null.
		 */
		locked?: string | null
	}>();

	const emit = defineEmits<{
		/** The artwork was saved for this sheet, or removed (null). */
		artwork: [paper: PaperSize | null]
	}>();

	// One inset panel per group (Artwork · Safe area · Colour), lightly tinted
	// so the three read as separate jobs inside the one card — the same panels
	// as StationeryHeaderFooterCard.
	const PANEL = "rounded-md border border-(--ui-border) bg-(--ui-bg-elevated)/50 p-4";

	const ASSETS = { asset: "stationery-background", original: "stationery-background-original" } as const;

	const store = useSettingsStore();
	const toast = useToast();
	const { fail, activeId, loadImage, downscaled, saveRaster, saveDerivative, readCropSource } = useRasterArtwork();

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const paperLabel = (key: PaperSize) => resolvePaperSize(key).label;
	const artwork = computed(() => parseStationery(store.settings?.pdf_stationery).background);
	const canRecrop = computed(() => artwork.value.ext !== null && isRasterArtwork(artwork.value.ext));

	const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
	const dragOver = ref(false);
	const busy = ref(false);
	const pick = () => {
		if (!props.locked) fileInput.value?.click();
	};

	// ---- preview -------------------------------------------------------
	// Shared with the Stationery thumbnail and editor: the file itself, or for
	// a PDF its first page rendered to PNG by Typst.
	const artworkPreview = useStationeryArtwork();

	// ---- saving --------------------------------------------------------
	const recordArtwork = async (next: BackgroundArtwork) => {
		await store.save({ pdf_stationery: setBackgroundArtwork(store.settings?.pdf_stationery, next) });
		emit("artwork", next.paper);
		await artworkPreview.reload();
	};

	// ---- crop ----------------------------------------------------------
	const cropOpen = ref(false);
	const cropBlob = ref<Blob | null>(null);
	const cropInitial = ref<CropRect | null>(null);
	const cropExt = ref<ArtworkExt>("png");
	// The untouched upload waiting on a crop; written only once the crop is
	// applied, so cancelling a fresh upload leaves the old background intact.
	const pendingOriginal = ref<Uint8Array | null>(null);

	const onCropped = async (rect: CropRect, blob: Blob) => {
		busy.value = true;
		try {
			if (pendingOriginal.value) await saveRaster(ASSETS, cropExt.value, pendingOriginal.value, blob);
			else await saveDerivative(ASSETS, cropExt.value, blob);
			await recordArtwork({ ext: cropExt.value, paper: props.paper, crop: rect, live_text: false });
			toast.add({ title: "Background updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail("Background upload failed", err);
		} finally {
			pendingOriginal.value = null;
			busy.value = false;
		}
	};

	// Kept-alive page (like pdf.vue's editorOpen): leaving mid-crop must not
	// bring back an open crop of an upload the user walked away from — or keep
	// its bytes around to be written by a later Apply.
	onDeactivated(() => {
		cropOpen.value = false;
		cropBlob.value = null;
		cropInitial.value = null;
		pendingOriginal.value = null;
		dragOver.value = false;
	});

	// Re-crop starts from the untouched ORIGINAL upload, with the stored crop
	// reshaped to the picked paper (ImageCropModal → fitCropToAspect) — after
	// a Paper size change to or from Letter / Legal that is how the artwork
	// gets its new proportions back. No original (it was already the paper's
	// shape): crop the artwork itself.
	const openRecrop = async () => {
		if (props.locked || !artwork.value.ext) return;
		try {
			const source = await readCropSource(ASSETS, artwork.value.crop);
			cropExt.value = source.ext;
			pendingOriginal.value = null;
			cropBlob.value = source.blob;
			cropInitial.value = source.initial;
			cropOpen.value = true;
		} catch (err) {
			fail("Couldn't open crop", err);
		}
	};

	// ---- upload --------------------------------------------------------
	const upload = async (file: File) => {
		if (props.locked) return;
		const ext = artworkFormatOf(file.name);
		if (!ext) {
			toast.add({ title: "Use an SVG, PDF, PNG or JPEG file", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		busy.value = true;
		try {
			const id = activeId();
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (!isRasterArtwork(ext)) {
				// Vector (SVG / PDF): stored as uploaded, covering the page uncropped.
				const liveText = ext === "svg" && svgHasLiveText(new TextDecoder().decode(bytes));
				await saveBusinessAsset(id, ASSETS.asset, ext, bytes);
				await removeBusinessAsset(id, ASSETS.original);
				await recordArtwork({ ext, paper: props.paper, crop: null, live_text: liveText });
				toast.add(liveText
					? { title: "Background updated — its text isn't outlined", description: "See the note under the buttons.", color: "warning", icon: "i-lucide-type" }
					: { title: "Background updated", color: "success", icon: "i-lucide-check" });
				return;
			}
			const img = await loadImage(new Blob([bytes], { type: artworkMimeOf(ext) }));
			if (matchesPaperAspect(img.naturalWidth, img.naturalHeight, props.paper)) {
				await saveRaster(ASSETS, ext, bytes, await downscaled(img, ext, props.paper));
				await recordArtwork({ ext, paper: props.paper, crop: null, live_text: false });
				toast.add({ title: "Background updated", color: "success", icon: "i-lucide-check" });
				return;
			}
			// Not the paper's shape: crop first (aspect-locked), saved on Apply.
			cropExt.value = ext;
			pendingOriginal.value = bytes;
			cropBlob.value = new Blob([bytes], { type: artworkMimeOf(ext) });
			cropInitial.value = null;
			cropOpen.value = true;
		} catch (err) {
			fail("Background upload failed", err);
		} finally {
			busy.value = false;
		}
	};

	const onFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await upload(file);
	};

	const onDrop = async (event: DragEvent) => {
		dragOver.value = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) await upload(file);
	};

	// Remove deletes the artwork and its original. Switching modes never does.
	const remove = async () => {
		if (props.locked) return;
		busy.value = true;
		try {
			const id = activeId();
			await removeBusinessAsset(id, ASSETS.asset);
			await removeBusinessAsset(id, ASSETS.original);
			await store.save({ pdf_stationery: clearBackgroundArtwork(store.settings?.pdf_stationery) });
			emit("artwork", null);
			toast.add({ title: "Background removed", color: "info", icon: "i-lucide-image-off" });
		} catch (err) {
			fail("Couldn't remove the background", err);
		} finally {
			busy.value = false;
		}
	};
</script>
