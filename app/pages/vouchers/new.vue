<template>
	<div class="max-w-2xl">
		<header class="mb-6">
			<NuxtLink to="/vouchers" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to vouchers
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New voucher
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				A money-in (receipt) or money-out (payment) record. Optionally link to an invoice or bill for traceability.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Type" required>
					<USelect v-model="voucherType" :items="typeOptions" value-key="value" class="w-full" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Date" required>
						<DateField v-model="voucherDate" />
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
				</div>

				<UFormField :label="voucherType === 'receipt' ? 'Received from' : 'Paid to'" required>
					<UInput v-model="partyName" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Method">
						<USelect v-model="method" :items="methodOptions" value-key="value" class="w-full" />
					</UFormField>
					<UFormField label="Reference" hint="Cheque #, transaction ID…">
						<UInput v-model="reference" />
					</UFormField>
				</div>

				<UFormField label="Description">
					<UTextarea v-model="description" :rows="3" />
				</UFormField>

				<UFormField v-if="voucherType === 'receipt'" label="Linked invoice (optional)">
					<USelect v-model="relatedInvoiceId" :items="invoiceOptions" value-key="value" class="w-full" />
				</UFormField>
				<UFormField v-if="voucherType === 'payment'" label="Linked bill (optional)">
					<USelect v-model="relatedBillId" :items="billOptions" value-key="value" class="w-full" />
				</UFormField>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/vouchers')">
						Cancel
					</UButton>
					<UButton :loading="creating" :disabled="!valid" icon="i-lucide-plus" @click="create">
						Create voucher
					</UButton>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
// "New voucher" reuses the editor under a different route mode. Same
// pattern as clients/new — we redirect by replacing the route once
// the user creates the voucher.

	import type { VoucherInput, VoucherMethod, VoucherType } from "~/stores/vouchers";
	import { toCents } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "New voucher" });

	const router = useRouter();
	const toast = useToast();
	const store = useVouchersStore();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();

	await Promise.all([invoicesStore.load(), billsStore.load()]);

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	const voucherType = ref<VoucherType>("payment");
	const voucherDate = ref<string>(todayISO());
	const partyName = ref<string>("");
	const amountDisplay = ref<string>("");
	const amountCents = ref<number>(0);
	const method = ref<VoucherMethod | null>("bank_transfer");
	const reference = ref<string>("");
	const description = ref<string>("");
	const relatedInvoiceId = ref<number | null>(null);
	const relatedBillId = ref<number | null>(null);
	const creating = ref(false);

	const typeOptions: { label: string, value: VoucherType }[] = [
		{ label: "Payment (we paid out)", value: "payment" },
		{ label: "Receipt (we received money)", value: "receipt" }
	];

	const methodOptions: { label: string, value: VoucherMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	// Receipts can link to invoices we've issued; payments can link to bills
	// we've received. We surface only the relevant set.
	const invoiceOptions = computed(() => [
		{ label: "—", value: null },
		...invoicesStore.invoices
			.filter((i) => i.status !== "cancelled")
			.map((i) => ({ label: `${i.number} · ${parseClient(i.client_snapshot)}`, value: i.id }))
	]);
	const billOptions = computed(() => [
		{ label: "—", value: null },
		...billsStore.bills
			.filter((b) => b.status !== "cancelled")
			.map((b) => ({ label: `${b.number} · ${parseSnapshot(b.vendor_snapshot, "(vendor)")}`, value: b.id }))
	]);

	function parseClient(snap: string): string {
		return parseSnapshot(snap, "(client)");
	}

	// Both client and vendor snapshots share the same shape — a JSON
	// object with at least a `name` field — so one helper covers both.
	function parseSnapshot(snap: string, fallback: string): string {
		try {
			return (JSON.parse(snap) as { name?: string }).name ?? fallback;
		} catch {
			return fallback;
		}
	}

	const onAmountInput = (raw: string | number) => {
		amountDisplay.value = String(raw);
		try {
			amountCents.value = toCents(String(raw));
		} catch { /* ignore */ }
	};

	const valid = computed(() =>
		partyName.value.trim() !== ""
		&& amountCents.value > 0
		&& /^\d{4}-\d{2}-\d{2}$/.test(voucherDate.value)
	);

	const create = async () => {
		if (!valid.value) {
			toast.add({ title: "Fill the required fields", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const input: VoucherInput = {
				voucher_type: voucherType.value,
				voucher_date: voucherDate.value,
				party_name: partyName.value.trim(),
				amount_cents: amountCents.value,
				payment_method: method.value,
				reference: reference.value.trim() || null,
				description: description.value.trim() || null,
				related_invoice_id: voucherType.value === "receipt" ? relatedInvoiceId.value : null,
				related_bill_id: voucherType.value === "payment" ? relatedBillId.value : null,
				attachment_path: null
			};
			const id = await store.create(input);
			toast.add({ title: "Voucher created", color: "success", icon: "i-lucide-check" });
			await router.replace(`/vouchers/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create voucher",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
