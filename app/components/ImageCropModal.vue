<template>
	<UModal
		v-model:open="openModel"
		:ui="{ content: 'max-w-3xl' }"
		title="Crop header logo"
		:description="sourceNote || 'Drag to reposition; pull a corner to resize. The crop is applied to the PDF header only — your original upload is kept.'"
	>
		<template #body>
			<!-- White stage: the PDF background is white, so the crop is judged
				against the truth. Fixed even in dark mode. -->
			<div
				ref="stageEl"
				class="relative w-full select-none bg-white rounded-md ring-1 ring-(--ui-border) overflow-hidden touch-none"
				:style="{ height: `${stageH}px`, cursor: dragMode === 'move' ? 'move' : 'default' }"
				@pointerdown="onPointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
			>
				<img v-if="imgUrl" :src="imgUrl" alt="" class="absolute" :style="imgStyle" draggable="false">
				<template v-if="img">
					<!-- Dim everything outside the crop rect -->
					<div v-for="(s, i) in shadeStyles" :key="i" class="absolute bg-black/50 pointer-events-none" :style="s" />
					<div class="absolute border-2 border-(--ui-primary) pointer-events-none" :style="rectStyle">
						<span
							v-for="c in corners"
							:key="c"
							class="absolute size-3 bg-(--ui-primary) rounded-full pointer-events-auto"
							:style="handleStyle(c)"
							:data-corner="c"
						/>
					</div>
				</template>
			</div>
			<div class="mt-2 text-xs text-(--ui-text-muted) tabular-nums">
				{{ rect.w }} × {{ rect.h }} px
			</div>
		</template>
		<template #footer>
			<div class="flex items-center justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="onCancel">
					Cancel
				</UButton>
				<UButton color="neutral" variant="soft" icon="i-lucide-maximize" @click="onReset">
					Reset
				</UButton>
				<UButton icon="i-lucide-crop" :loading="applying" @click="onApply">
					Apply crop
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { CropRect } from "~/lib/crop-rect";
	import { fullRect, moveRect, resizeRect } from "~/lib/crop-rect";

	const props = defineProps<{
		imageBlob: Blob | null
		initialRect?: CropRect | null
		sourceNote?: string
	}>();
	const emit = defineEmits<{
		cropped: [rect: CropRect, blob: Blob]
		cancel: []
	}>();
	const openModel = defineModel<boolean>("open", { default: false });

	const stageEl = ref<HTMLElement | null>(null);
	const stageH = 360;
	const img = ref<HTMLImageElement | null>(null);
	const imgUrl = ref<string | null>(null);
	const rect = ref<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
	const applying = ref(false);

	// Display transform: image scaled to fit the stage, centred.
	const view = ref({ scale: 1, ox: 0, oy: 0 });

	const loadImage = async () => {
		if (imgUrl.value) URL.revokeObjectURL(imgUrl.value);
		img.value = null;
		imgUrl.value = null;
		if (!props.imageBlob) return;
		const url = URL.createObjectURL(props.imageBlob);
		imgUrl.value = url;
		const el = new Image();
		await new Promise<void>((resolve, reject) => {
			el.onload = () => resolve();
			el.onerror = () => reject(new Error("image load failed"));
			el.src = url;
		});
		img.value = el;
		const stageW = stageEl.value?.clientWidth ?? 640;
		// Inset the image from the stage edges so a full-image crop rect never
		// touches the border — the corner handles extend 6px OUTSIDE the rect
		// and the stage is overflow-hidden, so a flush fit would clip them.
		const pad = 16;
		const scale = Math.min((stageW - pad * 2) / el.naturalWidth, (stageH - pad * 2) / el.naturalHeight, 1);
		view.value = {
			scale,
			ox: (stageW - el.naturalWidth * scale) / 2,
			oy: (stageH - el.naturalHeight * scale) / 2
		};
		rect.value = props.initialRect ?? fullRect(el.naturalWidth, el.naturalHeight);
	};

	watch(() => [openModel.value, props.imageBlob] as const, async ([open]) => {
		if (open && props.imageBlob) {
			await nextTick();
			await loadImage();
		}
	}, { immediate: true });

	onBeforeUnmount(() => {
		if (imgUrl.value) URL.revokeObjectURL(imgUrl.value);
	});

	const toDisplay = (r: CropRect) => ({
		left: view.value.ox + r.x * view.value.scale,
		top: view.value.oy + r.y * view.value.scale,
		width: r.w * view.value.scale,
		height: r.h * view.value.scale
	});
	const imgStyle = computed(() => img.value
		? {
			left: `${view.value.ox}px`,
			top: `${view.value.oy}px`,
			width: `${img.value.naturalWidth * view.value.scale}px`,
			height: `${img.value.naturalHeight * view.value.scale}px`
		}
		: {});
	const rectStyle = computed(() => {
		const d = toDisplay(rect.value);
		return { left: `${d.left}px`, top: `${d.top}px`, width: `${d.width}px`, height: `${d.height}px` };
	});
	// Four shade panels around the rect (top / bottom / left / right bands).
	const shadeStyles = computed(() => {
		const d = toDisplay(rect.value);
		return [
			{ left: "0px", top: "0px", right: "0px", height: `${d.top}px` },
			{ left: "0px", top: `${d.top + d.height}px`, right: "0px", bottom: "0px" },
			{ left: "0px", top: `${d.top}px`, width: `${d.left}px`, height: `${d.height}px` },
			{ left: `${d.left + d.width}px`, top: `${d.top}px`, right: "0px", height: `${d.height}px` }
		];
	});

	const corners = ["nw", "ne", "sw", "se"] as const;
	const handleStyle = (c: string) => ({
		left: c.includes("w") ? "-6px" : undefined,
		right: c.includes("e") ? "-6px" : undefined,
		top: c.includes("n") ? "-6px" : undefined,
		bottom: c.includes("s") ? "-6px" : undefined,
		cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize"
	});

	// Pointer state: what is being dragged and where it started.
	const dragMode = ref<"move" | "nw" | "ne" | "sw" | "se" | null>(null);
	const last = ref({ x: 0, y: 0 });

	const onPointerDown = (e: PointerEvent) => {
		if (!img.value || !stageEl.value) return;
		const corner = (e.target as HTMLElement).dataset?.corner as typeof dragMode.value;
		const stage = stageEl.value.getBoundingClientRect();
		const px = e.clientX - stage.left;
		const py = e.clientY - stage.top;
		const d = toDisplay(rect.value);
		const inRect = px >= d.left && px <= d.left + d.width && py >= d.top && py <= d.top + d.height;
		dragMode.value = corner ?? (inRect ? "move" : null);
		if (!dragMode.value) return;
		last.value = { x: e.clientX, y: e.clientY };
		stageEl.value.setPointerCapture(e.pointerId);
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!dragMode.value || !img.value) return;
		const dx = (e.clientX - last.value.x) / view.value.scale;
		const dy = (e.clientY - last.value.y) / view.value.scale;
		last.value = { x: e.clientX, y: e.clientY };
		const iw = img.value.naturalWidth;
		const ih = img.value.naturalHeight;
		rect.value = dragMode.value === "move"
			? moveRect(rect.value, dx, dy, iw, ih)
			: resizeRect(rect.value, dragMode.value, dx, dy, iw, ih);
	};
	const onPointerUp = () => {
		dragMode.value = null;
	};

	const onReset = () => {
		if (img.value) rect.value = fullRect(img.value.naturalWidth, img.value.naturalHeight);
	};
	const onCancel = () => {
		openModel.value = false;
		emit("cancel");
	};
	const onApply = async () => {
		if (!img.value) return;
		applying.value = true;
		try {
			const r = rect.value;
			const canvas = document.createElement("canvas");
			canvas.width = r.w;
			canvas.height = r.h;
			const ctx = canvas.getContext("2d")!;
			ctx.drawImage(img.value, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
			if (!blob) throw new Error("crop export failed");
			openModel.value = false;
			emit("cropped", { ...r }, blob);
		} finally {
			applying.value = false;
		}
	};
</script>
