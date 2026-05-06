// Singleton settings store. The DB row is unique (id=1) and seeded by the
// initial migration, so every operation here is a load-or-update.

import { convertFileSrc } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, selectOne } from "~/lib/db";

export interface CompanySettingsRow {
	id: number
	business_name: string
	address_line1: string | null
	address_line2: string | null
	city: string | null
	postal_code: string | null
	country: string | null
	tax_id: string | null
	email: string | null
	phone: string | null
	website: string | null
	bank_name: string | null
	bank_account_name: string | null
	bank_account_number: string | null
	bank_branch: string | null
	logo_path: string | null
	default_vat_rate: number
	default_payment_terms_days: number
	default_quote_validity_days: number
	invoice_footer_notes: string | null
	quote_footer_notes: string | null
	fiscal_year_start_month: number
	ui_font: string
	theme_color: string
	updated_at: string
}

export type SettingsUpdate = Omit<CompanySettingsRow, "id" | "updated_at">;

const UPDATABLE_COLUMNS: ReadonlyArray<keyof SettingsUpdate> = [
	"business_name",
	"address_line1",
	"address_line2",
	"city",
	"postal_code",
	"country",
	"tax_id",
	"email",
	"phone",
	"website",
	"bank_name",
	"bank_account_name",
	"bank_account_number",
	"bank_branch",
	"logo_path",
	"default_vat_rate",
	"default_payment_terms_days",
	"default_quote_validity_days",
	"invoice_footer_notes",
	"quote_footer_notes",
	"fiscal_year_start_month",
	"ui_font",
	"theme_color"
];

export const useSettingsStore = defineStore("settings", () => {
	const settings = ref<CompanySettingsRow | null>(null);
	const loading = ref(false);
	const saving = ref(false);
	const error = ref<string | null>(null);

	const businessName = computed(() => settings.value?.business_name ?? "Sakoram");

	// Webview-safe URL for the logo file, or null if there is no logo.
	const logoSrc = computed(() => {
		const p = settings.value?.logo_path;
		if (!p) return null;
		try {
			return convertFileSrc(p);
		} catch {
			return null;
		}
	});

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			const row = await selectOne<CompanySettingsRow>(
				"SELECT * FROM company_settings WHERE id = 1"
			);
			settings.value = row;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const ensureLoaded = async () => {
		if (settings.value === null && !loading.value) await load();
	};

	const save = async (patch: Partial<SettingsUpdate>) => {
		saving.value = true;
		error.value = null;
		try {
			// Build a parameterised UPDATE from a whitelist — never interpolate
			// column names from caller-controlled input.
			const cols = UPDATABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
			if (cols.length === 0) return;
			const setClause = cols.map((c) => `${c} = ?`).join(", ");
			const params = cols.map((c) => patch[c] as unknown);
			await execute(
				`UPDATE company_settings
				 SET ${setClause}, updated_at = datetime('now')
				 WHERE id = 1`,
				params
			);
			await load();
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			saving.value = false;
		}
	};

	return {
		settings,
		loading,
		saving,
		error,
		businessName,
		logoSrc,
		load,
		ensureLoaded,
		save
	};
});
