<template>
	<div class="select-none max-w-4xl mx-auto">
		<div v-if="!letter" class="text-(--ui-text-muted) p-6">
			Letter not found.
		</div>

		<template v-else>
			<header class="flex flex-wrap items-start justify-between gap-3 mb-4">
				<div class="min-w-0">
					<h1 class="text-xl font-semibold truncate">
						{{ form.subject || "Untitled letter" }}
					</h1>
					<p class="text-sm text-(--ui-text-muted)">
						{{ form.number || "No reference" }} · {{ form.letter_date }}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<UButton size="sm" icon="i-lucide-file-text" @click="openPdf">
						PDF &amp; Print
					</UButton>
					<UButton size="sm" color="neutral" variant="soft" icon="i-lucide-copy" @click="onDuplicate">
						Duplicate
					</UButton>
					<UButton size="sm" color="error" variant="soft" icon="i-lucide-trash-2" @click="onDelete">
						Delete
					</UButton>
				</div>
			</header>

			<div class="space-y-4">
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
					<SectionCard title="Letter details" subtitle="Reference, category, date, and subject." icon="i-lucide-file-pen">
						<div class="space-y-3">
							<UFormField label="Reference" hint="Editable / clearable">
								<UInput v-model="form.number" />
							</UFormField>
							<UFormField label="Category">
								<LetterCategoryPicker v-model="form.category" />
							</UFormField>
							<UFormField label="Date">
								<DateField v-model="form.letter_date" />
							</UFormField>
							<UFormField label="Subject">
								<UInput v-model="form.subject" />
							</UFormField>
						</div>
					</SectionCard>

					<SectionCard title="Recipient" subtitle="Who the letter is addressed to." icon="i-lucide-user">
						<div class="space-y-3">
							<UFormField label="Name">
								<UInput v-model="form.recipient_name" />
							</UFormField>
							<UFormField label="Address">
								<UTextarea v-model="form.recipient_address" :rows="3" placeholder="One line per row" />
							</UFormField>
						</div>
					</SectionCard>
				</div>

				<!-- Body has no header — it's obviously the letter body. Plain card
					keeps the page rhythm without a redundant title. -->
				<UCard>
					<RichTextEditor v-model="form.body_json" tables />
				</UCard>

				<SectionCard title="Signature" subtitle="The sign-off printed below a signature line at the bottom of the letter." icon="i-lucide-pen-line">
					<div class="space-y-2">
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs text-(--ui-text-muted)">Reuse a saved sign-off, or save this one as a template.</span>
							<SignaturePicker v-model="form.signature_json" />
						</div>
						<RichTextEditor v-model="form.signature_json" />
					</div>
				</SectionCard>

				<SectionCard title="Letterhead" subtitle="How the top of the printed page is handled." icon="i-lucide-file-text">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<div class="text-sm font-medium">
								Pre-printed letterhead paper
							</div>
							<p class="text-xs text-(--ui-text-muted) mt-1 leading-relaxed">
								<span class="font-medium text-(--ui-text)">On</span> — reserve blank space at the top for physical stationery.
								<span class="font-medium text-(--ui-text)">Off</span> — the app prints your letterhead header + footer.
							</p>
						</div>
						<USwitch v-model="prePrintedBool" class="shrink-0 mt-0.5" />
					</div>
				</SectionCard>
			</div>

			<!-- Sticky save bar -->
			<div
				v-if="dirty"
				class="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-(--ui-primary)/50 bg-(--ui-bg)/90 backdrop-blur px-4 py-3 shadow-2xl"
			>
				<span class="text-sm text-(--ui-text-muted)">Unsaved changes</span>
				<UButton color="neutral" variant="ghost" :disabled="saving" @click="discard">
					Discard
				</UButton>
				<UButton icon="i-lucide-save" :loading="saving" @click="save">
					Save changes
				</UButton>
			</div>

			<UModal v-model:open="deleteOpen" :title="`Delete ${form.number || 'letter'}?`">
				<template #body>
					<p class="text-sm">
						This permanently deletes
						<span class="font-medium">{{ form.subject || "this letter" }}</span>.
						This can't be undone.
					</p>
				</template>
				<template #footer>
					<div class="flex justify-end gap-2 w-full">
						<UButton color="neutral" variant="outline" @click="deleteOpen = false">
							Cancel
						</UButton>
						<UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">
							Delete letter
						</UButton>
					</div>
				</template>
			</UModal>

			<PdfPreviewModal
				v-model:open="pdf.state.open"
				:asset-url="pdf.state.assetUrl"
				:temp-path="pdf.state.tempPath"
				:suggested-file-name="pdf.state.suggestedFileName"
				:saving="pdf.state.saving"
				:title="pdf.title"
				@save="pdf.onSave"
				@cancel="pdf.onCancel"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
