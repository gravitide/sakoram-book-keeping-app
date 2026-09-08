<template>
	<div class="select-none">
		<!-- select-none on the page root: chrome / labels aren't
			selectable; form inputs stay selectable via the rule in
			main.css that puts user-select:text back on input / textarea
			/ [contenteditable] inside select-none containers. -->
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Pinned above the hero so the buttons can't collide
			with the name / chip strip below as the viewport narrows.
			flex-wrap on the row lets the cluster spill onto a second
			toolbar row at very narrow widths instead of crashing into
			the title; the cluster itself stays inline (no dropdown
			collapse — the set of actions is small enough to fit). -->
		<div class="mb-4 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
			<NuxtLink to="/clients" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to clients
			</NuxtLink>

			<!-- Hidden for new clients since there's nothing to act on.
				View quotes / invoices / statement moved into the shortcut
				cards below the hero — only record-level actions stay up
				here. Delete is blocked by the DB once any quote / invoice
				references the client — the handler catches the FK error
				and surfaces a friendly nudge toward Archive. -->
			<div v-if="!isNew" class="flex items-center gap-2 flex-wrap shrink-0">
				<UButton
					size="sm"
					:icon="isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
					variant="soft"
					color="neutral"
					@click="toggleArchive"
				>
					{{ isArchived ? "Restore client" : "Archive client" }}
				</UButton>
				<!-- Visual separator before the destructive action so a stray
					click on Archive doesn't land on Delete. -->
				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />
				<UButton
					size="sm"
					icon="i-lucide-trash-2"
					variant="soft"
					color="error"
					@click="confirmDelete = true"
				>
					Delete
				</UButton>
			</div>
		</div>

		<!-- Identity hero. Avatar + name + chips only — actions moved
			to the top row above so they can't crash into this content
			as the viewport narrows. -->
		<section class="mb-10">
			<div class="flex items-start gap-5 flex-wrap">
				<!-- Avatar — circular, primary-tinted background with the
					business's initials. Falls back to a generic icon
					when initials aren't available. -->
				<div class="size-20 shrink-0 rounded-full bg-(--ui-primary)/15 flex items-center justify-center overflow-hidden">
					<span
						v-if="initials"
						class="font-semibold text-2xl tracking-tight text-(--ui-primary)"
					>
						{{ initials }}
					</span>
					<UIcon v-else name="i-lucide-user-round" class="size-8 text-(--ui-text-muted)" />
				</div>

				<!-- Identity summary -->
				<div class="flex-1 min-w-0">
					<h1 class="text-3xl font-semibold leading-tight truncate flex items-center gap-3">
						{{ isNew ? "New client" : (form.name || "Untitled client") }}
						<UBadge v-if="!isNew && isArchived" color="neutral" variant="subtle">
							Archived
						</UBadge>
					</h1>
					<dl class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-(--ui-text-muted)">
						<div v-if="form.contact_person" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-user" class="size-3.5" />
							<span>{{ form.contact_person }}</span>
						</div>
						<div v-if="form.email" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-mail" class="size-3.5" />
							<span>{{ form.email }}</span>
						</div>
						<div v-if="form.phone" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-phone" class="size-3.5" />
							<span class="tabular-nums">{{ form.phone }}</span>
						</div>
						<div v-if="form.tax_id" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-receipt" class="size-3.5" />
							<span>Tax ID {{ form.tax_id }}</span>
						</div>
						<div v-if="!form.contact_person && !form.email && !form.phone && !form.tax_id">
							{{ isNew
								? "Fill in the details below — name is the only required field."
								: "No contact details captured yet — add some below." }}
						</div>
					</dl>
				</div>
			</div>
		</section>

		<!-- Activity shortcut cards — live per-client numbers with one-click
			jumps to the pre-filtered lists, plus the statement PDF.
			Replaces the old header-row View quotes / View invoices /
			Statement buttons; numbers come from SQL aggregates in
			loadStats(), refreshed on keep-alive re-entry. -->
		<!-- Each card owns a semantic colour so the row reads as three
			distinct destinations, not one grey strip: quotes = info blue,
			invoices = primary green, outstanding = warning amber. Tints
			ride the --ui-* theme tokens so light / dark and the user's
			accent swatch all keep working. -->
		<section v-if="!isNew" class="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
			<button
				type="button"
				class="group text-left rounded-lg border border-(--ui-info)/40 bg-(--ui-info)/10 hover:border-(--ui-info)/80 hover:bg-(--ui-info)/15 transition p-4 flex items-start gap-3 cursor-pointer shadow-md shadow-black/10"
				@click="viewQuotes"
			>
				<span class="size-10 shrink-0 rounded-md bg-(--ui-info)/20 flex items-center justify-center">
					<UIcon name="i-lucide-file-text" class="size-5 text-(--ui-info)" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-xs font-medium uppercase tracking-wider text-(--ui-info)">Quotes</span>
					<span class="block text-2xl font-semibold tabular-nums leading-tight">{{ stats.loaded ? stats.quotesTotal : "—" }}</span>
					<span class="block text-xs text-(--ui-text-muted) mt-0.5">
						{{ !stats.loaded ? "Loading…"
							: stats.quotesTotal === 0 ? "None yet — view all"
								: stats.quotesOpen > 0 ? `${stats.quotesOpen} open · view all` : "View all" }}
					</span>
				</span>
				<UIcon name="i-lucide-arrow-right" class="size-4 mt-1 text-(--ui-info)/50 group-hover:text-(--ui-info) group-hover:translate-x-0.5 transition" />
			</button>

			<button
				type="button"
				class="group text-left rounded-lg border border-(--ui-primary)/40 bg-(--ui-primary)/10 hover:border-(--ui-primary)/80 hover:bg-(--ui-primary)/15 transition p-4 flex items-start gap-3 cursor-pointer shadow-md shadow-black/10"
				@click="viewInvoices"
			>
				<span class="size-10 shrink-0 rounded-md bg-(--ui-primary)/20 flex items-center justify-center">
					<UIcon name="i-lucide-receipt" class="size-5 text-(--ui-primary)" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-xs font-medium uppercase tracking-wider text-(--ui-primary)">Invoices</span>
					<span class="block text-2xl font-semibold tabular-nums leading-tight">{{ stats.loaded ? stats.invoicesTotal : "—" }}</span>
					<span class="block text-xs text-(--ui-text-muted) mt-0.5">
						{{ !stats.loaded ? "Loading…"
							: stats.invoicesTotal === 0 ? "None yet — view all"
								: stats.invoicesOpen > 0 ? `${stats.invoicesOpen} awaiting payment · view all` : "All settled · view all" }}
					</span>
				</span>
				<UIcon name="i-lucide-arrow-right" class="size-4 mt-1 text-(--ui-primary)/50 group-hover:text-(--ui-primary) group-hover:translate-x-0.5 transition" />
			</button>

			<!-- Statement card carries the money headline: what this client
				still owes, and the one action that chases it. Two equally
				visible states: warning amber with money owed (click =
				generate statement), success green when settled (the "all
				clear" is information, not a disabled leftover). -->
			<button
				type="button"
				class="group text-left rounded-lg border transition p-4 flex items-start gap-3 shadow-md shadow-black/10"
				:class="stats.invoicesOpen > 0
					? 'border-(--ui-warning)/50 bg-(--ui-warning)/10 hover:border-(--ui-warning) hover:bg-(--ui-warning)/15 cursor-pointer'
					: 'border-(--ui-success)/40 bg-(--ui-success)/10 cursor-default'"
				:disabled="stats.invoicesOpen === 0 || statementPdf.state.rendering"
				@click="openStatement"
			>
				<span
					class="size-10 shrink-0 rounded-md flex items-center justify-center"
					:class="stats.invoicesOpen > 0 ? 'bg-(--ui-warning)/20' : 'bg-(--ui-success)/20'"
				>
					<UIcon
						:name="statementPdf.state.rendering ? 'i-lucide-loader-circle'
							: stats.invoicesOpen > 0 ? 'i-lucide-file-clock' : 'i-lucide-circle-check'"
						class="size-5"
						:class="[statementPdf.state.rendering && 'animate-spin', stats.invoicesOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)']"
					/>
				</span>
				<span class="min-w-0 flex-1">
					<span
						class="block text-xs font-medium uppercase tracking-wider"
						:class="stats.invoicesOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)'"
					>Outstanding</span>
					<span
						class="block text-2xl font-semibold tabular-nums leading-tight truncate"
						:class="stats.invoicesOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)'"
					>
						{{ stats.loaded ? formatLKR(stats.outstandingCents) : "—" }}
					</span>
					<span class="block text-xs text-(--ui-text-muted) mt-0.5">
						{{ !stats.loaded ? "Loading…"
							: stats.invoicesOpen === 0 ? "All settled — nothing to chase"
								: `Across ${stats.invoicesOpen} invoice${stats.invoicesOpen === 1 ? "" : "s"} · generate statement` }}
					</span>
				</span>
				<UIcon
					v-if="stats.invoicesOpen > 0"
					name="i-lucide-arrow-right"
					class="size-4 mt-1 text-(--ui-warning)/50 group-hover:text-(--ui-warning) group-hover:translate-x-0.5 transition"
				/>
			</button>
		</section>

		<!-- Form -------------------------------------------------------------- -->
		<UForm :schema="schema" :state="form" @submit="onSubmit">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<SectionCard
					icon="i-lucide-id-card"
					title="Identity"
					subtitle="Who they are and how to reach them."
				>
					<UFormField label="Name" name="name" required>
						<UInput v-model="form.name" placeholder="Acme (Pvt) Ltd" />
					</UFormField>
					<UFormField label="Contact person" name="contact_person">
						<UInput
							v-model="form.contact_person"
							leading-icon="i-lucide-user"
							placeholder="Person to address"
						/>
					</UFormField>
					<UFormField label="Email" name="email">
						<UInput
							v-model="form.email"
							type="email"
							leading-icon="i-lucide-mail"
							placeholder="hello@acme.lk"
						/>
					</UFormField>
					<UFormField label="Phone" name="phone">
						<UInput
							v-model="form.phone"
							leading-icon="i-lucide-phone"
							placeholder="+94 ..."
						/>
					</UFormField>
					<UFormField label="Tax / VAT ID" name="tax_id">
						<UInput v-model="form.tax_id" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-map-pin"
					title="Address"
					subtitle="Printed on every issued document for this client."
				>
					<UFormField label="Address line 1" name="address_line1">
						<UInput v-model="form.address_line1" />
					</UFormField>
					<UFormField label="Address line 2" name="address_line2">
						<UInput v-model="form.address_line2" />
					</UFormField>
					<div class="grid grid-cols-3 gap-3">
						<UFormField label="City" name="city" class="col-span-2">
							<UInput v-model="form.city" />
						</UFormField>
						<UFormField label="Postal" name="postal_code">
							<UInput v-model="form.postal_code" />
						</UFormField>
					</div>
					<UFormField label="Country" name="country">
						<UInput v-model="form.country" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-sticky-note"
					title="Internal notes"
					subtitle="Visible only to you — never appears on a client-facing PDF."
					class="lg:col-span-2"
				>
					<RichTextEditor v-model="form.notes" tables />
				</SectionCard>
			</div>

			<!-- Sticky save bar — same pattern as Settings → Company. Pinned
				to the bottom of the scrollable <main> ancestor; appears only
				when the form is dirty. On a brand-new client the form
				starts dirty after the first keystroke, so the bar surfaces
				naturally. -->
			<div
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">{{ isNew ? "Ready to save" : "Unsaved changes" }}</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="saving"
							@click="onDiscard"
						>
							{{ isNew ? "Cancel" : "Discard" }}
						</UButton>
						<UButton
							:loading="saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							{{ isNew ? "Create client" : "Save changes" }}
						</UButton>
					</div>
				</div>
			</div>
		</UForm>

		<!-- Delete confirmation. The DB protects clients with linked
			quotes / invoices via the FK constraint, so the destructive
			path is only available before any document is issued — see
			the handler for the FK error fallback. -->
		<UModal v-model:open="confirmDelete" title="Delete this client?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p>
						This permanently removes <span class="font-medium">{{ form.name || "this client" }}</span> from the address book.
					</p>
					<p class="text-(--ui-text-muted)">
						If a quote or invoice has ever been issued for this
						client, the database will refuse the delete —
						archive instead. Archived clients are hidden from
						pickers but their document history stays intact.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton color="error" :loading="deleting" icon="i-lucide-trash-2" @click="onDelete">
						Delete client
					</UButton>
				</div>
			</template>
		</UModal>

		<!-- Statement PDF preview. Same chromeless preview + Save-as
			flow every detail page uses; the only twist is no Save dialog
			to clutter the page state — usePdfPreview owns it. -->
		<PdfPreviewModal
			v-model:open="statementPdf.state.open"
			:asset-url="statementPdf.state.assetUrl"
			:temp-path="statementPdf.state.tempPath"
			:suggested-file-name="statementPdf.state.suggestedFileName"
			:saving="statementPdf.state.saving"
			title="Customer statement"
			@save="statementPdf.onSave"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { ClientInput } from "~/stores/clients";
	import { z } from "zod";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { selectOne } from "~/lib/db";
	import { invoiceDerivedFrom } from "~/lib/derived-status";
	import { formatLKR } from "~/lib/money";
	import { buildCustomerStatementPdfPayload, customerStatementFileName } from "~/lib/statement-pdf";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useClientsStore } from "~/stores/clients";
	import { useCreditNotesStore } from "~/stores/credit_notes";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Client" });

	const route = useRoute();
	const router = useRouter();
	const store = useClientsStore();
	// Used by the viewQuotes / viewInvoices handlers — set the
	// destination list's clientFilter before navigating so the user
	// lands pre-filtered. Mirrors the row actions on the clients list.
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();
	const creditNotesStore = useCreditNotesStore();
	// Customer-statement PDF generation reads from settings + banks +
	// invoices + the active currency formatter. Loaded on demand by the
	// `openStatement` handler so the page itself doesn't pay the cost
	// when nobody clicks the button.
	const settingsStore = useSettingsStore();
	const banksStore = useBusinessBanksStore();
	const currency = useActiveCurrency();
	const toast = useToast();

	const idParam = String(route.params.id ?? "");
	const isNew = idParam === "new";
	const clientId = isNew ? null : Number(idParam);
	if (!isNew && (!Number.isFinite(clientId) || clientId === null)) {
		throw createError({ statusCode: 404, statusMessage: "Client not found" });
	}

	const form = reactive<ClientInput>({
		name: "",
		contact_person: "",
		email: "",
		phone: "",
		address_line1: "",
		address_line2: "",
		city: "",
		postal_code: "",
		country: "Sri Lanka",
		tax_id: "",
		notes: ""
	});

	const isArchived = ref(false);
	const confirmDelete = ref(false);
	const deleting = ref(false);
	const saving = ref(false);

	// Derive a 1–2-character avatar label from the name. Falls back to a
	// generic user icon if the field is empty (e.g. on the New client page
	// before the user types anything).
	const initials = computed(() => {
		const raw = form.name?.trim() ?? "";
		if (!raw) return "";
		const parts = raw.split(/\s+/).filter(Boolean);
		const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
		return letters || raw[0]?.toUpperCase() || "";
	});

	const hydrate = (row: { name: string, contact_person: string | null, email: string | null, phone: string | null, address_line1: string | null, address_line2: string | null, city: string | null, postal_code: string | null, country: string | null, tax_id: string | null, notes: string | null, is_archived: number }) => {
		form.name = row.name;
		form.contact_person = row.contact_person ?? "";
		form.email = row.email ?? "";
		form.phone = row.phone ?? "";
		form.address_line1 = row.address_line1 ?? "";
		form.address_line2 = row.address_line2 ?? "";
		form.city = row.city ?? "";
		form.postal_code = row.postal_code ?? "";
		form.country = row.country ?? "Sri Lanka";
		form.tax_id = row.tax_id ?? "";
		form.notes = row.notes ?? "";
		isArchived.value = row.is_archived === 1;
	};

	if (!isNew && clientId !== null) {
		const row = await store.get(clientId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Client not found" });
		}
		hydrate(row);
	}

	// Local YYYY-MM-DD "today" (not UTC — toISOString would drift a day near
	// midnight for +ve timezones).
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Live per-client numbers for the shortcut cards between the hero and
	// the form. SQL aggregates, not store sums — the quotes/invoices
	// stores may not be loaded when the user lands here directly, and the
	// derived-status subquery gives the same paid/balance math the list
	// pages use. Reloaded on keep-alive re-entry so recording a payment
	// elsewhere and coming back shows fresh numbers.
	const stats = reactive({
		loaded: false,
		quotesTotal: 0,
		quotesOpen: 0,
		invoicesTotal: 0,
		invoicesOpen: 0,
		outstandingCents: 0
	});
	const loadStats = async () => {
		if (clientId === null) return;
		const q = await selectOne<{ total: number, open: number }>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN status IN ('draft', 'sent', 'accepted') THEN 1 ELSE 0 END), 0) AS open
			 FROM quotes WHERE client_id = ?`,
			[clientId]
		);
		const inv = await selectOne<{ total: number, open: number, outstanding: number }>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN _status IN ('sent', 'partial', 'overdue') THEN 1 ELSE 0 END), 0) AS open,
				COALESCE(SUM(CASE WHEN _status IN ('sent', 'partial', 'overdue') THEN _balance ELSE 0 END), 0) AS outstanding
			 FROM ${invoiceDerivedFrom(todayISO())} WHERE client_id = ?`,
			[clientId]
		);
		stats.quotesTotal = q?.total ?? 0;
		stats.quotesOpen = q?.open ?? 0;
		stats.invoicesTotal = inv?.total ?? 0;
		stats.invoicesOpen = inv?.open ?? 0;
		stats.outstandingCents = inv?.outstanding ?? 0;
		stats.loaded = true;
	};
	if (!isNew) void loadStats();
	// Keep-alive: setup runs once, so refresh the aggregates every time
	// the user navigates back to this cached page.
	onActivated(() => {
		if (!isNew) void loadStats();
	});

	// Dirty tracking via JSON snapshot. Re-baselined after save / discard.
	// On the new-client path the baseline is the empty form, so any
	// keystroke flips dirty true and surfaces the sticky save bar.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const schema = z.object({
		name: z.string().trim().min(1, "Name is required"),
		email: z.union([z.literal(""), z.string().email("Invalid email")])
	});

	type Schema = z.output<typeof schema>;

	const onSubmit = async (_event: { data: Schema }) => {
		saving.value = true;
		try {
			if (isNew) {
				const id = await store.create({ ...form });
				toast.add({ title: "Client created", color: "success", icon: "i-lucide-check" });
				await router.replace(`/clients/${id}`);
			} else if (clientId !== null) {
				await store.update(clientId, { ...form });
				refreshBaseline();
				toast.add({ title: "Client updated", color: "success", icon: "i-lucide-check" });
			}
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

	const onDiscard = async () => {
		if (isNew) {
			await router.push("/clients");
			return;
		}
		if (clientId !== null) {
			const row = await store.get(clientId);
			if (row) {
				hydrate(row);
				refreshBaseline();
				toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
			}
		}
	};

	const toggleArchive = async () => {
		if (clientId === null) return;
		try {
			await store.setArchived(clientId, !isArchived.value);
			isArchived.value = !isArchived.value;
			toast.add({
				title: isArchived.value ? "Archived" : "Restored",
				color: "info",
				icon: isArchived.value ? "i-lucide-archive" : "i-lucide-archive-restore"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Jump to the quotes / invoices list pre-filtered to this client.
	// Filters live on the destination stores (Pinia state survives
	// navigation); we clear the others and set the client before
	// routing. Mirrors the row actions on the clients list page.
	const viewQuotes = () => {
		if (clientId === null) return;
		quotesStore.search = "";
		quotesStore.clearStatusFilters();
		quotesStore.clearDateFilters();
		quotesStore.clientFilter = clientId;
		void router.push("/quotes");
	};
	const viewInvoices = () => {
		if (clientId === null) return;
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = clientId;
		void router.push("/invoices");
	};

	// Open invoices for this client — used both to gate the "Generate
	// statement" button (disabled when zero) and as the row set for the
	// PDF builder. Derived (not stored) so it auto-refreshes when an
	// invoice gets paid / cancelled in another tab on the same window.
	const openInvoicesForClient = computed(() => {
		if (clientId === null) return [];
		return invoicesStore.invoices.filter((inv) => {
			if (inv.client_id !== clientId) return false;
			const ds = invoicesStore.derivedStatus(inv);
			// Keep only the document states a statement should chase:
			// sent (not paid yet), partial (some paid), overdue (past
			// due). Draft / cancelled / fully paid don't belong on a
			// "you owe us" statement.
			return ds === "sent" || ds === "partial" || ds === "overdue";
		});
	});

	const statementPdf = usePdfPreview({
		command: "export_statement_pdf",
		title: "Customer statement",
		buildPayload: () => {
			// Build-time, not setup-time: settings + bank state may not
			// have been loaded yet when the page first mounts. The
			// openStatement handler awaits both before opening, so by
			// the time this runs the data is in memory.
			return buildCustomerStatementPdfPayload({
				settings: settingsStore.settings,
				currency: currency.value,
				client: {
					id: clientId ?? 0,
					name: form.name,
					contact_person: form.contact_person || null,
					email: form.email || null,
					phone: form.phone || null,
					address_line1: form.address_line1 || null,
					address_line2: form.address_line2 || null,
					city: form.city || null,
					postal_code: form.postal_code || null,
					country: form.country || null,
					tax_id: form.tax_id || null,
					notes: form.notes || null,
					is_archived: isArchived.value ? 1 : 0,
					created_at: "",
					updated_at: ""
				},
				openInvoices: openInvoicesForClient.value,
				paidCentsFor: (id: number) => invoicesStore.paidCentsFor(id),
				creditedCentsFor: (id: number) => invoicesStore.creditedCentsFor(id),
				unappliedCreditCents: clientId === null
					? 0
					: creditNotesStore.unappliedCreditFor(clientId),
				bank: banksStore.defaultBank ?? null
			});
		},
		fileName: () => customerStatementFileName(form.name || "client")
	});

	// Pre-load settings + invoices + banks so the payload builder sees
	// real data. The page renders without waiting on these (no spinner)
	// — they're only needed when the user actually generates a PDF.
	// The zero-check runs AFTER ensureLoaded: openInvoicesForClient sums
	// the in-memory store, which is empty until then on a fresh landing
	// (the card's own disabled state gates on the SQL stats instead).
	const openStatement = async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			invoicesStore.ensureLoaded(),
			// Statement balances net credit notes, so the store must be
			// warm before the payload is built — otherwise the PDF would
			// print pre-credit figures on a cold landing.
			creditNotesStore.ensureLoaded(),
			banksStore.ensureLoaded()
		]);
		if (openInvoicesForClient.value.length === 0) {
			toast.add({
				title: "No outstanding invoices",
				description: "This client has nothing outstanding to chase.",
				color: "info",
				icon: "i-lucide-info"
			});
			return;
		}
		await statementPdf.open();
	};

	const onDelete = async () => {
		if (clientId === null) return;
		deleting.value = true;
		try {
			await store.remove(clientId);
			toast.add({ title: "Client deleted", color: "info", icon: "i-lucide-trash-2" });
			confirmDelete.value = false;
			await router.replace("/clients");
		} catch (err) {
			// quotes / invoices FK clients(id) without an explicit
			// ON DELETE clause (defaults to NO ACTION). SQLite throws
			// when a document still references this client. Translate
			// that to a friendly nudge toward Archive instead of
			// dumping the raw SQL error.
			const raw = err instanceof Error ? err.message : String(err);
			const isFkError = /foreign key|constraint|RESTRICT/i.test(raw);
			toast.add({
				title: isFkError ? "Can't delete — has quote/invoice history" : "Delete failed",
				description: isFkError
					? "This client has at least one quote or invoice. Archive instead — those documents need to stay intact."
					: raw,
				color: isFkError ? "warning" : "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			deleting.value = false;
		}
	};
</script>
