<template>
	<UModal v-model:open="openModel" title="New letter">
		<template #body>
			<form id="new-letter-form" class="space-y-4" @submit.prevent="create">
				<p class="text-sm text-(--ui-text-muted)">
					A letter is created with these details — write the body on the next screen.
				</p>

				<UFormField label="Reference" hint="Auto-suggested; edit or clear it">
					<UInput v-model="reference" placeholder="e.g. LET-2026-0001" />
				</UFormField>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<UFormField label="Date" required>
						<DateField v-model="letterDate" />
					</UFormField>
					<UFormField label="Category" hint="For filtering (optional)">
						<UInput v-model="category" placeholder="e.g. Service letter" list="letter-categories" />
						<datalist id="letter-categories">
							<option v-for="c in letters.categories" :key="c" :value="c" />
						</datalist>
					</UFormField>
				</div>

				<UFormField label="Recipient name">
					<UInput v-model="recipientName" placeholder="e.g. Mr. A. Perera" />
				</UFormField>

				<UFormField label="Subject">
					<UInput v-model="subject" placeholder="e.g. Internship Confirmation" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="creating" @click="openModel = false">
					Cancel
				</UButton>
				<UButton type="submit" form="new-letter-form" :loading="creating" icon="i-lucide-plus">
					Create letter
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Header-fields-only modal (mirrors NewCreditNoteModal). The reference is a
// free-text field pre-filled with the next suggested LET-YYYY-NNNN; the body is
// composed on /letters/[id] after creation.
	import { peekNextSequence } from "~/lib/numbering";
	import { useLettersStore } from "~/stores/letters";
	import { useSettingsStore } from "~/stores/settings";

	const props = defineProps<{ issueDate?: string | null }>();
	const openModel = defineModel<boolean>("open", { default: false });

	const router = useRouter();
	const toast = useToast();
	const settings = useSettingsStore();
	const letters = useLettersStore();

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	const reference = ref("");
	const letterDate = ref(props.issueDate ?? todayISO());
	const category = ref("");
	const recipientName = ref("");
	const subject = ref("");
	const creating = ref(false);

	// Refresh the suggested reference whenever the modal opens or the date
	// changes (fiscal year can flip the LET-YYYY prefix).
	const refreshSuggestion = async () => {
		try {
			reference.value = (await peekNextSequence("letter", letterDate.value)).number;
		} catch {
			reference.value = "";
		}
	};

	watch(openModel, async (open) => {
		if (open) {
			await Promise.all([settings.ensureLoaded(), letters.ensureLoaded()]);
			letterDate.value = props.issueDate ?? todayISO();
			category.value = "";
			recipientName.value = "";
			subject.value = "";
			creating.value = false;
			await refreshSuggestion();
		}
	});

	watch(letterDate, () => {
		if (openModel.value) void refreshSuggestion();
	});

	const create = async () => {
		if (creating.value) return;
		creating.value = true;
		try {
			const id = await letters.create({
				number: reference.value,
				letter_date: letterDate.value,
				category: category.value,
				recipient_name: recipientName.value,
				subject: subject.value
			});
			toast.add({ title: "Letter created", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
			await router.push(`/letters/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create letter",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
