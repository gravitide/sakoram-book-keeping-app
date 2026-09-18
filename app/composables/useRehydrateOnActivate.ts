// Re-hydrate a detail page each time it is re-shown from <NuxtPage keepalive>.
//
// WHY: detail pages are cached per id (`/payslips/12` is its own instance),
// and setup() — including the initial `await hydrate()` — runs once. Without
// this, a document changed elsewhere keeps rendering its stale cached copy:
//   - mark a payslip issued from the list row, reopen it → still DRAFT with
//     an editable form (and Save would then write over an issued document);
//   - delete a document, press the titlebar Back button → the deleted row is
//     resurrected from cache and every action on it throws raw SQL errors.
//
// Extracted from the inline block quotes/[id] + invoices/[id] already had, so
// the other detail pages get identical semantics:
//   - the first activation is skipped (setup already hydrated);
//   - unsaved edits are preserved — that is the point of keep-alive;
//   - a row that no longer exists bounces to its list with an info toast.

export interface RehydrateOptions {
	/** True while the form holds unsaved edits — re-hydrating would wipe them. */
	isDirty: () => boolean
	/** Does the underlying row still exist? (a cheap `store.get(id)`) */
	exists: () => Promise<boolean>
	/** Reload the page state from the DB. */
	rehydrate: () => Promise<void> | void
	/** Noun for the "no longer exists" toast, e.g. "payslip". */
	noun: string
	/** Where to go when the row is gone, e.g. "/payslips". */
	listRoute: string
}

export function useRehydrateOnActivate(opts: RehydrateOptions): void {
	const router = useRouter();
	const toast = useToast();
	let activatedOnce = false;

	onActivated(async () => {
		if (!activatedOnce) {
			activatedOnce = true;
			return;
		}
		if (opts.isDirty()) return;
		const stillThere = await opts.exists().catch(() => false);
		if (!stillThere) {
			toast.add({ title: `This ${opts.noun} no longer exists`, color: "info", icon: "i-lucide-info" });
			await router.replace(opts.listRoute);
			return;
		}
		await opts.rehydrate();
	});
}
