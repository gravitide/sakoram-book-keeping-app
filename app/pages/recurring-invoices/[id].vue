<template>
	<div v-if="template" class="select-none">
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/recurring-invoices" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to recurring invoices
			</NuxtLink>

			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					size="sm"
					color="primary"
					icon="i-lucide-play"
					:disabled="!isPending || dirty"
					:title="dirty ? 'Save first' : isPending ? 'Generate the next draft invoice from this template' : 'Not yet due — next issue date is in the future'"
					@click="onGenerateNow"
				>
					Generate now
				</UButton>
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					:icon="template.is_paused === 1 ? 'i-lucide-play' : 'i-lucide-pause'"
					@click="onTogglePause"
				>
					{{ template.is_paused === 1 ? "Resume" : "Pause" }}
				</UButton>

				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />

				<UButton
					size="sm"
					color="error"
					variant="soft"
					icon="i-lucide-trash-2"
					@click="askDelete"
				>
					Delete
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
				<span>{{ template.template_name }}</span>
				<StatusBadge :status="template.is_paused === 1 ? 'paused' : 'active'" size="md" />
				<span v-if="isPending" class="app-chrome text-xs text-(--ui-warning) font-medium uppercase tracking-wider">
					ready to generate
				</span>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				{{ template.invoices_generated }} invoice{{ template.invoices_generated === 1 ? "" : "s" }} generated so far<span v-if="template.last_generated_at">, last on {{ template.last_generated_at.split(" ")[0] }}</span>.
			</p>
		</header>

		<div class="space-y-6 pb-24">
			<!-- Two cards side-by-side at lg+: Reference (template fields)
				wider on the left, party snapshot narrower on the right.
				DOM order keeps the snapshot first so single-column md
				stacks lead with "who is this for". -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<UCard class="lg:col-span-1 lg:col-start-3 lg:row-start-1">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2">
							<div class="app-chrome font-medium">
								Client
							</div>
							<UButton
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
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-receipt"
							@click="viewGeneratedInvoices"
						>
							Generated invoices
						</UButton>
					</div>
				</UCard>

				<UCard class="lg:col-span-2 lg:row-start-1">
					<template #header>
						<div class="app-chrome font-medium">
							Schedule
						</div>
					</template>
					<div class="grid grid-cols-2 gap-3 max-w-3xl">
						<UFormField label="Template name" required>
							<UInput v-model="formTemplateName" />
						</UFormField>
						<UFormField label="Frequency">
							<USelect
								v-model="formFrequency"
								:items="FREQUENCY_OPTIONS"
								value-key="value"
								class="w-full"
							/>
						</UFormField>
						<UFormField label="Start date">
							<DateField v-model="formStartDate" />
						</UFormField>
						<UFormField label="Next issue date" hint="Advances by one cycle every time you generate. Edit this to skip or backdate a cycle.">
							<DateField v-model="formNextIssueDate" />
						</UFormField>
						<UFormField label="End date" hint="Optional — leave blank for an open-ended schedule.">
							<DateField v-model="formEndDate" :min-value="formNextIssueDate || undefined" />
						</UFormField>
						<UFormField label="Payment terms (days)" hint="Net-N — added to each generated invoice's issue date to set its due date.">
							<UInputNumber v-model="formPaymentTermsDays" :min="0" :step="1" class="w-full" />
						</UFormField>
					</div>
				</UCard>
			</div>

			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Items
					</div>
				</template>
				<DocumentLineEditor
					:model-value="lineDrafts"
					mode="itemized"
					@update:model-value="onLinesChange"
				/>
			</UCard>

			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
				<UCard class="lg:col-span-2">
					<template #header>
						<div class="app-chrome font-medium">
							Defaults
						</div>
					</template>
					<div class="space-y-3">
						<UFormField label="Project title" hint="Becomes the subtitle on each generated invoice.">
							<UInput v-model="formProjectTitle" />
						</UFormField>
						<UFormField label="VAT rate (%)" hint="Seeded onto every generated invoice. Override per-invoice before issuing.">
							<UInputNumber
								v-model="vatRatePct"
								:step="0.01"
								:min="0"
								:max="100"
								class="md:w-32"
							/>
						</UFormField>
						<UFormField label="Bank account" hint="The bank printed on each generated invoice.">
							<USelect
								v-model="formBankId"
								:items="bankPickerOptions"
								value-key="value"
								class="w-full"
							/>
						</UFormField>
					</div>
				</UCard>
				<UCard class="lg:col-span-3">
					<template #header>
						<div class="app-chrome font-medium">
							Notes
						</div>
					</template>
					<UTextarea
						v-model="formNotes"
						:rows="6"
						placeholder="Carried onto each generated invoice. The user reviewing the draft can still edit per-invoice."
						class="w-full"
					/>
				</UCard>
			</div>
		</div>

		<!-- Sticky save bar. Same shape as the other detail pages. -->
		<div
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

		<UModal v-model:open="confirmDelete" :title="`Delete ${template.template_name}?`">
			<template #body>
				<p class="text-sm">
					This removes the recurring template only. Invoices already generated from it
					stay in your books — they're real documents now, independent of this template.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton color="error" :loading="deleting" icon="i-lucide-trash-2" @click="doDelete">
						Delete template
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// Recurring invoice template editor. Lets the user tune the schedule
// (frequency / start / next issue / end date), the invoice defaults
// (project title / VAT / payment terms / bank), and the line items
// that get cloned into each generated invoice.
//
// "Generate now" + Pause/Resume live in the header. Generation
// produces a draft invoice on /invoices (user reviews before issuing),
// advances `next_issue_date` by one cycle, and bumps
// `invoices_generated`.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { ClientSnapshot } from "~/stores/quotes";
	import type {
		RecurringFrequency,
		RecurringInvoiceLineRow,
		RecurringInvoiceRow
	} from "~/stores/recurring_invoices";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useRecurringInvoicesStore } from "~/stores/recurring_invoices";

	definePageMeta({ title: "Recurring invoice" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const banksStore = useBusinessBanksStore();
	const clientsStore = useClientsStore();
	const invoicesStore = useInvoicesStore();
	const store = useRecurringInvoicesStore();

	const templateId = Number(route.params.id);
	if (!Number.isFinite(templateId)) {
		throw createError({ statusCode: 404, statusMessage: "Recurring template not found" });
	}

	const template = ref<RecurringInvoiceRow | null>(null);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);
	const deleting = ref(false);
	const confirmDelete = ref(false);

	const formTemplateName = ref("");
	const formFrequency = ref<RecurringFrequency>("monthly");
	const formStartDate = ref("");
	const formNextIssueDate = ref("");
	const formEndDate = ref<string | null>(null);
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formBankId = ref<number | null>(null);
	const formPaymentTermsDays = ref(30);
	const vatRatePct = ref(0);
	const lineDrafts = ref<LineDraft[]>([]);

	const FREQUENCY_OPTIONS: { label: string, value: RecurringFrequency }[] = [
		{ label: "Weekly", value: "weekly" },
		{ label: "Monthly", value: "monthly" },
		{ label: "Quarterly", value: "quarterly" },
		{ label: "Yearly", value: "yearly" }
	];

	const bankPickerOptions = computed(() => {
		const items: { label: string, value: number | null }[] = [
			{ label: "— No bank —", value: null }
		];
		for (const b of banksStore.activeBanks) {
			const suffix = b.bank_account_number ? ` · ${b.bank_account_number}` : "";
			items.push({ label: `${b.label}${suffix}`, value: b.id });
		}
		return items;
	});

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!template.value?.client_snapshot) return null;
		try {
			return JSON.parse(template.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	const isPending = computed(() => {
		if (!template.value) return false;
		if (template.value.is_paused === 1) return false;
		const today = todayISO();
		if (template.value.next_issue_date > today) return false;
		if (template.value.end_date !== null && template.value.next_issue_date > template.value.end_date) return false;
		return true;
	});

	await Promise.all([
		banksStore.ensureLoaded(),
		clientsStore.load(),
		invoicesStore.ensureLoaded(),
		store.ensureLoaded()
	]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await store.get(templateId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Recurring template not found" });
		}
		template.value = row;
		formTemplateName.value = row.template_name;
		formFrequency.value = row.frequency;
		formStartDate.value = row.start_date;
		formNextIssueDate.value = row.next_issue_date;
		formEndDate.value = row.end_date;
		formProjectTitle.value = row.project_title ?? "";
		formNotes.value = row.notes ?? "";
		formBankId.value = row.business_bank_id;
		formPaymentTermsDays.value = row.payment_terms_days;
		vatRatePct.value = row.vat_rate_basis_points / 100;

		const lineRows: RecurringInvoiceLineRow[] = await store.getLines(templateId);
		// Map RecurringInvoiceLineRow → LineDraft shape that
		// DocumentLineEditor consumes. Template lines don't carry
		// `unit` (templates are intentionally simpler than full
		// invoice lines), so we pass null.
		lineDrafts.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description ?? "",
			quantity_milli: l.quantity_milli,
			unit: null,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.vat_rate_basis_points
		}));

		dirty.value = false;
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	watch(
		[
			formTemplateName,
			formFrequency,
			formStartDate,
			formNextIssueDate,
			formEndDate,
			formProjectTitle,
			formNotes,
			formBankId,
			formPaymentTermsDays,
			vatRatePct
		],
		() => {
			if (!hydrating.value) dirty.value = true;
		}
	);

	const onLinesChange = (next: LineDraft[]) => {
		lineDrafts.value = next;
		dirty.value = true;
	};

	const openClient = () => {
		if (!template.value) return;
		void router.push(`/clients/${template.value.client_id}`);
	};
	// Surface the invoices generated from this template — filter the
	// invoices list by the same client. Templates don't have a stable
	// link from generated invoices back to the template (the generated
	// row stands alone), so a per-client narrowing is the closest we
	// can offer without a schema change.
	const viewGeneratedInvoices = () => {
		if (!template.value) return;
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = template.value.client_id;
		void router.push("/invoices");
	};

	const refreshClientSnapshot = () => {
		if (!template.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === template.value!.client_id);
		if (!c) return;
		const snap = store.buildClientSnapshot(c);
		template.value = { ...template.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!template.value) return;
		saving.value = true;
		try {
			const bp = Math.round(vatRatePct.value * 100);
			await store.update(templateId, {
				template_name: formTemplateName.value.trim() || template.value.template_name,
				client_snapshot: template.value.client_snapshot,
				frequency: formFrequency.value,
				start_date: formStartDate.value,
				next_issue_date: formNextIssueDate.value,
				end_date: formEndDate.value,
				project_title: formProjectTitle.value || null,
				vat_rate_basis_points: bp,
				payment_terms_days: formPaymentTermsDays.value,
				notes: formNotes.value || null,
				business_bank_id: formBankId.value
			});
			// Replace lines — map LineDraft → RecurringInvoiceLineDraft
			// (no `unit`, vat_rate_basis_points instead of
			// tax_rate_basis_points). Template lines are intentionally
			// simpler than invoice lines.
			await store.replaceLines(templateId, lineDrafts.value.map((l) => ({
				item_label: l.item_label,
				description: l.description || null,
				quantity_milli: l.quantity_milli,
				unit_price_cents: l.unit_price_cents,
				vat_rate_basis_points: l.tax_rate_basis_points
			})));
			await store.load();
			await hydrate();
			toast.add({ title: "Template saved", color: "success", icon: "i-lucide-check" });
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
		if (saving.value) return;
		await hydrate();
		toast.add({ title: "Changes discarded", color: "neutral", icon: "i-lucide-rotate-ccw" });
	};

	const onTogglePause = async () => {
		if (!template.value) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			const wasPaused = template.value.is_paused === 1;
			await store.togglePause(templateId);
			await hydrate();
			toast.add({
				title: wasPaused ? "Template resumed" : "Template paused",
				color: "info",
				icon: wasPaused ? "i-lucide-play" : "i-lucide-pause"
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

	const onGenerateNow = async () => {
		if (!template.value || dirty.value || !isPending.value) return;
		try {
			const invoiceId = await store.generateOne(templateId);
			await hydrate();
			toast.add({
				title: "Draft invoice generated",
				description: "Review and mark sent on the invoices page.",
				color: "success",
				icon: "i-lucide-check"
			});
			void router.push(`/invoices/${invoiceId}`);
		} catch (err) {
			toast.add({
				title: "Could not generate",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const askDelete = () => {
		confirmDelete.value = true;
	};
	const doDelete = async () => {
		if (!template.value) return;
		deleting.value = true;
		try {
			await store.remove(templateId);
			toast.add({ title: "Template deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/recurring-invoices");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			deleting.value = false;
		}
	};

	// Items rendered into the responsive UDropdownMenu shown below md
	// (the inline cluster above is hidden at that width).
	const actionMenuItems = computed(() => {
		const primary: { label: string, icon: string, disabled?: boolean, onSelect: () => void }[] = [];
		primary.push({
			label: "Generate now",
			icon: "i-lucide-play",
			disabled: !isPending.value || dirty.value,
			onSelect: onGenerateNow
		});
		primary.push({
			label: template.value?.is_paused === 1 ? "Resume" : "Pause",
			icon: template.value?.is_paused === 1 ? "i-lucide-play" : "i-lucide-pause",
			onSelect: onTogglePause
		});
		const destructive = [{
			label: "Delete",
			icon: "i-lucide-trash-2",
			class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
			onSelect: askDelete
		}];
		return [primary, destructive];
	});
</script>
