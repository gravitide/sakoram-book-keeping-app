// Debounced, latest-wins async runs: `schedule(input)` waits until the
// changes stop for `delayMs`, then runs; only the NEWEST run's outcome is
// delivered, so a slow render that finishes after a later one can never paint
// over it. Used by the live page preview on /settings/pdf (one Typst render
// per pause in editing). Pure — no Vue, no Tauri — so vitest drives it with
// fake timers.

export interface LatestDebouncedOptions<I, R> {
	delayMs: number
	run: (input: I) => Promise<R>
	onResult: (result: R) => void
	onError?: (error: unknown) => void
	/** true from the first change until the newest run settles (or cancel). */
	onBusy?: (busy: boolean) => void
}

export interface LatestDebounced<I> {
	/** Run with `input` once changes have stopped for the delay. */
	schedule: (input: I) => void
	/** Run with `input` straight away. */
	runNow: (input: I) => void
	/** Drop the pending run and ignore any run still in flight. */
	cancel: () => void
}

export function createLatestDebounced<I, R>(opts: LatestDebouncedOptions<I, R>): LatestDebounced<I> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let generation = 0;
	let busy = false;
	const setBusy = (next: boolean) => {
		if (busy === next) return;
		busy = next;
		opts.onBusy?.(next);
	};
	const clearTimer = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};

	const start = (input: I) => {
		timer = null;
		const mine = ++generation;
		opts.run(input).then(
			(result) => {
				if (mine !== generation) return;
				setBusy(false);
				opts.onResult(result);
			},
			(error: unknown) => {
				if (mine !== generation) return;
				setBusy(false);
				opts.onError?.(error);
			}
		);
	};

	return {
		schedule(input) {
			clearTimer();
			setBusy(true);
			timer = setTimeout(() => start(input), opts.delayMs);
		},
		runNow(input) {
			clearTimer();
			setBusy(true);
			start(input);
		},
		cancel() {
			clearTimer();
			generation++;
			setBusy(false);
		}
	};
}
