<template>
	<div class="w-full max-w-2xl select-none">
		<header class="text-center mb-6">
			<img
				:src="sakoramLogo"
				alt="Sakoram"
				class="h-14 w-auto mx-auto mb-4 dark:invert dark:hue-rotate-180"
			>
			<h1 class="text-2xl font-semibold">
				Set up your business
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				A few minutes now saves you typing the same details on every quote and invoice.
			</p>
		</header>

		<!-- Step indicator. Click any past step to go back; future steps
			stay un-clickable so the user can't skip ahead without
			triggering the save callbacks. -->
		<div class="flex items-center justify-center gap-1 mb-6">
			<template v-for="(s, idx) in steps" :key="s.label">
				<button
					type="button"
					class="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded transition whitespace-nowrap shrink-0"
					:class="idx + 1 === currentStep
						? 'text-(--ui-primary) font-medium'
						: idx + 1 < currentStep
							? 'text-(--ui-text-muted) hover:text-(--ui-text)'
							: 'text-(--ui-text-muted)/50 cursor-default'"
					:disabled="idx + 1 > currentStep"
					@click="goToStep(idx + 1)"
				>
					<span
						class="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
						:class="idx + 1 === currentStep
							? 'bg-(--ui-primary) text-(--ui-bg)'
							: idx + 1 < currentStep
								? 'bg-(--ui-success)/20 text-(--ui-success)'
								: 'bg-(--ui-bg-muted) text-(--ui-text-muted)'"
					>
						<UIcon v-if="idx + 1 < currentStep" name="i-lucide-check" class="size-3" />
						<template v-else>{{ idx + 1 }}</template>
					</span>
					{{ s.label }}
				</button>
				<UIcon
					v-if="idx < steps.length - 1"
					name="i-lucide-chevron-right"
					class="size-3 shrink-0 text-(--ui-text-muted)/50"
				/>
			</template>
		</div>

		<!-- Step 1 — Identity -->
		<UCard v-if="currentStep === 1">
			<template #header>
				<div class="font-medium">
					Identity
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					What this business is called, and how it's identified to clients.
				</p>
			</template>

			<div class="space-y-4">
				<!-- One-time intro hint (step 1 only) — explains the wizard
					navigation so a first-timer knows Next saves, Skip moves on,
					and nothing is committed until the end. -->
				<HelpCallout variant="tip" title="Nothing's locked in">
					<strong>Next</strong> saves each step and moves on, <strong>Skip this step</strong> jumps past it, and <strong>Skip onboarding</strong> takes you straight to the app. You can change any of this later in Settings.
				</HelpCallout>

				<UFormField label="Business name" required>
					<UInput v-model="form.business_name" placeholder="e.g. Acme Trading Co" autofocus />
					<template #help>
						<span class="text-xs text-(--ui-text-muted)">Shown on every quote, invoice, and PDF. You can rename it later.</span>
					</template>
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Country">
						<UInput v-model="form.country" placeholder="Sri Lanka" />
					</UFormField>
					<UFormField label="Currency">
						<CurrencyPicker
							v-model:code="form.currency_code"
							v-model:symbol-override="form.currency_symbol_override"
						/>
					</UFormField>
				</div>

				<UFormField label="Tax ID (VAT / GST / TIN)">
					<UInput v-model="form.tax_id" placeholder="e.g. VAT-123456789" />
					<template #help>
						<span class="text-xs text-(--ui-text-muted)">Optional. Printed on invoices.</span>
					</template>
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<div class="text-xs font-medium text-(--ui-text) mb-1">
							Identity logo
						</div>
						<div class="text-xs text-(--ui-text-muted) mb-2">
							Square mark for the sidebar.
						</div>
						<button
							type="button"
							class="w-full aspect-square max-w-[140px] rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition"
							:class="identityDragOver
								? 'border-(--ui-primary) bg-(--ui-primary)/5'
								: 'border-(--ui-border-accented) hover:border-(--ui-primary) bg-(--ui-bg-muted)'"
							@click="identityLogoInput?.click()"
							@dragover.prevent="identityDragOver = true"
							@dragenter.prevent="identityDragOver = true"
							@dragleave.prevent="identityDragOver = false"
							@drop.prevent="onLogoDrop($event, 'identity')"
						>
							<img
								v-if="identityLogoPreview"
								:src="identityLogoPreview"
								class="max-w-full max-h-full object-contain"
								alt="Identity logo"
							>
							<div v-else class="text-xs text-(--ui-text-muted) text-center px-2">
								<UIcon name="i-lucide-upload" class="size-5 mx-auto mb-1" />
								Click or drop
							</div>
						</button>
						<input
							ref="identityLogoInput"
							type="file"
							accept="image/*"
							class="hidden"
							@change="onIdentityLogoChange"
						>
					</div>
					<div>
						<div class="text-xs font-medium text-(--ui-text) mb-1">
							PDF header logo
						</div>
						<div class="text-xs text-(--ui-text-muted) mb-2">
							Wide letterhead-style image printed on documents.
						</div>
						<button
							type="button"
							class="w-full h-[140px] rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition"
							:class="pdfDragOver
								? 'border-(--ui-primary) bg-(--ui-primary)/5'
								: 'border-(--ui-border-accented) hover:border-(--ui-primary) bg-(--ui-bg-muted)'"
							@click="pdfLogoInput?.click()"
							@dragover.prevent="pdfDragOver = true"
							@dragenter.prevent="pdfDragOver = true"
							@dragleave.prevent="pdfDragOver = false"
							@drop.prevent="onLogoDrop($event, 'pdf-header')"
						>
							<img
								v-if="pdfLogoPreview"
								:src="pdfLogoPreview"
								class="max-w-full max-h-full object-contain"
								alt="PDF header logo"
							>
							<div v-else class="text-xs text-(--ui-text-muted) text-center px-2">
								<UIcon name="i-lucide-upload" class="size-5 mx-auto mb-1" />
								Click or drop
							</div>
						</button>
						<input
							ref="pdfLogoInput"
							type="file"
							accept="image/*"
							class="hidden"
							@change="onPdfLogoChange"
						>
					</div>
				</div>
			</div>
		</UCard>

		<!-- Step 2 — Contact -->
		<UCard v-if="currentStep === 2">
			<template #header>
				<div class="font-medium">
					Contact
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					Address and contact info — printed on every document header.
				</p>
			</template>

			<div class="space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Email">
						<UInput v-model="form.email" type="email" placeholder="hello@business.com" />
					</UFormField>
					<UFormField label="Phone">
						<UInput v-model="form.phone" placeholder="+94 11 234 5678" />
					</UFormField>
				</div>

				<UFormField label="Website">
					<UInput v-model="form.website" placeholder="https://example.com" />
				</UFormField>

				<UFormField label="Address line 1">
					<UInput v-model="form.address_line1" placeholder="Street address" />
				</UFormField>

				<UFormField label="Address line 2">
					<UInput v-model="form.address_line2" placeholder="Apartment, suite, etc." />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="City">
						<UInput v-model="form.city" placeholder="Colombo" />
					</UFormField>
					<UFormField label="Postal code">
						<UInput v-model="form.postal_code" placeholder="00300" />
					</UFormField>
				</div>
			</div>
		</UCard>

		<!-- Step 3 — Money defaults -->
		<UCard v-if="currentStep === 3">
			<template #header>
				<div class="font-medium">
					Money defaults
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					Sensible defaults are pre-filled — only change them if you know what you want.
				</p>
			</template>

			<div class="space-y-4">
				<UFormField label="Fiscal year starts" hint="Used by yearly reports and the document numbering reset.">
					<USelect v-model="form.fiscal_year_start_month" :items="monthOptions" value-key="value" class="md:w-64" />
				</UFormField>

				<UFormField label="Default VAT rate (%)" hint="Pre-fills on new quotes and invoices. Set to 0 for tax-exempt.">
					<UInputNumber v-model="form.default_vat_rate_pct" :min="0" :max="100" :step="0.5" class="md:w-32" />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Payment terms (days)">
						<UInputNumber v-model="form.default_payment_terms_days" :min="0" :max="365" class="w-full" />
						<template #help>
							<span class="text-xs text-(--ui-text-muted)">Default due date = issue + N days.</span>
						</template>
					</UFormField>
					<UFormField label="Quote validity (days)">
						<UInputNumber v-model="form.default_quote_validity_days" :min="0" :max="365" class="w-full" />
						<template #help>
							<span class="text-xs text-(--ui-text-muted)">Default expiry on new quotes.</span>
						</template>
					</UFormField>
				</div>
			</div>
		</UCard>

		<!-- Step 4 — Banking -->
		<UCard v-if="currentStep === 4">
			<template #header>
				<div class="font-medium">
					Banking
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					Printed at the bottom of invoices so clients know where to send payment.
				</p>
			</template>

			<div class="space-y-4">
				<UFormField label="Bank name">
					<UInput v-model="form.bank_name" placeholder="e.g. Hatton National Bank" />
				</UFormField>
				<UFormField label="Account name">
					<UInput v-model="form.bank_account_name" placeholder="Acme Trading Co" />
				</UFormField>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Account number">
						<UInput v-model="form.bank_account_number" placeholder="0049-1234-5678" />
					</UFormField>
					<UFormField label="Branch">
						<UInput v-model="form.bank_branch" placeholder="Colombo Main" />
					</UFormField>
				</div>
			</div>
		</UCard>

		<!-- Step 5 — Documents (PDF template + accent colour) -->
		<UCard v-if="currentStep === 5">
			<template #header>
				<div class="font-medium">
					Documents
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					How your quotes, invoices, and bills look when printed. Fine-tune this any time in Settings → PDF.
				</p>
			</template>

			<div class="space-y-6">
				<div>
					<div class="text-xs font-medium text-(--ui-text) mb-2">
						Template
					</div>
					<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
						<button
							v-for="t in PDF_TEMPLATES"
							:key="t.key"
							type="button"
							:disabled="!canPickTemplate(t.key)"
							class="p-2 rounded-md border text-left transition"
							:class="[
								form.pdf_template === t.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)',
								canPickTemplate(t.key) ? 'cursor-pointer hover:border-(--ui-primary)/50' : 'opacity-50 cursor-not-allowed'
							]"
							@click="form.pdf_template = t.key"
						>
							<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
								<PdfTemplateThumb :template-key="t.key" :color="themeHex(form.pdf_theme_color)" />
							</div>
							<div class="text-xs font-medium flex items-center gap-1">
								{{ t.label }}
								<UIcon v-if="!canPickTemplate(t.key)" name="i-lucide-lock" class="size-3 text-(--ui-text-muted)" />
							</div>
						</button>
					</div>
				</div>

				<div>
					<div class="text-xs font-medium text-(--ui-text) mb-2">
						Accent colour
					</div>
					<div class="grid grid-cols-8 gap-3 max-w-md">
						<button
							v-for="c in THEME_COLORS"
							:key="c.value"
							type="button"
							class="group flex items-center justify-center"
							:title="c.label"
							@click="form.pdf_theme_color = c.value"
						>
							<span
								class="size-8 rounded-full border-2 transition"
								:class="form.pdf_theme_color === c.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) group-hover:border-(--ui-text-muted)'"
								:style="{ backgroundColor: c.hex }"
							/>
						</button>
					</div>
				</div>
			</div>
		</UCard>

		<!-- Step 6 — Security (optional) -->
		<UCard v-if="currentStep === 6">
			<template #header>
				<div class="font-medium">
					Security
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-1">
					Optionally password-protect this business by encrypting its database on this computer. You can also turn this on later in Settings → Security.
				</p>
			</template>

			<div class="space-y-4">
				<div class="text-sm text-(--ui-warning) bg-(--ui-warning)/10 border border-(--ui-warning)/30 rounded p-3 flex gap-2">
					<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
					<div>
						If you set a password, you'll see a <span class="font-semibold">recovery key</span> once. Save it somewhere safe — if you forget the password <span class="font-semibold">and</span> lose the recovery key, this business's data is unrecoverable. There's no backdoor.
					</div>
				</div>
				<UFormField label="Password" hint="Leave blank to skip — the business stays unencrypted.">
					<PasswordInput v-model="encPw" placeholder="Choose a strong password" :disabled="saving" />
				</UFormField>
				<UFormField label="Confirm password" :error="encMismatch ? 'Passwords don\'t match' : undefined">
					<PasswordInput v-model="encPw2" placeholder="Re-enter the password" :disabled="saving" @enter="onNext" />
				</UFormField>
			</div>
		</UCard>

		<!-- Step navigation -->
		<div class="mt-6 flex items-center justify-between gap-3">
			<div>
				<UButton
					v-if="currentStep > 1"
					variant="ghost"
					color="neutral"
					icon="i-lucide-arrow-left"
					:disabled="saving"
					@click="goToStep(currentStep - 1)"
				>
					Back
				</UButton>
				<button
					v-else
					type="button"
					class="text-xs text-(--ui-text-muted) hover:text-(--ui-text) underline-offset-2 hover:underline"
					:disabled="saving"
					@click="skipAll"
				>
					Skip onboarding — I'll fill these in later
				</button>
			</div>

			<div class="flex items-center gap-2">
				<UButton
					v-if="currentStep < 6"
					variant="ghost"
					color="neutral"
					:disabled="saving"
					@click="onSkip"
				>
					Skip this step
				</UButton>
				<UButton
					:loading="saving"
					:disabled="(currentStep === 1 && !form.business_name.trim()) || (currentStep === 6 && encMismatch)"
					:icon="currentStep === 6 ? 'i-lucide-check' : 'i-lucide-arrow-right'"
					:trailing="currentStep < 6"
					@click="onNext"
				>
					{{ currentStep === 6 ? "Finish & open dashboard" : "Next" }}
				</UButton>
			</div>
		</div>

		<!-- Recovery key — shown ONCE if the user set an encryption password
			on the Security step. Non-dismissible; Done (which opens the
			dashboard) is gated on the user confirming they saved it. -->
		<UModal v-model:open="showRecovery" title="Save your recovery key" :dismissible="false" :close="false">
			<template #body>
				<div class="space-y-4">
					<p class="text-sm text-(--ui-text-muted)">
						This is the <span class="font-medium text-(--ui-text)">only</span> time we'll show this.
						If you forget your password, this key is the only way back into this business.
					</p>
					<div class="bg-(--ui-bg-muted) border border-(--ui-border) rounded-md p-3 font-mono text-sm break-all select-text">
						{{ recoveryKey }}
					</div>
					<div class="flex justify-end">
						<UButton size="sm" variant="outline" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" @click="copyKey">
							{{ copied ? "Copied" : "Copy" }}
						</UButton>
					</div>
					<UCheckbox v-model="savedAck" label="I've saved my recovery key somewhere safe" />
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end w-full">
					<UButton :disabled="!savedAck" icon="i-lucide-check" @click="onRecoveryDone">
						Open dashboard
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// Multi-step onboarding for a freshly-created business. Triggered from
// the welcome page after the user names the new tenant — tenants.create()
// + tenants.activate() have already run, so this page reads/writes
// directly to the active tenant's settings via useSettingsStore.
//
// Each step saves on Next so partial completion sticks (DB writes are
// per-step). If the user closes the app mid-flow, what they entered up
// to the last Next they pressed is preserved.

	import { invoke } from "@tauri-apps/api/core";
	import { appDataDir, join } from "@tauri-apps/api/path";
	import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import CurrencyPicker from "~/components/CurrencyPicker.vue";
	import { resetDbCache } from "~/lib/db";
	import { PDF_TEMPLATES } from "~/lib/pdf-templates";
	import { THEME_COLORS, themeHex } from "~/lib/theme";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({
		layout: "welcome",
		title: "Set up your business"
	});

	const toast = useToast();
	const settingsStore = useSettingsStore();
	const banksStore = useBusinessBanksStore();
	const tenants = useTenantsStore();
	const license = useLicenseStore();

	await settingsStore.ensureLoaded();

	// PDF templates are a Plus feature. A fresh install is on the Premium
	// trial so all are pickable; after the trial only Classic is. Mirrors
	// the gate on /settings/pdf.
	const entitledToTemplates = computed(() => license.hasFeature("pdf_templates"));
	const canPickTemplate = (key: string): boolean => entitledToTemplates.value || key === "classic";

	// Step state machine. `steps` is a typed array purely for the indicator
	// UI labels. Steps 1-5 save settings; step 6 (Security) is the optional
	// at-rest encryption opt-in handled separately on Finish.
	type Step = 1 | 2 | 3 | 4 | 5 | 6;
	const steps = [
		{ label: "Identity" },
		{ label: "Contact" },
		{ label: "Money defaults" },
		{ label: "Banking" },
		{ label: "Documents" },
		{ label: "Security" }
	] as const;
	const currentStep = ref<Step>(1);

	// One reactive form mirroring the company_settings columns we touch.
	// VAT is stored as basis points (1800 = 18%); the UI shows percent
	// for friendlier editing and we convert on save.
	const form = reactive({
		business_name: settingsStore.settings?.business_name ?? "",
		country: settingsStore.settings?.country ?? "Sri Lanka",
		currency_code: settingsStore.settings?.currency_code ?? "LKR",
		currency_symbol_override: settingsStore.settings?.currency_symbol_override ?? null,
		tax_id: settingsStore.settings?.tax_id ?? "",
		email: settingsStore.settings?.email ?? "",
		phone: settingsStore.settings?.phone ?? "",
		website: settingsStore.settings?.website ?? "",
		address_line1: settingsStore.settings?.address_line1 ?? "",
		address_line2: settingsStore.settings?.address_line2 ?? "",
		city: settingsStore.settings?.city ?? "",
		postal_code: settingsStore.settings?.postal_code ?? "",
		fiscal_year_start_month: settingsStore.settings?.fiscal_year_start_month ?? 4,
		default_vat_rate_pct: (settingsStore.settings?.default_vat_rate ?? 1800) / 100,
		default_payment_terms_days: settingsStore.settings?.default_payment_terms_days ?? 30,
		default_quote_validity_days: settingsStore.settings?.default_quote_validity_days ?? 30,
		// Step 5 (Documents) — one template choice applies to both invoice
		// and quote PDFs; accent colour is the dedicated pdf_theme_color
		// (falls back to the UI theme colour for a sensible default).
		pdf_template: settingsStore.settings?.pdf_template_invoice || "classic",
		pdf_theme_color: settingsStore.settings?.pdf_theme_color ?? settingsStore.settings?.theme_color ?? "green",
		// Bank fields on this form aren't part of company_settings any
		// more (migration 0023 split them into a managed business_banks
		// list). The step 4 save creates a new business_banks row + sets
		// it as default if anything's filled in.
		bank_name: "",
		bank_account_name: "",
		bank_account_number: "",
		bank_branch: ""
	});

	const monthOptions = [
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

	// Logo upload state. The actual files live in app_data_dir/{logos,
	// pdf-headers}/{tenant_id}.{ext} on disk; the previews here are object
	// URLs while the user is mid-upload, replaced with convertFileSrc()
	// once persisted. Keeping it loose since we save to disk immediately
	// on selection (matches /settings/company / /settings/pdf flow).
	const identityLogoInput = useTemplateRef<HTMLInputElement>("identityLogoInput");
	const pdfLogoInput = useTemplateRef<HTMLInputElement>("pdfLogoInput");
	const identityLogoPreview = ref<string | null>(null);
	const pdfLogoPreview = ref<string | null>(null);

	const saving = ref(false);

	// Persist the step's fields. Each step saves only the columns it
	// owns — keeps the SQL UPDATE list tight and avoids accidentally
	// clobbering a field the user touched on a later step.
	const saveStep = async (step: 1 | 2 | 3 | 4 | 5) => {
		if (step === 1) {
			await settingsStore.save({
				business_name: form.business_name.trim() || "Untitled business",
				country: form.country.trim() || null,
				currency_code: form.currency_code,
				currency_symbol_override: form.currency_symbol_override,
				tax_id: form.tax_id.trim() || null
			});
		} else if (step === 2) {
			await settingsStore.save({
				email: form.email.trim() || null,
				phone: form.phone.trim() || null,
				website: form.website.trim() || null,
				address_line1: form.address_line1.trim() || null,
				address_line2: form.address_line2.trim() || null,
				city: form.city.trim() || null,
				postal_code: form.postal_code.trim() || null
			});
		} else if (step === 3) {
			await settingsStore.save({
				fiscal_year_start_month: form.fiscal_year_start_month,
				default_vat_rate: Math.round(form.default_vat_rate_pct * 100),
				default_payment_terms_days: form.default_payment_terms_days,
				default_quote_validity_days: form.default_quote_validity_days
			});
		} else if (step === 5) {
			// Documents — one template applies to both invoice + quote PDFs;
			// accent colour drives the header rule + highlights.
			await settingsStore.save({
				pdf_template_invoice: form.pdf_template,
				pdf_template_quote: form.pdf_template,
				pdf_theme_color: form.pdf_theme_color
			});
		} else {
			// Banking lives in business_banks now. Only create a row if
			// the user filled anything in — empty step 4 means "skip,
			// I'll add bank accounts later from Settings → Business
			// details".
			const bn = form.bank_name.trim();
			const ba = form.bank_account_name.trim();
			const an = form.bank_account_number.trim();
			const br = form.bank_branch.trim();
			if (bn || ba || an || br) {
				const id = await banksStore.create({
					// Auto-label using the bank name (or fall back to a
					// generic "Default") — the user can rename later.
					label: bn || "Default",
					bank_name: bn || null,
					bank_account_name: ba || null,
					bank_account_number: an || null,
					bank_branch: br || null
				});
				await banksStore.setDefault(id);
			}
		}
	};

	// ---- Step 6 (Security): optional at-rest encryption --------------------
	const encPw = ref("");
	const encPw2 = ref("");
	const encMismatch = computed(() => !!encPw2.value && encPw.value !== encPw2.value);
	const showRecovery = ref(false);
	const recoveryKey = ref("");
	const savedAck = ref(false);
	const copied = ref(false);

	const finishWithOptionalEncryption = async () => {
		const pw = encPw.value;
		// Blank password = skip encryption; just open the dashboard.
		if (!pw) {
			window.location.assign("/");
			return;
		}
		if (pw !== encPw2.value) {
			toast.add({ title: "Passwords don't match", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		const id = tenants.activeTenantId;
		if (!id) {
			window.location.assign("/");
			return;
		}
		// Close the pool so Rust gets a flushed db to encrypt; enable keeps the
		// working db in place. We hold on the recovery-key modal before the
		// dashboard reload so the user can save the key.
		await resetDbCache();
		recoveryKey.value = await invoke<string>("enable_tenant_encryption", { id, password: pw });
		savedAck.value = false;
		copied.value = false;
		showRecovery.value = true;
	};

	const copyKey = async () => {
		try {
			await navigator.clipboard.writeText(recoveryKey.value);
			copied.value = true;
			setTimeout(() => {
				copied.value = false;
			}, 2000);
		} catch {
			toast.add({ title: "Couldn't copy — select the key and copy it manually", color: "warning", icon: "i-lucide-circle-alert" });
		}
	};

	const onRecoveryDone = () => {
		window.location.assign("/");
	};

	const onNext = async () => {
		if (saving.value) return;
		saving.value = true;
		try {
			if (currentStep.value === 6) {
				// Final step: optionally enable encryption, then open the
				// dashboard (the recovery-key modal handles the reload when a
				// password was set).
				await finishWithOptionalEncryption();
				return;
			}
			await saveStep(currentStep.value as 1 | 2 | 3 | 4 | 5);
			currentStep.value = (currentStep.value + 1) as Step;
		} catch (err) {
			toast.add({
				title: "Could not save",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	// Skip = advance without writing anything for this step. Whatever
	// the user typed stays in `form` if they hit Back later.
	const onSkip = () => {
		if (currentStep.value < 6) {
			currentStep.value = (currentStep.value + 1) as Step;
		}
	};

	const goToStep = (step: number) => {
		if (step < 1 || step > 6) return;
		if (step > currentStep.value) return; // only allow going back via the indicator
		currentStep.value = step as Step;
	};

	// Escape hatch from step 1 — bail to the dashboard without saving
	// the form. We DO need to ensure business_name isn't blank (the row
	// requires it) so we save whatever's typed first; if empty, we
	// fall back to "Untitled business" via saveStep(1).
	const skipAll = async () => {
		if (saving.value) return;
		saving.value = true;
		try {
			await saveStep(1);
			window.location.assign("/");
		} catch (err) {
			saving.value = false;
			toast.add({
				title: "Could not save",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// ---- Logo upload helpers ----------------------------------------------
	// Same shape as /settings/company.vue's uploadLogo: write into APPDATA
	// (which IS in the allowed fs scope) and save the path to the DB.
	const uploadLogo = async (file: File, kind: "identity" | "pdf-header") => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const appData = await appDataDir();
			const dir = await join(appData, kind === "identity" ? "logos" : "pdf-headers");
			await mkdir(dir, { recursive: true }).catch(() => { /* exists */ });
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
			const fileName = `${tenantId}.${ext}`;
			const target = await join(dir, fileName);
			await writeFile(target, bytes);

			if (kind === "identity") {
				await settingsStore.save({ logo_path: target });
				await tenants.setLogoFile(tenantId, fileName);
				identityLogoPreview.value = URL.createObjectURL(file);
			} else {
				await settingsStore.save({ pdf_header_logo_path: target });
				pdfLogoPreview.value = URL.createObjectURL(file);
			}
		} catch (err) {
			toast.add({
				title: "Logo upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onIdentityLogoChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await uploadLogo(file, "identity");
	};

	const onPdfLogoChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await uploadLogo(file, "pdf-header");
	};

	// Drag-and-drop onto the logo zones. The window sets dragDropEnabled:false
	// and disable-file-drop-nav.client.ts prevents the document from navigating
	// on a stray drop, so a zone's own drop handler runs first and reads the
	// file — same pattern as /settings/pdf.vue's header-logo drop zone.
	const identityDragOver = ref(false);
	const pdfDragOver = ref(false);

	const onLogoDrop = async (event: DragEvent, kind: "identity" | "pdf-header") => {
		if (kind === "identity") identityDragOver.value = false;
		else pdfDragOver.value = false;
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.add({ title: "Only image files are accepted", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		await uploadLogo(file, kind);
	};
</script>
