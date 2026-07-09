<template>
	<div class="border border-(--ui-border) rounded-md overflow-hidden bg-(--ui-bg)" :style="{ '--rte-min-height': `${minHeight}px` }">
		<div v-if="editor && editable" class="flex items-center gap-0.5 border-b border-(--ui-border) bg-(--ui-bg-muted) p-1 flex-wrap">
			<!-- Block type / heading -->
			<UDropdownMenu :items="headingItems">
				<UButton size="xs" variant="ghost" color="neutral" aria-label="Text style" trailing-icon="i-lucide-chevron-down" :ui="{ trailingIcon: 'size-3' }" class="min-w-16 justify-between">
					{{ currentBlockLabel }}
				</UButton>
			</UDropdownMenu>

			<div class="w-px h-4 bg-(--ui-border) mx-0.5" />

			<template v-for="(group, gi) in toolbarGroups" :key="gi">
				<div v-if="gi > 0" class="w-px h-4 bg-(--ui-border) mx-0.5" />
				<UButton
					v-for="b in group"
					:key="b.name"
					:icon="b.icon"
					size="xs"
					variant="ghost"
					color="neutral"
					:aria-label="b.name"
					:class="b.active ? 'bg-(--ui-bg-accented) text-(--ui-primary)' : ''"
					@click="b.run"
				/>
			</template>

			<div class="w-px h-4 bg-(--ui-border) mx-0.5" />

			<!-- Font size -->
			<UDropdownMenu :items="fontSizeItems">
				<UButton icon="i-lucide-type" size="xs" variant="ghost" color="neutral" aria-label="Font size" trailing-icon="i-lucide-chevron-down" :ui="{ trailingIcon: 'size-3' }" />
			</UDropdownMenu>

			<!-- Text colour -->
			<UPopover>
				<UButton icon="i-lucide-palette" size="xs" variant="ghost" color="neutral" aria-label="Text colour" />
				<template #content>
					<div class="p-2 w-40">
						<div class="grid grid-cols-6 gap-1.5">
							<button
								v-for="c in textColors"
								:key="c"
								type="button"
								class="size-5 rounded border border-black/10 cursor-pointer"
								:style="{ backgroundColor: c }"
								:aria-label="`Colour ${c}`"
								@click="applyColor(c)"
							/>
						</div>
						<button
							type="button"
							class="mt-2 w-full text-xs text-(--ui-text-muted) hover:text-(--ui-text) text-left"
							@click="clearColor"
						>
							Reset colour
						</button>
					</div>
				</template>
			</UPopover>
		</div>
		<EditorContent
			:editor="editor"
			class="letter-body p-3 max-h-[50vh] overflow-y-auto text-sm"
			:class="{ 'opacity-70': !editable }"
		/>
	</div>
</template>

