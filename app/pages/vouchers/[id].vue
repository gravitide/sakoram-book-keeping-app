<template>
	<div v-if="voucher" class="max-w-2xl mx-auto select-none">
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
				<!-- Read-only by default; flip to edit mode explicitly so
					a stray click on a saved voucher can't introduce
					unintended changes. Save / Cancel live on the sticky
					bar below once edit mode is on. -->
				<UButton
					v-if="!editing"
					size="sm"
					icon="i-lucide-pencil"
					variant="soft"
					color="neutral"
					@click="enterEdit"
				>
					Edit
				</UButton>
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this voucher as a PDF'"
					@click="onPdfClick"
				>
					PDF & Print
				</UButton>
				<!-- Visual separator before the destructive action so a stray
					click on the everyday buttons doesn't land on Delete. -->
				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />
				<UButton size="sm" color="error" variant="soft" icon="i-lucide-trash-2" @click="askDelete">
					Delete
				</UButton>
			</div>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Type" hint="Cannot be changed — delete and re-create if it was the wrong type.">
					<div class="flex items-start gap-3 rounded-lg border p-3" :class="typeMeta.tile">
						<span class="flex size-9 shrink-0 items-center justify-center rounded-md" :class="typeMeta.chip">
							<UIcon :name="typeMeta.icon" class="size-5" />
						</span>
						<span class="min-w-0">
							<span class="block text-sm font-medium">{{ typeMeta.label }}</span>
							<span class="block text-xs text-(--ui-text-muted)">{{ typeMeta.desc }}</span>
						</span>
					</div>
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Date" required>
						<DateField v-model="voucherDate" :disabled="!editing" />
					</UFormField>
					<UFormField label="Amount" required>
						<MoneyInput v-model="amountCents" :disabled="!editing" />
					</UFormField>
				</div>

				<UFormField :label="isReceipt ? 'Received from' : 'Paid to'" required>
					<UInput v-model="partyName" :disabled="!editing" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Method">
						<USelect v-model="method" :items="methodOptions" value-key="value" class="w-full" :disabled="!editing" />
					</UFormField>
					<UFormField label="Reference">
						<UInput v-model="reference" :disabled="!editing" />
					</UFormField>
				</div>

				<UFormField
					v-if="method !== 'cash'"
					label="Bank account"
					help="Which of your bank accounts received / sent the money."
				>
					<USelect
						v-model="bankId"
						:items="bankPickerOptions"
						value-key="value"
						class="w-full"
						:disabled="!editing"
					>
						<!-- Colour dot per account (grey = none) — see BankColorDot. -->
						<template #leading>
							<BankColorDot :color="bankPickerOptions.find((o) => o.value === bankId)?.color" />
						</template>
						<template #item-leading="{ item }">
							<BankColorDot :color="item.color" />
						</template>
					</USelect>
				</UFormField>

				<UFormField label="Description">
					<UTextarea v-model="description" :rows="3" :disabled="!editing" />
				</UFormField>

				<UFormField v-if="isReceipt" label="Linked invoice">
					<LinkedInvoiceField v-model="relatedInvoiceId" :disabled="!editing" />
				</UFormField>
				<template v-else>
					<UFormField label="Linked bill">
						<LinkedBillField v-model="relatedBillId" :disabled="!editing" />
					</UFormField>
					<UFormField label="Linked payslip">
						<LinkedPayslipField v-model="relatedPayslipId" :disabled="!editing" />
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

		<!-- Attachments — scans / photos of the voucher. Read-only until
			the user enters edit mode, matching the rest of the page
			(vouchers are real cash records, not freely editable). -->
		<AttachmentsCard
			class="mt-6"
			document-type="voucher"
			:document-id="voucherId"
			:disabled="!editing"
			disabled-hint="Click Edit to add or remove attachments."
		/>

		<!-- Sticky save bar — visible the whole time edit mode is on
			(not gated on dirty), since entering edit mode is an explicit
			decision and the user needs Cancel/Save controls in reach.
			The status indicator changes from a neutral 'Editing…' to a
			pulsing 'Unsaved changes' once anything actually changes. -->
		<div
			v-if="editing"
			class="sticky bottom-0 -mx-2 mt-6"
		>
			<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border-2 border-(--ui-primary)/50 shadow-2xl px-4 py-3 flex items-center justify-between gap-4">
				<div class="flex items-center gap-2 text-sm">
					<template v-if="dirty">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</template>
					<template v-else>
						<span class="inline-flex size-2 rounded-full bg-(--ui-primary)" />
						<span class="text-(--ui-text-muted)">Editing voucher</span>
					</template>
				</div>
				<div class="flex items-center gap-2">
					<UButton
						variant="ghost"
						color="neutral"
						:disabled="saving"
						@click="cancelEdit"
					>
						Cancel
					</UButton>
					<UButton
						:loading="saving"
						:disabled="!dirty"
						icon="i-lucide-save"
						@click="save"
					>
						Save changes
					</UButton>
				</div>
			</div>
		</div>

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
			:temp-path="pdf.state.tempPath"
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
	import { formatLKR } from "~/lib/money";
	import { buildVoucherPdfPayload, resolveVoucherRelatedLabel } from "~/lib/voucher-pdf";
	import { useBillsStore } from "~/stores/bills";
	import { useBusinessBanksStore } from "~/stores/business_banks";
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
	const banksStore = useBusinessBanksStore();
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
	// Read-only by default. The user has to click Edit to put the
	// page into edit mode — protects vouchers (which represent real
	// cash flow) from a stray keystroke after they've been recorded.
	const editing = ref(false);

	const voucherDate = ref<string>("");
	const partyName = ref<string>("");
	const amountCents = ref<number>(0);
	const method = ref<VoucherMethod | null>(null);
	const reference = ref<string>("");
	const description = ref<string>("");
	const relatedInvoiceId = ref<number | null>(null);
	const relatedBillId = ref<number | null>(null);
	const relatedPayslipId = ref<number | null>(null);
	const bankId = ref<number | null>(null);

	const bankPickerOptions = computed<{ label: string, value: number | null, color: string | null }[]>(() => {
		const items: { label: string, value: number | null, color: string | null }[] = [
			{ label: "—", value: null, color: null }
		];
		for (const b of banksStore.activeBanks) {
			items.push({
				label: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
				value: b.id,
				color: b.color
			});
		}
		return items;
	});

	const methodOptions: { label: string, value: VoucherMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	// Linked-doc pickers (invoice / bill / payslip selectors in the
	// voucher form) bind to the corresponding store list. ensureLoaded
	// skips re-fetch on cached stores so subsequent voucher opens
	// don't re-query three tables — substantial win on the back-button
	// + open-another flow.
	await Promise.all([
		invoicesStore.ensureLoaded(),
		billsStore.ensureLoaded(),
		payslipsStore.ensureLoaded(),
		banksStore.ensureLoaded()
	]);

	// Guards the dirty watcher below. Watch callbacks flush AFTER hydrate's
	// synchronous `dirty = false`, so without this every hydrate that changed
	// a field (Cancel edit, keep-alive re-hydration) left the page dirty.
	const hydrating = ref(false);
	const hydrate = async () => {
		const row = await store.get(voucherId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Voucher not found" });
		}
		hydrating.value = true;
		voucher.value = row;
		voucherDate.value = row.voucher_date;
		partyName.value = row.party_name;
		amountCents.value = row.amount_cents;
		method.value = row.payment_method;
		reference.value = row.reference ?? "";
		description.value = row.description ?? "";
		relatedInvoiceId.value = row.related_invoice_id;
		relatedBillId.value = row.related_bill_id;
		relatedPayslipId.value = row.related_payslip_id;
		bankId.value = row.business_bank_id;
		dirty.value = false;
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Kept-alive page: setup (and the hydrate above) runs once, so re-hydrate
	// on every re-activation — see useRehydrateOnActivate for what goes stale.
	useRehydrateOnActivate({
		isDirty: () => dirty.value,
		exists: async () => (await store.get(voucherId)) != null,
		// Not dirty here, so nothing is lost: drop back to the read-only view
		// rather than reopening in an edit mode left on from an earlier visit.
		rehydrate: async () => {
			await hydrate();
			editing.value = false;
		},
		noun: "voucher",
		listRoute: "/vouchers"
	});

	watch([voucherDate, partyName, amountCents, method, reference, description, relatedInvoiceId, relatedBillId, relatedPayslipId, bankId], () => {
		if (hydrating.value) return;
		dirty.value = true;
	}, { deep: true });

	// Cash vouchers don't carry a bank. Auto-clear bankId when the
	// payment method flips to cash; auto-default to the business's
	// default bank when flipping back from cash.
	watch(method, (next, prev) => {
		if (next === "cash") {
			bankId.value = null;
		} else if (prev === "cash" && bankId.value === null) {
			bankId.value = banksStore.defaultBank?.id ?? null;
		}
	});

	const isReceipt = computed(() => voucher.value?.voucher_type === "receipt");

	// Voucher type rendered as a prominent (read-only) icon card —
	// mirrors the selectable tiles on the new-voucher page. Type is
	// locked post-creation, so this is just the one chosen tile.
	// Colours match the header badge: receipts green, payments amber.
	const typeMeta = computed(() =>
		isReceipt.value
			? {
				label: "Receipt",
				desc: "Money received",
				icon: "i-lucide-arrow-down-left",
				tile: "border-(--ui-success) bg-(--ui-success)/10 ring-1 ring-(--ui-success)",
				chip: "bg-(--ui-success) text-(--ui-bg)"
			}
			: {
				label: "Payment",
				desc: "Money paid out",
				icon: "i-lucide-arrow-up-right",
				tile: "border-(--ui-warning) bg-(--ui-warning)/10 ring-1 ring-(--ui-warning)",
				chip: "bg-(--ui-warning) text-(--ui-bg)"
			}
	);

	const linkedInvoice = computed(() =>
		relatedInvoiceId.value ? invoicesStore.invoices.find((i) => i.id === relatedInvoiceId.value) : null
	);
	const linkedBill = computed(() =>
		relatedBillId.value ? billsStore.bills.find((b) => b.id === relatedBillId.value) : null
	);
	const linkedPayslip = computed(() =>
		relatedPayslipId.value ? payslipsStore.payslips.find((p) => p.id === relatedPayslipId.value) : null
	);

	const enterEdit = () => {
		editing.value = true;
	};

	// Bail out of edit mode and snap the form back to whatever was
	// last persisted. Re-hydrating from the row clears any keystrokes
	// the user typed before changing their mind.
	const cancelEdit = async () => {
		await hydrate();
		editing.value = false;
	};

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
				related_payslip_id: !isReceipt.value ? relatedPayslipId.value : null,
				business_bank_id: method.value === "cash" ? null : bankId.value
			});
			await hydrate();
			editing.value = false;
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
	// Payload shape lives in `app/lib/voucher-pdf.ts` so the list page
	// can render from the same builder for its row action + bulk export.
	const pdf = usePdfPreview({
		command: "export_voucher_pdf",
		buildPayload: () => buildVoucherPdfPayload({
			row: voucher.value!,
			settings: settingsStore.settings,
			currency: currency.value,
			relatedLabel: resolveVoucherRelatedLabel(voucher.value!, {
				invoices: invoicesStore,
				bills: billsStore,
				payslips: payslipsStore
			})
		}),
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