// Letter detail — always-editable form + rich-text body + sticky save bar.
// Dirty-tracking compares the working `form` against the last-loaded snapshot.
	import type { LetterRow } from "~/stores/letters";
	import { buildLetterPdfPayload } from "~/lib/letter-pdf";
	import { useLettersStore } from "~/stores/letters";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Letter" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();
	const store = useLettersStore();
	const settings = useSettingsStore();

	// Read the id reactively: the app mounts pages under <NuxtPage keepalive>,
	// so navigating letter→letter (e.g. after Duplicate) reuses this instance
	// and setup() does NOT re-run. A watcher on the id re-hydrates the form.
	const currentId = computed(() => Number(route.params.id));

	interface LetterForm {
		number: string
		letter_date: string
		category: string
		recipient_name: string
		recipient_address: string
		subject: string
		body_json: string
		signature_json: string
		pre_printed: number
	}

	const letter = ref<LetterRow | null>(null);
	const form = reactive<LetterForm>({
		number: "",
		letter_date: "",
		category: "",
		recipient_name: "",
		recipient_address: "",
		subject: "",
		body_json: "",
		signature_json: "",
		pre_printed: 0
	});
	// Baseline for dirty-tracking. MUST be a ref (not a plain `let`): the `dirty`
	// computed only re-evaluates when a reactive dep changes, so a plain-let
	// snapshot re-baselined on save (with form unchanged) would leave `dirty`
	// stuck true and the save bar stuck open. Coerce every field with `?? ""`
	// so a null/missing column never lands `undefined` in the form.
	const snapshot = ref("");
	const saving = ref(false);

	const hydrate = (row: LetterRow) => {
		letter.value = row;
		form.number = row.number ?? "";
		form.letter_date = row.letter_date ?? "";
		form.category = row.category ?? "";
		form.recipient_name = row.recipient_name ?? "";
		form.recipient_address = row.recipient_address ?? "";
		form.subject = row.subject ?? "";
		form.body_json = row.body_json ?? "";
		form.signature_json = row.signature_json ?? "";
		form.pre_printed = row.pre_printed ?? 0;
		snapshot.value = JSON.stringify(form);
	};

	const load = async () => {
		const row = await store.get(currentId.value);
		letter.value = row;
		if (row) hydrate(row);
	};

	await Promise.all([load(), settings.ensureLoaded(), store.ensureLoaded()]);

	// Re-hydrate when the route id changes under keepalive (see currentId note).
	watch(currentId, () => {
		void load();
	});

	const prePrintedBool = computed({
		get: () => form.pre_printed === 1,
		set: (v: boolean) => {
			form.pre_printed = v ? 1 : 0;
		}
	});

	const dirty = computed(() => JSON.stringify(form) !== snapshot.value);

	// Kept-alive page: re-hydrate on every re-activation (a letter edited,
	// duplicated-over or deleted elsewhere) — see useRehydrateOnActivate.
	useRehydrateOnActivate({
		isDirty: () => dirty.value,
		exists: async () => (await store.get(currentId.value)) != null,
		rehydrate: load,
		noun: "letter",
		listRoute: "/letters"
	});

	const discard = () => {
		if (letter.value) hydrate(letter.value);
	};

	const save = async () => {
		if (saving.value) return;
		saving.value = true;
		try {
			await store.update(currentId.value, { ...form });
			const row = await store.get(currentId.value);
			if (row) hydrate(row);
			toast.add({ title: "Letter saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Could not save", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			saving.value = false;
		}
	};

	const pdf = usePdfPreview({
		command: "export_letter_pdf",
		buildPayload: () => buildLetterPdfPayload({
			row: { ...(letter.value as LetterRow), ...form },
			settings: settings.settings
		}),
		fileName: () => `${form.number || "letter"}.pdf`,
		title: "Letter PDF"
	});

	// Render from the current form (save first if dirty so the PDF matches).
	const openPdf = async () => {
		if (dirty.value) await save();
		await pdf.open();
	};

	const onDuplicate = async () => {
		try {
			const newId = await store.duplicate(currentId.value);
			toast.add({ title: "Letter duplicated", color: "success", icon: "i-lucide-copy" });
			await router.push(`/letters/${newId}`);
		} catch (err) {
			toast.add({ title: "Could not duplicate", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// Delete is confirmed via a modal — letters are permanent once removed.
	const deleteOpen = ref(false);
	const onDelete = () => {
		deleteOpen.value = true;
	};
	const confirmDelete = async () => {
		deleteOpen.value = false;
		try {
			await store.remove(currentId.value);
			toast.add({ title: "Letter deleted", color: "success", icon: "i-lucide-trash-2" });
			await router.push("/letters");
		} catch (err) {
			toast.add({ title: "Could not delete", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
