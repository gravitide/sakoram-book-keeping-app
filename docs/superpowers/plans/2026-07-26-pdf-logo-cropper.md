# PDF Header Logo Cropper + Size Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-destructive cropping, a 50–150% size slider, a white-background upload tile, and a Preview-on-PDF button for the header logo.

**Architecture:** The original upload is kept as `pdf-header-original.<ext>`; a hand-rolled canvas crop modal produces the `pdf-header.<ext>` derivative the PDFs render. A shared `header-logo(data, base-h)` helper in `common.typ` replaces all nine hardcoded `image(height: …)` sites, applying the per-business scale and a 55mm width clamp via `measure()`. Crop-rect math is pure and unit-tested in `app/lib/crop-rect.ts`.

**Tech Stack:** Nuxt 4 / NuxtUI 4 (`USlider`, `UModal`), canvas 2D, sqlx migration, Typst `context`/`measure`.

**Spec:** `docs/superpowers/specs/2026-07-26-pdf-logo-cropper-design.md`

## Global Constraints

- **bun** only; bash on Windows. Branch `feat/pdf-logo-cropper` exists and is checked out. Never work on `main`.
- **No Claude Code footer in commit messages.** No push / PR without explicit confirmation.
- Migration file must be registered in `MIGRATIONS` (`src-tauri/src/tenants.rs`); `SCHEMA_VERSION` 50 → **51** (`src-tauri/src/data_io.rs`). New Tauri commands must be registered in `lib.rs` `invoke_handler!` (missing registration reads as a permissions error).
- Version `0.151.0` → **`0.152.0`** across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`.
- Column names, verbatim: **`pdf_logo_scale`** (INTEGER NOT NULL DEFAULT 100, UI range 50–150 step 5), **`pdf_logo_crop`** (TEXT nullable, JSON `{x,y,w,h}` in source pixels).
- Payload field, verbatim: **`logo_scale`** (integer percent). Typst reads it with `data.at("logo_scale", default: 100)` so unmigrated payloads stay safe.
- Width clamp: **55mm**, fixed (not scaled) — it exists for page-layout safety.
- SVG uploads: derivative only, no original, no crop, `pdf_logo_crop` nulled.
- Pure logic in `app/lib/` with sibling `*.test.ts`; never import a Pinia store in a test.
- **Typst standalone templates must use a selective import** — `#import "common.typ": header-logo` — NOT a wildcard. `voucher.typ` / `report.typ` / `statement.typ` define their own `label`/`faint` helpers, and a wildcard import would collide (the exact landmine hit on `payslip.typ` in PR #315).
- Browser verification: call `resize_window` before measuring — a fresh Browser-pane tab has `innerWidth: 0` and every breakpoint is inert.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/migrations/0051_pdf_logo_controls.sql` | Create | Two columns |
| `src-tauri/src/tenants.rs` | Modify | Migration entry; original-asset arm; `read_business_asset` |
| `src-tauri/src/data_io.rs` | Modify | `SCHEMA_VERSION` → 51 |
| `src-tauri/src/lib.rs` | Modify | Register `read_business_asset` |
| `src-tauri/src/pdf.rs` | Modify | `common.typ` companion for voucher/report/statement |
| `app/lib/crop-rect.ts` + `.test.ts` | Create | Pure rect math (clamp / move / resize / full) |
| `app/components/ImageCropModal.vue` | Create | Canvas crop modal |
| `src-tauri/templates/common.typ` | Modify | `header-logo()` helper + its 2 internal sites |
| `src-tauri/templates/{doc-classic,doc-compact,doc-modern,letter,report,statement,voucher}.typ` | Modify | Use the helper (7 sites) |
| `app/lib/{quote,invoice,bill,payslip,voucher,letter,report,statement}-pdf.ts`, `app/lib/sample-pdf.ts` | Modify | Emit `logo_scale` |
| `app/stores/settings.ts` | Modify | Row type + `UPDATABLE_COLUMNS` |
| `app/pages/settings/pdf.vue` | Modify | White tile, crop flow, Re-crop, slider, Preview button |
| `CLAUDE.md`, version files | Modify | Docs + 0.152.0 |

### Sidecar render harness (Tasks 3 and 4)

Same recipe as prior PRs. `$SCRATCH` is the session scratchpad:

```bash
WORK="$SCRATCH/logocheck" && rm -rf "$WORK" && mkdir -p "$WORK"
cp src-tauri/templates/doc-classic.typ src-tauri/templates/common.typ "$WORK/"
# write data.json (invoice-shaped payload with logo_file + logo_scale), then:
./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe compile --root "$WORK" \
  --font-path src-tauri/fonts --format png --ppi 100 "$WORK/doc-classic.typ" "$WORK/out.png"
