<template>
	<div v-if="template" class="select-none">
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/recurring-bills" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to recurring bills
			</NuxtLink>

			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					size="sm"
					color="primary"
					icon="i-lucide-play"
					:disabled="!isPending || dirty"
					:title="dirty ? 'Save first' : isPending ? 'Generate the next bill from this template' : 'Not yet due — next issue date is in the future'"
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
				{{ template.bills_generated }} bill{{ template.bills_generated === 1 ? "" : "s" }} generated so far<span v-if="template.last_generated_at">, last on {{ template.last_generated_at.split(" ")[0] }}</span>.
			</p>
		</header>

		<div class="space-y-6 pb-24">
			<!-- Two cards side-by-side at lg+: Reference (template fields)
				wider on the left, vendor snapshot narrower on the right.
				DOM order keeps the snapshot first so single-column md
				stacks lead with "who is this from". -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<UCard class="lg:col-span-1 lg:col-start-3 lg:row-start-1">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2">
							<div class="app-chrome font-medium">
								Vendor
							</div>
							<UButton
								size="xs"
								variant="ghost"
								color="neutral"
								icon="i-lucide-refresh-ccw"
								title="Refresh vendor snapshot — pull the latest details from the vendor record"
								aria-label="Refresh vendor snapshot"
								@click="refreshVendorSnapshot"
							/>
						</div>
					</template>
					<div class="text-sm">
						<div class="font-medium">
							{{ vendorSnapshot?.name }}
						</div>
						<div v-if="vendorSnapshot?.address_line1" class="text-(--ui-text-muted)">
							{{ vendorSnapshot.address_line1 }}
						</div>
						<div v-if="vendorSnapshot?.address_line2" class="text-(--ui-text-muted)">
							{{ vendorSnapshot.address_line2 }}
						</div>
						<div v-if="vendorSnapshot?.city || vendorSnapshot?.country" class="text-(--ui-text-muted)">
							{{ [vendorSnapshot.city, vendorSnapshot.postal_code, vendorSnapshot.country].filter(Boolean).join(", ") }}
						</div>
						<div v-if="vendorSnapshot?.tax_id" class="text-(--ui-text-muted) mt-1 text-xs">
							Tax ID: {{ vendorSnapshot.tax_id }}
						</div>
					</div>
					<div class="mt-4 pt-3 border-t border-(--ui-border) flex flex-wrap gap-2">
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-external-link"
							@click="openVendor"
						>
							Open vendor
						</UButton>
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-file-input"
							@click="viewGeneratedBills"
						>
							Generated bills
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
						<UFormField label="Next issue date" help="Auto-set to one cycle after start. Edit to skip, backdate, or fire on the start date itself.">
							<DateField v-model="formNextIssueDate" />
						</UFormField>
						<UFormField label="End date" help="Optional. Leave blank for an open-ended schedule.">
							<DateField v-model="formEndDate" :min-value="formNextIssueDate || undefined" />
						</UFormField>
						<UFormField label="Payment terms (days)" help="Net-N. Added to issue date to set the due date on each generated bill.">
							<UInputNumber v-model="formPaymentTermsDays" :min="0" :step="1" class="w-full" />
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
						<!-- Bundle vs itemized switch — same shape as the
							bill detail page. Bundle = one lump-sum
							amount, itemized = per-line breakdown. The
							template's pricing_mode flows onto every
							generated bill. -->
						<div class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs">
							<button
								type="button"
								class="px-3 py-1.5"
								:class="formPricingMode === 'bundle' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="formPricingMode = 'bundle'"
							>
								Bundle
							</button>
							<button
								type="button"
								class="px-3 py-1.5 border-l border-(--ui-border)"
								:class="formPricingMode === 'itemized' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="formPricingMode = 'itemized'"
							>
								Itemized
							</button>
						</div>
					</div>
				</template>

				<DocumentLineEditor
					:model-value="lineDrafts"
					:mode="formPricingMode"
					@update:model-value="onLinesChange"
				/>
			</UCard>

			<!-- Totals + Defaults side-by-side. Totals fixed-width;
				Defaults takes whatever's left. Stacks vertically below
				lg. Notes goes full-width below. -->
			<div class="flex flex-col lg:flex-row gap-6 items-start">
				<UCard class="w-full lg:w-[26rem] shrink-0">
					<template #header>
						<div class="app-chrome font-medium">
							Totals
						</div>
					</template>
					<div class="flex justify-end">
						<div class="w-full max-w-sm space-y-3">
							<UFormField
								v-if="formPricingMode === 'bundle'"
								label="Bundle subtotal"
								help="Amount before VAT."
							>
								<MoneyInput v-model="bundleSubtotalCents" class="text-right" />
							</UFormField>
							<div class="flex justify-end">
								<UCheckbox
									v-model="formApplyVat"
									label="Apply VAT"
									:ui="{ label: 'font-medium' }"
								/>
							</div>
							<div v-if="formApplyVat" class="text-right">
								<div class="text-sm font-medium mb-1.5">
									VAT rate (%)
								</div>
								<div class="flex justify-end">
									<UInputNumber
										v-model="vatRatePct"
										:step="0.01"
										:min="0"
										:max="100"
										class="md:w-32"
									/>
								</div>
								<div class="text-xs text-(--ui-text-muted) mt-1.5">
									Applied to the subtotal on each generated bill.
								</div>
							</div>
							<div class="border-t border-(--ui-border) pt-3 text-sm tabular-nums text-right space-y-0.5">
								<div class="text-(--ui-text-muted)">
									Subtotal: <span class="text-(--ui-text)">{{ formatLKR(totalsPreview.subtotal) }}</span>
								</div>
								<div v-if="totalsPreview.tax !== 0" class="text-(--ui-text-muted)">
									VAT: <span class="text-(--ui-text)">{{ formatLKR(totalsPreview.tax) }}</span>
								</div>
								<div class="font-medium text-base">
									Total: {{ formatLKR(totalsPreview.total) }}
								</div>
							</div>
						</div>
					</div>
				</UCard>
				<UCard class="w-full lg:flex-1 min-w-0">
					<template #header>
						<div class="app-chrome font-medium">
							Defaults
						</div>
					</template>
					<div class="space-y-3">
						<UFormField label="Category" help="Becomes the category on each generated bill.">
							<CategoryPicker v-model="formCategoryId" />
						</UFormField>
					</div>
				</UCard>
			</div>

			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Notes
					</div>
				</template>
				<UTextarea
					v-model="formNotes"
					:rows="6"
					placeholder="Carried onto each generated bill. You can still edit per-bill on the bills page."
					class="w-full"
				/>
			</UCard>
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
					This removes the recurring template only. Bills already generated from it
					stay in your books — they're real liabilities now, independent of this template.
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
// Recurring bill template editor. Mirror of the recurring-invoices
// detail page, swapping client for vendor and dropping bank /
// project_title (bills don't carry them). Adds the bill-category
// picker on the Defaults card.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { VendorSnapshot } from "~/stores/bills";
	import type {
		RecurringBillLineRow,
		RecurringBillRow,
		RecurringFrequency
	} from "~/stores/recurring_bills";
	import type { VendorRow } from "~/stores/vendors";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { buildCategorySnapshot, useBillCategoriesStore } from "~/stores/bill_categories";
	import { useBillsStore } from "~/stores/bills";
	import { advanceDate, useRecurringBillsStore } from "~/stores/recurring_bills";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "Recurring bill" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const vendorsStore = useVendorsStore();
	const billsStore = useBillsStore();
	const categoriesStore = useBillCategoriesStore();
	const store = useRecurringBillsStore();

	const templateId = Number(route.params.id);
	if (!Number.isFinite(templateId)) {
		throw createError({ statusCode: 404, statusMessage: "Recurring template not found" });
	}

	const template = ref<RecurringBillRow | null>(null);
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
	const formCategoryId = ref<number | null>(null);
	const formNotes = ref("");
	const formPaymentTermsDays = ref(30);
	const vatRatePct = ref(0);
	const lineDrafts = ref<LineDraft[]>([]);
	const formPricingMode = ref<"bundle" | "itemized">("bundle");
	const bundleSubtotalCents = ref<number>(0);
	const formApplyVat = ref<boolean>(true);

	const totalsPreview = computed(() => {
		if (formPricingMode.value === "bundle") {
			const sub = bundleSubtotalCents.value;
			const bp = formApplyVat.value ? Math.round(vatRatePct.value * 100) : 0;
			const tax = Math.round((sub * bp) / 10000);
			return { subtotal: sub, tax, total: sub + tax };
		}
		const subs = lineDrafts.value.map((l) =>
			computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_subtotal_cents
		);
		const taxes = lineDrafts.value.map((l) =>
			computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_tax_cents
		);
		const totals = lineDrafts.value.map((l) =>
			computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_total_cents
		);
		return {
			subtotal: sumCents(...subs),
			tax: sumCents(...taxes),
			total: sumCents(...totals)
		};
	});

	const FREQUENCY_OPTIONS: { label: string, value: RecurringFrequency }[] = [
		{ label: "Weekly", value: "weekly" },
		{ label: "Monthly", value: "monthly" },
		{ label: "Quarterly", value: "quarterly" },
		{ label: "Yearly", value: "yearly" }
	];

	const vendorSnapshot = computed<VendorSnapshot | null>(() => {
		if (!template.value?.vendor_snapshot) return null;
		try {
			return JSON.parse(template.value.vendor_snapshot) as VendorSnapshot;
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
		vendorsStore.ensureLoaded(),
		billsStore.ensureLoaded(),
		categoriesStore.ensureLoaded(),
		store.ensureLoaded()
	]);

	function snapshotForSelectedCategory(): string | null {
		if (formCategoryId.value === null) return null;
		const c = categoriesStore.categories.find((row) => row.id === formCategoryId.value);
		return c ? buildCategorySnapshot(c) : null;
	}

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
		formCategoryId.value = row.category_id;
		formNotes.value = row.notes ?? "";
		formPaymentTermsDays.value = row.payment_terms_days;
		vatRatePct.value = row.vat_rate_basis_points / 100;
		formApplyVat.value = row.vat_rate_basis_points > 0;
		formPricingMode.value = row.pricing_mode;
		bundleSubtotalCents.value = row.bundle_subtotal_cents;

		const lineRows: RecurringBillLineRow[] = await store.getLines(templateId);
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

	// Auto-sync next_issue_date when start_date or frequency changes —
	// same subscription mental model recurring_invoices uses.
	watch([formStartDate, formFrequency], ([start, freq]) => {
		if (hydrating.value) return;
		if (!start) return;
		if (template.value && template.value.bills_generated > 0) return;
		formNextIssueDate.value = advanceDate(start, freq);
	});

	await hydrate();

	watch(
		[
			formTemplateName,
			formFrequency,
			formStartDate,
			formNextIssueDate,
			formEndDate,
			formCategoryId,
			formNotes,
			formPaymentTermsDays,
			vatRatePct,
			formApplyVat,
			formPricingMode,
			bundleSubtotalCents
		],
		() => {
			if (!hydrating.value) dirty.value = true;
		}
	);

	const onLinesChange = (next: LineDraft[]) => {
		lineDrafts.value = next;
		dirty.value = true;
	};

	const openVendor = () => {
		if (!template.value) return;
		void router.push(`/vendors/${template.value.vendor_id}`);
	};
	const viewGeneratedBills = () => {
		if (!template.value) return;
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.clearDateFilters();
		billsStore.vendorFilter = template.value.vendor_id;
		void router.push("/bills");
	};

	const refreshVendorSnapshot = () => {
		if (!template.value) return;
		const v: VendorRow | undefined = vendorsStore.vendors.find((vr) => vr.id === template.value!.vendor_id);
		if (!v) return;
		const snap = store.buildVendorSnapshot(v);
		template.value = { ...template.value, vendor_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Vendor snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!template.value) return;
		saving.value = true;
		try {
			const bp = formApplyVat.value ? Math.round(vatRatePct.value * 100) : 0;
			await store.update(templateId, {
				template_name: formTemplateName.value.trim() || template.value.template_name,
				vendor_snapshot: template.value.vendor_snapshot,
				category_id: formCategoryId.value,
				category_snapshot: snapshotForSelectedCategory(),
				frequency: formFrequency.value,
				start_date: formStartDate.value,
				next_issue_date: formNextIssueDate.value,
				end_date: formEndDate.value,
				pricing_mode: formPricingMode.value,
				bundle_subtotal_cents: bundleSubtotalCents.value,
				vat_rate_basis_points: bp,
				payment_terms_days: formPaymentTermsDays.value,
				notes: formNotes.value || null
			});
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
			const billId = await store.generateOne(templateId);
			await hydrate();
			toast.add({
				title: "Bill generated",
				description: "Recorded as unpaid on the bills page.",
				color: "success",
				icon: "i-lucide-check"
			});
			void router.push(`/bills/${billId}`);
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
			confirmDelete.value = false;
			deleting.value = false;
			toast.add({ title: "Template deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/recurring-bills");
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
