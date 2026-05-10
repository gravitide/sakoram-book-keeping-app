<template>
	<div v-if="voucher" class="max-w-2xl mx-auto">
		<!-- Centered narrow shape, same as the new-voucher page and the
			Appearance / PDF settings pages. The form's intrinsic width is
			much smaller than the wider main-content cap. Comment lives
			inside the root so the page has a single top-level node — a
			leading sibling comment breaks Nuxt route transitions and
			renders blank on subsequent navigations. -->
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<NuxtLink to="/vouchers" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
					<UIcon name="i-lucide-arrow-left" class="size-4" />
					Back to vouchers
				</NuxtLink>
				<h1 class="text-2xl font-semibold mt-1 flex items-center gap-3 flex-wrap">
					<span class="tabular-nums">{{ voucher.number }}</span>
					<UBadge :color="isReceipt ? 'success' : 'warning'" variant="subtle">
						{{ isReceipt ? 'Receipt' : 'Payment' }}
					</UBadge>
				</h1>
				<p class="text-sm text-(--ui-text-muted) mt-1">
					{{ isReceipt ? `From ${voucher.party_name}` : `To ${voucher.party_name}` }}
					·
					<span class="font-medium tabular-nums" :class="isReceipt ? 'text-(--ui-success)' : 'text-(--ui-error)'">
						{{ isReceipt ? '+' : '−' }} {{ formatLKR(voucher.amount_cents) }}
					</span>
				</p>
			</div>
			<div class="flex gap-2 items-center">
				<UButton :loading="saving" :disabled="!dirty" icon="i-lucide-save" @click="save">
					Save
				</UButton>
				<UButton
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this voucher as a PDF'"
					@click="onPdfClick"
				>
					PDF
				</UButton>
				<UButton color="error" variant="ghost" icon="i-lucide-trash-2" @click="askDelete">
					Delete
				</UButton>
			</div>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Type" hint="Cannot be changed — delete and re-create if it was the wrong type.">
					<UInput :model-value="isReceipt ? 'Receipt' : 'Payment'" disabled />
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

				<UFormField :label="isReceipt ? 'Received from' : 'Paid to'" required>
					<UInput v-model="partyName" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Method">
						<USelect v-model="method" :items="methodOptions" value-key="value" class="w-full" />
					</UFormField>
					<UFormField label="Reference">
						<UInput v-model="reference" />
					</UFormField>
				</div>

				<UFormField label="Description">
					<UTextarea v-model="description" :rows="3" />
				</UFormField>

				<UFormField v-if="isReceipt" label="Linked invoice">
					<USelect v-model="relatedInvoiceId" :items="invoiceOptions" value-key="value" class="w-full" />
				</UFormField>
				<template v-else>
					<UFormField label="Linked bill">
						<USelect v-model="relatedBillId" :items="billOptions" value-key="value" class="w-full" />
					</UFormField>
					<UFormField label="Linked payslip">
						<USelect v-model="relatedPayslipId" :items="payslipOptions" value-key="value" class="w-full" />
					</UFormField>
				</template>

				<NuxtLink
					v-if="linkedInvoice"
					:to="`/invoices/${linkedInvoice.id}`"
					class="text-xs text-(--ui-primary) hover:underline inline-flex items-center gap-1"
				>
					<UIcon name="i-lucide-link" class="size-3" />
					View invoice {{ linkedInvoice.number }}
				</NuxtLink>
				<NuxtLink
					v-if="linkedBill"
					:to="`/bills/${linkedBill.id}`"
					class="text-xs text-(--ui-primary) hover:underline inline-flex items-center gap-1"
				>
					<UIcon name="i-lucide-link" class="size-3" />
					View bill {{ linkedBill.number }}
				</NuxtLink>
				<NuxtLink
					v-if="linkedPayslip"
					:to="`/payslips/${linkedPayslip.id}`"
					class="text-xs text-(--ui-primary) hover:underline inline-flex items-center gap-1"
				>
					<UIcon name="i-lucide-link" class="size-3" />
					View payslip {{ linkedPayslip.number }}
				</NuxtLink>
			</div>
		</UCard>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${voucher.number}?`">
			<template #body>
				<p class="text-sm text-(--ui-text-muted)">
					This permanently removes the voucher record. The number will not
					be reused — it'll show as a gap in your voucher sequence.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDeleteDialog = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">
						Delete voucher
					</UButton>
				</div>
			</template>
		</UModal>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Voucher PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Voucher detail/edit. voucher_type is locked post-creation (see store
// note) — everything else is editable. Delete is allowed: vouchers are
// just records, not gapless documents like invoices.

	import type { VoucherMethod, VoucherRow } from "~/stores/vouchers";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR, toCents } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Voucher" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const store = useVouchersStore();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const payslipsStore = usePayslipsStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();
	settingsStore.ensureLoaded().catch(() => { /* surfaced elsewhere */ });

	const voucherId = Number(route.params.id);
	if (!Number.isFinite(voucherId)) {
		throw createError({ statusCode: 404, statusMessage: "Voucher not found" });
	}

	const voucher = ref<VoucherRow | null>(null);
	const saving = ref(false);
	const dirty = ref(false);

	const voucherDate = ref<string>("");
	const partyName = ref<string>("");
	const amountDisplay = ref<string>("");
	const amountCents = ref<number>(0);
	const method = ref<VoucherMethod | null>(null);
	const reference = ref<string>("");
	const description = ref<string>("");
	const relatedInvoiceId = ref<number | null>(null);
	const relatedBillId = ref<number | null>(null);
	const relatedPayslipId = ref<number | null>(null);

	const methodOptions: { label: string, value: VoucherMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	await Promise.all([invoicesStore.load(), billsStore.load(), payslipsStore.load()]);

	const hydrate = async () => {
		const row = await store.get(voucherId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Voucher not found" });
		}
		voucher.value = row;
		voucherDate.value = row.voucher_date;
		partyName.value = row.party_name;
		amountCents.value = row.amount_cents;
		amountDisplay.value = `${Math.floor(row.amount_cents / 100)}.${String(row.amount_cents % 100).padStart(2, "0")}`;
		method.value = row.payment_method;
		reference.value = row.reference ?? "";
		description.value = row.description ?? "";
		relatedInvoiceId.value = row.related_invoice_id;
		relatedBillId.value = row.related_bill_id;
		relatedPayslipId.value = row.related_payslip_id;
		dirty.value = false;
	};

	await hydrate();

	watch([voucherDate, partyName, amountCents, method, reference, description, relatedInvoiceId, relatedBillId, relatedPayslipId], () => {
		dirty.value = true;
	}, { deep: true });

	const onAmountInput = (raw: string | number) => {
		amountDisplay.value = String(raw);
		try {
			amountCents.value = toCents(String(raw));
		} catch { /* ignore */ }
	};

	const isReceipt = computed(() => voucher.value?.voucher_type === "receipt");

	const invoiceOptions = computed(() => [
		{ label: "—", value: null },
		...invoicesStore.invoices.map((i) => {
			let name = "(client)";
			try {
				name = (JSON.parse(i.client_snapshot) as { name?: string }).name ?? name;
			} catch { /* ignore */ }
			return { label: `${i.number} · ${name}`, value: i.id };
		})
	]);
	const billOptions = computed(() => [
		{ label: "—", value: null },
		...billsStore.bills.map((b) => {
			let name = "(vendor)";
			try {
				name = (JSON.parse(b.vendor_snapshot) as { name?: string }).name ?? name;
			} catch { /* ignore */ }
			return { label: `${b.number} · ${name}`, value: b.id };
		})
	]);
	const payslipOptions = computed(() => [
		{ label: "—", value: null },
		...payslipsStore.payslips.map((p) => {
			let name = "(employee)";
			try {
				name = (JSON.parse(p.employee_snapshot) as { full_name?: string }).full_name ?? name;
			} catch { /* ignore */ }
			return { label: `${p.number} · ${name}`, value: p.id };
		})
	]);

	const linkedInvoice = computed(() =>
		relatedInvoiceId.value ? invoicesStore.invoices.find((i) => i.id === relatedInvoiceId.value) : null
	);
	const linkedBill = computed(() =>
		relatedBillId.value ? billsStore.bills.find((b) => b.id === relatedBillId.value) : null
	);
	const linkedPayslip = computed(() =>
		relatedPayslipId.value ? payslipsStore.payslips.find((p) => p.id === relatedPayslipId.value) : null
	);

	const save = async () => {
		if (!voucher.value) return;
		if (amountCents.value <= 0) {
			toast.add({ title: "Amount must be positive", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		saving.value = true;
		try {
			await store.update(voucherId, {
				voucher_date: voucherDate.value,
				party_name: partyName.value.trim(),
				amount_cents: amountCents.value,
				payment_method: method.value,
				reference: reference.value.trim() || null,
				description: description.value.trim() || null,
				related_invoice_id: isReceipt.value ? relatedInvoiceId.value : null,
				related_bill_id: !isReceipt.value ? relatedBillId.value : null,
				related_payslip_id: !isReceipt.value ? relatedPayslipId.value : null
			});
			await hydrate();
			toast.add({ title: "Voucher saved", color: "success", icon: "i-lucide-check" });
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

	const showDeleteDialog = ref(false);
	const askDelete = () => {
		showDeleteDialog.value = true;
	};
	// ---- PDF export ----------------------------------------------------------
	// Vouchers use the dedicated voucher.typ template (one-page receipt
	// layout, big amount up top). Receipts are rendered in green, payments
	// in red — the colour comes through `amount_color` because Typst can't
	// derive it from the JSON kind alone without a switch.
	const methodFriendlyLabel = (m: VoucherMethod | null): string | null => {
		if (!m) return null;
		return ({
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		} as const)[m] ?? m;
	};

	const buildPdfPayload = () => {
		const v = voucher.value!;
		const isReceiptDoc = v.voucher_type === "receipt";
		const partyLabel = isReceiptDoc ? "Received from" : "Paid to";
		const counterSig = isReceiptDoc ? "Received by" : "Paid to (signature)";
		const amountColor = isReceiptDoc ? "#16a34a" : "#dc2626";

		// Receipts can link only to invoices; payments to a bill *or* a
		// payslip. Bill wins ties (a single voucher should never link
		// to both — the UI dropdowns are mutually exclusive in spirit,
		// though the schema allows both columns).
		let relatedLabel: string | null = null;
		if (isReceiptDoc) {
			const inv = v.related_invoice_id
				? invoicesStore.invoices.find((i) => i.id === v.related_invoice_id)
				: null;
			if (inv) relatedLabel = `Invoice ${inv.number}`;
		} else {
			const bill = v.related_bill_id
				? billsStore.bills.find((b) => b.id === v.related_bill_id)
				: null;
			if (bill) {
				relatedLabel = `Bill ${bill.number}`;
			} else {
				const ps = v.related_payslip_id
					? payslipsStore.payslips.find((p) => p.id === v.related_payslip_id)
					: null;
				if (ps) relatedLabel = `Payslip ${ps.number}`;
			}
		}

		// LKR amount as a string — formatLKR returns "LKR 1,234.56", we
		// strip the prefix because the template re-adds it.
		const amountDisplay = formatLKR(v.amount_cents, { withSymbol: false });

		return {
			number: v.number,
			title: isReceiptDoc ? "Receipt voucher" : "Payment voucher",
			theme_color: themeHex(settingsStore.settings?.theme_color),
			font_family: settingsStore.settings?.pdf_font ?? "Inter",
			currency_code: currency.value.code,
			currency_symbol: currency.value.symbol,
			voucher_date: v.voucher_date,
			amount_display: amountDisplay,
			amount_color: amountColor,
			party_label: partyLabel,
			party_name: v.party_name,
			method_display: methodFriendlyLabel(v.payment_method),
			reference: v.reference ?? null,
			description: v.description ?? null,
			related_label: relatedLabel,
			counter_signature_label: counterSig,
			business_name: settingsStore.settings?.business_name ?? null,
			website: settingsStore.settings?.website ?? null,
			phone: settingsStore.settings?.phone ?? null,
			logo_path: settingsStore.settings?.pdf_header_logo_path ?? null
		};
	};

	// Vouchers don't have line items, so no caching needed — just call
	// buildPayload() directly each render.
	const pdf = usePdfPreview({
		command: "export_voucher_pdf",
		buildPayload: () => buildPdfPayload(),
		fileName: () => `${voucher.value?.number ?? "voucher"}.pdf`,
		title: "Voucher PDF preview"
	});

	const onPdfClick = () => {
		if (!voucher.value || dirty.value) return;
		pdf.open();
	};

	const confirmDelete = async () => {
		showDeleteDialog.value = false;
		try {
			await store.remove(voucherId);
			toast.add({ title: "Voucher deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/vouchers");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};
</script>
