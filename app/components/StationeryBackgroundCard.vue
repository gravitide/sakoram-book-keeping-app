<template>
	<SectionCard
		icon="i-lucide-file-image"
		title="Full-page background"
		subtitle="Your letterhead as one page-sized artwork, drawn behind the content of every page. SVG or PDF stay sharp at any size; PNG and JPEG are cropped to the paper and kept at print resolution."
	>
		<div class="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
			<!-- The page, to scale, with the Safe area the margins leave. White
				in both themes: it previews against the paper. -->
			<div class="flex flex-col items-center gap-2">
				<div
					class="relative w-44 rounded-md border-2 border-dashed overflow-hidden bg-white transition cursor-pointer"
					:class="dragOver ? 'border-(--ui-primary) scale-[1.01]' : 'border-(--ui-border-accented) hover:border-(--ui-primary)/60'"
					:style="{ aspectRatio: `${paperInfo.widthMm} / ${paperInfo.heightMm}` }"
					role="button"
					tabindex="0"
					aria-label="Upload a full-page background"
					@click="pick"
					@keydown.enter.prevent="pick"
					@keydown.space.prevent="pick"
					@dragover.prevent="dragOver = true"
					@dragenter.prevent="dragOver = true"
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
						v-if="previewUrl"
						:src="previewUrl"
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
					<!-- Safe area -->
					<div
						class="absolute border border-dashed border-(--ui-primary) pointer-events-none"
						:style="safeAreaStyle"
					/>
					<div v-if="busy" class="absolute inset-0 bg-white/70 flex items-center justify-center">
						<UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-zinc-500" />
					</div>
				</div>
				<div class="text-[11px] text-(--ui-text-muted)">
					{{ paperInfo.label }} · dashed line = Safe area
				</div>
			</div>

			<div class="space-y-4">
				<div class="flex flex-wrap gap-2">
					<UButton
						icon="i-lucide-upload"
						size="sm"
						variant="soft"
						:loading="busy"
						@click="pick"
					>
						{{ artwork.ext ? "Replace" : "Upload" }}
					</UButton>
					<UButton
						v-if="canRecrop"
						icon="i-lucide-crop"
						size="sm"
						variant="soft"
						color="neutral"
						:disabled="busy"
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
						:disabled="busy"
						@click="remove"
					>
						Remove
					</UButton>
				</div>

				<p v-if="!artwork.ext" class="text-xs text-(--ui-text-muted)">
					No background yet — documents print with blank margins until you upload one.
				</p>
				<p v-else-if="artwork.paper && artwork.paper !== paper" class="text-xs text-(--ui-warning)">
					This artwork was prepared for {{ paperLabel(artwork.paper) }} — it is scaled to cover {{ paperInfo.label }}. Upload artwork made for {{ paperInfo.label }} for the best fit.
				</p>

				<UAlert
					v-if="artwork.ext === 'svg' && artwork.live_text"
					color="warning"
					variant="subtle"
					icon="i-lucide-type"
					title="Convert the text to outlines"
					description="This SVG still contains live text. The PDF uses only Sakoram's bundled fonts, so your letterhead's lettering may come out in a different typeface. In your design app, convert text to outlines (paths) and upload it again."
				/>

				<div>
					<div class="text-sm font-medium mb-1">
						Safe area margins
					</div>
					<p class="text-xs text-(--ui-text-muted) mb-3">
						How far the content stays from each edge, so it never prints over your artwork. Page numbers sit just inside the bottom margin.
					</p>
					<div class="grid grid-cols-2 gap-4 max-w-md">
						<UFormField label="Top (mm)">
							<UInputNumber v-model="margins.top" :min="0" :max="MAX_BAND_MM" :step="1" />
						</UFormField>
						<UFormField label="Bottom (mm)">
							<UInputNumber v-model="margins.bottom" :min="0" :max="MAX_BAND_MM" :step="1" />
						</UFormField>
						<UFormField label="Left (mm)">
							<UInputNumber v-model="margins.left" :min="0" :max="MAX_BAND_MM" :step="1" />
						</UFormField>
						<UFormField label="Right (mm)">
							<UInputNumber v-model="margins.right" :min="0" :max="MAX_BAND_MM" :step="1" />
						</UFormField>
					</div>
				</div>
			</div>
		</div>

		<ImageCropModal
			v-model:open="cropOpen"
			:image-blob="cropBlob"
			:initial-rect="cropInitial"
			:aspect="paperInfo.widthMm / paperInfo.heightMm"
			:max-output="backgroundPixelSize(paper)"
			:output-type="cropExt === 'jpg' ? 'image/jpeg' : 'image/png'"
			title="Crop background to the page"
			:hint="`Your image isn't ${paperInfo.label}-shaped. Choose the part that fills the page; the crop is locked to the paper's proportions. Your original upload is kept.`"
			@cropped="onCropped"
		/>
	</SectionCard>