```

The payload's `logo_file` must name a real image copied into `$WORK` (generate a test PNG with the sidecar itself or reuse any PNG from the repo; an extreme-banner test image can be produced by rendering a tiny `.typ` file containing a colored `#rect(width: 200mm, height: 10mm)`).

---

### Task 1: Schema + Rust plumbing

**Files:**
- Create: `src-tauri/migrations/0051_pdf_logo_controls.sql`
- Modify: `src-tauri/src/tenants.rs` (MIGRATIONS array ~line 106; `save_business_asset` kind match ~line 747; new command below it), `src-tauri/src/data_io.rs:56`, `src-tauri/src/lib.rs` (invoke_handler list), `src-tauri/src/pdf.rs:336,350,365`

**Interfaces:**
- Produces: columns `pdf_logo_scale` / `pdf_logo_crop`; asset kind `"pdf-header-original"`; command `read_business_asset(id, kind) -> (String, Vec<u8>)` (ext, bytes). Tasks 2–4 consume these.

- [ ] **Step 1: Migration**

Create `src-tauri/migrations/0051_pdf_logo_controls.sql`:

```sql
-- Header-logo controls: per-business size multiplier + remembered crop.
--
-- pdf_logo_scale is an integer percent (UI range 50..150, default 100)
-- applied to each template's own baseline logo height (12mm classic, 9mm
-- compact, 14mm voucher...), so relative template intent survives. 100 means
-- existing tenants render byte-identically until they touch the slider.
--
-- pdf_logo_crop is the last crop rect as JSON {x,y,w,h} in source-image
-- pixels, kept so "Re-crop" can reopen the original where the user left off.
-- NULL for SVG logos (never cropped - cropping would rasterise a vector) and
-- for logos uploaded before this feature.

ALTER TABLE company_settings ADD COLUMN pdf_logo_scale INTEGER NOT NULL DEFAULT 100;
ALTER TABLE company_settings ADD COLUMN pdf_logo_crop TEXT;
```

- [ ] **Step 2: Register + bump**

`tenants.rs`, after the migration-50 entry:

```rust
	(51, "pdf logo controls", include_str!("../migrations/0051_pdf_logo_controls.sql")),
```

`data_io.rs:56`: `pub const SCHEMA_VERSION: i32 = 51;`

- [ ] **Step 3: Original-asset arm**

In `save_business_asset`'s `match kind.as_str()`, add:

```rust
		"pdf-header-original" => (folder_for(&app, &id)?, "pdf-header-original"),
```

- [ ] **Step 4: `read_business_asset`**

Below `save_business_asset` in `tenants.rs`:

```rust
/// Read a business asset's bytes for the frontend. Needed by the logo crop
/// modal: canvas pixel access requires a same-origin image, and the asset
/// protocol's convertFileSrc URLs are cross-origin (drawing one taints the
/// canvas, making toBlob throw). Bytes -> blob URL keeps the canvas clean.
/// Returns (extension, bytes); errors when no file exists for the stem.
#[tauri::command]
pub fn read_business_asset(
	app: AppHandle,
	id: String,
	kind: String,
) -> Result<(String, Vec<u8>), String> {
	let (dir, stem) = match kind.as_str() {
		"logo" => (logos_dir_for(&app, &id)?, "logo"),
		"pdf-header" => (folder_for(&app, &id)?, "pdf-header"),
		"pdf-header-original" => (folder_for(&app, &id)?, "pdf-header-original"),
		_ => return Err(format!("unknown asset kind: {kind}")),
	};
	let entries = std::fs::read_dir(&dir).map_err(|e| format!("read asset dir: {e}"))?;
	for entry in entries.flatten() {
		let p = entry.path();
		if p.file_stem().and_then(|s| s.to_str()) == Some(stem) && p.is_file() {
			let ext = p
				.extension()
				.and_then(|s| s.to_str())
				.unwrap_or("png")
				.to_lowercase();
			let bytes = std::fs::read(&p).map_err(|e| format!("read asset: {e}"))?;
			return Ok((ext, bytes));
		}
	}
	Err(format!("no {kind} asset found"))
}
```

Register in `lib.rs`'s `invoke_handler!` list next to `tenants::save_business_asset`:

```rust
			tenants::read_business_asset,
```

- [ ] **Step 5: Companion files for the three standalone renders**

