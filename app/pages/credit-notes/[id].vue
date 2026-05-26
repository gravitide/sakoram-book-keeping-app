<template>
	<div v-if="creditNote" class="select-none">
		<!-- Top toolbar — back link + action cluster, same shape as
			invoice / quote / bill detail pages. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/credit-notes" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to credit notes
			</NuxtLink>

			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					v-for="a in transitionActions"
					:key="a.label"
					size="sm"
					color="neutral"
					variant="outline"
					:icon="a.icon"
					@click="a.onSelect"
				>
					{{ a.label }}
				</UButton>

				<div v-if="transitionActions.length > 0" class="h-6 w-px bg-(--ui-border-accented) mx-1" />

				<UButton
					size="sm"
					color="error"
					variant="soft"
					icon="i-lucide-trash-2"
					@click="askDelete"
				>
					{{ isDraft ? "Delete draft" : "Delete" }}
				</UButton>
			</div>

			<div class="md:hidden shrink-0">
				<UDropdownMenu :items="actionMenuItems">
					<UButton
						size="sm"
						color="neutral"
						variant="outline"
						icon="i-lucide-ellipsis-vertical"
						title="Actions"
						aria-label="Actions"
					/>
				</UDropdownMenu>
			</div>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3 flex-wrap">
				<span class="tabular-nums">{{ creditNote.number }}</span>
				<StatusBadge :status="creditNote.status" size="md" />
				<span v-if="!editable" class="app-chrome text-xs text-(--ui-text-muted) font-normal">
					read-only after issue
				</span>
			</h1>
			<NuxtLink
				v-if="creditNote.source_invoice_id"
				:to="`/invoices/${creditNote.source_invoice_id}`"
				class="text-xs text-(--ui-primary) hover:underline mt-1 inline-flex items-center gap-1"
			>
				<UIcon name="i-lucide-link" class="size-3" />
				Credits invoice
			</NuxtLink>
		</header>

		<div class="space-y-6 pb-24">
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<UCard class="lg:col-span-1 lg:col-start-3 lg:row-start-1">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2">
							<div class="app-chrome font-medium">
								Credit to
							</div>
							<UButton
								v-if="editable"
								size="xs"
								variant="ghost"
								color="neutral"
								icon="i-lucide-refresh-ccw"
								title="Refresh client snapshot — pull the latest details from the client record"
								aria-label="Refresh client snapshot"
								@click="refreshClientSnapshot"
							/>
						</div>
					</template>
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
					<div class="mt-4 pt-3 border-t border-(--ui-border) flex flex-wrap gap-2">
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-external-link"
							@click="openClient"
						>
							Open client
						</UButton>
					</div>
				</UCard>

				<UCard class="lg:col-span-2 lg:row-start-1">
					<template #header>
						<div class="app-chrome font-medium">
							Reference
						</div>
					</template>
					<div class="grid grid-cols-2 gap-3 max-w-3xl">
						<UFormField label="PDF header">
							<UInput
								v-model="formTitleOverride"
								:disabled="!editable"
								placeholder="CREDIT NOTE"
							/>
						</UFormField>
						<UFormField label="Project title">
							<UInput v-model="formProjectTitle" :disabled="!editable" placeholder="Subtitle on the PDF (optional)" />
						</UFormField>
						<UFormField label="Issue date">
							<DateField v-model="formIssueDate" :disabled="!editable" />
						</UFormField>
						<UFormField label="Source invoice" hint="Optional — the invoice this credit settles.">
							<USelect
								v-model="formSourceInvoiceId"
								:items="invoiceOptions"
								value-key="value"
								class="w-full"
								:disabled="!editable"
							/>
						</UFormField>
					</div>
				</UCard>
			</div>

			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-4 flex-wrap">
						<div class="app-chrome font-medium">
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

			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
				<UCard class="lg:col-span-2">
					<template #header>
						<div class="app-chrome font-medium">
							Totals
						</div>
					</template>

					<div v-if="pricingMode === 'bundle' && editable" class="space-y-3">
						<UFormField label="Subtotal" help="Total exclusive of VAT.">
							<MoneyInput v-model="bundleSubtotalCents" />
						</UFormField>
						<UFormField label="VAT rate (%)" help="Set to 0 for a tax-free credit note.">
							<UInputNumber
								v-model="vatRatePct"
								:step="0.5"
								:min="0"
								:max="100"
								class="w-full"
							/>
						</UFormField>
					</div>

					<dl class="text-sm space-y-1.5 tabular-nums">
						<div class="flex justify-between">
							<dt class="text-(--ui-text-muted)">
								Subtotal
							</dt>
							<dd>{{ formatLKR(computedTotals.subtotal) }}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-(--ui-text-muted)">
								VAT
							</dt>
							<dd>{{ formatLKR(computedTotals.tax) }}</dd>
						</div>
						<div class="flex justify-between pt-2 mt-2 border-t border-(--ui-border) font-semibold">
							<dt>Credit total</dt>
							<dd class="text-(--ui-error)">
								− {{ formatLKR(computedTotals.total) }}
							</dd>
						</div>
					</dl>
				</UCard>

				<UCard class="lg:col-span-3">
					<template #header>
						<div class="app-chrome font-medium">
							Notes
						</div>
					</template>
					<!-- Notes stay editable post-issue so the user can
						annotate historical credit notes without re-opening
						them as drafts. Matches the notes-only-after-issue
						exception used on the other detail pages. -->
					<UTextarea
						v-model="formNotes"
						:rows="4"
						placeholder="Optional internal note. Printed on the PDF if not blank."
						class="w-full"
					/>
				</UCard>
			</div>
		</div>

		<!-- Sticky save bar. Mirrors the rest of the detail pages. -->
		<div
			v-if="dirty"
			class="app-chrome fixed bottom-2 right-2 bg-(--ui-bg)/95 backdrop-blur-sm border border-(--ui-primary)/50 rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3"
		>
			<span class="text-sm text-(--ui-text-muted)">Unsaved changes</span>
			<UButton size="sm" color="neutral" variant="outline" :disabled="saving" @click="hydrate">
				Discard
			</UButton>
			<UButton size="sm" :loading="saving" icon="i-lucide-save" @click="save">
				Save changes
			</UButton>
		</div>

		<UModal v-model:open="confirmDelete" title="Delete this credit note?">
			<template #body>
				<p class="text-sm">
					<span class="font-medium">{{ creditNote.number }}</span> will be permanently removed. This cannot be undone.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton color="error" :loading="busy" icon="i-lucide-trash-2" @click="doDelete">
						Delete
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// Credit note detail page. Structurally similar to the invoice detail
// page but slimmer: no bank picker (credit notes don't request
// payment), no terms / prepared-by, no payment ledger (credit notes
// don't receive payments), no attachments yet (deferred to a
// follow-up PR alongside PDF rendering).

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { CreditNoteLineRow, CreditNoteRow, CreditNoteStatus } from "~/stores/credit_notes";
	import type { ClientSnapshot, PricingMode } from "~/stores/quotes";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useCreditNotesStore } from "~/stores/credit_notes";
	import { useInvoicesStore } from "~/stores/invoices";

	definePageMeta({ title: "Credit note" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const clientsStore = useClientsStore();
	const creditNotesStore = useCreditNotesStore();
	const invoicesStore = useInvoicesStore();

	const creditNoteId = Number(route.params.id);
	if (!Number.isFinite(creditNoteId)) {
		throw createError({ statusCode: 404, statusMessage: "Credit note not found" });
	}

	const creditNote = ref<CreditNoteRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);
	const busy = ref(false);
	const confirmDelete = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const vatRatePct = ref<number>(0);
	const formIssueDate = ref("");
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formTitleOverride = ref("");
	const formSourceInvoiceId = ref<number | null>(null);

	const pricingMode = computed<PricingMode>(() => creditNote.value?.pricing_mode ?? "bundle");
	const isDraft = computed(() => creditNote.value?.status === "draft");
	const editable = computed(() => isDraft.value);

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!creditNote.value?.client_snapshot) return null;
		try {
			return JSON.parse(creditNote.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	// Source invoice picker — all sent / partial / paid / overdue
	// invoices for this credit note's client, so the user can link a
	// freshly-created credit note to its source.
	const invoiceOptions = computed(() => {
		const cnClientId = creditNote.value?.client_id;
		const items: { label: string, value: number | null }[] = [
			{ label: "— None —", value: null }
		];
		if (!cnClientId) return items;
		const invoicesForClient = invoicesStore.invoices
			.filter((i) => i.client_id === cnClientId && i.status !== "cancelled" && i.status !== "draft")
			.sort((a, b) => b.issue_date.localeCompare(a.issue_date));
		for (const i of invoicesForClient) {
			items.push({ label: `${i.number} · ${formatLKR(i.total_cents)}`, value: i.id });
		}
		return items;
	});

	await Promise.all([
		clientsStore.load(),
		invoicesStore.ensureLoaded(),
		creditNotesStore.ensureLoaded()
	]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await creditNotesStore.get(creditNoteId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Credit note not found" });
		}
		creditNote.value = row;
		formIssueDate.value = row.issue_date;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTitleOverride.value = row.title_override ?? "";
		formSourceInvoiceId.value = row.source_invoice_id;
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;

		const lineRows: CreditNoteLineRow[] = await creditNotesStore.getLines(creditNoteId);
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

	watch(
		[formProjectTitle, formIssueDate, formNotes, formTitleOverride, formSourceInvoiceId, vatRatePct, bundleSubtotalCents],
		() => {
			if (editable.value && !hydrating.value) dirty.value = true;
		}
	);

	const computedTotals = computed(() => {
		if (pricingMode.value === "itemized") {
			const subs = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_subtotal_cents);
			const tx = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_tax_cents);
			const tot = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_total_cents);
			return { subtotal: sumCents(...subs), tax: sumCents(...tx), total: sumCents(...tot) };
		}
		const sub = bundleSubtotalCents.value;
		const taxCents = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax: taxCents, total: sub + taxCents };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!creditNote.value || creditNote.value.pricing_mode === mode || !editable.value) return;
		creditNote.value = { ...creditNote.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	const openClient = () => {
		if (!creditNote.value) return;
		void router.push(`/clients/${creditNote.value.client_id}`);
	};

	const refreshClientSnapshot = () => {
		if (!creditNote.value || !editable.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === creditNote.value!.client_id);
		if (!c) return;
		const snap = creditNotesStore.buildClientSnapshot(c);
		creditNote.value = { ...creditNote.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!creditNote.value || !editable.value) return;
		saving.value = true;
		try {
			const totalsFromLines = await creditNotesStore.replaceLines(creditNoteId, lines.value);
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

			await creditNotesStore.update(creditNoteId, {
				pricing_mode: creditNote.value.pricing_mode,
				project_title: formProjectTitle.value,
				issue_date: formIssueDate.value,
				source_invoice_id: formSourceInvoiceId.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				notes: formNotes.value || null,
				client_snapshot: creditNote.value.client_snapshot,
				title_override: formTitleOverride.value.trim() || null
			});
			await creditNotesStore.load();
			await hydrate();
			toast.add({ title: "Credit note saved", color: "success", icon: "i-lucide-check" });
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

	// Persisted status transitions. Same shape as quotes / invoices —
	// each legal next-state is exposed as an explicit button (or
	// dropdown item) rather than buried in a generic status menu.
	interface TransitionAction {
		label: string
		icon: string
		onSelect: () => void
	}

	const legalNextStates = computed<CreditNoteStatus[]>(() => {
		const s = creditNote.value?.status;
		if (s === "draft") return ["issued", "cancelled"];
		if (s === "issued") return ["draft", "cancelled"];
		if (s === "cancelled") return ["draft"];
		return [];
	});

	const transitionLabel: Record<CreditNoteStatus, string> = {
		draft: "Back to draft",
		issued: "Mark issued",
		cancelled: "Cancel"
	};
	const transitionIcon: Record<CreditNoteStatus, string> = {
		draft: "i-lucide-rotate-ccw",
		issued: "i-lucide-send",
		cancelled: "i-lucide-circle-x"
	};

	const transitionActions = computed<TransitionAction[]>(() =>
		legalNextStates.value.map((target) => ({
			label: transitionLabel[target],
			icon: transitionIcon[target],
			onSelect: async () => {
				if (!creditNote.value) return;
				try {
					await creditNotesStore.setStatus(creditNote.value.id, target);
					await hydrate();
					toast.add({ title: `Status: ${target}`, color: "success", icon: "i-lucide-check" });
				} catch (err) {
					toast.add({
						title: "Could not change status",
						description: err instanceof Error ? err.message : String(err),
						color: "error",
						icon: "i-lucide-circle-alert"
					});
				}
			}
		}))
	);

	const askDelete = () => {
		confirmDelete.value = true;
	};
	const doDelete = async () => {
		if (!creditNote.value) return;
		busy.value = true;
		try {
			await creditNotesStore.remove(creditNote.value.id);
			toast.add({ title: "Credit note deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/credit-notes");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			busy.value = false;
		}
	};

	// Dropdown items for the below-md responsive action menu. Groups
	// match the inline cluster: transitions, then Delete (in error tone).
	interface ActionItem {
		label: string
		icon: string
		class?: string
		onSelect: () => void
	}
	const actionMenuItems = computed(() => {
		const transitions: ActionItem[] = transitionActions.value.map((a) => ({
			label: a.label,
			icon: a.icon,
			onSelect: a.onSelect
		}));
		const destructive: ActionItem[] = [{
			label: isDraft.value ? "Delete draft" : "Delete",
			icon: "i-lucide-trash-2",
			class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
			onSelect: askDelete
		}];
		return [transitions, destructive].filter((g) => g.length > 0);
	});
</script>