</template>

<script setup lang="ts">
	// Full-page background Stationery: upload / crop / downscale / remove the
	// artwork, and the four Safe-area margins (number inputs; the visual editor
	// is a follow-up).
	//
	// Files go through Rust commands only (a business folder can live on any
	// drive — see CLAUDE.md): stationery/background.<ext> is what PDFs render;
	// stationery/background-original.<ext> keeps an untouched raster upload for
	// Re-crop. company_settings.pdf_stationery records only the format, the
	// paper it was prepared for, the crop and the live-text flag — never a path.
	//
	// Artwork changes save immediately (like the header logo); the margins are
	// part of the page's form and save with Save changes.
	import type { CropRect } from "~/lib/crop-rect";
	import type { PaperSize } from "~/lib/page-settings";
	import type { BackgroundArtwork, BackgroundExt, StationeryMarginsMm } from "~/lib/stationery";
	import { invoke } from "@tauri-apps/api/core";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { clearBackgroundArtwork, MAX_BAND_MM, parseStationery, setBackgroundArtwork } from "~/lib/stationery";
	import { backgroundFormatOf, backgroundPixelSize, downscaleSize, isRasterBackground, matchesPaperAspect, svgHasLiveText } from "~/lib/stationery-artwork";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	const props = defineProps<{
		/** The business's Paper size as currently picked on the page (maybe unsaved). */
		paper: PaperSize
	}>();
	const margins = defineModel<StationeryMarginsMm>("margins", { required: true });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const paperLabel = (key: PaperSize) => resolvePaperSize(key).label;
	const artwork = computed(() => parseStationery(store.settings?.pdf_stationery).background);
	const canRecrop = computed(() => artwork.value.ext !== null && isRasterBackground(artwork.value.ext));

	const pct = (mm: number, of: number) => `${Math.min(100, Math.max(0, (mm / of) * 100))}%`;
	const safeAreaStyle = computed(() => ({
		top: pct(margins.value.top, paperInfo.value.heightMm),
		bottom: pct(margins.value.bottom, paperInfo.value.heightMm),
		left: pct(margins.value.left, paperInfo.value.widthMm),
		right: pct(margins.value.right, paperInfo.value.widthMm)
	}));

	const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
	const dragOver = ref(false);
	const busy = ref(false);
	const pick = () => fileInput.value?.click();

	const mimeOf = (ext: string) => ({ svg: "image/svg+xml", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }[ext] ?? "application/octet-stream");

	const fail = (title: string, err: unknown) => toast.add({
		title,
		description: err instanceof Error ? err.message : String(err),
		color: "error",
		icon: "i-lucide-circle-alert"
	});

	// ---- preview -------------------------------------------------------
	// Bytes via Rust → blob URL (asset:// URLs can't reach a folder on any
	// drive). A PDF has no <img> preview; the tile says so instead.
	const previewUrl = ref<string | null>(null);
	const setPreview = (url: string | null) => {
		if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
		previewUrl.value = url;
	};
	const loadPreview = async () => {
		const tenantId = tenants.activeTenantId;
		const ext = artwork.value.ext;
		if (!tenantId || !ext || ext === "pdf") return setPreview(null);
		try {
			const [readExt, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenantId, kind: "stationery-background" });
			setPreview(URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeOf(readExt) })));
		} catch {
			setPreview(null);
		}
	};
	watch(() => store.settings?.pdf_stationery, loadPreview, { immediate: true });
	onActivated(loadPreview);
	onBeforeUnmount(() => setPreview(null));

	// ---- saving --------------------------------------------------------
	const saveAsset = (kind: string, ext: string, bytes: Uint8Array) =>
		invoke<string>("save_business_asset", { id: tenants.activeTenantId, kind, ext, bytes: Array.from(bytes) });

	const recordArtwork = async (next: BackgroundArtwork) => {
		await store.save({ pdf_stationery: setBackgroundArtwork(store.settings?.pdf_stationery, next) });
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

	// Whole image, downscaled to ~300 DPI at the paper size (never enlarged).
	const downscaled = async (img: HTMLImageElement, ext: BackgroundExt): Promise<Uint8Array> => {
		const out = downscaleSize(img.naturalWidth, img.naturalHeight, backgroundPixelSize(props.paper));
		const canvas = document.createElement("canvas");
		canvas.width = out.w;
		canvas.height = out.h;
		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(img, 0, 0, out.w, out.h);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeOf(ext), 0.92));
		if (!blob) throw new Error("Couldn't encode the image.");
		return new Uint8Array(await blob.arrayBuffer());
	};

	// ---- crop ----------------------------------------------------------
	const cropOpen = ref(false);
	const cropBlob = ref<Blob | null>(null);
	const cropInitial = ref<CropRect | null>(null);
	const cropExt = ref<BackgroundExt>("png");
	// The untouched upload waiting on a crop; written only once the crop is
	// applied, so cancelling a fresh upload leaves the old background intact.
	const pendingOriginal = ref<Uint8Array | null>(null);

	const onCropped = async (rect: CropRect, blob: Blob) => {
		busy.value = true;
		try {
			if (pendingOriginal.value) await saveAsset("stationery-background-original", cropExt.value, pendingOriginal.value);
			await saveAsset("stationery-background", cropExt.value, new Uint8Array(await blob.arrayBuffer()));
			await recordArtwork({ ext: cropExt.value, paper: props.paper, crop: rect, live_text: false });
			toast.add({ title: "Background updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail("Background upload failed", err);
		} finally {
			pendingOriginal.value = null;
			busy.value = false;
		}
	};

	const openRecrop = async () => {
		if (!tenants.activeTenantId || !artwork.value.ext) return;
		try {
			let ext: string;
			let bytes: number[];
			let initial = artwork.value.crop;
			try {
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenants.activeTenantId, kind: "stationery-background-original" });
			} catch {
				// No original (e.g. it was already the paper's shape): crop the artwork itself.
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenants.activeTenantId, kind: "stationery-background" });
				initial = null;
			}
			cropExt.value = backgroundFormatOf(`x.${ext}`) ?? "png";
			pendingOriginal.value = null;
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: mimeOf(cropExt.value) });
			cropInitial.value = initial;
			cropOpen.value = true;
		} catch (err) {
			fail("Couldn't open crop", err);
		}
	};

	// ---- upload --------------------------------------------------------
	const upload = async (file: File) => {
		if (!tenants.activeTenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		const ext = backgroundFormatOf(file.name);
		if (!ext) {
			toast.add({ title: "Use an SVG, PDF, PNG or JPEG file", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		busy.value = true;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (!isRasterBackground(ext)) {
				// Vector (SVG / PDF): stored as uploaded, covering the page uncropped.
				const liveText = ext === "svg" && svgHasLiveText(new TextDecoder().decode(bytes));
				await saveAsset("stationery-background", ext, bytes);
				await invoke("remove_business_asset", { id: tenants.activeTenantId, kind: "stationery-background-original" });
				await recordArtwork({ ext, paper: props.paper, crop: null, live_text: liveText });
				toast.add(liveText
					? { title: "Background updated — its text isn't outlined", description: "See the note under the buttons.", color: "warning", icon: "i-lucide-type" }
					: { title: "Background updated", color: "success", icon: "i-lucide-check" });
				return;
			}
			const img = await loadImage(new Blob([bytes], { type: mimeOf(ext) }));
			if (matchesPaperAspect(img.naturalWidth, img.naturalHeight, props.paper)) {
				await saveAsset("stationery-background-original", ext, bytes);
				await saveAsset("stationery-background", ext, await downscaled(img, ext));
				await recordArtwork({ ext, paper: props.paper, crop: null, live_text: false });
				toast.add({ title: "Background updated", color: "success", icon: "i-lucide-check" });
				return;
			}
			// Not the paper's shape: crop first (aspect-locked), saved on Apply.
			cropExt.value = ext;
			pendingOriginal.value = bytes;
			cropBlob.value = new Blob([bytes], { type: mimeOf(ext) });
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
		if (!tenants.activeTenantId) return;
		busy.value = true;
		try {
			await invoke("remove_business_asset", { id: tenants.activeTenantId, kind: "stationery-background" });
			await invoke("remove_business_asset", { id: tenants.activeTenantId, kind: "stationery-background-original" });
			await store.save({ pdf_stationery: clearBackgroundArtwork(store.settings?.pdf_stationery) });
			toast.add({ title: "Background removed", color: "info", icon: "i-lucide-image-off" });
		} catch (err) {
			fail("Couldn't remove the background", err);
		} finally {
			busy.value = false;
		}
	};
</script>
