<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; form fields stay selectable via the input rule
			in main.css. -->
		<!-- Identity hero -------------------------------------------------- -->
		<section class="mb-10">
			<div class="flex flex-col md:flex-row md:items-center gap-6">
				<!-- Logo upload / drop zone -->
				<div
					class="group relative size-32 shrink-0 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition cursor-pointer" :class="[
						dragOver
							? 'border-(--ui-primary) bg-(--ui-primary)/5 scale-[1.02]'
							: 'border-(--ui-border) bg-(--ui-bg-muted) hover:border-(--ui-primary)/60'
					]"
					role="button"
					tabindex="0"
					aria-label="Upload logo"
					@click="pickLogo"
					@keydown.enter.prevent="pickLogo"
					@keydown.space.prevent="pickLogo"
					@dragover.prevent="dragOver = true"
					@dragenter.prevent="dragOver = true"
					@dragleave.prevent="dragOver = false"
					@drop.prevent="onDrop"
				>
					<input
						ref="fileInput"
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml"
						class="hidden"
						@change="onFileChange"
					>
					<img
						v-if="store.logoSrc"
						:src="store.logoSrc"
						alt="Logo"
						class="max-w-full max-h-full object-contain p-2"
					>
					<div v-else class="flex flex-col items-center gap-1 text-(--ui-text-muted)">
						<UIcon name="i-lucide-image-up" class="size-8" />
						<div class="text-[10px] uppercase tracking-wider">
							Drop logo
						</div>
					</div>
					<!-- Replace overlay (only when a logo is set) -->
					<div
						v-if="store.logoSrc"
						class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
					>
						<UIcon name="i-lucide-upload" class="size-5 text-white" />
						<span class="text-[10px] uppercase tracking-wider text-white">
							Replace
						</span>
					</div>
				</div>

				<!-- Identity summary -->
				<div class="flex-1 min-w-0">
					<h1 class="text-3xl font-semibold leading-tight truncate">
						{{ form.business_name || 'Untitled business' }}
					</h1>
					<dl class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-(--ui-text-muted)">
						<div v-if="form.tax_id" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-receipt" class="size-3.5" />
							<span>Tax ID {{ form.tax_id }}</span>
						</div>
						<div v-if="form.email" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-mail" class="size-3.5" />
							<span>{{ form.email }}</span>
						</div>
						<div v-if="form.phone" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-phone" class="size-3.5" />
							<span class="tabular-nums">{{ form.phone }}</span>
						</div>
						<div v-if="!form.business_name && !form.tax_id && !form.email && !form.phone">
							Fill in the company details below — they appear on every PDF you generate.
						</div>
					</dl>
					<div class="mt-4 flex flex-wrap items-center gap-2">
						<UButton
							v-if="store.settings?.logo_path"
							icon="i-lucide-trash-2"
							size="xs"
							variant="ghost"
							color="neutral"
							@click="removeLogo"
						>
							Remove logo
						</UButton>
						<UButton
							v-else
							icon="i-lucide-upload"
							size="xs"
							variant="soft"
							@click="pickLogo"
						>
							Upload logo
						</UButton>
						<span v-if="logoFileName" class="text-xs text-(--ui-text-muted) truncate">
							{{ logoFileName }}
						</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Form -------------------------------------------------------------- -->
		<UForm
			:schema="schema"
			:state="form"
			@submit="onSubmit"
		>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div id="company" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-building-2"
						title="Company"
						subtitle="The legal entity behind quotes and invoices."
					>
						<UFormField label="Business name" name="business_name" required>
							<UInput v-model="form.business_name" placeholder="Acme (Pvt) Ltd" />
						</UFormField>
						<UFormField label="Tax / VAT registration ID" name="tax_id">
							<UInput v-model="form.tax_id" />
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
						<UFormField label="Website" name="website">
							<UInput
								v-model="form.website"
								leading-icon="i-lucide-globe"
								placeholder="https://"
							/>
						</UFormField>
					</SectionCard>
				</div>

				<div id="address" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-map-pin"
						title="Address"
						subtitle="Printed on every issued document."
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
				</div>

				<!-- Bank accounts: managed list, one marked default. Auto-applied
					to new quotes / invoices (with per-document override on the
					detail page). Card sits inside the form for layout rhythm
					but its own actions don't trigger the main form submit —
					each row's action is its own immediate write. -->
				<div id="bank-accounts" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-landmark"
						title="Bank accounts"
						subtitle="Shown on invoice PDFs so clients know where to pay. One is the default for new quotes / invoices."
					>
						<div v-if="banksStore.activeBanks.length === 0" class="text-sm text-(--ui-text-muted) py-4 text-center">
							No bank accounts yet. Add one to show payment instructions on your quotes and invoices.
						</div>
						<ul v-else class="divide-y divide-(--ui-border) -mt-2">
							<li
								v-for="bank in banksStore.activeBanks"
								:key="bank.id"
								class="py-3 flex items-center gap-3"
							>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="font-medium truncate">{{ bank.label }}</span>
										<UBadge
											v-if="bank.is_default === 1"
											color="primary"
											variant="subtle"
											size="sm"
										>
											Default
										</UBadge>
									</div>
									<div class="text-xs text-(--ui-text-muted) truncate mt-0.5">
										<span>{{ bank.bank_name || "—" }}</span>
										<span v-if="bank.bank_account_number" class="tabular-nums"> · {{ bank.bank_account_number }}</span>
										<span v-if="bank.bank_branch"> · {{ bank.bank_branch }}</span>
									</div>
								</div>
								<UDropdownMenu :items="bankMenuItems(bank)">
									<UButton
										size="sm"
										variant="ghost"
										color="neutral"
										icon="i-lucide-ellipsis-vertical"
										aria-label="Bank actions"
									/>
								</UDropdownMenu>
							</li>
						</ul>
						<UButton
							block
							size="sm"
							variant="soft"
							icon="i-lucide-plus"
							class="mt-3"
							@click="openNewBank"
						>
							Add bank account
						</UButton>
					</SectionCard>
				</div>

				<div id="defaults" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-sliders-horizontal"
						title="Operational defaults"
						subtitle="Pre-fill values when creating new documents."
					>
					<UFormField label="Currency" name="currency_code" hint="Used everywhere money is displayed and on every PDF.">
						<CurrencyPicker
							v-model:code="form.currency_code"
							v-model:symbol-override="form.currency_symbol_override"
						/>
					</UFormField>
					<div class="grid grid-cols-2 gap-3">
						<UFormField label="VAT rate (%)" name="default_vat_rate">
							<UInputNumber
								v-model="vatRatePct"
								:step="0.5"
								:min="0"
								:max="100"
								class="w-full"
							/>
						</UFormField>
						<UFormField label="Payment terms (days)" name="default_payment_terms_days">
							<UInputNumber
								v-model="form.default_payment_terms_days"
								:min="0"
								:max="365"
								class="w-full"
							/>
						</UFormField>
						<UFormField label="Quote validity (days)" name="default_quote_validity_days">
							<UInputNumber
								v-model="form.default_quote_validity_days"
								:min="0"
								:max="365"
								class="w-full"
							/>
						</UFormField>
						<UFormField label="Fiscal year starts" name="fiscal_year_start_month">
							<USelect
								v-model="form.fiscal_year_start_month"
								:items="months"
								value-key="value"
								class="w-full"
							/>
						</UFormField>
					</div>
					</SectionCard>
				</div>
			</div>

			<!-- Sticky save bar — lives inside the form so it shares the
				scrollable <main> ancestor; position:sticky pins it to the
				bottom of the viewport without taking it out of normal flow
				(avoids the second scrollbar that position:fixed introduced
				here). -->
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
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="store.saving || !dirty"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="store.saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							Save changes
						</UButton>
					</div>
				</div>
			</div>
		</UForm>

		<!-- Bank account create / edit modal. -->
		<BusinessBankFormModal v-model:open="bankModalOpen" :bank="editingBank" />

		<!-- Delete confirmation. Bank rows on issued quotes / invoices have
			their data frozen in bank_details_snapshot, so deletion can't
			corrupt history — drafts with the deleted bank linked fall back
			to the default at next save (ON DELETE SET NULL on the FK). -->
		<UModal
			:open="bankToDelete !== null"
			title="Delete this bank account?"
			@update:open="(v) => { if (!v) bankToDelete = null }"
		>
			<template #body>
				<div class="space-y-3 text-sm">
					<p>
						This removes <span class="font-medium">{{ bankToDelete?.label }}</span> from your bank accounts list.
					</p>
					<p class="text-(--ui-text-muted)">
						Quotes and invoices that have already been issued keep their
						bank details on the PDF — those are frozen at issue time and
						are not affected by deletion.
					</p>
					<p v-if="bankToDelete?.is_default === 1" class="text-(--ui-warning)">
						This is the default bank. Another bank will be promoted to
						default after deletion.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="bankToDelete = null">
						Cancel
					</UButton>
					<UButton
						color="error"
						:loading="deletingBank"
						icon="i-lucide-trash-2"
						@click="confirmDeleteBank"
					>
						Delete bank account
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { BusinessBankRow } from "~/stores/business_banks";
	import type { SettingsUpdate } from "~/stores/settings";
	import { appDataDir, join } from "@tauri-apps/api/path";
	import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
	import { z } from "zod";
	import CurrencyPicker from "~/components/CurrencyPicker.vue";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "Business details" });

	const store = useSettingsStore();
	const banksStore = useBusinessBanksStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Appearance settings (ui_font, theme_color) live on a sibling page, so
	// Excludes fields owned by sibling settings pages so we don't stamp them
	// back when this form saves. Appearance owns ui_font/pdf_font/theme_color;
	// the PDF page owns pdf_header_logo_path/invoice_footer_notes/quote_footer_notes.
	type SiblingOwnedKey = "ui_font" | "pdf_font" | "theme_color" | "pdf_header_logo_path" | "invoice_footer_notes" | "quote_footer_notes";
	type CompanyForm = Omit<SettingsUpdate, SiblingOwnedKey>;

	const form = reactive<CompanyForm>({
		business_name: "",
		address_line1: "",
		address_line2: "",
		city: "",
		postal_code: "",
		country: "Sri Lanka",
		tax_id: "",
		email: "",
		phone: "",
		website: "",
		logo_path: null,
		default_vat_rate: 1800,
		default_payment_terms_days: 30,
		default_quote_validity_days: 30,
		fiscal_year_start_month: 1,
		currency_code: "LKR",
		currency_symbol_override: null
	});

	// Tax rate is stored in basis points (1800 = 18.00%) but the user types
	// percent. Bind a separate ref and project on save.
	const vatRatePct = ref<number>(18);

	const months = [
		{ label: "January", value: 1 },
		{ label: "February", value: 2 },
		{ label: "March", value: 3 },
		{ label: "April", value: 4 },
		{ label: "May", value: 5 },
		{ label: "June", value: 6 },
		{ label: "July", value: 7 },
		{ label: "August", value: 8 },
		{ label: "September", value: 9 },
		{ label: "October", value: 10 },
		{ label: "November", value: 11 },
		{ label: "December", value: 12 }
	];

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.business_name = s.business_name;
		form.address_line1 = s.address_line1 ?? "";
		form.address_line2 = s.address_line2 ?? "";
		form.city = s.city ?? "";
		form.postal_code = s.postal_code ?? "";
		form.country = s.country ?? "Sri Lanka";
		form.tax_id = s.tax_id ?? "";
		form.email = s.email ?? "";
		form.phone = s.phone ?? "";
		form.website = s.website ?? "";
		form.logo_path = s.logo_path;
		form.default_vat_rate = s.default_vat_rate;
		form.default_payment_terms_days = s.default_payment_terms_days;
		form.default_quote_validity_days = s.default_quote_validity_days;
		form.fiscal_year_start_month = s.fiscal_year_start_month;
		form.currency_code = s.currency_code ?? "LKR";
		form.currency_symbol_override = s.currency_symbol_override ?? null;
		vatRatePct.value = s.default_vat_rate / 100;
	};

	await Promise.all([store.ensureLoaded(), banksStore.ensureLoaded()]);
	hydrate();

	// --- Bank accounts management ---------------------------------------
	// The list lives inside the same form for layout rhythm but its row
	// actions write directly (no form-submit flow needed). Edit / create
	// open the modal, set-default is a single atomic UPDATE, delete is
	// guarded by a confirmation modal that mentions the snapshot
	// preservation so the user understands historical PDFs stay intact.

	const bankModalOpen = ref(false);
	const editingBank = ref<BusinessBankRow | null>(null);
	const bankToDelete = ref<BusinessBankRow | null>(null);
	const deletingBank = ref(false);

	const openNewBank = () => {
		editingBank.value = null;
		bankModalOpen.value = true;
	};
	const openEditBank = (bank: BusinessBankRow) => {
		editingBank.value = bank;
		bankModalOpen.value = true;
	};

	const setBankDefault = async (bank: BusinessBankRow) => {
		try {
			await banksStore.setDefault(bank.id);
			toast.add({
				title: `${bank.label} is now the default`,
				color: "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			toast.add({
				title: "Could not set default",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const askDeleteBank = (bank: BusinessBankRow) => {
		bankToDelete.value = bank;
	};

	const confirmDeleteBank = async () => {
		const bank = bankToDelete.value;
		if (!bank) return;
		deletingBank.value = true;
		try {
			await banksStore.remove(bank.id);
			// If we just deleted the default and other banks remain, promote
			// the first one so quotes / invoices don't lose their auto-pick.
			if (bank.is_default === 1 && banksStore.activeBanks.length > 0) {
				const promote = banksStore.activeBanks[0];
				if (promote) await banksStore.setDefault(promote.id);
			}
			toast.add({
				title: `${bank.label} deleted`,
				color: "info",
				icon: "i-lucide-trash-2"
			});
			bankToDelete.value = null;
		} catch (err) {
			toast.add({
				title: "Could not delete",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			deletingBank.value = false;
		}
	};

	// Per-row dropdown items. The Set-default item only appears when the
	// row isn't already the default. Delete is in its own group so the
	// menu draws a divider above it, matching the convention on document
	// list pages.
	const bankMenuItems = (bank: BusinessBankRow) => {
		const primary: { label: string, icon: string, onSelect: () => void | Promise<void> }[] = [];
		if (bank.is_default !== 1) {
			primary.push({
				label: "Set as default",
				icon: "i-lucide-star",
				onSelect: () => setBankDefault(bank)
			});
		}
		primary.push({
			label: "Edit",
			icon: "i-lucide-pencil",
			onSelect: () => openEditBank(bank)
		});
		return [primary, [
			{
				label: "Delete",
				icon: "i-lucide-trash-2",
				class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
				onSelect: () => askDeleteBank(bank)
			}
		]];
	};

	// Dirty tracking via JSON snapshot. Re-baselined after save / discard.
	const formSnapshot = computed(() =>
		JSON.stringify({ ...form, _vat: vatRatePct.value })
	);
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const schema = z.object({
		business_name: z.string().trim().min(1, "Business name is required"),
		email: z.union([z.literal(""), z.string().email("Invalid email")]),
		default_payment_terms_days: z.number().int().min(0).max(365),
		default_quote_validity_days: z.number().int().min(0).max(365),
		fiscal_year_start_month: z.number().int().min(1).max(12)
	});

	type Schema = z.output<typeof schema>;

	const onSubmit = async (_event: { data: Schema }) => {
		const patch: Partial<SettingsUpdate> = {
			...form,
			// Project percent → basis points. 18.5% → 1850. Always integer.
			default_vat_rate: Math.round(vatRatePct.value * 100)
		};
		try {
			await store.save(patch);
			refreshBaseline();
			toast.add({ title: "Settings saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onDiscard = () => {
		hydrate();
		refreshBaseline();
		toast.add({
			title: "Changes discarded",
			color: "info",
			icon: "i-lucide-rotate-ccw"
		});
	};

	// ----- Logo handling -------------------------------------------------------

	const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
	const dragOver = ref(false);
	const pickLogo = () => fileInput.value?.click();

	// Show just the basename, not the absolute OS path. Handles both Windows
	// backslashes and POSIX slashes so it stays correct on either platform.
	const logoFileName = computed(() => {
		const p = store.settings?.logo_path;
		if (!p) return null;
		return p.split(/[\\/]/).pop() ?? p;
	});

	// Use an HTML <input type="file"> rather than the Tauri dialog plugin: it
	// gives us the raw File bytes directly via FileReader, so we never need
	// fs-read capability on the user's arbitrary source path. We only write
	// into the app data dir, which IS in the allowed scope.
	const uploadLogo = async (file: File) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			// Build paths with `join` so the separators are platform-correct.
			// Hand-concatenating backslashes confuses Tauri's fs scope matcher
			// — it falls back to the "forbidden path" error even though the
			// glob ($APPDATA/**) should logically cover the destination.
			const appData = await appDataDir();
			const logosDir = await join(appData, "logos");
			await mkdir(logosDir, { recursive: true }).catch(() => { /* already exists */ });
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
			const fileName = `${tenantId}.${ext}`;
			const target = await join(logosDir, fileName);
			await writeFile(target, bytes);
			await store.save({ logo_path: target });
			// Sync the filename into tenants.json so the welcome screen +
			// sidebar can find it without round-tripping through the DB.
			await tenants.setLogoFile(tenantId, fileName);
			form.logo_path = target;
			refreshBaseline();
			toast.add({ title: "Logo updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Logo upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ""; // allow re-picking the same file
		if (file) await uploadLogo(file);
	};

	const onDrop = async (event: DragEvent) => {
		dragOver.value = false;
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.add({
				title: "Only image files are accepted",
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		await uploadLogo(file);
	};

	const removeLogo = async () => {
		await store.save({ logo_path: null });
		form.logo_path = null;
		refreshBaseline();
		if (tenants.activeTenantId) {
			await tenants.setLogoFile(tenants.activeTenantId, null);
		}
		toast.add({ title: "Logo removed", color: "info", icon: "i-lucide-image-off" });
	};
</script>
