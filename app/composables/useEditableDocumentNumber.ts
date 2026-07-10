// Live-editable document number for a DETAIL page (drafts only).
//
// Mirrors `useDocumentNumber` (the create-flow version) but seeds the sequence
// from the document's CURRENT number and excludes that document from the
// uniqueness check — so a draft can be renumbered in place without clashing
// with itself. The detail page binds `sequence` to a UInputNumber, shows
// `numberFormatted` / `numberTaken` as live feedback, gates its save bar on
// `numberValid`, and calls the store's `setNumber` (→ `reserveDocumentNumber`)
// when `changed` is true.

import type { Ref } from "vue";
import type { DocumentType } from "~/lib/numbering";
import { formatDocumentNumber, isDocumentNumberAvailable } from "~/lib/numbering";

// Trailing digit group as the sequence — works for both the current
// "QUO-0004" format and legacy "QUO-2025-0004" numbers (last group wins).
const seqFromNumber = (num: string | null | undefined): number | null => {
	if (!num) return null;
	const m = /(\d+)\s*$/.exec(num);
	return m ? Number(m[1]) : null;
};

export const useEditableDocumentNumber = (opts: {
	type: DocumentType
	id: number
	/** The document's stored number (reactive — re-seeds on hydrate). */
	currentNumber: Ref<string | null | undefined>
	/** While false the watchers are no-ops (issued docs / mid-hydrate). */
	enabled: Ref<boolean>
}) => {
	const sequence = ref<number | null>(seqFromNumber(opts.currentNumber.value));
	const numberTaken = ref(false);

	// Re-seed whenever the stored number changes (hydrate / reload / discard).
	watch(opts.currentNumber, (n) => {
		sequence.value = seqFromNumber(n);
	});

	// Live uniqueness check, excluding this document. Cheap indexed SELECT on a
	// local SQLite (single user) so no debounce.
	watch(
		[sequence, opts.enabled],
		async ([seq, on]) => {
			if (!on || seq === null || !Number.isInteger(seq) || seq < 1) {
				numberTaken.value = false;
				return;
			}
			try {
				numberTaken.value = !(await isDocumentNumberAvailable(opts.type, seq, opts.id));
			} catch {
				numberTaken.value = false;
			}
		},
		{ immediate: true }
	);

	const numberFormatted = computed(() =>
		sequence.value !== null && Number.isInteger(sequence.value) && sequence.value >= 1
			? formatDocumentNumber(opts.type, sequence.value)
			: ""
	);

	// Valid to save: a positive integer that isn't taken by another document.
	const numberValid = computed(() =>
		sequence.value !== null
		&& Number.isInteger(sequence.value)
		&& sequence.value >= 1
		&& !numberTaken.value
	);

	// Has the user changed the sequence from the stored number's?
	const changed = computed(() => sequence.value !== seqFromNumber(opts.currentNumber.value));

	// Re-seed from the stored number. The currentNumber watch only fires when
	// the number actually changes, so a Discard (re-hydrate to the SAME number)
	// wouldn't reset an edited sequence — the detail page calls this in hydrate.
	const reseed = () => {
		sequence.value = seqFromNumber(opts.currentNumber.value);
	};

	return { sequence, numberFormatted, numberTaken, numberValid, changed, reseed };
};
