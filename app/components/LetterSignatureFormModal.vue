<template>
	<UModal v-model:open="openModel" :title="signature ? 'Edit signature' : 'New signature'">
		<template #body>
			<form id="letter-signature-form" class="space-y-4" @submit.prevent="save">
				<UFormField label="Name" required>
					<UInput v-model="name" placeholder="e.g. Director sign-off" autofocus />
				</UFormField>
				<UFormField label="Signature">
					<RichTextEditor v-model="bodyJson" />
				</UFormField>
				<UFormField>
					<UCheckbox v-model="isDefault" label="Use as the default signature for new letters" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="openModel = false">
					Cancel
				</UButton>
				<UButton type="submit" form="letter-signature-form" :loading="saving" :disabled="!name.trim()" icon="i-lucide-check">
					{{ signature ? "Save" : "Create" }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Create / edit a reusable signature. `signature` null = create, else edit.
// Writes via the store; the parent refetches when the modal closes.
	import type { LetterSignatureRow } from "~/stores/letter_signatures";
	import { useLetterSignaturesStore } from "~/stores/letter_signatures";

	const props = defineProps<{ signature: LetterSignatureRow | null }>();
	const openModel = defineModel<boolean>("open", { default: false });

	const store = useLetterSignaturesStore();
	const toast = useToast();

	const name = ref("");
	const bodyJson = ref("");
	const isDefault = ref(false);
	const saving = ref(false);

	// Seed the form each time the modal opens.
	watch(openModel, (open) => {
		if (!open) return;
		name.value = props.signature?.name ?? "";
		bodyJson.value = props.signature?.body_json ?? "";
		isDefault.value = props.signature?.is_default === 1;
		saving.value = false;
	});

	const save = async () => {
		if (!name.value.trim() || saving.value) return;
		saving.value = true;
		try {
			if (props.signature) {
				await store.update(props.signature.id, { name: name.value, body_json: bodyJson.value });
				if (isDefault.value && props.signature.is_default !== 1) await store.setDefault(props.signature.id);
			} else {
				await store.create({ name: name.value, body_json: bodyJson.value, isDefault: isDefault.value });
			}
			toast.add({ title: "Signature saved", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
		} catch (err) {
			toast.add({ title: "Could not save", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			saving.value = false;
		}
	};
</script>
