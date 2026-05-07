<template>
	<div v-if="quote">
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<NuxtLink to="/quotes" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
					<UIcon name="i-lucide-arrow-left" class="size-4" />
					Back to quotes
				</NuxtLink>
				<h1 class="text-2xl font-semibold mt-1 flex items-center gap-3 flex-wrap">
					<span class="tabular-nums">{{ quote.number }}</span>
					<StatusBadge :status="status" size="md" />
					<span v-if="!editable" class="text-xs text-(--ui-text-muted) font-normal">read-only after issue</span>
				</h1>
				<p v-if="formProjectTitle" class="text-sm text-(--ui-text-muted) mt-1">
					{{ formProjectTitle }}
				</p>
			</div>
			<div class="flex gap-2 items-center">
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
					:title="dirty ? 'Save first' : 'Preview this quote as a PDF'"
					@click="onPdfClick"
				>
					PDF
				</UButton>
				<UButton
					v-if="canConvert"
					color="primary"
					icon="i-lucide-receipt"
					@click="askConvert"
				>
					Convert to invoice
				</UButton>
				<NuxtLink
					v-if="quote.converted_invoice_id"
					:to="`/invoices/${quote.converted_invoice_id}`"
					class="text-sm text-(--ui-primary) hover:underline inline-flex items-center gap-1"
				>
					<UIcon name="i-lucide-link" class="size-4" />
					View linked invoice
				</NuxtLink>
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
							Quote to
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
							<UFormField label="Valid until">
								<DateField v-model="formValidUntil" :disabled="!editable" />
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
					<p class="text-xs text-(--ui-text-muted) mt-1">
						<span v-if="pricingMode === 'bundle'">Scope rows on the left + a single grand total below.</span>
						<span v-else>Each row carries its own quantity, price, and VAT.</span>
					</p>
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
						Totals
					</div>
				</template>

				<div v-if="pricingMode === 'bundle'" class="space-y-3">
					<UFormField label="Quote subtotal" hint="Total price for this quote, exclusive of VAT.">
						<UInput
							:model-value="bundleSubtotalDisplay"
							placeholder="0.00"
							:disabled="!editable"
							@update:model-value="onBundleSubtotalInput"
						>
							<template #trailing>
								<span class="text-xs text-(--ui-text-muted) pr-1">LKR</span>
							</template>
						</UInput>
					</UFormField>

					<UFormField label="VAT rate (%)" hint="Set to 0 for a tax-free quote.">
						<UInput
							v-model="vatRatePct"
							type="number"
							:step="0.01"
							:min="0"
							:max="100"
							:disabled="!editable"
							class="md:w-32"
						/>
					</UFormField>
				</div>

				<div class="border-t border-(--ui-border) pt-4 mt-4 flex justify-end">
					<div class="text-sm tabular-nums text-right">
						<div class="text-(--ui-text-muted)">
							Subtotal: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.subtotal) }}</span>
						</div>
						<div v-if="computedTotals.tax !== 0" class="text-(--ui-text-muted)">
							VAT: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.tax) }}</span>
						</div>
						<div class="font-semibold text-base mt-1">
							Total: {{ formatLKR(computedTotals.total) }}
						</div>
					</div>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Notes &amp; sign-off
					</div>
				</template>
				<div class="grid grid-cols-1 gap-4">
					<UFormField label="Notes" hint="Free text shown below the items table on the PDF.">
						<UTextarea v-model="formNotes" :rows="6" :disabled="!editable" />
					</UFormField>
					<UFormField label="Terms" hint="Optional — if you keep terms separate from notes.">
						<UTextarea v-model="formTerms" :rows="3" :disabled="!editable" />
					</UFormField>
					<UFormField label="Prepared by" hint="Signature line at the bottom of the PDF.">
						<UInput v-model="formPreparedBy" placeholder="e.g. Your name" :disabled="!editable" />
					</UFormField>
				</div>
			</UCard>
		</div>

		<UModal v-model:open="showConvertDialog" title="Convert to invoice?">
			<template #body>
				<div class="text-sm text-(--ui-text-muted) space-y-2">
					<p>
						A new draft invoice will be created with the same client, line
						items, totals, and project title from this quote. The quote will
						be marked as <span class="font-medium text-(--ui-text)">converted</span>
						and locked.
					</p>
					<p>
						The new invoice will get its own number (next in the INV
						sequence) and a fresh due date based on your default payment
						terms.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showConvertDialog = false">
						Cancel
					</UButton>
					<UButton :loading="converting" icon="i-lucide-receipt" @click="confirmConvert">
						Create invoice
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${quote.number}?`">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						This permanently removes the quote and its line items. The
						number {{ quote.number }} will not be reused — it'll show as a
						gap in your sequence.
					</p>
					<div v-if="!isDraft" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							This quote has been issued ({{ status }}).
						</p>
						<p class="text-(--ui-text-muted)">
							Deleting issued documents breaks the rule that issued
							records are immutable. Only do this if it's a real
							mistake you need to scrub from your books.
							<span v-if="quote.converted_invoice_id">
								The linked invoice will be unlinked but kept.
							</span>
						</p>
						<UFormField :label="`Type ${quote.number} to confirm`">
							<UInput v-model="deleteConfirmInput" :placeholder="quote.number" autofocus />
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

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Quote PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Quote editor.
//
// Layout intent: mirrors the user's reference PDF — the form has the same
// blocks (Client, Project title, Items, Totals, Notes, Bank, Sign-off). The
// PDF in Phase 6 will render this same data using that exact layout.
//
// Edit-locking: only drafts are freely editable. Once sent, only `notes`
// stay editable; everything else is frozen to keep the issued document
// consistent with what the client received. This intentionally enforces
// the "issued documents are immutable" property.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { BankSnapshot, ClientSnapshot, PricingMode, QuoteLineRow, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { computeLineTotals, formatLKR, formatQty, formatRate, sumCents, toCents } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { canTransition, useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Quote" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const settingsStore = useSettingsStore();
	const clientsStore = useClientsStore();
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();

	const quoteId = Number(route.params.id);
	if (!Number.isFinite(quoteId)) {
		throw createError({ statusCode: 404, statusMessage: "Quote not found" });
	}

	const quote = ref<QuoteRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	// Bundle-mode subtotal entered directly (in cents).
	const bundleSubtotalCents = ref<number>(0);
	const bundleSubtotalDisplay = ref<string>("");
	// VAT rate as percent for the UI (e.g. 18 → 18% → 1800 bp).
	const vatRatePct = ref<number>(0);
	// Field-level state that mirrors quote columns.
	const formIssueDate = ref("");
	const formValidUntil = ref("");
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formTerms = ref("");
	const formPreparedBy = ref("");

	const pricingMode = computed<PricingMode>(() => quote.value?.pricing_mode ?? "bundle");
	const status = computed<QuoteStatus>(() => quote.value?.status ?? "draft");
	const isDraft = computed(() => status.value === "draft");
	const editable = computed(() => isDraft.value);

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!quote.value?.client_snapshot) return null;
		try {
			return JSON.parse(quote.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	await Promise.all([settingsStore.ensureLoaded(), clientsStore.load()]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await quotesStore.get(quoteId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Quote not found" });
		}
		quote.value = row;
		formIssueDate.value = row.issue_date;
		formValidUntil.value = row.valid_until;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTerms.value = row.terms ?? "";
		formPreparedBy.value = row.prepared_by ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;
		bundleSubtotalDisplay.value = centsToRupees(row.subtotal_cents);

		const lineRows: QuoteLineRow[] = await quotesStore.getLines(quoteId);
		lines.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			quantity_milli: l.quantity_milli,
			unit: l.unit,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.tax_rate_basis_points
		}));
		dirty.value = false;
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Mark dirty when any directly v-model'd form field changes. Registered
	// after the initial hydrate; hydrating-flag guards re-hydrate paths.
	watch(
		[formProjectTitle, formIssueDate, formValidUntil, formNotes, formTerms, formPreparedBy, vatRatePct],
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
		} catch { /* ignore in-flight invalid */ }
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
		// Bundle: tax = subtotal * vat_rate
		const sub = bundleSubtotalCents.value;
		const taxCents = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax: taxCents, total: sub + taxCents };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!quote.value || quote.value.pricing_mode === mode || !editable.value) return;
		quote.value = { ...quote.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	// Re-snapshot the client. If the linked client has been updated since this
	// draft was made, the user can refresh the snapshot here. (Not allowed once
	// sent, since the snapshot is meant to be immutable.)
	const refreshClientSnapshot = async () => {
		if (!quote.value || !editable.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === quote.value!.client_id);
		if (!c) return;
		const snap = quotesStore.buildClientSnapshot(c);
		quote.value = { ...quote.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!quote.value || !editable.value) return;
		saving.value = true;
		try {
			// Re-write all line rows. In bundle mode we still persist whatever
			// rows the user entered for scope (with qty/price 0) so the PDF can
			// render them.
			const totalsFromLines = await quotesStore.replaceLines(quoteId, lines.value);

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

			await quotesStore.update(quoteId, {
				pricing_mode: quote.value.pricing_mode,
				project_title: formProjectTitle.value,
				issue_date: formIssueDate.value,
				valid_until: formValidUntil.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				notes: formNotes.value || null,
				terms: formTerms.value || null,
				prepared_by: formPreparedBy.value || null,
				client_snapshot: quote.value.client_snapshot
			});
			await quotesStore.load();
			await hydrate();
			toast.add({ title: "Quote saved", color: "success", icon: "i-lucide-check" });
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

	const transition = async (target: QuoteStatus) => {
		if (!quote.value) return;
		if (!canTransition(quote.value.status, target)) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			await quotesStore.setStatus(quoteId, target);
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

	// Build the JSON payload the unified `document.typ` template consumes.
	// Anything the PDF needs goes through here — once we hand off to the
	// typst sidecar there's no callback for "look up X". We pre-format
	// money / quantities / rates in JS so the template stays simple.
	const buildPdfPayload = (lineRows: QuoteLineRow[]) => {
		const q = quote.value!;
		const c = clientSnapshot.value;
		const cityLine = [c?.city, c?.postal_code].filter(Boolean).join(" ").trim();
		const addressLines = [c?.address_line1, c?.address_line2, cityLine || null, c?.country]
			.filter((s): s is string => Boolean(s && s.trim()));
		const hasVat = (q.tax_cents ?? 0) !== 0;
		let bank: BankSnapshot | null = null;
		try {
			if (q.bank_details_snapshot) bank = JSON.parse(q.bank_details_snapshot) as BankSnapshot;
		} catch { /* ignore */ }

		const fmt = (cents: number) => formatLKR(cents);
		const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

		return {
			kind: "quote",
			number: q.number,
			title: "QUOTATION",
			theme_color: themeHex(settingsStore.settings?.theme_color),
			font_family: settingsStore.settings?.pdf_font ?? "Google Sans Flex",
			// Meta block labels (drives the right-hand grid in document.typ)
			primary_label: "Quote",
			date_label: "Date",
			date_value: q.issue_date,
			secondary_label: "Valid till",
			secondary_value: q.valid_until,
			vendor_invoice_label: null,
			vendor_invoice_value: null,
			// Party block (left in meta block)
			party_label: "Quote to",
			party: c
				? {
					name: c.name,
					tax_id: c.tax_id ?? null,
					address_lines: addressLines
				}
				: { name: "(no client)", tax_id: null, address_lines: [] },
			// Headline + body
			project_title: q.project_title || "",
			pricing_mode: q.pricing_mode,
			has_vat: hasVat,
			notes: q.notes ?? "",
			notes_paragraphs: (q.notes ?? "").split(/\n\s*\n/).filter((p) => p.trim().length > 0),
			prepared_by: q.prepared_by ?? "",
			// Quotes don't have payments — keep paid_cents null so the
			// template suppresses the paid/balance row.
			paid_cents: null,
			paid_display: null,
			balance_display: null,
			// Settings
			business_name: settingsStore.settings?.business_name ?? null,
			website: settingsStore.settings?.website ?? null,
			phone: settingsStore.settings?.phone ?? null,
			address_line1: settingsStore.settings?.address_line1 ?? null,
			city: settingsStore.settings?.city ?? null,
			logo_path: settingsStore.settings?.logo_path ?? null,
			bank,
			// Line items, both raw & pre-formatted for the template
			lines: lineRows.map((l) => ({
				item_label: l.item_label,
				description: l.description,
				qty_display: formatQty(l.quantity_milli) + (l.unit ? ` ${l.unit}` : ""),
				unit_price_display: fmtNoSym(l.unit_price_cents),
				vat_display: formatRate(l.tax_rate_basis_points),
				total_display: fmtNoSym(l.line_total_cents)
			})),
			formatted: {
				subtotal: fmt(q.subtotal_cents),
				subtotal_no_symbol: fmtNoSym(q.subtotal_cents),
				tax: fmt(q.tax_cents),
				tax_no_symbol: fmtNoSym(q.tax_cents),
				total: fmt(q.total_cents),
				total_no_symbol: fmtNoSym(q.total_cents)
			}
		};
	};

	// Cache of line rows fetched at preview time. We can't make
	// buildPayload async (the composable expects sync), so we pre-fetch
	// the lines whenever they change and reuse the cached value.
	const linesForPreview = ref<QuoteLineRow[]>([]);
	watch([() => quoteId, () => quote.value?.updated_at], async () => {
		try {
			linesForPreview.value = await quotesStore.getLines(quoteId);
		} catch { /* ignore — surfaced if user clicks PDF */ }
	}, { immediate: true });

	// Preview-then-save flow. Renders to a temp file under app local data,
	// shows it in PdfPreviewModal, and copies to the user's chosen path on
	// "Save as…". The composable owns all the state + toast handling.
	const pdf = usePdfPreview({
		command: "export_quote_pdf",
		buildPayload: () => buildPdfPayload(linesForPreview.value),
		fileName: () => `${quote.value?.number ?? "quote"}.pdf`,
		title: "Quote PDF preview"
	});

	const onPdfClick = () => {
		if (!quote.value || dirty.value) return;
		pdf.open();
	};

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};

	// For drafts, no typed confirmation needed. For issued quotes, require
	// the user to type the document number — this is a deliberately
	// destructive escape hatch.
	const canConfirmDelete = computed(() => {
		if (!quote.value) return false;
		if (isDraft.value) return true;
		return deleteConfirmInput.value.trim() === quote.value.number;
	});

	const confirmDelete = async () => {
		if (!quote.value || !canConfirmDelete.value) return;
		showDeleteDialog.value = false;
		try {
			await quotesStore.remove(quoteId);
			toast.add({
				title: isDraft.value ? "Draft deleted" : "Quote deleted",
				color: "info",
				icon: "i-lucide-trash-2"
			});
			await router.replace("/quotes");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Convert-to-invoice. Quote must be in 'accepted' status (per the
	// transition graph) and not already converted.
	const canConvert = computed(() =>
		status.value === "accepted" && !quote.value?.converted_invoice_id
	);
	const showConvertDialog = ref(false);
	const converting = ref(false);
	const askConvert = () => {
		showConvertDialog.value = true;
	};
	const confirmConvert = async () => {
		if (!quote.value || !canConvert.value) return;
		converting.value = true;
		try {
			const lineRows = await quotesStore.getLines(quoteId);
			const newInvoiceId = await invoicesStore.createFromQuote(quote.value, lineRows);
			await quotesStore.markConverted(quoteId, newInvoiceId);
			showConvertDialog.value = false;
			toast.add({
				title: "Invoice created from quote",
				color: "success",
				icon: "i-lucide-check"
			});
			await router.push(`/invoices/${newInvoiceId}`);
		} catch (err) {
			toast.add({
				title: "Convert failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			converting.value = false;
		}
	};

	const transitionItems = computed(() => {
		const cur = status.value;
		const items: { label: string, icon: string, onSelect: () => void }[] = [];
		if (canTransition(cur, "sent")) items.push({ label: "Mark as Sent", icon: "i-lucide-send", onSelect: () => transition("sent") });
		if (canTransition(cur, "accepted")) items.push({ label: "Mark as Accepted", icon: "i-lucide-thumbs-up", onSelect: () => transition("accepted") });
		if (canTransition(cur, "rejected")) items.push({ label: "Mark as Rejected", icon: "i-lucide-thumbs-down", onSelect: () => transition("rejected") });
		if (canTransition(cur, "expired")) items.push({ label: "Mark as Expired", icon: "i-lucide-calendar-x", onSelect: () => transition("expired") });
		return items.length > 0 ? [items] : [];
	});
</script>