In `pdf.rs`, change the last argument `&[]` to
`&[("common.typ", COMMON_TEMPLATE)]` in `export_voucher_pdf` (line ~336),
`export_report_pdf` (~350), and `export_statement_pdf` (~365). (Payslip and
letter already ship it; the doc family always has.)

- [ ] **Step 6: Verify + commit**

Run: `cd src-tauri && cargo check` → `Finished`.

```bash
git add src-tauri/migrations/0051_pdf_logo_controls.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs src-tauri/src/lib.rs src-tauri/src/pdf.rs
git commit -m "feat: logo-control schema + business-asset read command (migration 0051)"
```

---

### Task 2: Crop-rect math (TDD) + crop modal component

**Files:**
- Create: `app/lib/crop-rect.ts`, `app/lib/crop-rect.test.ts`, `app/components/ImageCropModal.vue`

**Interfaces:**
- Produces:
  - `CropRect { x: number, y: number, w: number, h: number }`
  - `fullRect(imgW, imgH): CropRect`
  - `moveRect(rect, dx, dy, imgW, imgH): CropRect`
  - `resizeRect(rect, corner: "nw" | "ne" | "sw" | "se", dx, dy, imgW, imgH, minSize?): CropRect`
  - `<ImageCropModal v-model:open :image-blob :initial-rect :source-note @cropped @cancel>` where `cropped` emits `(rect: CropRect, blob: Blob)`.
- Task 4 consumes both.

- [ ] **Step 1: Failing tests**

Create `app/lib/crop-rect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fullRect, moveRect, resizeRect } from "./crop-rect";

describe("fullRect", () => {
	it("covers the whole image", () => {
		expect(fullRect(800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
	});
});

describe("moveRect", () => {
	it("moves freely inside bounds", () => {
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, 20, 5, 800, 600))
			.toEqual({ x: 30, y: 15, w: 100, h: 50 });
	});

	it("clamps at the edges without shrinking", () => {
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, -999, -999, 800, 600))
			.toEqual({ x: 0, y: 0, w: 100, h: 50 });
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, 9999, 9999, 800, 600))
			.toEqual({ x: 700, y: 550, w: 100, h: 50 });
	});
});

describe("resizeRect", () => {
	it("se drag grows width and height", () => {
		expect(resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "se", 40, 30, 800, 600))
			.toEqual({ x: 10, y: 10, w: 140, h: 80 });
	});

	it("nw drag moves the origin and shrinks", () => {
		expect(resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "nw", 5, 5, 800, 600))
			.toEqual({ x: 15, y: 15, w: 95, h: 45 });
	});

	it("never collapses below minSize", () => {
		const r = resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "se", -999, -999, 800, 600, 16);
		expect(r.w).toBe(16);
		expect(r.h).toBe(16);
	});

	it("never escapes the image bounds", () => {
		const r = resizeRect({ x: 700, y: 550, w: 100, h: 50 }, "se", 999, 999, 800, 600);
		expect(r.x + r.w).toBeLessThanOrEqual(800);
		expect(r.y + r.h).toBeLessThanOrEqual(600);
	});

	it("rounds to whole pixels", () => {
		const r = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, "se", 0.4, 0.6, 800, 600);
		expect([r.x, r.y, r.w, r.h].every(Number.isInteger)).toBe(true);
	});
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun run test -- crop-rect` → FAIL (module not found).

- [ ] **Step 3: Implement `app/lib/crop-rect.ts`**

```ts
// Pure rect math for the header-logo crop modal. All values are integer
// SOURCE-image pixels — the modal converts pointer deltas from display space
// before calling in, and rounds happen here so the stored crop is exact.
// Pure (no Vue/Tauri) per house rule so it's unit-testable in node.

export interface CropRect {
	x: number
	y: number
	w: number
	h: number
}

const round = (r: CropRect): CropRect =>
	({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** The whole image — the Reset state and the default for a fresh crop. */
export function fullRect(imgW: number, imgH: number): CropRect {
	return { x: 0, y: 0, w: imgW, h: imgH };
}

/** Translate without resizing; clamps so the rect stays fully inside. */
export function moveRect(rect: CropRect, dx: number, dy: number, imgW: number, imgH: number): CropRect {
	const x = Math.min(Math.max(rect.x + dx, 0), imgW - rect.w);
	const y = Math.min(Math.max(rect.y + dy, 0), imgH - rect.h);
	return round({ ...rect, x, y });
}

/**
 * Drag one corner. The opposite corner stays anchored; result is clamped to
 * the image and to minSize per axis (no flip-through: dragging past the
 * anchor pins at minSize rather than inverting).
 */
export function resizeRect(
	rect: CropRect,
	corner: "nw" | "ne" | "sw" | "se",
	dx: number,
	dy: number,
	imgW: number,
	imgH: number,
	minSize = 16
): CropRect {
	let { x, y, w, h } = rect;
	const right = x + w;
	const bottom = y + h;

	if (corner === "nw" || corner === "sw") {
		const nx = Math.min(Math.max(x + dx, 0), right - minSize);
		w = right - nx;
		x = nx;
	} else {
		w = Math.min(Math.max(w + dx, minSize), imgW - x);
	}
	if (corner === "nw" || corner === "ne") {
		const ny = Math.min(Math.max(y + dy, 0), bottom - minSize);
		h = bottom - ny;
		y = ny;
	} else {
		h = Math.min(Math.max(h + dy, minSize), imgH - y);
	}
	return round({ x, y, w, h });
}
```

