<template>
	<UModal v-model:open="openModel" :title="`Import statement for ${bankName}`" :ui="{ content: 'max-w-3xl' }">
		<template #body>
			<div v-if="step === 'pick'" class="space-y-4">
				<p class="text-sm text-(--ui-text-muted)">
					Upload a CSV bank statement. After you map the columns, we'll import the rows and try to match them against existing vouchers on this bank account.
				</p>
				<UButton icon="i-lucide-file-up" :loading="reading" @click="onPickFile">
					Choose CSV file…
				</UButton>
			</div>

			<div v-else-if="step === 'map'" class="space-y-4">
				<p class="text-sm text-(--ui-text-muted)">
					<strong>{{ filename }}</strong> — {{ rawRows.length }} rows detected. Map each CSV column to its meaning, then confirm.
				</p>

				<!-- Column mapping table -->
				<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
					<table class="w-full text-sm">
						<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
							<tr>
								<th class="px-2 py-2 font-medium">
									Column
								</th>
								<th class="px-2 py-2 font-medium">
									Role
								</th>
								<th
									v-for="(_, i) in rawRows.slice(0, 3)"
									:key="i"
									class="px-2 py-2 font-medium"
								>
									Sample {{ i + 1 }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="(header, colIdx) in headers"
								:key="colIdx"
								class="border-t border-(--ui-border)"
							>
								<td class="px-2 py-2 font-mono text-xs">
									{{ header || `(col ${colIdx + 1})` }}
								</td>
								<td class="px-2 py-2">
									<USelect
										v-model="columnRoles[colIdx]"
										:items="ROLE_OPTIONS"
										value-key="value"
										class="min-w-40"
									/>
								</td>
								<td
									v-for="(row, rowIdx) in rawRows.slice(0, 3)"
									:key="rowIdx"
									class="px-2 py-2 text-(--ui-text-muted) truncate max-w-[12rem]"
								>
									{{ row[colIdx] }}
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<!-- Date format -->
				<UFormField label="Date format" help="Pick the format used in the Date column.">
					<URadioGroup
						v-model="dateFormat"
						:items="DATE_FORMAT_OPTIONS"
						value-key="value"
						orientation="horizontal"
					/>
				</UFormField>

				<!-- Parse preview / errors -->
				<UAlert
					v-if="parseError"
					color="error"
					icon="i-lucide-circle-alert"
					:title="parseError"
				/>
				<div v-else-if="parsedRows.length > 0" class="text-sm text-(--ui-text-muted)">
					<strong>{{ parsedRows.length }}</strong> rows ready to import.
				</div>
			</div>
		</template>

		<template #footer>
			<div class="flex justify-between items-center gap-2 w-full">
				<UButton
					v-if="step === 'map'"
					variant="ghost"
					color="neutral"
					@click="step = 'pick'"
				>
					Back
				</UButton>
				<div v-else />
				<div class="flex gap-2">
					<UButton color="neutral" variant="outline" :disabled="importing" @click="cancel">
						Cancel
					</UButton>
					<UButton
						v-if="step === 'map'"
						color="primary"
						icon="i-lucide-upload"
						:loading="importing"
						:disabled="!canImport"
						@click="confirmImport"
					>
						Import {{ parsedRows.length }} rows
					</UButton>
				</div>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { StatementDateFormat } from "~/lib/date-parse";
	import type { ColumnMapping } from "~/stores/bank_statements";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { readTextFile } from "@tauri-apps/plugin-fs";
	import { parseCsv } from "~/composables/useCsvParser";
	import { parseStatementDate } from "~/lib/date-parse";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useBusinessBanksStore } from "~/stores/business_banks";

	const props = defineProps<{
		bankId: number | null
	}>();
	const openModel = defineModel<boolean>("open", { default: false });

	const store = useBankStatementsStore();
	const banks = useBusinessBanksStore();
	const toast = useToast();

	const bankName = computed(() => {
		const b = banks.activeBanks.find((x) => x.id === props.bankId);
		return b ? (b.bank_name ?? b.label) : "—";
	});

	type Role = "ignore" | "date" | "description" | "amount" | "debit" | "credit" | "reference" | "balance";
	const ROLE_OPTIONS: { label: string, value: Role }[] = [
		{ label: "Ignore", value: "ignore" },
		{ label: "Date", value: "date" },
		{ label: "Description", value: "description" },
		{ label: "Amount (signed)", value: "amount" },
		{ label: "Debit (outflow)", value: "debit" },
		{ label: "Credit (inflow)", value: "credit" },
		{ label: "Reference", value: "reference" },
		{ label: "Balance", value: "balance" }
	];

	const DATE_FORMAT_OPTIONS: { label: string, value: StatementDateFormat }[] = [
		{ label: "YYYY-MM-DD", value: "YYYY-MM-DD" },
		{ label: "DD/MM/YYYY", value: "DD/MM/YYYY" },
		{ label: "DD-MM-YYYY", value: "DD-MM-YYYY" },
		{ label: "DD-MMM-YYYY", value: "DD-MMM-YYYY" }
	];

	const step = ref<"pick" | "map">("pick");
	const filename = ref("");
	const headers = ref<string[]>([]);
	const rawRows = ref<string[][]>([]);
	const columnRoles = ref<Role[]>([]);
	const dateFormat = ref<StatementDateFormat>("YYYY-MM-DD");
	const reading = ref(false);
	const importing = ref(false);

	// Reset on close. Pre-select last-used date format on open.
	watch(openModel, (open) => {
		if (!open) {
			step.value = "pick";
			filename.value = "";
			headers.value = [];
			rawRows.value = [];
			columnRoles.value = [];
			dateFormat.value = "YYYY-MM-DD";
			importing.value = false;
		} else if (props.bankId !== null) {
			const last = store.lastMappingFor(props.bankId);
			if (last) dateFormat.value = last.dateFormat;
		}
	});

	const onPickFile = async () => {
		reading.value = true;
		try {
			const picked = await openDialog({
				multiple: false,
				filters: [{ name: "CSV", extensions: ["csv", "txt"] }]
			});
			if (!picked || typeof picked !== "string") {
				reading.value = false;
				return;
			}
			const contents = await readTextFile(picked);
			const parsed = parseCsv(contents);
			if (parsed.rows.length === 0) {
				toast.add({
					title: "No data rows found",
					description: "The file appears to be empty or only contains headers.",
					color: "warning",
					icon: "i-lucide-circle-alert"
				});
				reading.value = false;
				return;
			}
			filename.value = picked.split(/[\\/]/).pop() ?? "statement.csv";
			headers.value = parsed.headers;
			rawRows.value = parsed.rows;
			// Apply last-used mapping if columns match by index, else heuristic
			const last = props.bankId !== null ? store.lastMappingFor(props.bankId) : null;
			columnRoles.value = headers.value.map((h, idx) => {
				if (last) {
					if (last.date === idx) return "date";
					if (last.description === idx) return "description";
					if (last.amount === idx) return "amount";
					if (last.debit === idx) return "debit";
					if (last.credit === idx) return "credit";
					if (last.reference === idx) return "reference";
					if (last.balance === idx) return "balance";
				}
				const lower = h.toLowerCase().trim();
				if (/date/.test(lower)) return "date";
				if (/desc|narration|particulars/.test(lower)) return "description";
				if (/amount/.test(lower)) return "amount";
				if (/debit|withdraw/.test(lower)) return "debit";
				if (/credit|deposit/.test(lower)) return "credit";
				if (/ref|cheque|txn/.test(lower)) return "reference";
				if (/balance/.test(lower)) return "balance";
				return "ignore";
			});
			step.value = "map";
		} catch (err) {
			toast.add({
				title: "Couldn't read the CSV",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			reading.value = false;
		}
	};

	const findCol = (role: Role): number => columnRoles.value.findIndex((r) => r === role);

	interface ParsedRow { dateIso: string, description: string | null, amountCents: number, reference: string | null, balanceCents: number | null }

	const parseResult = computed<{ rows: ParsedRow[], error: string | null }>(() => {
		const dateCol = findCol("date");
		const amountCol = findCol("amount");
		const debitCol = findCol("debit");
		const creditCol = findCol("credit");
		const descCol = findCol("description");
		const refCol = findCol("reference");
		const balCol = findCol("balance");

		if (dateCol === -1) {
			return { rows: [], error: "Pick a Date column." };
		}
		const hasAmount = amountCol !== -1;
		const hasDebitCredit = debitCol !== -1 && creditCol !== -1;
		if (!hasAmount && !hasDebitCredit) {
			return { rows: [], error: "Pick either an Amount column OR both Debit + Credit columns." };
		}

		const out: ParsedRow[] = [];
		const failures: number[] = [];
		for (let i = 0; i < rawRows.value.length; i++) {
			const r = rawRows.value[i]!;
			const dateIso = parseStatementDate(r[dateCol] ?? "", dateFormat.value);
			if (!dateIso) {
				failures.push(i);
				continue;
			}

			let amountCents: number;
			if (hasAmount) {
				const raw = (r[amountCol] ?? "").replace(/[, ]/g, "");
				const n = Number.parseFloat(raw);
				if (!Number.isFinite(n)) {
					failures.push(i);
					continue;
				}
				amountCents = Math.round(n * 100);
			} else {
				const dRaw = (r[debitCol] ?? "").replace(/[, ]/g, "");
				const cRaw = (r[creditCol] ?? "").replace(/[, ]/g, "");
				const dN = dRaw ? Number.parseFloat(dRaw) : 0;
				const cN = cRaw ? Number.parseFloat(cRaw) : 0;
				if (!Number.isFinite(dN) || !Number.isFinite(cN)) {
					failures.push(i);
					continue;
				}
				amountCents = Math.round((cN - dN) * 100);
			}

			const description = descCol !== -1 ? (r[descCol] ?? "").trim() || null : null;
			const reference = refCol !== -1 ? (r[refCol] ?? "").trim() || null : null;
			const balRaw = balCol !== -1 ? (r[balCol] ?? "").replace(/[, ]/g, "") : "";
			const balN = balRaw ? Number.parseFloat(balRaw) : Number.NaN;
			const balanceCents = Number.isFinite(balN) ? Math.round(balN * 100) : null;

			out.push({ dateIso, description, amountCents, reference, balanceCents });
		}
		if (failures.length > 0) {
			const sample = failures.slice(0, 3).map((i) => i + 2).join(", ");
			const error = `Couldn't parse ${failures.length} row${failures.length === 1 ? "" : "s"} (e.g. CSV line${failures.length === 1 ? "" : "s"} ${sample}). Check your column mapping.`;
			return { rows: out, error };
		}
		return { rows: out, error: null };
	});

	const parsedRows = computed(() => parseResult.value.rows);
	const parseError = computed(() => parseResult.value.error);

	const canImport = computed(() => parsedRows.value.length > 0 && parseError.value === null);

	const confirmImport = async () => {
		if (!props.bankId || !canImport.value) return;
		importing.value = true;
		try {
			const mapping: ColumnMapping = {
				date: findCol("date"),
				description: findCol("description"),
				amount: findCol("amount"),
				debit: findCol("debit"),
				credit: findCol("credit"),
				reference: findCol("reference"),
				balance: findCol("balance"),
				dateFormat: dateFormat.value
			};
			const { inserted, skipped } = await store.importCsv({
				bankId: props.bankId,
				filename: filename.value,
				columnMapping: mapping,
				rows: parsedRows.value
			});
			toast.add({
				title: `Imported ${inserted} row${inserted === 1 ? "" : "s"}`,
				description: skipped > 0 ? `${skipped} skipped (already imported)` : undefined,
				color: "success",
				icon: "i-lucide-check"
			});
			openModel.value = false;
		} catch (err) {
			toast.add({
				title: "Import failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			importing.value = false;
		}
	};

	const cancel = () => {
		if (importing.value) return;
		openModel.value = false;
	};
</script>
