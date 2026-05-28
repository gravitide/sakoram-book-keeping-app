<template>
	<UModal v-model:open="openModel" title="Create voucher from statement row" :ui="{ content: 'max-w-xl' }">
		<template #body>
			<form id="create-voucher-from-row-form" class="space-y-3" @submit.prevent="onSubmit">
				<p class="text-sm text-(--ui-text-muted)">
					A new voucher will be created and linked to this statement row.
				</p>
				<UFormField label="Voucher type" required>
					<URadioGroup
						v-model="voucherType"
						:items="[
							{ label: 'Receipt (money in)', value: 'receipt' },
							{ label: 'Payment (money out)', value: 'payment' }
						]"
						value-key="value"
						orientation="horizontal"
					/>
				</UFormField>
				<UFormField label="Date" required>
					<DateField v-model="voucherDate" />
				</UFormField>
				<UFormField label="Party" help="Who you received from / paid to.">
					<UInput v-model="partyName" />
				</UFormField>
				<UFormField label="Amount" required>
					<MoneyInput v-model="amountCents" />
				</UFormField>
				<UFormField label="Description">
					<UInput v-model="description" />
				</UFormField>
				<UFormField label="Reference">
					<UInput v-model="reference" />
				</UFormField>
				<UFormField label="Payment method" required>
					<USelect
						v-model="paymentMethod"
						:items="[
							{ label: 'Bank transfer', value: 'bank_transfer' },
							{ label: 'Cheque', value: 'cheque' },
							{ label: 'Card', value: 'card' },
							{ label: 'Other', value: 'other' }
						]"
						value-key="value"
						class="w-full"
					/>
				</UFormField>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" :disabled="saving" @click="openModel = false">
					Cancel
				</UButton>
				<UButton
					type="submit"
					form="create-voucher-from-row-form"
					color="primary"
					:loading="saving"
					icon="i-lucide-plus"
				>
					Create + link
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { BankStatementRowRow } from "~/stores/bank_statements";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		bankId: number | null
		sourceRow: BankStatementRowRow | null
	}>();
	const emit = defineEmits<{
		created: []
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const vouchers = useVouchersStore();
	const store = useBankStatementsStore();
	const toast = useToast();

	const voucherType = ref<"receipt" | "payment">("payment");
	const voucherDate = ref("");
	const partyName = ref("");
	const amountCents = ref(0);
	const description = ref("");
	const reference = ref("");
	const paymentMethod = ref<"bank_transfer" | "cheque" | "card" | "other">("bank_transfer");
	const saving = ref(false);

	// Repopulate fields whenever the source row changes (the page swaps it
	// when a different unmatched row's "Create" button is clicked).
	watch(() => props.sourceRow, (r) => {
		if (!r) return;
		voucherType.value = r.amount_cents > 0 ? "receipt" : "payment";
		voucherDate.value = r.statement_date;
		partyName.value = r.description ?? ""; // best signal — banks describe counterparty in description
		amountCents.value = Math.abs(r.amount_cents);
		description.value = r.description ?? "";
		reference.value = r.reference ?? "";
		paymentMethod.value = "bank_transfer";
	}, { immediate: true });

	const onSubmit = async () => {
		if (!props.sourceRow || !props.bankId) return;
		if (amountCents.value <= 0) {
			toast.add({ title: "Amount must be positive", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		saving.value = true;
		try {
			const newId = await vouchers.create({
				voucher_type: voucherType.value,
				voucher_date: voucherDate.value,
				party_name: partyName.value.trim() || "—",
				amount_cents: amountCents.value,
				description: description.value.trim() || null,
				reference: reference.value.trim() || null,
				payment_method: paymentMethod.value,
				business_bank_id: props.bankId,
				related_invoice_id: null,
				related_bill_id: null,
				related_payslip_id: null
			});
			await store.linkMatch(props.sourceRow.id, newId);
			toast.add({ title: "Voucher created and linked", color: "success", icon: "i-lucide-check" });
			emit("created");
		} catch (err) {
			toast.add({
				title: "Couldn't create voucher",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};
</script>
