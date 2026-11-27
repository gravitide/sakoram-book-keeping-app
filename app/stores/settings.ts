// Singleton settings store. The DB row is unique (id=1) and seeded by the
// initial migration, so every operation here is a load-or-update.

import { convertFileSrc } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, selectOne } from "~/lib/db";
import { createLoadOnce } from "~/lib/load-once";
import { isBuiltinCurrency, registerCurrency, setActiveCurrency } from "~/lib/money";

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
	logo_path: string | null
	default_vat_rate: number
	default_payment_terms_days: number
	default_quote_validity_days: number
	invoice_footer_notes: string | null
	quote_footer_notes: string | null
	// Per-business default "Prepared by" seeded onto new quotes / invoices
	// (migration 0038). Editable per-document afterwards.
	default_prepared_by: string | null
	fiscal_year_start_month: number
	currency_code: string
	// Set only when currency_code isn't a built-in (CURRENCIES map). The
	// settings store registers this as the active CurrencyMeta on load,
	// so formatMoney() / formatLKR() work for any user-entered code.
	currency_symbol_override: string | null
	ui_font: string
	pdf_font: string
	// The Layout every doc-family PDF uses (quote / invoice / bill / payslip):
	// classic | modern | minimal | compact (migration 0055 — it replaced the
	// old pdf_template, whose "letterhead" became Classic + Pre-printed paper).
	// See app/lib/pdf-layouts.ts; unknown values fall back to "classic" in
	// both the JS resolver and the Rust registry.
	pdf_layout: string
	// The page design (migration 0057): safe area + canvas items, JSON parsed
	// by app/lib/page-design.ts. NULL = never chosen — renders the Classic
	// starter template (page-settings.ts effectiveDesign).
	pdf_design: string | null
	// Paper size (migration 0054): the sheet every PDF of the business is laid
	// out on — a4 | a5 | us-letter | us-legal (the Typst paper names). Unknown
	// values fall back to a4. See app/lib/page-settings.ts.
	pdf_paper_size: string
	theme_color: string
	// PDF accent colour — split from the UI theme_color (migration 0039) so a
	// business can run a different colour on its generated PDFs than in the
	// app. A name from the THEME_COLORS palette; NULL falls back to
	// theme_color in the PDF builders (see app/lib/theme.ts pdfThemeHex).
	pdf_theme_color: string | null
	// Payroll cycle template — day-of-month integers (1..31). Clamped at
	// runtime to the actual length of the target month, so 31 means
	// "last day of whatever month this is" (Feb → 28/29, Apr → 30…).
	// Resolution lives in app/lib/payroll-cycle.ts.
	payroll_period_start_day: number
	payroll_period_end_day: number
	payroll_pay_day: number
	// Statutory auto-compute (EPF + ETF). Rates are basis points
	// (8% = 800). statutory_auto_compute is the master toggle that seeds
	// each new payslip's statutory_enabled. See app/lib/statutory.ts.
	statutory_auto_compute: number
	epf_employee_rate_bp: number
	epf_employer_rate_bp: number
	etf_rate_bp: number
	// PAYE / APIT (monthly tax-table). paye_brackets is a JSON array of
	// { upToCents: number|null, rateBp } — taxable-income bands. See
	// app/lib/statutory.ts computePaye. Master toggle defaults off.
	paye_auto_compute: number
	paye_relief_cents: number
	paye_deduct_epf: number
	paye_brackets: string
	// PDF owner-password protection. `pdf_protect_password` is the owner
	// password (null/empty = protection off). The five flags are per-type
	// opt-ins, stored as 0/1 INTEGERs. A document is encrypted only when
	// its flag is 1 AND a password is set. See app/lib/pdf.ts.
	pdf_protect_password: string | null
	pdf_protect_quote: number
	pdf_protect_invoice: number
	pdf_protect_bill: number
	pdf_protect_voucher: number
	pdf_protect_payslip: number
	// Opt-in sign-off block on the payslip PDF ("Authorised by" / "Received
	// by (employee)"). 0/1, defaults 0. Read by app/lib/payslip-pdf.ts and
	// rendered by src-tauri/templates/payslip.typ.
	payslip_show_signatures: number
	// Square identity-logo crop rect (migration 0053): JSON {x,y,w,h} in
	// source px; null for SVG or a logo uploaded before the cropper.
	logo_crop: string | null
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
	"logo_path",
	"default_vat_rate",
	"default_payment_terms_days",
	"default_quote_validity_days",
	"invoice_footer_notes",
	"quote_footer_notes",
	"default_prepared_by",
	"fiscal_year_start_month",
	"currency_code",
	"currency_symbol_override",
	"ui_font",
	"pdf_font",
	"pdf_layout",
	"pdf_design",
	"pdf_paper_size",
	"theme_color",
	"pdf_theme_color",
	"payroll_period_start_day",
	"payroll_period_end_day",
	"payroll_pay_day",
	"statutory_auto_compute",
	"epf_employee_rate_bp",
	"epf_employer_rate_bp",
	"etf_rate_bp",
	"paye_auto_compute",
	"paye_relief_cents",
	"paye_deduct_epf",
	"paye_brackets",
	"pdf_protect_password",
	"pdf_protect_quote",
	"pdf_protect_invoice",
	"pdf_protect_bill",
	"pdf_protect_voucher",
	"pdf_protect_payslip",
	"payslip_show_signatures",
	"logo_crop"
];

