// Zod schemas for things crossing the UI ↔ DB boundary. Add per-feature
// schemas here as phases land — Phase 1 only ships settings + clients.

import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const companySettingsSchema = z.object({
	business_name: z.string().min(1, "Business name is required"),
	address_line1: z.string().nullable().optional(),
	address_line2: z.string().nullable().optional(),
	city: z.string().nullable().optional(),
	postal_code: z.string().nullable().optional(),
	country: z.string().nullable().optional(),
	tax_id: z.string().nullable().optional(),
	email: z.string().email().nullable().optional().or(z.literal("")),
	phone: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	bank_name: z.string().nullable().optional(),
	bank_account_name: z.string().nullable().optional(),
	bank_account_number: z.string().nullable().optional(),
	bank_branch: z.string().nullable().optional(),
	logo_path: z.string().nullable().optional(),
	default_vat_rate: z.number().int().min(0).max(10000),
	default_payment_terms_days: z.number().int().min(0).max(365),
	default_quote_validity_days: z.number().int().min(0).max(365),
	invoice_footer_notes: z.string().nullable().optional(),
	quote_footer_notes: z.string().nullable().optional(),
	fiscal_year_start_month: z.number().int().min(1).max(12)
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const clientSchema = z.object({
	name: z.string().min(1, "Name is required"),
	contact_person: z.string().nullable().optional(),
	email: z.string().email().nullable().optional().or(z.literal("")),
	phone: z.string().nullable().optional(),
	address_line1: z.string().nullable().optional(),
	address_line2: z.string().nullable().optional(),
	city: z.string().nullable().optional(),
	postal_code: z.string().nullable().optional(),
	country: z.string().nullable().optional(),
	tax_id: z.string().nullable().optional(),
	notes: z.string().nullable().optional()
});

export type ClientInput = z.infer<typeof clientSchema>;
