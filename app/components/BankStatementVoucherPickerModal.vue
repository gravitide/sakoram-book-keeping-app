<template>
	<UModal v-model:open="openModel" title="Pick a voucher to link" :ui="{ content: 'max-w-2xl' }">
		<template #body>
			<div class="space-y-3">
				<p v-if="row" class="text-sm text-(--ui-text-muted)">
					Linking statement row from <strong>{{ row.statement_date }}</strong>,
					amount <strong class="tabular-nums" :class="row.amount_cents > 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'">
						{{ row.amount_cents > 0 ? "+" : "−" }}{{ formatLKR(Math.abs(row.amount_cents)) }}
					</strong>.
				</p>

				<UInput v-model="search" placeholder="Search by number, description, reference…" icon="i-lucide-search" class="w-full" />

				<div class="max-h-96 overflow-y-auto rounded-lg border border-(--ui-border) divide-y divide-(--ui-border)/60">
					<button
						v-for="v in candidates"
						:key="v.id"
						type="button"
						class="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-(--ui-bg-muted) cursor-pointer text-sm"
						@click="pick(v.id)"
					>
						<div class="min-w-0">
							<div class="font-mono text-xs">
								{{ v.number }}
							</div>
							<div class="text-(--ui-text-muted) truncate">
								{{ v.description || "—" }}
							</div>
						</div>
						<div class="text-(--ui-text-muted) text-xs whitespace-nowrap">
							{{ v.voucher_date }}
						</div>
						<div class="tabular-nums font-medium" :class="v.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'">
							{{ v.voucher_type === "receipt" ? "+" : "−" }}{{ formatLKR(v.amount_cents) }}
						</div>
					</button>
					<div v-if="candidates.length === 0" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">
						No matching vouchers.
					</div>
				</div>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end w-full">
				<UButton color="neutral" variant="ghost" @click="openModel = false">
					Cancel
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import { formatLKR } from "~/lib/money";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		bankId: number | null
		rowId: number | null
	}>();
	const emit = defineEmits<{
		picked: [rowId: number, voucherId: number]
	}>();

	const openModel = defineModel<boolean>("open", { default: false });

	const vouchers = useVouchersStore();
	const store = useBankStatementsStore();

	const search = ref("");

	const row = computed(() =>
		props.rowId === null ? null : store.rows.find((r) => r.id === props.rowId)
	);

	const candidates = computed(() => {
		if (props.bankId === null) return [];
		const q = search.value.trim().toLowerCase();
		let list = vouchers.vouchers.filter(
			(v) => v.business_bank_id === props.bankId && v.reconciled_at === null
		);
		// If the row's amount + sign are known, prefer those candidates first.
		if (row.value) {
			const wantType = row.value.amount_cents > 0 ? "receipt" : "payment";
			const wantAmount = Math.abs(row.value.amount_cents);
			list = list.sort((a, b) => {
				const aMatch = a.voucher_type === wantType && a.amount_cents === wantAmount ? 0 : 1;
				const bMatch = b.voucher_type === wantType && b.amount_cents === wantAmount ? 0 : 1;
				if (aMatch !== bMatch) return aMatch - bMatch;
				return b.voucher_date.localeCompare(a.voucher_date);
			});
		}
		if (q) {
			list = list.filter((v) =>
				v.number.toLowerCase().includes(q)
				|| (v.description ?? "").toLowerCase().includes(q)
				|| (v.reference ?? "").toLowerCase().includes(q)
			);
		}
		return list.slice(0, 100);
	});

	const pick = (voucherId: number) => {
		if (props.rowId === null) return;
		emit("picked", props.rowId, voucherId);
	};

	watch(openModel, (open) => {
		if (open) search.value = "";
	});
</script>
