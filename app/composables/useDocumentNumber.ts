// Editable document-number state for the New* creation forms.
//
// Each new-document modal (quote / invoice / bill / payslip) and the
// /vouchers/new page lets the user override the auto-allocated sequence
// number. Default = next-available sequence for the fiscal year derived
// from the picked issue date; override = any positive integer that
// isn't already taken in the same document table + fiscal year.
//
// The "why" is gap-filling. The atomic counter only ever increments;
// when the latest quote is deleted, its number becomes a dead gap that
// the auto-allocator can't reuse. This composable's editable field is
// the user's escape hatch — type the deleted number back in.
//
// Reactive contract:
//   sequence  — the integer the user picked / the auto-allocated default
//   fiscalYear — recomputed whenever issueDate changes; locks the prefix
//   numberFormatted — live "QUO-2026-0003"-style preview
//   numberTaken — true if a doc in that (type, fy) already uses the
//                 picked sequence (the helper text turns red)
//   numberValid — combined gate the modal's Create button binds to
//
// Lifecycle:
//   `enabled` ref is the modal's open state. While false the watchers
//   are no-ops so a closed modal doesn't keep refetching. On the
//   open→true edge we peek the counter; the user can then edit freely.
//   reset() blanks state for the next open.

import type { Ref } from "vue";
import type { DocumentType } from "~/lib/numbering";
import {
	formatDocumentNumber,
	isDocumentNumberAvailable,
	peekNextSequence
} from "~/lib/numbering";

const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface UseDocumentNumberOptions {
	/** Document type whose counter we're driving. */
	type: DocumentType
	/** Reactive issue date (ISO YYYY-MM-DD). Drives fiscal-year. */
	issueDate: Ref<string | null | undefined>
	/** While false, all watchers are no-ops (modal closed). */
	enabled: Ref<boolean>
}

export const useDocumentNumber = (opts: UseDocumentNumberOptions) => {
	const sequence = ref<number | null>(null);
	const fiscalYear = ref<number | null>(null);
	const numberTaken = ref(false);

	// Peek the counter on enable + whenever the issue date changes.
	//
	// Reseed the suggested `sequence` when it's unset (first open — the
	// open/close watcher reset()s it) OR when the fiscal year changes. The
	// second case is the important one for BACK-DATING: numbers are scoped
	// per (type, fiscal_year), so moving the issue date into a different
	// fiscal year must re-suggest THAT year's next number — otherwise the
	// year in the preview changes but the sequence stays stuck on the old
	// year's value (which is usually already taken). Within the same fiscal
	// year we leave `sequence` alone so a manual gap-fill edit survives a
	// day-only date change.
	watch(
		[opts.enabled, opts.issueDate],
		async ([on, raw]) => {
			if (!on) return;
			const date = raw || todayISO();
			try {
				const peek = await peekNextSequence(opts.type, date);
				const fyChanged = fiscalYear.value !== null && peek.fiscalYear !== fiscalYear.value;
				fiscalYear.value = peek.fiscalYear;
				if (sequence.value === null || fyChanged) sequence.value = peek.sequence;
			} catch {
				// On a fresh tenant the counter table may not yet have a row
				// for this (type, fy) — peekNextSequence handles that and
				// returns 1. Any other failure is silently ignored here; the
				// uniqueness check below + the store's allocator will catch
				// real problems on submit.
			}
		},
		{ immediate: true }
	);

	// Live uniqueness check. Runs on every sequence keystroke — cheap
	// (one indexed SELECT on a local SQLite, single user) so no debounce.
	watch(
		[sequence, opts.issueDate, opts.enabled],
		async ([seq, raw, on]) => {
			if (!on || seq === null || !Number.isInteger(seq) || seq < 1) {
				numberTaken.value = false;
				return;
			}
			const date = raw || todayISO();
			try {
				const ok = await isDocumentNumberAvailable(opts.type, date, seq);
				numberTaken.value = !ok;
			} catch {
				numberTaken.value = false;
			}
		}
	);

	const numberFormatted = computed(() => {
		if (sequence.value === null || fiscalYear.value === null) return "";
		if (!Number.isInteger(sequence.value) || sequence.value < 1) return "";
		return formatDocumentNumber(opts.type, fiscalYear.value, sequence.value);
	});

	const numberValid = computed(() =>
		sequence.value !== null
		&& Number.isInteger(sequence.value)
		&& sequence.value >= 1
		&& !numberTaken.value
	);

	const reset = () => {
		sequence.value = null;
		fiscalYear.value = null;
		numberTaken.value = false;
	};

	return {
		sequence,
		fiscalYear,
		numberFormatted,
		numberTaken,
		numberValid,
		reset
	};
};