- [ ] **Step 4: Run, expect pass**

Run: `bun run test -- crop-rect` → PASS, 8 tests.

- [ ] **Step 5: `ImageCropModal.vue`**

Create `app/components/ImageCropModal.vue`. Structure (complete component —
adjust only if lint reflows):

```vue
<template>
	<UModal v-model:open="openModel" :ui="{ content: 'max-w-3xl' }" title="Crop header logo" :description="sourceNote || 'Drag to reposition; pull a corner to resize. The crop is applied to the PDF header only — your original upload is kept.'">
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
					<div v-for="(s, i) in shadeStyles" :key="i" class="absolute bg-black/50" :style="s" />
					<div class="absolute border-2 border-(--ui-primary)" :style="rectStyle">
						<span
							v-for="c in corners"
							:key="c"
							class="absolute size-3 bg-(--ui-primary) rounded-full"
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
		const scale = Math.min(stageW / el.naturalWidth, stageH / el.naturalHeight, 1);
		view.value = {
			scale,
			ox: (stageW - el.naturalWidth * scale) / 2,
			oy: (stageH - el.naturalHeight * scale) / 2
		};
		rect.value = props.initialRect ?? fullRect(el.naturalWidth, el.naturalHeight);
	};

	watch(() => [openModel.value, props.imageBlob], async () => {
		if (openModel.value && props.imageBlob) await nextTick().then(loadImage);
	}, { immediate: true });

	onBeforeUnmount(() => { if (imgUrl.value) URL.revokeObjectURL(imgUrl.value); });

	const toDisplay = (r: CropRect) => ({
		left: `${view.value.ox + r.x * view.value.scale}px`,
		top: `${view.value.oy + r.y * view.value.scale}px`,
		width: `${r.w * view.value.scale}px`,
		height: `${r.h * view.value.scale}px`
	});
	const imgStyle = computed(() => img.value
		? {
				left: `${view.value.ox}px`,
				top: `${view.value.oy}px`,
				width: `${img.value.naturalWidth * view.value.scale}px`,
				height: `${img.value.naturalHeight * view.value.scale}px`
			}
		: {});
	const rectStyle = computed(() => toDisplay(rect.value));
	// Four shade panels around the rect (top / bottom / left / right bands).
	const shadeStyles = computed(() => {
		const d = toDisplay(rect.value);
		const l = parseFloat(d.left);
		const t = parseFloat(d.top);
		const w = parseFloat(d.width);
		const h = parseFloat(d.height);
		return [
			{ left: "0px", top: "0px", right: "0px", height: `${t}px` },
			{ left: "0px", top: `${t + h}px`, right: "0px", bottom: "0px" },
			{ left: "0px", top: `${t}px`, width: `${l}px`, height: `${h}px` },
			{ left: `${l + w}px`, top: `${t}px`, right: "0px", height: `${h}px` }
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
		if (!img.value) return;
		const corner = (e.target as HTMLElement).dataset?.corner as typeof dragMode.value;
		const d = toDisplay(rect.value);
		const l = parseFloat(d.left);
		const t = parseFloat(d.top);
		const inRect
			= e.offsetX >= l && e.offsetX <= l + parseFloat(d.width)
				&& e.offsetY >= t && e.offsetY <= t + parseFloat(d.height);
		dragMode.value = corner ?? (inRect ? "move" : null);
		if (!dragMode.value) return;
		last.value = { x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
	const onPointerUp = () => { dragMode.value = null; };

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
```

Notes for the implementer: `UModal` body slot is `#body` (never `#content` —
documented landmine); the stage is `touch-none` so pointer capture wins.

