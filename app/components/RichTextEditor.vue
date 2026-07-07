<template>
	<div class="border border-(--ui-border) rounded-md overflow-hidden bg-(--ui-bg)">
		<div v-if="editor" class="flex items-center gap-0.5 border-b border-(--ui-border) bg-(--ui-bg-muted) p-1">
			<UButton
				v-for="b in toolbar"
				:key="b.name"
				:icon="b.icon"
				size="xs"
				variant="ghost"
				color="neutral"
				:aria-label="b.name"
				:class="b.active ? 'bg-(--ui-bg-accented) text-(--ui-primary)' : ''"
				@click="b.run"
			/>
		</div>
		<EditorContent
			:editor="editor"
			class="letter-body p-3 min-h-[240px] max-h-[50vh] overflow-y-auto text-sm"
		/>
	</div>
</template>

<script setup lang="ts">
// Thin TipTap wrapper. v-model is the ProseMirror document serialised to a
// JSON string (what we persist in letters.body_json). StarterKit provides
// bold / italic / underline / heading / bullet + ordered lists (Underline is
// bundled in StarterKit v3 — registering it separately would duplicate). A
// `tick` ref bumped on every transaction keeps the toolbar's active-state
// highlighting reactive (TipTap's editor instance isn't a Vue reactive object).
	import StarterKit from "@tiptap/starter-kit";
	import { Editor, EditorContent } from "@tiptap/vue-3";

	const model = defineModel<string>({ default: "" });
	const editor = shallowRef<Editor>();
	const tick = ref(0);

	const parseDoc = (json: string): object | undefined => {
		if (!json) return undefined;
		try {
			return JSON.parse(json) as object;
		} catch {
			return undefined;
		}
	};

	onMounted(() => {
		editor.value = new Editor({
			extensions: [StarterKit],
			content: parseDoc(model.value),
			onUpdate: ({ editor: e }) => {
				model.value = JSON.stringify(e.getJSON());
			},
			onTransaction: () => {
				tick.value++;
			}
		});
	});

	onBeforeUnmount(() => {
		editor.value?.destroy();
	});

	// External model changes (e.g. loading a letter) → set content without
	// looping back through onUpdate. Skip when the value already matches.
	watch(model, (val) => {
		if (!editor.value) return;
		const current = JSON.stringify(editor.value.getJSON());
		if (val !== current) editor.value.commands.setContent(parseDoc(val) ?? "", { emitUpdate: false });
	});

	interface ToolbarButton { name: string, icon: string, active: boolean, run: () => void }
	const toolbar = computed<ToolbarButton[]>(() => {
		const e = editor.value;
		void tick.value; // reactive dep so active states refresh on selection
		if (!e) return [];
		return [
			{ name: "Bold", icon: "i-lucide-bold", active: e.isActive("bold"), run: () => e.chain().focus().toggleBold().run() },
			{ name: "Italic", icon: "i-lucide-italic", active: e.isActive("italic"), run: () => e.chain().focus().toggleItalic().run() },
			{ name: "Underline", icon: "i-lucide-underline", active: e.isActive("underline"), run: () => e.chain().focus().toggleUnderline().run() },
			{ name: "Heading", icon: "i-lucide-heading", active: e.isActive("heading", { level: 2 }), run: () => e.chain().focus().toggleHeading({ level: 2 }).run() },
			{ name: "Bullet list", icon: "i-lucide-list", active: e.isActive("bulletList"), run: () => e.chain().focus().toggleBulletList().run() },
			{ name: "Numbered list", icon: "i-lucide-list-ordered", active: e.isActive("orderedList"), run: () => e.chain().focus().toggleOrderedList().run() }
		];
	});
</script>

<style scoped>
.letter-body :deep(.ProseMirror) {
	outline: none;
	min-height: 220px;
}
.letter-body :deep(ul) {
	list-style: disc;
	padding-left: 1.5rem;
}
.letter-body :deep(ol) {
	list-style: decimal;
	padding-left: 1.5rem;
}
.letter-body :deep(h2) {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 0.4rem 0;
}
.letter-body :deep(p) {
	margin: 0.3rem 0;
}
</style>
