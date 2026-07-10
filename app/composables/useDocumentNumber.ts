// Editable document-number state for the New* creation forms.
//
// Each new-document modal (quote / invoice / bill / payslip) and the
// /vouchers/new page lets the user override the auto-allocated sequence
// number. Default = next-available sequence for the type; override = any
// positive integer that isn't already taken in the same document table.
//
// The "why" is gap-filling. The atomic counter only ever increments; when the
// latest quote is deleted, its number becomes a dead gap that the auto-
// allocator can't reuse. This composable's editable field is the user's escape
// hatch — type the deleted number back in.
//
// Numbers are continuous per type (no fiscal year), so the issue date has NO
// effect on the number — the composable doesn't take it.
//
// Reactive contract:
//   sequence  — the integer the user picked / the auto-allocated default
//   numberFormatted — live "QUO-0003"-style preview
//   numberTaken — true if a doc of that type already uses the picked sequence
//                 (the helper text turns red)
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

export interface UseDocumentNumberOptions {
	/** Document type whose counter we're driving. */
	type: DocumentType
	/** While false, all watchers are no-ops (modal closed). */
	enabled: Ref<boolean>
}

export const useDocumentNumber = (opts: UseDocumentNumberOptions) => {
	const sequence = ref<number | null>(null);
	const numberTaken = ref(false);

	// Peek the counter on enable. Reseeds `sequence` when it's unset — the
	// open/close watcher reset()s it, so re-opening the modal always re-peeks
	// the fresh next number.
	watch(
		opts.enabled,
		async (on) => {
			if (!on) return;
			try {
				const peek = await peekNextSequence(opts.type);
				if (sequence.value === null) sequence.value = peek.sequence;
			} catch {
				// On a fresh tenant the counter table may not yet have a row
				// for this type — peekNextSequence handles that and returns 1.
				// Any other failure is silently ignored; the uniqueness check
				// below + the store's allocator catch real problems on submit.
			}
		},
		{ immediate: true }
	);

	// Live uniqueness check. Runs on every sequence keystroke — cheap
	// (one indexed SELECT on a local SQLite, single user) so no debounce.
	watch(
		[sequence, opts.enabled],
		async ([seq, on]) => {
			if (!on || seq === null || !Number.isInteger(seq) || seq < 1) {
				numberTaken.value = false;
				return;
			}
			try {
				const ok = await isDocumentNumberAvailable(opts.type, seq);
				numberTaken.value = !ok;
			} catch {
				numberTaken.value = false;
			}
		}
	);

	const numberFormatted = computed(() => {
		if (sequence.value === null) return "";
		if (!Number.isInteger(sequence.value) || sequence.value < 1) return "";
		return formatDocumentNumber(opts.type, sequence.value);
	});

	const numberValid = computed(() =>
		sequence.value !== null
		&& Number.isInteger(sequence.value)
		&& sequence.value >= 1
		&& !numberTaken.value
	);

	const reset = () => {
		sequence.value = null;
		numberTaken.value = false;
	};

	return {
		sequence,
		numberFormatted,
		numberTaken,
		numberValid,
		reset
	};
};