export const useSettingsStore = defineStore("settings", () => {
	const settings = ref<CompanySettingsRow | null>(null);
	const loading = ref(false);
	const saving = ref(false);
	const error = ref<string | null>(null);

	const businessName = computed(() => settings.value?.business_name ?? "Sakoram");

	// Webview-safe URL for the (square) identity logo used in the sidebar
	// + tenant switcher + company-settings hero. Null if no logo is set.
	// Cache-bust asset URLs for logos. Both logos are written to a stable
	// per-tenant path (logos/{id}.{ext} / pdf-headers/{id}.{ext}), so replacing
	// an image with one of the SAME extension yields an identical asset:// URL
	// and the webview keeps serving the cached old bytes — the preview looks
	// like the upload "didn't take". `updated_at` is bumped by save() on every
	// write (including a logo upload), so appending it as a query changes the
	// URL and forces a re-fetch. The asset protocol resolves the file from the
	// path and ignores the query string.
	const bustCache = (url: string): string => {
		const v = settings.value?.updated_at;
		return v ? `${url}?v=${encodeURIComponent(v)}` : url;
	};

	const logoSrc = computed(() => {
		const p = settings.value?.logo_path;
		if (!p) return null;
		try {
			return bustCache(convertFileSrc(p));
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
			// Mirror the chosen currency into the formatMoney() module cache
			// so list pages, dashboards, and PDFs all render with the right
			// symbol without each callsite having to thread it through.
			//
			// For codes not in the built-in CURRENCIES map (user picked
			// "Custom currency…"), register the supplied symbol first so
			// setActiveCurrency below finds a real entry instead of
			// silently falling back to LKR. Label defaults to the code
			// itself; locale defaults to en-US — only affects grouping
			// separators, which is a reasonable starting point for
			// anything we don't recognise.
			if (row?.currency_code) {
				if (!isBuiltinCurrency(row.currency_code)) {
					const symbol = row.currency_symbol_override?.trim() || row.currency_code;
					registerCurrency({
						code: row.currency_code,
						label: row.currency_code,
						symbol,
						locale: "en-US"
					});
				}
				setActiveCurrency(row.currency_code);
			}
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// createLoadOnce, not `if (!loaded && !loading) await load()` — that form
	// let a second concurrent caller return while settings was still null.
	const ensureLoaded = createLoadOnce(load, () => settings.value !== null);

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
