<template>
	<div v-if="invoice">
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<NuxtLink to="/invoices" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
					<UIcon name="i-lucide-arrow-left" class="size-4" />
					Back to invoices
				</NuxtLink>
				<h1 class="text-2xl font-semibold mt-1 flex items-center gap-3 flex-wrap">
					<span class="tabular-nums">{{ invoice.number }}</span>
					<StatusBadge :status="status" size="md" />
					<span v-if="!editable" class="text-xs text-(--ui-text-muted) font-normal">
						read-only after issue
					</span>
				</h1>
				<p v-if="formProjectTitle" class="text-sm text-(--ui-text-muted) mt-1">
					{{ formProjectTitle }}
				</p>
				<NuxtLink
					v-if="invoice.source_quote_id"
					:to="`/quotes/${invoice.source_quote_id}`"
					class="text-xs text-(--ui-primary) hover:underline mt-1 inline-flex items-center gap-1"
				>
					<UIcon name="i-lucide-link" class="size-3" />
					Converted from quote
				</NuxtLink>
			</div>
			<div class="flex gap-2 items-center">
				<UButton
					v-if="canRecordPayments"
					color="primary"
					icon="i-lucide-circle-dollar-sign"
					@click="openRecordPayment"
				>
					Record payment
				</UButton>
				<UButton
					v-if="editable"
					:loading="saving"
					:disabled="!dirty"
					icon="i-lucide-save"
					@click="save"
				>
					Save
				</UButton>
				<UButton
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this invoice as a PDF'"
					@click="onPdfClick"
				>
					PDF
				</UButton>
				<UDropdownMenu v-if="transitionItems.length > 0" :items="transitionItems">
					<UButton color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down">
						Status
					</UButton>
				</UDropdownMenu>
				<UButton
					color="error"
					variant="ghost"
					icon="i-lucide-trash-2"
					@click="askDelete"
				>
					{{ isDraft ? "Delete draft" : "Delete" }}
				</UButton>
			</div>
		</header>

		<div class="space-y-6">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Client &amp; project
						</div>
						<UButton
							v-if="editable"
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-refresh-ccw"
							@click="refreshClientSnapshot"
						>
							Refresh client snapshot
						</UButton>
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Bill to
						</div>
						<div class="text-sm">
							<div class="font-medium">
								{{ clientSnapshot?.name }}
							</div>
							<div v-if="clientSnapshot?.address_line1" class="text-(--ui-text-muted)">
								{{ clientSnapshot.address_line1 }}
							</div>
							<div v-if="clientSnapshot?.address_line2" class="text-(--ui-text-muted)">
								{{ clientSnapshot.address_line2 }}
							</div>
							<div v-if="clientSnapshot?.city || clientSnapshot?.country" class="text-(--ui-text-muted)">
								{{ [clientSnapshot.city, clientSnapshot.postal_code, clientSnapshot.country].filter(Boolean).join(", ") }}
							</div>
							<div v-if="clientSnapshot?.tax_id" class="text-(--ui-text-muted) mt-1 text-xs">
								Tax ID: {{ clientSnapshot.tax_id }}
							</div>
						</div>
					</div>
					<div class="space-y-3">
						<UFormField label="Project title" hint="Centered subtitle on the PDF">
							<UInput v-model="formProjectTitle" :disabled="!editable" />
						</UFormField>
						<div class="grid grid-cols-2 gap-3">
							<UFormField label="Issue date">
								<DateField v-model="formIssueDate" :disabled="!editable" />
							</UFormField>
							<UFormField label="Due date">
								<DateField v-model="formDueDate" :disabled="!editable" />
							</UFormField>
						</div>
					</div>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="flex items-center justify-between gap-4 flex-wrap">
						<div class="font-medium">
							Items
						</div>
						<div v-if="editable" class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs">
							<button
								type="button"
								class="px-3 py-1.5"
								:class="pricingMode === 'bundle' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="togglePricingMode('bundle')"
							>
								Bundle
							</button>
							<button
								type="button"
								class="px-3 py-1.5 border-l border-(--ui-border)"
								:class="pricingMode === 'itemized' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="togglePricingMode('itemized')"
							>
								Itemized
							</button>
						</div>
					</div>
				</template>
				<DocumentLineEditor
					:model-value="lines"
					:mode="pricingMode"
					:disabled="!editable"
					@update:model-value="onLinesChange"
				/>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Totals &amp; payments
					</div>
				</template>

				<div v-if="pricingMode === 'bundle' && editable" class="space-y-3">
					<UFormField label="Invoice subtotal" hint="Total exclusive of VAT.">
						<UInput
							:model-value="bundleSubtotalDisplay"
							placeholder="0.00"
							@update:model-value="onBundleSubtotalInput"
						>
							<template #trailing>
								<span class="text-xs text-(--ui-text-muted) pr-1">{{ currency.code }}</span>
							</template>
						</UInput>
					</UFormField>
					<UFormField label="VAT rate (%)" hint="Set to 0 for a tax-free invoice.">
						<UInputNumber
							v-model="vatRatePct"
							:step="0.01"
							:min="0"
							:max="100"
							class="md:w-32"
						/>
					</UFormField>
				</div>

				<div class="border-t border-(--ui-border) pt-4 mt-4 flex justify-end">
					<div class="text-sm tabular-nums text-right space-y-0.5">
						<div class="text-(--ui-text-muted)">
							Subtotal: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.subtotal) }}</span>
						</div>
						<div v-if="computedTotals.tax !== 0" class="text-(--ui-text-muted)">
							VAT: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.tax) }}</span>
						</div>
						<div class="font-semibold text-base">
							Total: {{ formatLKR(computedTotals.total) }}
						</div>
						<div v-if="paidCents > 0" class="text-(--ui-text-muted) pt-1 border-t border-(--ui-border) mt-1">
							Paid: <span class="text-(--ui-success)">{{ formatLKR(paidCents) }}</span>
						</div>
						<div v-if="paidCents > 0" class="font-semibold" :class="balanceCents === 0 ? 'text-(--ui-success)' : 'text-(--ui-text)'">
							Balance: {{ formatLKR(balanceCents) }}
						</div>
					</div>
				</div>

				<!-- Payment ledger -->
				<div v-if="payments.length > 0 || canRecordPayments" class="mt-6 border-t border-(--ui-border) pt-4">
					<div class="flex items-center justify-between mb-2">
						<div class="text-sm font-medium">
							Payments
						</div>
						<UButton
							v-if="canRecordPayments"
							size="xs"
							variant="outline"
							icon="i-lucide-plus"
							@click="openRecordPayment"
						>
							Add payment
						</UButton>
					</div>
					<div v-if="payments.length === 0" class="text-sm text-(--ui-text-muted) py-4 text-center border border-dashed border-(--ui-border) rounded-md">
						No payments recorded yet.
					</div>
					<table v-else class="w-full text-sm">
						<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
							<tr>
								<th class="py-2 pr-2 font-medium">
									Date
								</th>
								<th class="py-2 px-2 font-medium">
									Method
								</th>
								<th class="py-2 px-2 font-medium">
									Reference
								</th>
								<th class="py-2 px-2 font-medium text-right">
									Amount
								</th>
								<th class="py-2 pl-2 w-8" />
							</tr>
						</thead>
						<tbody>
							<tr v-for="p in payments" :key="p.id" class="border-b border-(--ui-border)/60 last:border-0">
								<td class="py-2 pr-2 tabular-nums">
									{{ p.payment_date }}
								</td>
								<td class="py-2 px-2 text-(--ui-text-muted)">
									{{ methodLabel(p.method) }}
								</td>
								<td class="py-2 px-2 text-(--ui-text-muted)">
									{{ p.reference || "—" }}
								</td>
								<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap font-medium">
									{{ formatLKR(p.amount_cents) }}
								</td>
								<td class="py-2 pl-2 text-right">
									<UButton
										v-if="canRecordPayments || status === 'paid'"
										size="xs"
										variant="ghost"
										color="error"
										icon="i-lucide-trash-2"
										@click="askDeletePayment(p)"
									/>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Notes &amp; sign-off
					</div>
				</template>
				<div class="grid grid-cols-1 gap-4">
					<UFormField label="Notes">
						<UTextarea v-model="formNotes" :rows="6" :disabled="!editable" />
					</UFormField>
					<UFormField label="Terms">
						<UTextarea v-model="formTerms" :rows="3" :disabled="!editable" />
					</UFormField>
					<UFormField label="Prepared by">
						<UInput v-model="formPreparedBy" :disabled="!editable" />
					</UFormField>
				</div>
			</UCard>
		</div>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${invoice.number}?`">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						This permanently removes the invoice, its line items, and all
						payment records. The number {{ invoice.number }} will not be
						reused — it'll show as a gap in your sequence.
					</p>
					<div v-if="!isDraft" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							This invoice has been issued ({{ status }}<span v-if="paidCents > 0">, {{ formatLKR(paidCents) }} paid</span>).
						</p>
						<p class="text-(--ui-text-muted)">
							Deleting issued documents breaks the rule that issued
							records are immutable.
							<span v-if="payments.length > 0">All {{ payments.length }} payment record(s) will be lost.</span>
							<span v-if="invoice.source_quote_id">The source quote's link to this invoice will be cleared.</span>
							Vouchers that reference this invoice will be kept but
							unlinked. Only do this if it's a real mistake to scrub
							from your books.
						</p>
						<UFormField :label="`Type ${invoice.number} to confirm`">
							<UInput v-model="deleteConfirmInput" :placeholder="invoice.number" autofocus />
						</UFormField>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDeleteDialog = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						icon="i-lucide-trash-2"
						:disabled="!canConfirmDelete"
						@click="confirmDelete"
					>
						{{ isDraft ? "Delete draft" : "Delete anyway" }}
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="showDeletePaymentDialog" title="Remove payment?">
			<template #body>
				<p v-if="paymentToDelete" class="text-sm text-(--ui-text-muted)">
					Remove the {{ formatLKR(paymentToDelete.amount_cents) }} payment
					from {{ paymentToDelete.payment_date }}? The invoice's paid total
					and status will be recalculated.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDeletePaymentDialog = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" @click="confirmDeletePayment">
						Remove payment
					</UButton>
				</div>
			</template>
		</UModal>

		<PaymentRecorder
			v-model:open="showPaymentModal"
			:total-cents="totalCents"
			:paid-cents="paidCents"
			@save="onRecordPayment"
		/>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Invoice PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Invoice editor — mirrors the quote editor but adds a payments ledger.
//
// Once an invoice is sent, the header/lines are frozen but payments can
// still be added/removed (recordPayment / deletePayment auto-recompute
// status). Drafts are fully editable.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { InvoiceLineRow, InvoicePaymentRow, InvoiceRow, InvoiceStatus, PaymentDraft, PaymentMethod } from "~/stores/invoices";
	import type { BankSnapshot, ClientSnapshot, PricingMode } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { computeLineTotals, formatLKR, formatQty, formatRate, sumCents, toCents } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { useClientsStore } from "~/stores/clients";
	import { canTransition, useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Invoice" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const settingsStore = useSettingsStore();
	const clientsStore = useClientsStore();
	const invoicesStore = useInvoicesStore();
	const currency = useActiveCurrency();

	const invoiceId = Number(route.params.id);
	if (!Number.isFinite(invoiceId)) {
		throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
	}

	const invoice = ref<InvoiceRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const payments = ref<InvoicePaymentRow[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const bundleSubtotalDisplay = ref<string>("");
	const vatRatePct = ref<number>(0);
	const formIssueDate = ref("");
	const formDueDate = ref("");
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formTerms = ref("");
	const formPreparedBy = ref("");

	const pricingMode = computed<PricingMode>(() => invoice.value?.pricing_mode ?? "bundle");
	const status = computed<InvoiceStatus>(() => invoice.value?.status ?? "draft");
	const isDraft = computed(() => status.value === "draft");
	const editable = computed(() => isDraft.value);
	const canRecordPayments = computed(() =>
		["sent", "partial", "overdue"].includes(status.value)
	);

	const totalCents = computed(() => invoice.value?.total_cents ?? 0);
	const paidCents = computed(() => invoice.value?.paid_cents ?? 0);
	const balanceCents = computed(() => Math.max(0, totalCents.value - paidCents.value));

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!invoice.value?.client_snapshot) return null;
		try {
			return JSON.parse(invoice.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	await Promise.all([settingsStore.ensureLoaded(), clientsStore.load()]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await invoicesStore.get(invoiceId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
		}
		invoice.value = row;
		formIssueDate.value = row.issue_date;
		formDueDate.value = row.due_date;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTerms.value = row.terms ?? "";
		formPreparedBy.value = row.prepared_by ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;
		bundleSubtotalDisplay.value = centsToRupees(row.subtotal_cents);

		const lineRows: InvoiceLineRow[] = await invoicesStore.getLines(invoiceId);
		lines.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			quantity_milli: l.quantity_milli,
			unit: l.unit,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.tax_rate_basis_points
		}));

		payments.value = await invoicesStore.getPayments(invoiceId);
		dirty.value = false;
		// Let the form-field watcher's queued run flush before unsetting the
		// guard, so re-hydrate after save doesn't immediately re-dirty.
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Mark dirty when any of the directly v-model'd form fields change.
	// Registered after the initial hydrate so the population pass doesn't trip
	// it. Re-runs of hydrate() reset dirty to false at the end, so the watcher
	// firing during a re-hydrate is harmless.
	watch(
		[formProjectTitle, formIssueDate, formDueDate, formNotes, formTerms, formPreparedBy, vatRatePct],
		() => {
			if (editable.value && !hydrating.value) dirty.value = true;
		}
	);

	function centsToRupees(c: number): string {
		if (!Number.isInteger(c) || c === 0) return "";
		const r = Math.floor(Math.abs(c) / 100);
		const cs = Math.abs(c) % 100;
		const sign = c < 0 ? "-" : "";
		return `${sign}${r}.${cs.toString().padStart(2, "0")}`;
	}

	const onBundleSubtotalInput = (raw: string | number) => {
		bundleSubtotalDisplay.value = String(raw);
		try {
			bundleSubtotalCents.value = toCents(String(raw));
			dirty.value = true;
		} catch { /* ignore */ }
	};

	const computedTotals = computed(() => {
		if (pricingMode.value === "itemized") {
			const subs = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_subtotal_cents);
			const tx = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_tax_cents);
			const tot = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_total_cents);
			return {
				subtotal: sumCents(...subs),
				tax: sumCents(...tx),
				total: sumCents(...tot)
			};
		}
		const sub = bundleSubtotalCents.value;
		const taxCents = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax: taxCents, total: sub + taxCents };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!invoice.value || invoice.value.pricing_mode === mode || !editable.value) return;
		invoice.value = { ...invoice.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	const refreshClientSnapshot = async () => {
		if (!invoice.value || !editable.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === invoice.value!.client_id);
		if (!c) return;
		const snap = invoicesStore.buildClientSnapshot(c);
		invoice.value = { ...invoice.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!invoice.value || !editable.value) return;
		saving.value = true;
		try {
			const totalsFromLines = await invoicesStore.replaceLines(invoiceId, lines.value);
			const bp = Math.round(vatRatePct.value * 100);
			const subtotal = pricingMode.value === "itemized"
				? totalsFromLines.subtotal_cents
				: bundleSubtotalCents.value;
			const tax = pricingMode.value === "itemized"
				? totalsFromLines.tax_cents
				: Math.round((subtotal * bp) / 10000);
			const total = pricingMode.value === "itemized"
				? totalsFromLines.total_cents
				: subtotal + tax;

			await invoicesStore.update(invoiceId, {
				pricing_mode: invoice.value.pricing_mode,
				project_title: formProjectTitle.value,
				issue_date: formIssueDate.value,
				due_date: formDueDate.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				notes: formNotes.value || null,
				terms: formTerms.value || null,
				prepared_by: formPreparedBy.value || null,
				client_snapshot: invoice.value.client_snapshot
			});
			await invoicesStore.load();
			await hydrate();
			toast.add({ title: "Invoice saved", color: "success", icon: "i-lucide-check" });
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

	const transition = async (target: InvoiceStatus) => {
		if (!invoice.value) return;
		if (!canTransition(invoice.value.status, target)) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			await invoicesStore.setStatus(invoiceId, target);
			await hydrate();
			toast.add({ title: `Marked as ${target}`, color: "info", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const transitionItems = computed(() => {
		const cur = status.value;
		const items: { label: string, icon: string, onSelect: () => void }[] = [];
		if (canTransition(cur, "sent")) items.push({ label: "Mark as Sent", icon: "i-lucide-send", onSelect: () => transition("sent") });
		if (canTransition(cur, "cancelled")) items.push({ label: "Mark as Cancelled", icon: "i-lucide-ban", onSelect: () => transition("cancelled") });
		return items.length > 0 ? [items] : [];
	});

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};
	// Drafts: plain confirmation. Issued: typed-name confirmation, since this
	// also wipes the payment ledger and detaches reverse FKs.
	const canConfirmDelete = computed(() => {
		if (!invoice.value) return false;
		if (isDraft.value) return true;
		return deleteConfirmInput.value.trim() === invoice.value.number;
	});
	const confirmDelete = async () => {
		if (!invoice.value || !canConfirmDelete.value) return;
		showDeleteDialog.value = false;
		try {
			await invoicesStore.remove(invoiceId);
			toast.add({
				title: isDraft.value ? "Draft deleted" : "Invoice deleted",
				color: "info",
				icon: "i-lucide-trash-2"
			});
			await router.replace("/invoices");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const showPaymentModal = ref(false);
	const openRecordPayment = () => {
		showPaymentModal.value = true;
	};
	const onRecordPayment = async (draft: PaymentDraft) => {
		showPaymentModal.value = false;
		try {
			await invoicesStore.recordPayment(invoiceId, draft);
			await hydrate();
			toast.add({ title: "Payment recorded", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Could not record payment",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const showDeletePaymentDialog = ref(false);
	const paymentToDelete = ref<InvoicePaymentRow | null>(null);
	const askDeletePayment = (p: InvoicePaymentRow) => {
		paymentToDelete.value = p;
		showDeletePaymentDialog.value = true;
	};
	const confirmDeletePayment = async () => {
		const p = paymentToDelete.value;
		showDeletePaymentDialog.value = false;
		paymentToDelete.value = null;
		if (!p) return;
		try {
			await invoicesStore.deletePayment(invoiceId, p.id);
			await hydrate();
			toast.add({ title: "Payment removed", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Could not remove payment",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const methodLabel = (m: PaymentMethod | null): string => {
		if (!m) return "—";
		return ({
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		} as const)[m] ?? m;
	};

	// ---- PDF export ----------------------------------------------------------
	// Same unified document.typ template as quotes — only the labels differ.
	const buildPdfPayload = (lineRows: InvoiceLineRow[]) => {
		const inv = invoice.value!;
		const c = clientSnapshot.value;
		const cityLine = [c?.city, c?.postal_code].filter(Boolean).join(" ").trim();
		const addressLines = [c?.address_line1, c?.address_line2, cityLine || null, c?.country]
			.filter((s): s is string => Boolean(s && s.trim()));
		const hasVat = (inv.tax_cents ?? 0) !== 0;
		let bank: BankSnapshot | null = null;
		try {
			if (inv.bank_details_snapshot) bank = JSON.parse(inv.bank_details_snapshot) as BankSnapshot;
		} catch { /* ignore */ }

		const fmt = (cents: number) => formatLKR(cents);
		const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

		const balanceCentsValue = Math.max(0, inv.total_cents - inv.paid_cents);

		return {
			kind: "invoice",
			number: inv.number,
			title: "INVOICE",
			theme_color: themeHex(settingsStore.settings?.theme_color),
			font_family: settingsStore.settings?.pdf_font ?? "Inter",
			currency_code: currency.value.code,
			currency_symbol: currency.value.symbol,
			primary_label: "Invoice",
			date_label: "Date",
			date_value: inv.issue_date,
			secondary_label: "Due date",
			secondary_value: inv.due_date,
			vendor_invoice_label: null,
			vendor_invoice_value: null,
			party_label: "Bill to",
			party: c
				? {
					name: c.name,
					tax_id: c.tax_id ?? null,
					address_lines: addressLines
				}
				: { name: "(no client)", tax_id: null, address_lines: [] },
			project_title: inv.project_title || "",
			pricing_mode: inv.pricing_mode,
			has_vat: hasVat,
			notes: inv.notes ?? "",
			notes_paragraphs: (inv.notes ?? "").split(/\n\s*\n/).filter((p) => p.trim().length > 0),
			prepared_by: inv.prepared_by ?? "",
			// Show paid/balance only when something has been paid; null
			// suppresses the row entirely on a freshly-issued invoice.
			paid_cents: inv.paid_cents > 0 ? inv.paid_cents : null,
			paid_display: inv.paid_cents > 0 ? fmtNoSym(inv.paid_cents) : null,
			balance_display: inv.paid_cents > 0 ? fmtNoSym(balanceCentsValue) : null,
			business_name: settingsStore.settings?.business_name ?? null,
			website: settingsStore.settings?.website ?? null,
			phone: settingsStore.settings?.phone ?? null,
			address_line1: settingsStore.settings?.address_line1 ?? null,
			city: settingsStore.settings?.city ?? null,
			logo_path: settingsStore.settings?.pdf_header_logo_path ?? null,
			bank,
			lines: lineRows.map((l) => ({
				item_label: l.item_label,
				description: l.description,
				qty_display: formatQty(l.quantity_milli) + (l.unit ? ` ${l.unit}` : ""),
				unit_price_display: fmtNoSym(l.unit_price_cents),
				vat_display: formatRate(l.tax_rate_basis_points),
				total_display: fmtNoSym(l.line_total_cents)
			})),
			formatted: {
				subtotal: fmt(inv.subtotal_cents),
				subtotal_no_symbol: fmtNoSym(inv.subtotal_cents),
				tax: fmt(inv.tax_cents),
				tax_no_symbol: fmtNoSym(inv.tax_cents),
				total: fmt(inv.total_cents),
				total_no_symbol: fmtNoSym(inv.total_cents)
			}
		};
	};

	// Preview-then-save flow. Same pattern as quotes/[id].vue — see there
	// for the rationale on the linesForPreview cache.
	const linesForPreview = ref<InvoiceLineRow[]>([]);
	watch([() => invoiceId, () => invoice.value?.updated_at], async () => {
		try {
			linesForPreview.value = await invoicesStore.getLines(invoiceId);
		} catch { /* surfaced when user clicks PDF */ }
	}, { immediate: true });

	const pdf = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => buildPdfPayload(linesForPreview.value),
		fileName: () => `${invoice.value?.number ?? "invoice"}.pdf`,
		title: "Invoice PDF preview"
	});

	const onPdfClick = () => {
		if (!invoice.value || dirty.value) return;
		pdf.open();
	};
</script>
