<template>
	<UModal v-model:open="openModel" :title="editing ? 'Edit bank account' : 'New bank account'">
		<template #body>
			<div class="space-y-4">
				<UFormField label="Label" required hint="A short nickname for your reference — not printed on PDFs.">
					<UInput v-model="form.label" placeholder="e.g. Sampath LKR · Main" autofocus />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Bank name">
						<UInput v-model="form.bank_name" placeholder="Sampath Bank PLC" />
					</UFormField>
					<UFormField label="Branch">
						<UInput v-model="form.bank_branch" placeholder="Colombo Main" />
					</UFormField>
				</div>

				<UFormField label="Account name">
					<UInput v-model="form.bank_account_name" placeholder="Acme Trading Co (Pvt) Ltd" />
				</UFormField>

				<UFormField label="Account number">
					<UInput v-model="form.bank_account_number" placeholder="012345678900" />
				</UFormField>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="cancel">
					Cancel
				</UButton>
				<UButton :loading="saving" :disabled="!canSave" @click="submit">
					{{ editing ? "Save" : "Create" }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { BusinessBankInput, BusinessBankRow } from "~/stores/business_banks";
	import { useBusinessBanksStore } from "~/stores/business_banks";

	// Create / edit modal for a business bank account. Used from
	// /settings/company. Mirrors CategoryFormModal in shape.

	interface Props {
		open: boolean
		bank?: BusinessBankRow | null
	}
	const props = withDefaults(defineProps<Props>(), { bank: null });
	const emit = defineEmits<{
		"update:open": [v: boolean]
		saved: [id: number]
	}>();

	const store = useBusinessBanksStore();
	const toast = useToast();

	const openModel = computed({
		get: () => props.open,
		set: (v: boolean) => emit("update:open", v)
	});

	const editing = computed(() => props.bank !== null);

	const blankForm = (): BusinessBankInput => ({
		label: "",
		bank_name: "",
		bank_account_name: "",
		bank_account_number: "",
		bank_branch: ""
	});

	const form = reactive<BusinessBankInput>(blankForm());
	const saving = ref(false);

	const canSave = computed(() => form.label.trim().length > 0);

	// Reset / hydrate the form whenever the modal opens.
	watch(() => props.open, (isOpen) => {
		if (!isOpen) return;
		if (props.bank) {
			form.label = props.bank.label;
			form.bank_name = props.bank.bank_name ?? "";
			form.bank_account_name = props.bank.bank_account_name ?? "";
			form.bank_account_number = props.bank.bank_account_number ?? "";
			form.bank_branch = props.bank.bank_branch ?? "";
		} else {
			Object.assign(form, blankForm());
		}
	});

	const cancel = () => {
		emit("update:open", false);
	};

	// Normalise empty strings to null so the DB doesn't carry meaningless ""
	// values that would later trip the "any field filled" snapshot check.
	const trimOrNull = (v: string | null): string | null => {
		if (v == null) return null;
		const t = v.trim();
		return t.length === 0 ? null : t;
	};

	const submit = async () => {
		if (!canSave.value) return;
		saving.value = true;
		try {
			const payload: BusinessBankInput = {
				label: form.label.trim(),
				bank_name: trimOrNull(form.bank_name),
				bank_account_name: trimOrNull(form.bank_account_name),
				bank_account_number: trimOrNull(form.bank_account_number),
				bank_branch: trimOrNull(form.bank_branch)
			};
			let id: number;
			if (props.bank) {
				id = props.bank.id;
				await store.update(id, payload);
			} else {
				id = await store.create(payload);
				// If this is the very first bank, also make it the default
				// so quotes / invoices created next pick it up without the
				// user having to explicitly mark it.
				if (store.activeBanks.length === 1) await store.setDefault(id);
			}
			emit("saved", id);
			emit("update:open", false);
			toast.add({
				title: editing.value ? "Bank account updated" : "Bank account added",
				color: "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};
</script>
