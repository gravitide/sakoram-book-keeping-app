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
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this quote as a PDF'"
					@click="onPdfClick"
				>
					PDF & Print
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
				<!-- Legal next-state transitions as individual buttons —
					replaces an opaque 'Status' dropdown so the available
					moves are visible at a glance. Hidden when no
					transitions are legal (terminal states). -->
				<UButton
					v-for="t in transitionActions"
					:key="t.label"
					color="neutral"
					variant="outline"
					:icon="t.icon"
					@click="t.onSelect"
				>
					{{ t.label }}
				</UButton>

				<!-- Visual separator before the destructive action so the
					delete button doesn't sit shoulder-to-shoulder with the
					everyday actions and get accidentally clicked. -->
				<div class="h-6 w-px bg-(--ui-border) mx-1" />

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
								<DateField v-model="formValidUntil" :min-value="formIssueDate || undefined" :disabled="!editable" />
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

			<!-- Totals + Notes share a row on large screens — same layout
				as the invoice page. Totals is a compact money summary
				(~2/5); Notes & sign-off takes the wider ~3/5. items-start
				so the shorter Totals card doesn't stretch. -->
			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
				<UCard class="lg:col-span-2">
					<template #header>
						<div class="font-medium">
							Totals
						</div>
					</template>

					<div v-if="pricingMode === 'bundle'" class="space-y-3">
						<UFormField label="Quote subtotal" help="Total price for this quote, exclusive of VAT.">
							<MoneyInput
								v-model="bundleSubtotalCents"
								:disabled="!editable"
							/>
						</UFormField>

						<UFormField label="VAT rate (%)" help="Set to 0 for a tax-free quote.">
							<UInputNumber
								v-model="vatRatePct"
								:step="0.01"
								:min="0"
								:max="100"
								:disabled="!editable"
								class="md:w-32"
							/>
						</UFormField>
					</div>

					<div class="flex justify-end" :class="{ 'border-t border-(--ui-border) pt-4 mt-4': pricingMode === 'bundle' }">
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

				<UCard class="lg:col-span-3">
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

			<!-- Attachments — scans / photos of the quote. Shared card,
				same as the invoice / bill / voucher detail pages. -->
			<AttachmentsCard document-type="quote" :document-id="quoteId" />

			<!-- Sticky save bar — same pattern as Settings → Company and the
				client / employee edit pages. Pinned to the bottom of the
				scrollable <main> ancestor; only appears when the form is
				dirty *and* the quote is still editable (sent/converted
				quotes lock the form). -->
			<div
				v-if="editable"
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border-2 border-(--ui-primary)/50 shadow-2xl px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="saving"
							@click="onDiscard"
						>
							Discard
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
			:temp-path="pdf.state.tempPath"
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
	import type { ClientSnapshot, PricingMode, QuoteLineRow, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { buildQuotePdfPayload } from "~/lib/quote-pdf";
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
	const currency = useActiveCurrency();

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
		[formProjectTitle, formIssueDate, formValidUntil, formNotes, formTerms, formPreparedBy, vatRatePct, bundleSubtotalCents],
		() => {
			if (editable.value && !hydrating.value) dirty.value = true;
		}
	);

	// Add N days to a YYYY-MM-DD string.
	function addDays(iso: string, days: number): string {
		const [y, m, d] = iso.split("-").map(Number);
		if (!y || !m || !d) return iso;
		const dt = new Date(y, m - 1, d);
		dt.setDate(dt.getDate() + days);
		return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
	}

	// When the issue date changes, re-derive valid_until from the
	// business's quote-validity setting (issue + N days) — the same rule
	// the new-quote flow uses — so the validity window tracks Settings
	// instead of stranding the old date.
	watch(formIssueDate, (next) => {
		if (!editable.value || hydrating.value || !next) return;
		const days = settingsStore.settings?.default_quote_validity_days ?? 0;
		formValidUntil.value = addDays(next, days);
	});

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

	// Sticky save bar's Discard action: re-hydrate from the DB which
	// resets the form refs and clears `dirty`.
	const onDiscard = async () => {
		if (saving.value) return;
		await hydrate();
		toast.add({ title: "Changes discarded", color: "neutral", icon: "i-lucide-rotate-ccw" });
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
	// The actual builder lives in app/lib/quote-pdf.ts so the list page
	// can call it from its row context menu without duplicating logic.
	const buildPdfPayload = (lineRows: QuoteLineRow[]) =>
		buildQuotePdfPayload({
			row: quote.value!,
			lines: lineRows,
			settings: settingsStore.settings,
			currency: currency.value
		});

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

	// Legal next-state actions for the current status. Rendered as
	// individual buttons in the header so the available transitions are
	// visible at a glance — no dropdown to click through. Short verbs
	// keep the header compact.
	interface TransitionAction {
		label: string
		icon: string
		onSelect: () => void
	}
	const transitionActions = computed<TransitionAction[]>(() => {
		const cur = status.value;
		const items: TransitionAction[] = [];
		// Reopen comes first so it's the most prominent button on a
		// rejected/expired quote — the most likely thing the user wants.
		if (canTransition(cur, "draft")) items.push({ label: "Reopen as draft", icon: "i-lucide-rotate-ccw", onSelect: () => transition("draft") });
		if (canTransition(cur, "sent")) items.push({ label: "Send", icon: "i-lucide-send", onSelect: () => transition("sent") });
		if (canTransition(cur, "accepted")) items.push({ label: "Accept", icon: "i-lucide-thumbs-up", onSelect: () => transition("accepted") });
		if (canTransition(cur, "rejected")) items.push({ label: "Reject", icon: "i-lucide-thumbs-down", onSelect: () => transition("rejected") });
		if (canTransition(cur, "expired")) items.push({ label: "Expire", icon: "i-lucide-calendar-x", onSelect: () => transition("expired") });
		return items;
	});
</script>
