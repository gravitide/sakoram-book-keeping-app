<template>
	<div class="max-w-2xl mx-auto select-none">
		<!-- Centered narrow shape, same as Settings → Appearance / PDF.
			The form's intrinsic width (max-w-2xl) is much smaller than
			the wider main-content cap, and a left-anchored block looks
			off on a wide monitor. The comment lives *inside* the root
			div — leaving it at the template top makes the page have two
			top-level nodes, which breaks Nuxt route transitions and ends
			up rendering as an empty page after navigation. -->
		<header class="mb-6">
			<!-- Back link follows the prefill: if the user arrived from a
				bill / invoice / payslip's "Record payment" button, we
				return them there on cancel rather than dumping them on
				the vouchers list. -->
			<NuxtLink :to="backLink.to" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				{{ backLink.label }}
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
				<!-- Linked-document context block: when a bill or invoice is
					linked (either via ?bill / ?invoice prefill or the
					dropdown below), show what the payment is going
					against so the user can sanity-check the amount
					without leaving the form. -->
				<div
					v-if="linkedDocKind"
					class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted)/60 px-3 py-2.5 text-sm"
				>
					<div class="flex items-center gap-2 mb-1.5">
						<UIcon :name="linkedDocIcon" class="size-4 text-(--ui-text-muted)" />
						<span class="font-medium tabular-nums">{{ linkedDocNumber }}</span>
						<span class="text-(--ui-text-muted)">· {{ linkedDocPartyLabel }}</span>
					</div>
					<div class="grid grid-cols-3 gap-3 text-xs tabular-nums">
						<div>
							<div class="text-(--ui-text-muted)">
								{{ linkedDocTotalLabel }}
							</div>
							<div class="font-medium">
								{{ formatLKR(linkedDocTotalCents) }}
							</div>
						</div>
						<div>
							<div class="text-(--ui-text-muted)">
								{{ linkedDocPaidLabel }}
							</div>
							<div class="font-medium">
								{{ formatLKR(linkedDocAlreadyPaidCents) }}
							</div>
						</div>
						<div>
							<div class="text-(--ui-text-muted)">
								Remaining
							</div>
							<div
								class="font-medium"
								:class="linkedDocRemainingCents === 0 ? 'text-(--ui-success)' : ''"
							>
								{{ formatLKR(linkedDocRemainingCents) }}
							</div>
						</div>
					</div>
				</div>

				<UFormField label="Type" required>
					<div class="grid grid-cols-2 gap-3">
						<button
							v-for="choice in typeChoices"
							:key="choice.value"
							type="button"
							:disabled="prefilled"
							class="flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed"
							:class="tileClass(choice.value)"
							@click="voucherType = choice.value"
						>
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-md"
								:class="tileChipClass(choice.value)"
							>
								<UIcon :name="choice.icon" class="size-5" />
							</span>
							<span class="min-w-0">
								<span class="block text-sm font-medium">{{ choice.label }}</span>
								<span class="block text-xs text-(--ui-text-muted)">{{ choice.desc }}</span>
							</span>
						</button>
					</div>
				</UFormField>

				<!-- Editable voucher number with live uniqueness check. The
					fiscal year derives from `voucher_date`, so changing
					the date can shift the prefix and reseed the default.
					See app/composables/useDocumentNumber.ts. -->
				<UFormField label="Number" required>
					<template #help>
						<span v-if="docNum.numberTaken.value" class="text-(--ui-error)">
							{{ docNum.numberFormatted.value }} is already in use — pick another sequence.
						</span>
						<span v-else-if="docNum.numberFormatted.value">
							Will be saved as <span class="font-medium">{{ docNum.numberFormatted.value }}</span>
						</span>
					</template>
					<UInputNumber
						v-model="docNum.sequence.value"
						:min="1"
						:step="1"
						class="w-1/2"
					/>
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Date" required>
						<DateField v-model="voucherDate" :min-value="dateMin" />
						<template v-if="dateMin" #help>
							<span class="inline-flex items-center gap-1 text-xs">
								<UIcon name="i-lucide-info" class="size-3 shrink-0" />
								On or after {{ dateMin }} (pay date)
							</span>
						</template>
					</UFormField>
					<UFormField label="Amount" required>
						<MoneyInput v-model="amountCents" />
						<!-- Soft over-payment warning. We don't block the
							submission — overpayment can legitimately
							represent a refund, a rounding adjustment, or a
							deliberate advance — but the user should see
							the math before clicking Create. -->
						<div
							v-if="overpaying"
							class="mt-2 flex items-start gap-2 rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 px-3 py-2 text-xs"
						>
							<UIcon name="i-lucide-triangle-alert" class="size-4 text-(--ui-warning) shrink-0 mt-0.5" />
							<div class="text-(--ui-text)">
								This {{ overpaymentVerb }} exceeds the {{ linkedDocNoun }}'s outstanding balance by
								<span class="font-semibold tabular-nums">{{ formatLKR(overpaymentCents) }}</span>.
								Total {{ overpaymentTotalVerb }} will become {{ formatLKR(linkedDocAlreadyPaidCents + amountCents) }} against a {{ formatLKR(linkedDocTotalCents) }} {{ linkedDocNoun }}. Continue if intended.
							</div>
						</div>
						<template v-if="prefilled" #help>
							<span class="inline-flex items-center gap-1 text-xs">
								<UIcon name="i-lucide-info" class="size-3 shrink-0" />
								Edit for a partial payment
							</span>
						</template>
					</UFormField>
				</div>

				<UFormField :label="voucherType === 'receipt' ? 'Received from' : 'Paid to'" required>
					<UInput v-model="partyName" :disabled="prefilled" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Method">
						<USelect v-model="method" :items="methodOptions" value-key="value" class="w-full" />
					</UFormField>
					<UFormField label="Reference" hint="Cheque #, transaction ID…">
						<UInput v-model="reference" />
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
					/>
				</UFormField>

				<UFormField label="Description">
					<UTextarea v-model="description" :rows="3" />
				</UFormField>

				<UFormField v-if="voucherType === 'receipt'" label="Linked invoice (optional)">
					<LinkedInvoiceField v-model="relatedInvoiceId" :disabled="prefilled" />
				</UFormField>
				<UFormField v-if="voucherType === 'payment'" label="Linked bill (optional)">
					<LinkedBillField v-model="relatedBillId" :disabled="prefilled" />
				</UFormField>
				<UFormField v-if="voucherType === 'payment'" label="Linked payslip (optional)">
					<LinkedPayslipField v-model="relatedPayslipId" :disabled="prefilled" />
				</UFormField>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="onCancel">
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

	import type { VendorSnapshot } from "~/stores/bills";
	import type { EmployeeSnapshot } from "~/stores/payslips";
	import type { ClientSnapshot } from "~/stores/quotes";
	import type { VoucherInput, VoucherMethod, VoucherType } from "~/stores/vouchers";
	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useVouchersStore } from "~/stores/vouchers";

	// Opt out of the app-wide <NuxtPage keepalive>. This form reads its
	// prefill (type / party / amount / linked-doc) from route.query at
	// setup time and computes it ONCE — there's no onActivated/watch to
	// re-seed. Kept alive, the second "Record payment" from a different
	// invoice reuses the cached instance and shows the first document's
	// stale prefill (or none). Disabling keep-alive forces a fresh setup
	// every visit, so the prefill always reflects the current ?invoice /
	// ?bill / ?payslip. A form page has nothing worth caching anyway.
	definePageMeta({ title: "New voucher", keepalive: false });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();
	const store = useVouchersStore();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const payslipsStore = usePayslipsStore();
	const banksStore = useBusinessBanksStore();

	// Vouchers store has to be loaded too so the bills store's
	// derivedStatus / paidCentsFor below see existing payment vouchers
	// when we compute the suggested-amount default.
	await Promise.all([store.load(), invoicesStore.load(), billsStore.load(), payslipsStore.load(), banksStore.ensureLoaded()]);

	// "Record payment" on a bill or invoice detail page navigates here
	// with ?bill=N or ?invoice=N — we pre-fill the appropriate fields
	// and bounce back on save. Bills get voucher_type=payment + the
	// vendor name + related_bill_id; invoices get voucher_type=receipt
	// + the client name + related_invoice_id.
	const prefilledBillId = computed<number | null>(() => {
		const raw = route.query.bill;
		const v = Array.isArray(raw) ? raw[0] : raw;
		const n = Number(v);
		return Number.isFinite(n) && n > 0 ? n : null;
	});
	const prefilledInvoiceId = computed<number | null>(() => {
		const raw = route.query.invoice;
		const v = Array.isArray(raw) ? raw[0] : raw;
		const n = Number(v);
		return Number.isFinite(n) && n > 0 ? n : null;
	});
	const prefilledPayslipId = computed<number | null>(() => {
		const raw = route.query.payslip;
		const v = Array.isArray(raw) ? raw[0] : raw;
		const n = Number(v);
		return Number.isFinite(n) && n > 0 ? n : null;
	});

	// True when the user arrived via 'Record payment' on a known
	// document — type / party / linked-doc come from that document
	// and shouldn't be edited here. Date and amount stay editable
	// because partial / early / late payments are normal.
	const prefilled = computed(() =>
		prefilledInvoiceId.value !== null
		|| prefilledBillId.value !== null
		|| prefilledPayslipId.value !== null
	);

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Seed from the linked document if we arrived here via "Record
	// payment" on a bill or invoice detail page. Both can't be set at
	// once — the invoice prefill wins if it is, since that's the more
	// recent route. Otherwise these defaults are the empty-form path
	// (today, payment-type, blank).
	const seedBill = prefilledBillId.value
		? billsStore.bills.find((b) => b.id === prefilledBillId.value) ?? null
		: null;
	const seedInvoice = prefilledInvoiceId.value
		? invoicesStore.invoices.find((i) => i.id === prefilledInvoiceId.value) ?? null
		: null;
	const seedPayslip = prefilledPayslipId.value
		? payslipsStore.payslips.find((p) => p.id === prefilledPayslipId.value) ?? null
		: null;

	// When recording a payment for a payslip, the voucher date must
	// be on or after the payslip's pay_date — paying before the pay
	// date doesn't make accounting sense. Bills and invoices don't
	// share the same constraint (you can pay a bill the day it
	// arrives, even before its issue/due date in edge cases) so we
	// only clamp the payslip case.
	const dateMin: string | null = seedPayslip?.pay_date ?? null;

	const seedVendorName = (() => {
		if (!seedBill) return "";
		try {
			return (JSON.parse(seedBill.vendor_snapshot) as VendorSnapshot).name ?? "";
		} catch {
			return "";
		}
	})();

	const seedClientName = (() => {
		if (!seedInvoice) return "";
		try {
			return (JSON.parse(seedInvoice.client_snapshot) as ClientSnapshot).name ?? "";
		} catch {
			return "";
		}
	})();

	const seedEmployeeName = (() => {
		if (!seedPayslip) return "";
		try {
			return (JSON.parse(seedPayslip.employee_snapshot) as EmployeeSnapshot).full_name ?? "";
		} catch {
			return "";
		}
	})();

	// Pick whichever side prefilled. Invoice wins, then payslip, then bill.
	// Multiple query params at once is a malformed link — first match wins.
	const seedAmountCents = seedInvoice
		? invoicesStore.balanceCentsFor(seedInvoice)
		: seedPayslip
			? payslipsStore.balanceCentsFor(seedPayslip)
			: seedBill ? billsStore.balanceCentsFor(seedBill) : 0;

	const initialType: VoucherType = seedInvoice ? "receipt" : "payment";
	const initialPartyName = seedInvoice
		? seedClientName
		: seedPayslip
			? seedEmployeeName
			: seedVendorName;
	const initialDescription = seedInvoice
		? `Receipt for ${seedInvoice.number}`
		: seedPayslip
			? `Salary payment — ${seedPayslip.number}`
			: seedBill ? `Payment for ${seedBill.number}` : "";

	const voucherType = ref<VoucherType>(initialType);
	// Default to today, but never earlier than the payslip's pay_date
	// when one's prefilled — saves the user a manual fix when they
	// open the form before the salary is officially due.
	//
	// `?date=YYYY-MM-DD` from the calendar's "New voucher" shortcut
	// overrides today. The min-date guard above still applies so the
	// voucher can't predate a linked payslip.
	const initialDate = (() => {
		const queryDate = typeof route.query.date === "string" ? route.query.date : null;
		const candidate = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
			? queryDate
			: todayISO();
		return dateMin && candidate < dateMin ? dateMin : candidate;
	})();
	const voucherDate = ref<string>(initialDate);
	const partyName = ref<string>(initialPartyName);
	const amountCents = ref<number>(seedAmountCents);
	const method = ref<VoucherMethod | null>("bank_transfer");
	const bankId = ref<number | null>(banksStore.defaultBank?.id ?? null);
	const reference = ref<string>("");
	const description = ref<string>(initialDescription);
	const relatedInvoiceId = ref<number | null>(seedInvoice?.id ?? null);
	const relatedBillId = ref<number | null>(seedBill?.id ?? null);
	const relatedPayslipId = ref<number | null>(seedPayslip?.id ?? null);
	const creating = ref(false);

	// Editable voucher number with live uniqueness check. The page is
	// always mounted-and-enabled while the user is on it (no modal open
	// state to gate on), so `enabled` is a const-true ref. See
	// app/composables/useDocumentNumber.ts for the reactive contract.
	const enabled = ref(true);
	const docNum = useDocumentNumber({
		type: "voucher",
		issueDate: voucherDate,
		enabled
	});

	// Voucher type rendered as two selectable tiles (not a dropdown) —
	// directional arrows carry the money-in / money-out meaning.
	const typeChoices: { value: VoucherType, label: string, desc: string, icon: string }[] = [
		{ value: "payment", label: "Payment", desc: "Money paid out", icon: "i-lucide-arrow-up-right" },
		{ value: "receipt", label: "Receipt", desc: "Money received", icon: "i-lucide-arrow-down-left" }
	];

	// Selected-tile colours match the voucher header badge: receipts
	// green (success), payments amber (warning). Full class strings so
	// Tailwind's JIT picks them up.
	const TYPE_ACTIVE: Record<VoucherType, { tile: string, chip: string }> = {
		payment: {
			tile: "border-(--ui-warning) bg-(--ui-warning)/10 ring-1 ring-(--ui-warning)",
			chip: "bg-(--ui-warning) text-(--ui-bg)"
		},
		receipt: {
			tile: "border-(--ui-success) bg-(--ui-success)/10 ring-1 ring-(--ui-success)",
			chip: "bg-(--ui-success) text-(--ui-bg)"
		}
	};
	const INACTIVE_TILE = "border-(--ui-border) hover:border-(--ui-text-muted)/50 hover:bg-(--ui-bg-muted) disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-(--ui-border)";
	const INACTIVE_CHIP = "bg-(--ui-bg-muted) text-(--ui-text-muted)";
	const tileClass = (v: VoucherType): string =>
		voucherType.value === v ? TYPE_ACTIVE[v].tile : INACTIVE_TILE;
	const tileChipClass = (v: VoucherType): string =>
		voucherType.value === v ? TYPE_ACTIVE[v].chip : INACTIVE_CHIP;

	const methodOptions: { label: string, value: VoucherMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	const bankPickerOptions = computed<{ label: string, value: number | null }[]>(() => {
		const items: { label: string, value: number | null }[] = [
			{ label: "—", value: null }
		];
		for (const b of banksStore.activeBanks) {
			items.push({
				label: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
				value: b.id
			});
		}
		return items;
	});

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

	// The document the voucher is currently linked to (whether by
	// prefill or by the user picking from the dropdown). Drives the
	// context block at the top of the form and the overpayment warning
	// under the amount field. Symmetric for bills (payment vouchers)
	// and invoices (receipt vouchers).
	const linkedBill = computed(() => {
		if (voucherType.value !== "payment" || relatedBillId.value === null) return null;
		return billsStore.bills.find((b) => b.id === relatedBillId.value) ?? null;
	});
	const linkedInvoice = computed(() => {
		if (voucherType.value !== "receipt" || relatedInvoiceId.value === null) return null;
		return invoicesStore.invoices.find((i) => i.id === relatedInvoiceId.value) ?? null;
	});
	const linkedPayslip = computed(() => {
		if (voucherType.value !== "payment" || relatedPayslipId.value === null) return null;
		return payslipsStore.payslips.find((p) => p.id === relatedPayslipId.value) ?? null;
	});

	const linkedDocKind = computed<"bill" | "invoice" | "payslip" | null>(() => {
		if (linkedBill.value) return "bill";
		if (linkedInvoice.value) return "invoice";
		if (linkedPayslip.value) return "payslip";
		return null;
	});

	const linkedDocNumber = computed(() =>
		linkedBill.value?.number
		?? linkedInvoice.value?.number
		?? linkedPayslip.value?.number
		?? ""
	);

	const linkedDocPartyLabel = computed(() => {
		if (linkedBill.value) {
			try {
				return (JSON.parse(linkedBill.value.vendor_snapshot) as VendorSnapshot).name ?? "";
			} catch {
				return "";
			}
		}
		if (linkedInvoice.value) {
			try {
				return (JSON.parse(linkedInvoice.value.client_snapshot) as ClientSnapshot).name ?? "";
			} catch {
				return "";
			}
		}
		if (linkedPayslip.value) {
			try {
				return (JSON.parse(linkedPayslip.value.employee_snapshot) as EmployeeSnapshot).full_name ?? "";
			} catch {
				return "";
			}
		}
		return "";
	});

	const linkedDocTotalCents = computed(() => {
		if (linkedBill.value) return linkedBill.value.total_cents;
		if (linkedInvoice.value) return linkedInvoice.value.total_cents;
		if (linkedPayslip.value) return linkedPayslip.value.net_cents;
		return 0;
	});

	const linkedDocAlreadyPaidCents = computed(() => {
		if (linkedBill.value) return billsStore.paidCentsFor(linkedBill.value.id);
		if (linkedInvoice.value) return invoicesStore.paidCentsFor(linkedInvoice.value.id);
		if (linkedPayslip.value) return payslipsStore.paidCentsFor(linkedPayslip.value.id);
		return 0;
	});

	const linkedDocRemainingCents = computed(() =>
		Math.max(0, linkedDocTotalCents.value - linkedDocAlreadyPaidCents.value)
	);

	// Per-kind copy for the context block + overpayment warning. Keeps
	// the template readable instead of nested ternaries.
	const linkedDocIcon = computed(() => {
		switch (linkedDocKind.value) {
		case "invoice": return "i-lucide-receipt";
		case "payslip": return "i-lucide-file-spreadsheet";
		default: return "i-lucide-file-input"; // bill
		}
	});
	const linkedDocNoun = computed(() => {
		switch (linkedDocKind.value) {
		case "invoice": return "invoice";
		case "payslip": return "payslip";
		default: return "bill";
		}
	});
	const linkedDocTotalLabel = computed(() => {
		switch (linkedDocKind.value) {
		case "invoice": return "Invoice total";
		case "payslip": return "Net pay";
		default: return "Bill total";
		}
	});
	const linkedDocPaidLabel = computed(() =>
		linkedDocKind.value === "invoice" ? "Already received" : "Already paid"
	);
	const overpaymentVerb = computed(() =>
		linkedDocKind.value === "invoice" ? "receipt" : "payment"
	);
	const overpaymentTotalVerb = computed(() =>
		linkedDocKind.value === "invoice" ? "received" : "paid"
	);

	// "Overpayment" = sum of existing payments + this new voucher
	// would exceed the linked document's total. We warn but don't
	// block (refunds, rounding adjustments, deliberate over-the-top
	// payments are all legitimate). Zero when no document is linked.
	const overpaymentCents = computed(() => {
		if (!linkedDocKind.value) return 0;
		const sumWithThis = linkedDocAlreadyPaidCents.value + amountCents.value;
		return Math.max(0, sumWithThis - linkedDocTotalCents.value);
	});
	const overpaying = computed(() => overpaymentCents.value > 0);

	const valid = computed(() =>
		partyName.value.trim() !== ""
		&& amountCents.value > 0
		&& /^\d{4}-\d{2}-\d{2}$/.test(voucherDate.value)
		&& docNum.numberValid.value
	);

	// Where to go when the user backs out — both the top-of-page
	// "Back…" link and the Cancel button consult this so they stay in
	// sync. When prefilled from a "Record payment" click, return to
	// the originating document; otherwise the vouchers list (the
	// canonical home of the standalone-create flow).
	const backLink = computed<{ to: string, label: string }>(() => {
		if (prefilledInvoiceId.value) {
			return { to: `/invoices/${prefilledInvoiceId.value}`, label: "Back to invoice" };
		}
		if (prefilledPayslipId.value) {
			return { to: `/payslips/${prefilledPayslipId.value}`, label: "Back to payslip" };
		}
		if (prefilledBillId.value) {
			return { to: `/bills/${prefilledBillId.value}`, label: "Back to bill" };
		}
		return { to: "/vouchers", label: "Back to vouchers" };
	});

	const onCancel = () => {
		router.push(backLink.value.to);
	};

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
				business_bank_id: method.value === "cash" ? null : bankId.value,
				reference: reference.value.trim() || null,
				description: description.value.trim() || null,
				related_invoice_id: voucherType.value === "receipt" ? relatedInvoiceId.value : null,
				related_bill_id: voucherType.value === "payment" ? relatedBillId.value : null,
				related_payslip_id: voucherType.value === "payment" ? relatedPayslipId.value : null
			};
			const id = await store.create({
				...input,
				sequence: docNum.sequence.value ?? undefined
			});
			toast.add({ title: "Voucher created", color: "success", icon: "i-lucide-check" });
			// If we arrived from a bill or invoice, bounce back so the
			// user sees the new payment row appear in the document's
			// Payments panel. Otherwise land on the voucher detail
			// page like the standalone-create path always did.
			if (prefilledInvoiceId.value) {
				await router.replace(`/invoices/${prefilledInvoiceId.value}`);
			} else if (prefilledPayslipId.value) {
				await router.replace(`/payslips/${prefilledPayslipId.value}`);
			} else if (prefilledBillId.value) {
				await router.replace(`/bills/${prefilledBillId.value}`);
			} else {
				await router.replace(`/vouchers/${id}`);
			}
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
