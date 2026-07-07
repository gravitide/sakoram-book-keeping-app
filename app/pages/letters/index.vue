<template>
	<div class="select-none">
		<header class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h1 class="text-xl font-semibold">
					Letters
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Compose letters on your business letterhead and keep track of them.
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="showNew = true">
				New letter
			</UButton>
		</header>

		<!-- Filter strip -->
		<div class="flex flex-wrap items-center gap-2 mb-3">
			<UInput
				v-model="store.search"
				icon="i-lucide-search"
				placeholder="Search reference, subject, recipient…"
				class="w-64"
			/>
			<USelect
				v-model="store.categoryFilter"
				:items="categoryItems"
				value-key="value"
				class="w-48"
			/>
			<UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetFilters">
				Reset
			</UButton>
			<div class="ml-auto">
				<StatChip label="Shown" :value="String(store.filtered.length)" color="neutral" />
			</div>
		</div>

		<ResizableDataTable
			:rows="store.filtered"
			state-key="letters-list"
			:row-actions="itemsFor"
			default-sort-field="letter_date"
			:default-sort-order="-1"
			@row-click="(row) => router.push(`/letters/${row.id}`)"
		>
			<Column field="number" header="Reference" sortable>
				<template #body="{ data }">
					<div class="truncate font-medium tabular-nums">
						{{ data.number || "—" }}
					</div>
				</template>
			</Column>
			<Column field="letter_date" header="Date" sortable>
				<template #body="{ data }">
					<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
						{{ data.letter_date }}
					</div>
				</template>
			</Column>
			<Column field="category" header="Category" sortable>
				<template #body="{ data }">
					<div class="truncate">
						{{ data.category || "—" }}
					</div>
				</template>
			</Column>
			<Column field="recipient_name" header="Recipient" sortable>
				<template #body="{ data }">
					<div class="truncate">
						{{ data.recipient_name || "—" }}
					</div>
				</template>
			</Column>
			<Column field="subject" header="Subject" sortable>
				<template #body="{ data }">
					<div class="truncate text-(--ui-text-muted)">
						{{ data.subject || "—" }}
					</div>
				</template>
			</Column>
		</ResizableDataTable>

		<NewLetterModal v-model:open="showNew" />
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
	</div>
</template>

<script setup lang="ts">
// Letters list — client-mode ResizableDataTable (letter volume is low). Row
// actions surface View / PDF & Print / Duplicate / Delete via the shared
// context-menu pattern. PDF generation for a row builds the payload from that
// row + settings and previews through usePdfPreview.
	import type { LetterRow } from "~/stores/letters";
	import { buildLetterPdfPayload } from "~/lib/letter-pdf";
	import { useLettersStore } from "~/stores/letters";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Letters" });

	const router = useRouter();
	const toast = useToast();
	const store = useLettersStore();
	const settings = useSettingsStore();

	await Promise.all([store.load(), settings.ensureLoaded()]);

	const showNew = ref(false);

	const categoryItems = computed(() => [
		{ label: "All categories", value: "all" as const },
		...store.categories.map((c) => ({ label: c, value: c }))
	]);

	const resetFilters = () => {
		store.search = "";
		store.categoryFilter = "all";
		store.clearDateFilters();
	};

	// One preview instance reused per row; the buildPayload closure reads the
	// currently-targeted row.
	const pdfRow = ref<LetterRow | null>(null);
	const pdf = usePdfPreview({
		command: "export_letter_pdf",
		buildPayload: () => buildLetterPdfPayload({ row: pdfRow.value!, settings: settings.settings }),
		fileName: () => `${pdfRow.value?.number || "letter"}.pdf`,
		title: "Letter PDF"
	});

	const generatePdf = async (row: LetterRow) => {
		pdfRow.value = row;
		await pdf.open();
	};

	const duplicate = async (row: LetterRow) => {
		try {
			const id = await store.duplicate(row.id);
			toast.add({ title: "Letter duplicated", color: "success", icon: "i-lucide-copy" });
			await router.push(`/letters/${id}`);
		} catch (err) {
			toast.add({ title: "Could not duplicate", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const remove = async (row: LetterRow) => {
		try {
			await store.remove(row.id);
			toast.add({ title: "Letter deleted", color: "success", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({ title: "Could not delete", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	function itemsFor(letter: LetterRow) {
		return [
			[
				{ label: "View", icon: "i-lucide-eye", onSelect: () => router.push(`/letters/${letter.id}`) },
				{ label: "PDF & Print", icon: "i-lucide-file-text", onSelect: () => {
					void generatePdf(letter);
				} },
				{ label: "Duplicate", icon: "i-lucide-copy", onSelect: () => {
					void duplicate(letter);
				} }
			],
			[
				{ label: "Delete", icon: "i-lucide-trash-2", onSelect: () => {
					void remove(letter);
				} }
			]
		];
	}
</script>