<script setup lang="ts">
	import TextAlign from "@tiptap/extension-text-align";
	import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
	// Thin TipTap wrapper on the official Vue-3 integration (`useEditor` +
	// EditorContent). v-model is the ProseMirror document serialised to a JSON
	// string (persisted in letters.body_json / signature_json). StarterKit gives
	// bold / italic / underline / heading / lists; TextAlign adds alignment;
	// TextStyle + Color + FontSize add text colour + size (stored as a `textStyle`
	// mark with { color, fontSize } attrs). `immediatelyRender: false` avoids the
	// SSG prerender pass touching the editor before hydration.
	//
	// NOTE: a single ProseMirror copy is required — `@nuxt/ui` ships its own TipTap
	// at a different prosemirror-model version, so `nuxt.config.ts` dedupes the
	// prosemirror-* packages. Without that, structural commands throw "multiple
	// versions of prosemirror-model".
	import StarterKit from "@tiptap/starter-kit";
	import { EditorContent, useEditor } from "@tiptap/vue-3";

	// `editable` gates typing (false → read-only view, toolbar hidden) so locked
	// documents (issued quotes / invoices / bills) can still render their notes
	// through the same component. `minHeight` sizes the writing area — documents
	// want a shorter box than the full-page letter editor.
	const props = withDefaults(defineProps<{ editable?: boolean, minHeight?: number }>(), {
		editable: true,
		minHeight: 240
	});

	const model = defineModel<string>({ default: "" });

	// Initial editor content from the stored string. Accepts TipTap JSON (letters,
	// and client notes once edited) OR legacy PLAIN TEXT — a field that was a plain
	// textarea before (e.g. client internal notes) still has plain strings stored;
	// we turn those into one paragraph per line so nothing is lost when the field
	// is upgraded to rich text. On the next edit the value round-trips to JSON.
	const parseDoc = (value: string): object | undefined => {
		if (!value) return undefined;
		try {
			const parsed = JSON.parse(value) as { type?: string };
			if (parsed && typeof parsed === "object" && parsed.type === "doc") return parsed as object;
		} catch { /* not JSON — fall through to plain-text handling */ }
		return {
			type: "doc",
			content: value.split("\n").map((line) => line.length > 0
				? { type: "paragraph", content: [{ type: "text", text: line }] }
				: { type: "paragraph" })
		};
	};

	const editor = useEditor({
		extensions: [
			StarterKit,
			TextAlign.configure({ types: ["heading", "paragraph"] }),
			TextStyle,
			Color.configure({ types: ["textStyle"] }),
			FontSize.configure({ types: ["textStyle"] })
		],
		content: parseDoc(model.value),
		editable: props.editable,
		immediatelyRender: false,
		onUpdate: ({ editor: e }) => {
			model.value = JSON.stringify(e.getJSON());
		}
	});

	// Toggle read-only live (e.g. a draft quote gets marked sent while open).
	watch(() => props.editable, (val) => {
		editor.value?.setEditable(val);
	});

	// External model changes (e.g. loading a different letter under keepalive)
	// → replace content without looping back through onUpdate.
	watch(model, (val) => {
		const e = editor.value;
		if (!e) return;
		const current = JSON.stringify(e.getJSON());
		if (val !== current) e.commands.setContent(parseDoc(val) ?? "", { emitUpdate: false });
	});

	interface ToolbarButton { name: string, icon: string, active: boolean, run: () => void }
	// Grouped so the template can draw a divider between logical clusters
	// (inline marks · lists · alignment).
	const toolbarGroups = computed<ToolbarButton[][]>(() => {
		const e = editor.value;
		if (!e) return [];
		return [
			[
				{ name: "Bold", icon: "i-lucide-bold", active: e.isActive("bold"), run: () => e.chain().focus().toggleBold().run() },
				{ name: "Italic", icon: "i-lucide-italic", active: e.isActive("italic"), run: () => e.chain().focus().toggleItalic().run() },
				{ name: "Underline", icon: "i-lucide-underline", active: e.isActive("underline"), run: () => e.chain().focus().toggleUnderline().run() }
			],
			[
				{ name: "Bullet list", icon: "i-lucide-list", active: e.isActive("bulletList"), run: () => e.chain().focus().toggleBulletList().run() },
				{ name: "Numbered list", icon: "i-lucide-list-ordered", active: e.isActive("orderedList"), run: () => e.chain().focus().toggleOrderedList().run() }
			],
			[
				{ name: "Align left", icon: "i-lucide-align-left", active: e.isActive({ textAlign: "left" }), run: () => e.chain().focus().setTextAlign("left").run() },
				{ name: "Align center", icon: "i-lucide-align-center", active: e.isActive({ textAlign: "center" }), run: () => e.chain().focus().setTextAlign("center").run() },
				{ name: "Align right", icon: "i-lucide-align-right", active: e.isActive({ textAlign: "right" }), run: () => e.chain().focus().setTextAlign("right").run() },
				{ name: "Justify", icon: "i-lucide-align-justify", active: e.isActive({ textAlign: "justify" }), run: () => e.chain().focus().setTextAlign("justify").run() }
			]
		];
	});

	// --- block type / heading -----------------------------------------------
	// Label for the dropdown trigger reflecting the current block.
	const currentBlockLabel = computed(() => {
		const e = editor.value;
		if (!e) return "Text";
		if (e.isActive("heading", { level: 1 })) return "H1";
		if (e.isActive("heading", { level: 2 })) return "H2";
		if (e.isActive("heading", { level: 3 })) return "H3";
		return "Text";
	});
	const headingItems = computed(() => {
		const e = editor.value;
		if (!e) return [];
		return [[
			{ label: "Text", onSelect: () => e.chain().focus().setParagraph().run() },
			{ label: "Heading 1", onSelect: () => e.chain().focus().setHeading({ level: 1 }).run() },
			{ label: "Heading 2", onSelect: () => e.chain().focus().setHeading({ level: 2 }).run() },
			{ label: "Heading 3", onSelect: () => e.chain().focus().setHeading({ level: 3 }).run() }
		]];
	});

	// --- font size ----------------------------------------------------------
	// null = clear (back to the default body size). px values convert to pt in
	// the PDF (see app/lib/letter-body.ts).
	const fontSizes: { label: string, px: string | null }[] = [
		{ label: "Small", px: "13px" },
		{ label: "Normal", px: null },
		{ label: "Large", px: "18px" },
		{ label: "Huge", px: "24px" }
	];
	const applyFontSize = (px: string | null) => {
		const e = editor.value;
		if (!e) return;
		if (px === null) e.chain().focus().unsetFontSize().run();
		else e.chain().focus().setFontSize(px).run();
	};
	const fontSizeItems = computed(() => [fontSizes.map((s) => ({
		label: s.label,
		onSelect: () => applyFontSize(s.px)
	}))]);

	// --- text colour --------------------------------------------------------
	const textColors = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#0891b2", "#6b7280", "#78350f", "#334155"];
	const applyColor = (hex: string) => {
		editor.value?.chain().focus().setColor(hex).run();
	};
	const clearColor = () => {
		editor.value?.chain().focus().unsetColor().run();
	};

	// Expose the underlying TipTap instance (parent / test harness access).
	defineExpose({ editor });
</script>

<style scoped>
.letter-body :deep(.ProseMirror) {
	outline: none;
	min-height: var(--rte-min-height, 240px);
}
.letter-body :deep(.ProseMirror:focus) {
	outline: none;
}
.letter-body :deep(ul) {
	list-style: disc;
	padding-left: 1.5rem;
}
.letter-body :deep(ol) {
	list-style: decimal;
	padding-left: 1.5rem;
}
.letter-body :deep(h1) {
	font-size: 1.4rem;
	font-weight: 700;
	margin: 0.5rem 0 0.35rem;
}
.letter-body :deep(h2) {
	font-size: 1.2rem;
	font-weight: 700;
	margin: 0.45rem 0 0.3rem;
}
.letter-body :deep(h3) {
	font-size: 1.05rem;
	font-weight: 700;
	margin: 0.4rem 0 0.25rem;
}
.letter-body :deep(p) {
	margin: 0.3rem 0;
}
</style>
