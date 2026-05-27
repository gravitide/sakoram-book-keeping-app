<template>
	<UModal v-model:open="openModel" :title="modalTitle">
		<template #body>
			<div class="space-y-4">
				<!-- Intro copy + the pending list are hidden mid-generation
					so the modal doesn't flicker between "Nothing pending"
					(pending list re-computes to 0 as each generation
					advances its template's next_issue_date) and the
					progress card. While running we show only the
					progress card — clean focus state. -->
				<template v-if="!running">
					<p class="text-sm text-(--ui-text-muted)">
						Each selected template becomes a <strong>draft invoice</strong> in your invoices list. The template's
						<span class="font-mono text-xs">next issue date</span> advances by one cycle.
						Drafts must still be reviewed and marked sent — they aren't auto-issued.
					</p>

					<!-- Flex column centers the icon over the text. `mx-auto`
						alone doesn't center UIcon because it renders as
						inline-block — flex parent fixes that without
						touching the icon's own classes. -->
					<div v-if="pending.length === 0" class="py-6 flex flex-col items-center gap-2 text-sm text-(--ui-text-muted)">
						<UIcon name="i-lucide-check-circle-2" class="size-8 opacity-60" />
						<span>Nothing pending right now.</span>
					</div>

					<div v-else class="rounded-lg border border-(--ui-border) overflow-hidden">
						<!-- Select-all header. Click toggles every checkbox. -->
						<div class="px-3 py-2 bg-(--ui-bg-muted) border-b border-(--ui-border) text-xs flex items-center gap-2 select-none">
							<UCheckbox v-model="allSelected" :indeterminate="someButNotAllSelected" @change="toggleAll" />
							<span class="font-medium uppercase tracking-wider text-(--ui-text-muted)">
								{{ selectedIds.size }} of {{ pending.length }} selected
							</span>
						</div>
						<div class="max-h-96 overflow-y-auto">
							<label
								v-for="t in pending"
								:key="t.id"
								class="flex items-start gap-3 px-3 py-2.5 border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer select-none"
							>
								<UCheckbox
									:model-value="selectedIds.has(t.id)"
									class="mt-0.5"
									@update:model-value="toggleOne(t.id, $event)"
								/>
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">
										{{ t.template_name }}
									</div>
									<div class="text-xs text-(--ui-text-muted) truncate">
										{{ t.client_name || "—" }} · {{ FREQUENCY_LABEL[t.frequency] }} · next: {{ t.next_issue_date }}
									</div>
								</div>
							</label>
						</div>
					</div>
				</template>

				<!-- Progress indicator while we iterate generation. Lives
					outside the !running guard so it can replace the
					list cleanly. -->
				<div v-if="running" class="rounded-lg border border-(--ui-primary)/40 bg-(--ui-primary)/5 px-3 py-2.5 text-sm flex items-center gap-2">
					<UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-(--ui-primary)" />
					<span>Generating {{ progress.current }} of {{ progress.total }}…</span>
				</div>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="running" @click="cancel">
					Cancel
				</UButton>
				<UButton
					:loading="running"
					:disabled="selectedIds.size === 0 || running"
					icon="i-lucide-play"
					@click="run"
				>
					Generate {{ selectedIds.size }} draft{{ selectedIds.size === 1 ? '' : 's' }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Bulk-generate pending recurring invoices. Lists every template
// where (is_paused=0 AND next_issue_date <= today AND within
// end_date), pre-selects them all, and iterates `generateOne` on
// confirm.
//
// Each generated invoice is a DRAFT — the user must still review +
// mark sent on /invoices. That's the safety net for one-off
// corrections (rate change, special discount, off-month adjustment).

	import type { RecurringFrequency, RecurringInvoiceRow } from "~/stores/recurring_invoices";
	import { useRecurringInvoicesStore } from "~/stores/recurring_invoices";

	const openModel = defineModel<boolean>("open", { default: false });

	const toast = useToast();
	const store = useRecurringInvoicesStore();

	const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
		weekly: "Weekly",
		monthly: "Monthly",
		quarterly: "Quarterly",
		yearly: "Yearly"
	};

	const pending = computed<RecurringInvoiceRow[]>(() => store.pendingTemplates);

	const running = ref(false);
	const progress = ref<{ current: number, total: number }>({ current: 0, total: 0 });

	// Title flips to a "Generating…" state while the iterator runs so
	// the header doesn't read "Generate 0 pending invoices" (the
	// pending list re-computes to 0 as each generation advances its
	// template's next_issue_date out of the pending window).
	const modalTitle = computed(() => {
		if (running.value) {
			return `Generating ${progress.value.current} of ${progress.value.total}…`;
		}
		const n = pending.value.length;
		return `Generate ${n} pending ${n === 1 ? "invoice" : "invoices"}`;
	});

	// Selected ids — a Set so toggling per-row is O(1) and the
	// select-all toggle just swaps the whole set.
	const selectedIds = ref<Set<number>>(new Set());

	const allSelected = computed(() =>
		pending.value.length > 0 && selectedIds.value.size === pending.value.length
	);
	const someButNotAllSelected = computed(() =>
		selectedIds.value.size > 0 && selectedIds.value.size < pending.value.length
	);

	const toggleAll = () => {
		if (allSelected.value) {
			selectedIds.value = new Set();
		} else {
			selectedIds.value = new Set(pending.value.map((t) => t.id));
		}
	};
	const toggleOne = (id: number, checked: boolean) => {
		const next = new Set(selectedIds.value);
		if (checked) next.add(id);
		else next.delete(id);
		selectedIds.value = next;
	};

	// Pre-select every pending row whenever the modal opens (or the
	// pending set changes while it's open). Mirrors industry tools —
	// the user can untick individual rows but the default action is
	// "generate everything that's due".
	watch(openModel, (open) => {
		if (open) {
			selectedIds.value = new Set(pending.value.map((t) => t.id));
			running.value = false;
			progress.value = { current: 0, total: 0 };
		}
	});

	const cancel = () => {
		if (running.value) return;
		openModel.value = false;
	};

	const run = async () => {
		if (selectedIds.value.size === 0) return;
		const ids = Array.from(selectedIds.value);
		running.value = true;
		progress.value = { current: 0, total: ids.length };
		let ok = 0;
		const failures: string[] = [];
		for (const id of ids) {
			progress.value = { current: ok + failures.length + 1, total: ids.length };
			try {
				await store.generateOne(id);
				ok += 1;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				const t = pending.value.find((p) => p.id === id);
				failures.push(`${t?.template_name ?? `#${id}`}: ${msg}`);
			}
		}
		running.value = false;
		openModel.value = false;

		if (failures.length === 0) {
			toast.add({
				title: `Generated ${ok} draft invoice${ok === 1 ? "" : "s"}`,
				description: "Review them on the invoices list before marking sent.",
				color: "success",
				icon: "i-lucide-check"
			});
		} else if (ok === 0) {
			toast.add({
				title: "Could not generate any invoices",
				description: failures.join("\n"),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} else {
			toast.add({
				title: `Generated ${ok}, ${failures.length} failed`,
				description: failures.join("\n"),
				color: "warning",
				icon: "i-lucide-circle-alert"
			});
		}
	};
</script>
