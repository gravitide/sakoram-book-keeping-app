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
					<SectionCard title="Letter details" icon="i-lucide-file-pen">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<UFormField label="Reference" hint="Editable / clearable">
								<UInput v-model="form.number" />
							</UFormField>
							<UFormField label="Date">
								<DateField v-model="form.letter_date" />
							</UFormField>
							<UFormField label="Category" class="sm:col-span-2">
								<LetterCategoryPicker v-model="form.category" />
							</UFormField>
							<UFormField label="Subject" class="sm:col-span-2">
								<UInput v-model="form.subject" />
							</UFormField>
						</div>
					</SectionCard>

					<SectionCard title="Recipient" icon="i-lucide-user">
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

				<SectionCard title="Body" icon="i-lucide-pilcrow">
					<RichTextEditor v-model="form.body_json" />
				</SectionCard>

				<SectionCard title="Signature & letterhead" icon="i-lucide-pen-line">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<UFormField label="Signatory name">
							<UInput v-model="form.signatory_name" placeholder="e.g. Jane Doe" />
						</UFormField>
						<UFormField label="Signatory title">
							<UInput v-model="form.signatory_title" placeholder="e.g. HR Manager" />
						</UFormField>
						<UFormField label="Pre-printed letterhead paper" class="sm:col-span-2" hint="On: reserve blank space at the top for physical stationery. Off: the app prints your letterhead header + footer.">
							<USwitch v-model="prePrintedBool" />
						</UFormField>
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
		signatory_name: string
		signatory_title: string
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
		signatory_name: "",
		signatory_title: "",
		pre_printed: 0
	});
	let snapshot = "";
	const saving = ref(false);

	const hydrate = (row: LetterRow) => {
		letter.value = row;
		form.number = row.number;
		form.letter_date = row.letter_date;
		form.category = row.category;
		form.recipient_name = row.recipient_name;
		form.recipient_address = row.recipient_address;
		form.subject = row.subject;
		form.body_json = row.body_json;
		form.signatory_name = row.signatory_name;
		form.signatory_title = row.signatory_title;
		form.pre_printed = row.pre_printed;
		snapshot = JSON.stringify(form);
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

	const dirty = computed(() => JSON.stringify(form) !== snapshot);

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

	const onDelete = async () => {
		try {
			await store.remove(currentId.value);
			toast.add({ title: "Letter deleted", color: "success", icon: "i-lucide-trash-2" });
			await router.push("/letters");
		} catch (err) {
			toast.add({ title: "Could not delete", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