- [ ] **Step 6: Lint + commit**

Run: `bun run lint` → exits 0.

```bash
git add app/lib/crop-rect.ts app/lib/crop-rect.test.ts app/components/ImageCropModal.vue
git commit -m "feat: crop-rect math + hand-rolled image crop modal"
```

---

### Task 3: Typst `header-logo` helper + payload `logo_scale`

**Files:**
- Modify: `src-tauri/templates/common.typ` (new helper; sites at ~415 and ~438)
- Modify: `src-tauri/templates/doc-classic.typ:26`, `doc-compact.typ:25`, `doc-modern.typ:40`, `letter.typ:55`, `report.typ:59`, `statement.typ:63`, `voucher.typ:36`
- Modify: `app/lib/quote-pdf.ts:95`, `invoice-pdf.ts:99`, `bill-pdf.ts:105`, `payslip-pdf.ts:103`, `voucher-pdf.ts:75`, `letter-pdf.ts:36`, `report-pdf.ts` (~26 + ~81), `statement-pdf.ts:261`, `sample-pdf.ts:57,153`

**Interfaces:**
- Consumes: `pdf_logo_scale` column (Task 1) via `CompanySettingsRow` (typed in Task 4, but emission uses `settings?.pdf_logo_scale ?? 100` which compiles once Task 4's store change lands — order within this task: payloads may temporarily reference an untyped field, so **do the store type addition here** instead: add `pdf_logo_scale: number` and `pdf_logo_crop: string | null` to `CompanySettingsRow` and both names to `UPDATABLE_COLUMNS` (after `"payslip_show_signatures"`), in this task.)
- Produces: `header-logo(data, base-h)` in `common.typ`; `logo_scale` on every PDF payload.

- [ ] **Step 1: Store type + columns**

`app/stores/settings.ts` — in `CompanySettingsRow`, after `payslip_show_signatures: number`:

```ts
	// Header-logo controls (migration 0051). Scale is integer percent
	// (50..150) applied to each template's baseline logo height; crop is the
	// last crop rect JSON {x,y,w,h} in source px, null for SVG / uncropped.
	pdf_logo_scale: number
	pdf_logo_crop: string | null
```

And append to `UPDATABLE_COLUMNS` after `"payslip_show_signatures"`:

```ts
	"pdf_logo_scale",
	"pdf_logo_crop"
```

- [ ] **Step 2: The Typst helper**

Append to `src-tauri/templates/common.typ`:

```typst
// --- header logo --------------------------------------------------------
// The logo at the template's baseline height x the user's scale
// (company_settings.pdf_logo_scale, percent), with a hard width cap so a
// banner-shaped crop scales down instead of colliding with the title.
// measure() supplies the natural aspect ratio, so nothing ever distorts.
// The cap is fixed (not scaled): it exists for page-layout safety.
#let header-logo(data, base-h) = context {
  let s = data.at("logo_scale", default: 100) / 100
  let m = measure(image(data.logo_file))
  let h = base-h * s
  let w = h * m.width / m.height
  let w-max = 55mm
  if w > w-max {
    h = h * w-max / w
    w = w-max
  }
  image(data.logo_file, width: w, height: h)
}
```

- [ ] **Step 3: Swap the nine sites**

Replace each `image(data.logo_file, height: <X>)` with
`header-logo(data, <X>)`, keeping the surrounding `#if` / `box` structure
untouched:

- `common.typ` ~415 (inside `logo-or-wordmark`): `header-logo(data, logo-h)` — note `data` is in scope because `logo-or-wordmark` is defined inside `doc-header(data)`.
- `common.typ` ~438 (modern branch): `header-logo(data, 12mm)`
- `doc-classic.typ:26`: `header-logo(data, 12mm)`
- `doc-compact.typ:25`: `header-logo(data, 9mm)`
- `doc-modern.typ:40`: `header-logo(data, 12mm)`
- `letter.typ:55`: `header-logo(data, 12mm)`
- `report.typ:59`: `header-logo(data, 12mm)`
- `statement.typ:63`: `header-logo(data, 12mm)`
- `voucher.typ:36`: `header-logo(data, 14mm)`

For `voucher.typ`, `report.typ`, `statement.typ` — which import nothing —
add at the top, after their `#let data = json("data.json")` line:

```typst
#import "common.typ": header-logo
```

**Selective import only.** These three define their own `label` / `faint`
helpers; a wildcard `common.typ` import would shadow-collide exactly the way
`payslip.typ`'s local `label` did in PR #315. `letter.typ` already imports
from `common.typ` — extend its existing import list with `header-logo` rather
than adding a second import line (check its current form first:
`grep -n "import" src-tauri/templates/letter.typ`).

- [ ] **Step 4: Emit `logo_scale` from every builder**

In each file, directly beside the existing `logo_path` line, add:

```ts
		logo_scale: settings?.pdf_logo_scale ?? 100,
```

Sites: `quote-pdf.ts:95`, `invoice-pdf.ts:99`, `bill-pdf.ts:105`,
`payslip-pdf.ts:103`, `voucher-pdf.ts:75`, `letter-pdf.ts:36`,
`report-pdf.ts:81` (also add `logo_scale: number` to the payload interface
field list near line 26), `statement-pdf.ts:261` (arg is `input.settings`),
`sample-pdf.ts` in `base()` (~57) and `samplePayslipPayload` (~153).

Confirm coverage: `grep -c "logo_scale" app/lib/*-pdf.ts app/lib/sample-pdf.ts`
— every file that emits `logo_path` must show ≥ 1.

- [ ] **Step 5: Render-verify with the sidecar**

Using the harness: create a test logo (render `#rect(width: 40mm, height: 10mm, fill: rgb("#16a34a"))` in a scratch `.typ` to PNG), copy into `$WORK` as `logo.png`, set payload `"logo_file": "logo.png"`.

1. Render `doc-classic` with `logo_scale` 50, 100, 150 → logo height visibly steps ≈ 6/12/18mm; 100 matches pre-change output.
2. Render with an extreme banner logo (200mm × 10mm source): at scale 150 the natural width would be 18mm × 20 = 360mm → confirm it renders at 55mm wide with no title overlap, on `doc-classic` AND `doc-modern` (copy those templates + common.typ into `$WORK`).
3. Render `voucher.typ`, `report.typ`, `statement.typ` once each (with `common.typ` copied alongside and a minimal payload matching each template's fields — reuse the report/statement/voucher sample shapes from their builders) → compile OK, proving the selective import resolves.
4. Render `doc-classic` with a payload that **omits** `logo_scale` → compiles, logo at baseline (the `default: 100` path).

- [ ] **Step 6: Lint, test, commit**

`bun run lint` → 0. `bun run test` → all pass.

```bash
git add src-tauri/templates/ app/lib/ app/stores/settings.ts
git commit -m "feat: scaled + width-clamped header logo across all PDF templates"
```

---

### Task 4: The Header logo card — white tile, crop flow, slider, preview

**Files:**
- Modify: `app/pages/settings/pdf.vue` (Header logo card template + script)

**Interfaces:**
- Consumes: `ImageCropModal` + `CropRect` (Task 2), `read_business_asset` / `save_business_asset` kinds (Task 1), `pdf_logo_scale` / `pdf_logo_crop` on the store (Task 3).

- [ ] **Step 1: White tile**

In the upload zone's `:class` binding, replace the theme-reactive backgrounds so
the tile is white in both modes (keep the drag-over border states):

- non-drag state: `'border-(--ui-border-accented) bg-white hover:border-(--ui-primary)/60'`
- drag-over state: `'border-(--ui-primary) bg-white scale-[1.01]'`

Also add `bg-white` awareness to the empty-state hint text (it sits on white
now): change its wrapper class to `text-zinc-400` instead of
`text-(--ui-text-muted)` so it's legible in dark mode too.

- [ ] **Step 2: Script — crop state + helpers**

Add to the script (near the existing `uploadPdfLogo`):

```ts
	const cropOpen = ref(false);
	const cropBlob = ref<Blob | null>(null);
	const cropInitial = ref<CropRect | null>(null);
	const cropSourceNote = ref<string | undefined>(undefined);
	// Extension of the original being cropped; the derivative is always PNG.
	const cropExt = ref("png");

	const isSvgLogo = computed(() =>
		(store.settings?.pdf_header_logo_path ?? "").toLowerCase().endsWith(".svg"));

	const parseCropRect = (json: string | null): CropRect | null => {
		if (!json) return null;
		try {
			const r = JSON.parse(json) as CropRect;
			return Number.isFinite(r.x) && Number.isFinite(r.y) && r.w > 0 && r.h > 0 ? r : null;
		} catch {
			return null;
		}
	};
```

Imports: `ImageCropModal` auto-registers (Nuxt components dir);
`import type { CropRect } from "~/lib/crop-rect";`.

- [ ] **Step 3: Rework `uploadPdfLogo`**

Replace the body so raster goes through the original + crop path and SVG stays
direct:

```ts
	const uploadPdfLogo = async (file: File) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();

			if (ext === "svg") {
				// Vector: save straight through — cropping would rasterise it.
				const target = await invoke<string>("save_business_asset", {
					id: tenantId, kind: "pdf-header", ext, bytes
				});
				await store.save({ pdf_header_logo_path: target, pdf_logo_crop: null });
				form.pdf_header_logo_path = target;
				refreshBaseline();
				toast.add({ title: "PDF header updated", color: "success", icon: "i-lucide-check" });
				return;
			}

			// Raster: keep the untouched original, then offer the crop.
			await invoke<string>("save_business_asset", {
				id: tenantId, kind: "pdf-header-original", ext, bytes
			});
			cropExt.value = ext;
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: file.type || "image/png" });
			cropInitial.value = null;
			cropSourceNote.value = undefined;
			cropOpen.value = true;
		} catch (err) {
			toast.add({
				title: "PDF header upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};
```

- [ ] **Step 4: Crop apply / cancel / re-crop**

```ts
	// Save the derivative the PDFs render. Fresh uploads that cancel the crop
	// fall through here with the whole image, so cancelling never loses the file.
	const saveDerivative = async (bytes: number[], ext: string, cropJson: string | null) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		const target = await invoke<string>("save_business_asset", {
			id: tenantId, kind: "pdf-header", ext, bytes
		});
		await store.save({ pdf_header_logo_path: target, pdf_logo_crop: cropJson });
		form.pdf_header_logo_path = target;
		refreshBaseline();
	};

	const onCropped = async (rect: CropRect, blob: Blob) => {
		try {
			const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
			await saveDerivative(bytes, "png", JSON.stringify(rect));
			toast.add({ title: "PDF header updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Crop failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// True while the open crop modal belongs to a just-uploaded file (as
	// opposed to a Re-crop of an existing logo). Set in uploadPdfLogo.
	const freshUpload = ref(false);

	const onCropCancel = async () => {
		// Only a FRESH upload needs the fallback save — the file must not be
		// lost just because the user skipped cropping. Cancelling a re-crop
		// leaves the existing derivative alone.
		if (!cropBlob.value || !freshUpload.value) return;
		const bytes = Array.from(new Uint8Array(await cropBlob.value.arrayBuffer()));
		await saveDerivative(bytes, cropExt.value, null);
		toast.add({ title: "PDF header saved (uncropped)", color: "info", icon: "i-lucide-check" });
	};

	const openRecrop = async () => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		freshUpload.value = false;
		try {
			let [ext, bytes] = ["png", [] as number[]];
			try {
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenantId, kind: "pdf-header-original" });
				cropSourceNote.value = undefined;
			} catch {
				// Original missing (pre-feature upload): crop the derivative itself.
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenantId, kind: "pdf-header" });
				cropSourceNote.value = "Original file not found — cropping the current header image instead.";
			}
			cropExt.value = ext;
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
			cropInitial.value = cropSourceNote.value ? null : parseCropRect(store.settings?.pdf_logo_crop ?? null);
			cropOpen.value = true;
		} catch (err) {
			toast.add({ title: "Couldn't open crop", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
```

And in `uploadPdfLogo`'s raster branch, set `freshUpload.value = true;` just
before `cropOpen.value = true;`. Wire `removePdfLogo` to also null the crop:
its `store.save({ pdf_header_logo_path: null })` becomes
`store.save({ pdf_header_logo_path: null, pdf_logo_crop: null })`.

- [ ] **Step 5: Template — modal, buttons, slider**

Inside the Header logo card, after the upload zone `div`, replace the buttons
row and add the slider + modal:

```vue
								<div class="flex flex-wrap items-center gap-2">
									<UButton
										v-if="!store.settings?.pdf_header_logo_path"
										icon="i-lucide-upload"
										size="xs"
										variant="soft"
										@click="pickPdfLogo"
									>
										Upload header
									</UButton>
									<template v-else>
										<UButton icon="i-lucide-upload" size="xs" variant="soft" @click="pickPdfLogo">
											Replace
										</UButton>
										<UButton
											v-if="!isSvgLogo"
											icon="i-lucide-crop"
											size="xs"
											variant="soft"
											color="neutral"
											@click="openRecrop"
										>
											Re-crop
										</UButton>
										<UButton
											icon="i-lucide-eye"
											size="xs"
											variant="soft"
											color="neutral"
											:loading="invoicePreview.state.rendering"
											@click="invoicePreview.open()"
										>
											Preview on PDF
										</UButton>
										<UButton
											icon="i-lucide-trash-2"
											size="xs"
											variant="ghost"
											color="neutral"
											@click="removePdfLogo"
										>
											Remove
										</UButton>
									</template>
									<span v-if="pdfLogoFileName" class="text-xs text-(--ui-text-muted) truncate">
										{{ pdfLogoFileName }}
									</span>
								</div>

								<div class="max-w-md">
									<div class="flex items-baseline justify-between mb-1.5">
										<span class="text-sm font-medium">Logo size</span>
										<span class="text-xs text-(--ui-text-muted) tabular-nums">
											{{ form.pdf_logo_scale }}% — classic prints ≈ {{ (12 * form.pdf_logo_scale / 100).toFixed(1) }}mm tall
										</span>
									</div>
									<USlider v-model="form.pdf_logo_scale" :min="50" :max="150" :step="5" />
								</div>
```

And at template end, beside the existing `PdfPreviewModal`s:

```vue
		<ImageCropModal
			v-model:open="cropOpen"
			:image-blob="cropBlob"
			:initial-rect="cropInitial"
			:source-note="cropSourceNote"
			@cropped="onCropped"
			@cancel="onCropCancel"
		/>
```

Script wiring for the slider: add `pdf_logo_scale` to the `PdfForm` Pick type,
default `100` in the reactive form, hydrate `form.pdf_logo_scale =
s.pdf_logo_scale ?? 100;`, include in the save payload and the dirty baseline —
follow exactly how `pdf_theme_color` flows through `PdfForm` / hydrate / save.
(`pdf_logo_crop` is NOT in the form — it saves immediately on crop apply, like
the logo path itself.)

- [ ] **Step 6: Browser-verify the modal**

Scratch-route recipe (guard plugin + middleware bypass + throwaway page, all
tagged `SCRATCH-VERIFY`, reverted after; **`resize_window` to 1280×800 before
measuring**). The scratch page feeds `ImageCropModal` a generated canvas-PNG
blob (e.g. 800×300 with a colored rect) and asserts via `javascript_tool`:

1. Modal opens; stage background is white in dark mode (`getComputedStyle` on the stage → `rgb(255, 255, 255)`).
2. Drag inside the rect moves it; drag `se` handle resizes; rect never leaves the image (read the on-screen `W × H px` label + rect element geometry).
3. Apply emits: scratch page renders the emitted rect + blob size into a probe div; confirm rect is integers within source bounds and the blob is a PNG (`blob.type === "image/png"`).
4. Reset restores the full-image rect.

- [ ] **Step 7: Version, docs, gates**

- Bump `0.151.0` → `0.152.0` in `package.json`, `src-tauri/Cargo.toml:8`, `src-tauri/tauri.conf.json:35`; `cd src-tauri && cargo check`; confirm `Cargo.lock` shows `0.152.0`.
- CLAUDE.md: append migration row after 0050:

```
0051_pdf_logo_controls.sql              ← `company_settings.pdf_logo_scale` (INTEGER, default 100 — percent, UI 50..150 step 5) + `pdf_logo_crop` (TEXT JSON {x,y,w,h} in source px, NULL for SVG/uncropped). Header-logo revamp: uploads keep the untouched original at `pdf-header-original.<ext>` (business-folder root) and a hand-rolled canvas cropper (`ImageCropModal.vue` + pure `app/lib/crop-rect.ts`) writes the `pdf-header.<ext>` derivative the PDFs render; "Re-crop" reopens the original with the stored rect via the `read_business_asset` command (bytes, because asset:// URLs taint the canvas). All 9 template logo sites now render through `header-logo(data, base-h)` in common.typ — baseline × scale with a fixed 55mm width clamp via measure() so banner crops shrink instead of colliding with the title. voucher/report/statement gained a SELECTIVE `#import "common.typ": header-logo` (wildcard would shadow their local label/faint — the payslip landmine) + common.typ as a render companion. SCHEMA_VERSION → 51.
```

- `bun run lint` → 0; `bun run test` → all pass (14 new across crop-rect).

- [ ] **Step 8: Commit**

```bash
git add app/pages/settings/pdf.vue CLAUDE.md package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "feat: header-logo crop flow, size slider, white tile, PDF preview (v0.152.0)"
```

- [ ] **Step 9: Report and stop**

Summarise with evidence (render measurements, modal assertions), list what
needs the GUI (live migration, real upload → crop → PDF round-trip, slider
persistence). **Do not push, do not open a PR.**
