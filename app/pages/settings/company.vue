<template>
	<div>
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Company details
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Business info, address, bank details, defaults, and logo. Changes are saved together.
			</p>
		</header>

		<UForm :schema="schema" :state="form" class="space-y-6" @submit="onSubmit">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Logo
						</div>
						<div v-if="store.settings?.logo_path" class="text-xs text-(--ui-text-muted)">
							{{ store.settings.logo_path }}
						</div>
					</div>
				</template>

				<div class="flex items-center gap-4">
					<input
						ref="fileInput"
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml"
						class="hidden"
						@change="onFileChange"
					>
					<div class="size-24 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) flex items-center justify-center overflow-hidden">
						<img
							v-if="store.logoSrc"
							:src="store.logoSrc"
							alt="Logo"
							class="max-w-full max-h-full object-contain"
						>
						<UIcon v-else name="i-lucide-image" class="size-8 text-(--ui-text-muted)" />
					</div>
					<div class="flex gap-2">
						<UButton icon="i-lucide-upload" variant="outline" @click="pickLogo">
							{{ store.settings?.logo_path ? "Replace logo" : "Upload logo" }}
						</UButton>
						<UButton
							v-if="store.settings?.logo_path"
							icon="i-lucide-trash-2"
							color="neutral"
							variant="ghost"
							@click="removeLogo"
						>
							Remove
						</UButton>
					</div>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Company
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Business name" name="business_name" required>
						<UInput v-model="form.business_name" />
					</UFormField>
					<UFormField label="Tax / VAT registration ID" name="tax_id">
						<UInput v-model="form.tax_id" />
					</UFormField>
					<UFormField label="Email" name="email">
						<UInput v-model="form.email" type="email" />
					</UFormField>
					<UFormField label="Phone" name="phone">
						<UInput v-model="form.phone" />
					</UFormField>
					<UFormField label="Website" name="website" class="md:col-span-2">
						<UInput v-model="form.website" placeholder="https://" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Address
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Address line 1" name="address_line1" class="md:col-span-2">
						<UInput v-model="form.address_line1" />
					</UFormField>
					<UFormField label="Address line 2" name="address_line2" class="md:col-span-2">
						<UInput v-model="form.address_line2" />
					</UFormField>
					<UFormField label="City" name="city">
						<UInput v-model="form.city" />
					</UFormField>
					<UFormField label="Postal code" name="postal_code">
						<UInput v-model="form.postal_code" />
					</UFormField>
					<UFormField label="Country" name="country">
						<UInput v-model="form.country" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Bank details
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Printed on invoice PDFs.
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Bank name" name="bank_name">
						<UInput v-model="form.bank_name" />
					</UFormField>
					<UFormField label="Branch" name="bank_branch">
						<UInput v-model="form.bank_branch" />
					</UFormField>
					<UFormField label="Account name" name="bank_account_name">
						<UInput v-model="form.bank_account_name" />
					</UFormField>
					<UFormField label="Account number" name="bank_account_number">
						<UInput v-model="form.bank_account_number" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Defaults
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<UFormField label="Default VAT rate (%)" name="default_vat_rate">
						<UInput v-model="vatRatePct" type="number" :step="0.01" :min="0" :max="100" />
					</UFormField>
					<UFormField label="Payment terms (days)" name="default_payment_terms_days">
						<UInput v-model="form.default_payment_terms_days" type="number" :min="0" :max="365" />
					</UFormField>
					<UFormField label="Quote validity (days)" name="default_quote_validity_days">
						<UInput v-model="form.default_quote_validity_days" type="number" :min="0" :max="365" />
					</UFormField>
					<UFormField label="Fiscal year starts" name="fiscal_year_start_month" class="md:col-span-3">
						<USelect v-model="form.fiscal_year_start_month" :items="months" value-key="value" class="md:w-1/3" />
						<template #help>
							Sri Lanka government FY runs April → March (set to April).
						</template>
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Footer notes
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Shown at the bottom of generated PDFs.
					</div>
				</template>
				<div class="grid grid-cols-1 gap-4">
					<UFormField label="Invoice footer" name="invoice_footer_notes">
						<UTextarea v-model="form.invoice_footer_notes" :rows="3" />
					</UFormField>
					<UFormField label="Quote footer" name="quote_footer_notes">
						<UTextarea v-model="form.quote_footer_notes" :rows="3" />
					</UFormField>
				</div>
			</UCard>

			<div class="flex justify-end gap-2 pt-2">
				<UButton type="submit" :loading="store.saving" icon="i-lucide-save">
					Save changes
				</UButton>
			</div>
		</UForm>
	</div>
</template>

<script setup lang="ts">
	import type { SettingsUpdate } from "~/stores/settings";
	import { appDataDir, join } from "@tauri-apps/api/path";
	import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
	import { z } from "zod";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "Company details" });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Appearance settings (ui_font, theme_color) live on a sibling page, so
	// we exclude them from this form to avoid stamping them back on save.
	type CompanyForm = Omit<SettingsUpdate, "ui_font" | "theme_color">;

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
		bank_name: "",
		bank_account_name: "",
		bank_account_number: "",
		bank_branch: "",
		logo_path: null,
		default_vat_rate: 1800,
		default_payment_terms_days: 30,
		default_quote_validity_days: 30,
		invoice_footer_notes: "",
		quote_footer_notes: "",
		fiscal_year_start_month: 1
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
		form.bank_name = s.bank_name ?? "";
		form.bank_account_name = s.bank_account_name ?? "";
		form.bank_account_number = s.bank_account_number ?? "";
		form.bank_branch = s.bank_branch ?? "";
		form.logo_path = s.logo_path;
		form.default_vat_rate = s.default_vat_rate;
		form.default_payment_terms_days = s.default_payment_terms_days;
		form.default_quote_validity_days = s.default_quote_validity_days;
		form.invoice_footer_notes = s.invoice_footer_notes ?? "";
		form.quote_footer_notes = s.quote_footer_notes ?? "";
		form.fiscal_year_start_month = s.fiscal_year_start_month;
		vatRatePct.value = s.default_vat_rate / 100;
	};

	await store.ensureLoaded();
	hydrate();

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

	// Use an HTML <input type="file"> rather than the Tauri dialog plugin: it
	// gives us the raw File bytes directly via FileReader, so we never need
	// fs-read capability on the user's arbitrary source path. We only write
	// into the app data dir, which IS in the allowed scope.
	const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
	const pickLogo = () => fileInput.value?.click();

	const onFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ""; // allow re-picking the same file
		if (!file) return;

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

	const removeLogo = async () => {
		await store.save({ logo_path: null });
		form.logo_path = null;
		if (tenants.activeTenantId) {
			await tenants.setLogoFile(tenants.activeTenantId, null);
		}
		toast.add({ title: "Logo removed", color: "info", icon: "i-lucide-image-off" });
	};
</script>
