<template>
	<UModal :open="open" title="Record payment" @update:open="emit('update:open', $event)">
		<template #body>
			<div class="space-y-4">
				<div class="text-sm text-(--ui-text-muted) flex justify-between border-b border-(--ui-border) pb-2">
					<span>Outstanding balance:</span>
					<span class="font-medium tabular-nums text-(--ui-text)">{{ formatLKR(balance) }}</span>
				</div>

				<UFormField label="Payment date" required>
					<DateField v-model="paymentDate" />
				</UFormField>

				<UFormField label="Amount" required>
					<UInput
						:model-value="amountDisplay"
						placeholder="0.00"
						@update:model-value="onAmountInput"
					>
						<template #trailing>
							<span class="text-xs text-(--ui-text-muted) pr-1">LKR</span>
						</template>
					</UInput>
				</UFormField>

				<UFormField label="Method">
					<USelect v-model="method" :items="methodOptions" value-key="value" class="w-full" />
				</UFormField>

				<UFormField label="Reference" hint="Cheque number, transaction ID, etc.">
					<UInput v-model="reference" />
				</UFormField>

				<UFormField label="Notes">
					<UTextarea v-model="notes" :rows="2" />
				</UFormField>
			</div>
		</template>

		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="close">
					Cancel
				</UButton>
				<UButton :disabled="!valid" icon="i-lucide-check" @click="onSave">
					Record payment
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Inline modal to record a payment against an invoice. Auto-defaults the
// amount to the outstanding balance — that's what the user wants 90% of
// the time. Method/reference/notes are optional.

	import type { PaymentDraft, PaymentMethod } from "~/stores/invoices";
	import { formatLKR, toCents } from "~/lib/money";

	interface Props {
		open: boolean
		totalCents: number
		paidCents: number
	}
	const props = defineProps<Props>();
	const emit = defineEmits<{
		"update:open": [value: boolean]
		save: [draft: PaymentDraft]
	}>();

	const balance = computed(() => Math.max(0, props.totalCents - props.paidCents));

	const todayISO = (): string => {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${dd}`;
	};

	const paymentDate = ref(todayISO());
	const amountDisplay = ref("");
	const amountCents = ref(0);
	const method = ref<PaymentMethod | null>("bank_transfer");
	const reference = ref("");
	const notes = ref("");

	const methodOptions: { label: string, value: PaymentMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	// When the modal opens, prefill the amount with the outstanding balance.
	watch(() => props.open, (v) => {
		if (!v) return;
		paymentDate.value = todayISO();
		amountCents.value = balance.value;
		amountDisplay.value = balance.value === 0
			? ""
			: `${Math.floor(balance.value / 100)}.${String(balance.value % 100).padStart(2, "0")}`;
		method.value = "bank_transfer";
		reference.value = "";
		notes.value = "";
	});

	const onAmountInput = (raw: string | number) => {
		amountDisplay.value = String(raw);
		try {
			amountCents.value = toCents(String(raw));
		} catch { /* in-flight */ }
	};

	const valid = computed(() =>
		amountCents.value > 0
		&& /^\d{4}-\d{2}-\d{2}$/.test(paymentDate.value)
	);

	const onSave = () => {
		if (!valid.value) return;
		emit("save", {
			payment_date: paymentDate.value,
			amount_cents: amountCents.value,
			method: method.value,
			reference: reference.value.trim() || null,
			notes: notes.value.trim() || null
		});
	};

	const close = () => emit("update:open", false);
</script>
