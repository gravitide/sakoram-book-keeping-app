<template>
	<div class="w-full max-w-2xl">
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
		<div class="flex items-center justify-center gap-2 mb-6">
			<template v-for="(s, idx) in steps" :key="s.label">
				<button
					type="button"
					class="flex items-center gap-2 text-xs px-2 py-1 rounded transition"
					:class="idx + 1 === currentStep
						? 'text-(--ui-primary) font-medium'
						: idx + 1 < currentStep
							? 'text-(--ui-text-muted) hover:text-(--ui-text)'
							: 'text-(--ui-text-muted)/50 cursor-default'"
					:disabled="idx + 1 > currentStep"
					@click="goToStep(idx + 1)"
				>
					<span
						class="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-medium"
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
					class="size-3 text-(--ui-text-muted)/50"
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
				<UFormField label="Business name" required>
					<UInput v-model="form.business_name" placeholder="e.g. Acme Trading Co" autofocus />
				</UFormField>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Country">
						<UInput v-model="form.country" placeholder="Sri Lanka" />
					</UFormField>
					<UFormField label="Currency" hint="ISO 4217 alpha code; drives PDF totals.">
						<USelect v-model="form.currency_code" :items="currencyOptions" value-key="value" class="w-full" />
					</UFormField>
				</div>

				<UFormField label="Tax ID" hint="VAT / GST / TIN — appears on invoices.">
					<UInput v-model="form.tax_id" placeholder="e.g. VAT-123456789" />
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
							class="w-full aspect-square max-w-[140px] rounded-md border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) flex items-center justify-center overflow-hidden bg-(--ui-bg-muted)"
							@click="identityLogoInput?.click()"
						>
							<img
								v-if="identityLogoPreview"
								:src="identityLogoPreview"
								class="max-w-full max-h-full object-contain"
								alt="Identity logo"
							>
							<div v-else class="text-xs text-(--ui-text-muted) text-center px-2">
								<UIcon name="i-lucide-upload" class="size-5 mx-auto mb-1" />
								Click to upload
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
							class="w-full h-[140px] rounded-md border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) flex items-center justify-center overflow-hidden bg-(--ui-bg-muted)"
							@click="pdfLogoInput?.click()"
						>
							<img
								v-if="pdfLogoPreview"
								:src="pdfLogoPreview"
								class="max-w-full max-h-full object-contain"
								alt="PDF header logo"
							>
							<div v-else class="text-xs text-(--ui-text-muted) text-center px-2">
								<UIcon name="i-lucide-upload" class="size-5 mx-auto mb-1" />
								Click to upload
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
					<UFormField label="Payment terms (days)" hint="Default due date = issue + N days.">
						<UInputNumber v-model="form.default_payment_terms_days" :min="0" :max="365" class="w-full" />
					</UFormField>
					<UFormField label="Quote validity (days)" hint="Default expiry on new quotes.">
						<UInputNumber v-model="form.default_quote_validity_days" :min="0" :max="365" class="w-full" />
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
					v-if="currentStep < 4"
					variant="ghost"
					color="neutral"
					:disabled="saving"
					@click="onSkip"
				>
					Skip this step
				</UButton>
				<UButton
					:loading="saving"
					:disabled="currentStep === 1 && !form.business_name.trim()"
					:icon="currentStep === 4 ? 'i-lucide-check' : 'i-lucide-arrow-right'"
					:trailing="currentStep < 4"
					@click="onNext"
				>
					{{ currentStep === 4 ? "Finish & open dashboard" : "Next" }}
				</UButton>
			</div>
		</div>
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

	import { appDataDir, join } from "@tauri-apps/api/path";
	import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { CURRENCIES } from "~/lib/money";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({
		layout: "welcome",
		title: "Set up your business"
	});

	const toast = useToast();
	const settingsStore = useSettingsStore();
	const tenants = useTenantsStore();

	await settingsStore.ensureLoaded();

	// Step state machine. Hardcoded 4 — keeping `steps` as a typed array
	// purely for the indicator UI labels.
	const steps = [
		{ label: "Identity" },
		{ label: "Contact" },
		{ label: "Money defaults" },
		{ label: "Banking" }
	] as const;
	const currentStep = ref<1 | 2 | 3 | 4>(1);

	// One reactive form mirroring the company_settings columns we touch.
	// VAT is stored as basis points (1800 = 18%); the UI shows percent
	// for friendlier editing and we convert on save.
	const form = reactive({
		business_name: settingsStore.settings?.business_name ?? "",
		country: settingsStore.settings?.country ?? "Sri Lanka",
		currency_code: settingsStore.settings?.currency_code ?? "LKR",
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
		bank_name: settingsStore.settings?.bank_name ?? "",
		bank_account_name: settingsStore.settings?.bank_account_name ?? "",
		bank_account_number: settingsStore.settings?.bank_account_number ?? "",
		bank_branch: settingsStore.settings?.bank_branch ?? ""
	});

	const currencyOptions = Object.values(CURRENCIES).map((c) => ({
		label: `${c.code} — ${c.label}`,
		value: c.code
	}));

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
	const saveStep = async (step: 1 | 2 | 3 | 4) => {
		if (step === 1) {
			await settingsStore.save({
				business_name: form.business_name.trim() || "Untitled business",
				country: form.country.trim() || null,
				currency_code: form.currency_code,
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
		} else {
			await settingsStore.save({
				bank_name: form.bank_name.trim() || null,
				bank_account_name: form.bank_account_name.trim() || null,
				bank_account_number: form.bank_account_number.trim() || null,
				bank_branch: form.bank_branch.trim() || null
			});
		}
	};

	const onNext = async () => {
		if (saving.value) return;
		saving.value = true;
		try {
			await saveStep(currentStep.value);
			if (currentStep.value === 4) {
				// Hard reload so every store re-hydrates against the now-
				// fully-populated tenant — same pattern as tenant switch.
				window.location.assign("/");
				return;
			}
			currentStep.value = (currentStep.value + 1) as 1 | 2 | 3 | 4;
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
		if (currentStep.value < 4) {
			currentStep.value = (currentStep.value + 1) as 1 | 2 | 3 | 4;
		}
	};

	const goToStep = (step: number) => {
		if (step < 1 || step > 4) return;
		if (step > currentStep.value) return; // only allow going back via the indicator
		currentStep.value = step as 1 | 2 | 3 | 4;
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
</script>
