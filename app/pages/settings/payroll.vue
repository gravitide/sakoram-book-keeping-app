<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; form fields stay selectable via the input rule
			in main.css. -->
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Payroll
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				The default pay cycle. Once set, the bulk payslip flow and the
				payroll dashboard let you pick a month and have all three dates
				filled in for you.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl mx-auto">
			<UCard id="cycle" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Cycle template
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Each value is a day-of-month (1–31). Days higher than the
						target month allows are clamped automatically — so 31
						always means "the last day of whatever month this is"
						(28 / 29 in February, 30 in April).
					</div>
				</template>

				<div class="space-y-5">
					<DayOfMonthField
						v-model="periodStart"
						label="Period start day"
						help="When the pay period begins (e.g. 1st of the month)."
						:show-last-day-toggle="false"
					/>
					<DayOfMonthField
						v-model="periodEnd"
						label="Period end day"
						help="When the pay period ends. If smaller than the start day, the period straddles two months (e.g. 26 → 25)."
					/>
					<DayOfMonthField
						v-model="payDay"
						label="Pay date"
						help="When salaries are paid out. Used for voucher dates on auto-paid payslips."
					/>

					<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 text-sm">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Preview — {{ previewMonthLabel }}
						</div>
						<div class="tabular-nums">
							Period <span class="font-medium">{{ preview.periodStart }}</span>
							→ <span class="font-medium">{{ preview.periodEnd }}</span>
						</div>
						<div class="tabular-nums">
							Pay date <span class="font-medium">{{ preview.payDate }}</span>
						</div>
					</div>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="neutral" variant="outline" :disabled="!dirty || saving" @click="reset">
							Reset
						</UButton>
						<UButton :disabled="!dirty || saving" :loading="saving" @click="onSave">
							Save
						</UButton>
					</div>
				</template>
			</UCard>

			<UCard id="statutory" class="scroll-mt-6">
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Statutory contributions (EPF / ETF)
						</div>
						<USwitch v-model="statutoryOn" />
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						When on, new payslips auto-add the employee EPF deduction and
						show employer EPF + ETF contributions. Rates are percentages of
						EPF-liable earnings. Sri Lankan defaults: EPF 8% / 12%, ETF 3%.
					</div>
				</template>

				<div class="space-y-5" :class="statutoryOn ? '' : 'opacity-50 pointer-events-none'">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<UFormField label="EPF — employee" help="Deducted from net pay.">
							<UInputNumber v-model="epfEmployeePct" :min="0" :max="100" :step="0.1" />
						</UFormField>
						<UFormField label="EPF — employer" help="Business cost, not deducted.">
							<UInputNumber v-model="epfEmployerPct" :min="0" :max="100" :step="0.1" />
						</UFormField>
						<UFormField label="ETF — employer" help="Business cost, not deducted.">
							<UInputNumber v-model="etfPct" :min="0" :max="100" :step="0.1" />
						</UFormField>
					</div>

					<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 text-sm">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Preview — on {{ formatMoney(previewBase) }} liable earnings
						</div>
						<div class="tabular-nums">
							EPF employee <span class="font-medium">{{ formatMoney(previewStatutory.epfEmployeeCents) }}</span>
							· EPF employer <span class="font-medium">{{ formatMoney(previewStatutory.epfEmployerCents) }}</span>
							· ETF <span class="font-medium">{{ formatMoney(previewStatutory.etfCents) }}</span>
						</div>
					</div>
				</div>
			</UCard>

			<UCard id="paye" class="scroll-mt-6">
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							PAYE (APIT)
						</div>
						<USwitch v-model="payeOn" />
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Monthly income-tax withholding. When on, new payslips auto-add a
						PAYE deduction computed from the bracket table below. Rates change
						with the national budget — edit them here when they do.
					</div>
				</template>

				<div class="space-y-5" :class="payeOn ? '' : 'opacity-50 pointer-events-none'">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<UFormField label="Monthly tax-free relief" help="Income below this is untaxed.">
							<MoneyInput v-model="payeReliefCents" />
						</UFormField>
						<UFormField label="Deduct employee EPF first" help="Subtract the 8% EPF before taxing.">
							<UCheckbox
								:model-value="payeDeductEpf === 1"
								label="EPF reduces taxable income"
								@update:model-value="(v) => payeDeductEpf = v === true ? 1 : 0"
							/>
						</UFormField>
					</div>

					<div class="space-y-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
							Tax bands (on taxable income, after relief)
						</div>
						<div
							v-for="(band, i) in payeBands"
							:key="i"
							class="grid grid-cols-[1fr_auto_8.5rem_auto] gap-2 items-center"
						>
							<MoneyInput
								v-if="band.upToCents !== null"
								v-model="band.upToCents"
							/>
							<div v-else class="text-sm text-(--ui-text-muted) italic">
								Balance (everything above)
							</div>
							<span class="text-xs text-(--ui-text-muted)">→</span>
							<UInputNumber v-model="band.ratePct" :min="0" :max="100" :step="0.1" class="w-full" />
							<UButton
								icon="i-lucide-trash-2"
								variant="ghost"
								color="neutral"
								size="xs"
								:disabled="band.upToCents === null"
								aria-label="Remove band"
								@click="removeBand(i)"
							/>
						</div>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-plus" @click="addBand">
							Add band
						</UButton>
					</div>

					<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 space-y-2 text-sm">
						<div class="flex items-center justify-between gap-3">
							<span class="text-xs uppercase tracking-wide text-(--ui-text-muted)">Preview on gross</span>
							<div class="w-44">
								<MoneyInput v-model="payePreviewBase" />
							</div>
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							Taxable after relief: <span class="tabular-nums">{{ formatMoney(payeBreakdown.taxable) }}</span>
						</div>
						<div v-if="payeBreakdown.rows.length" class="space-y-0.5">
							<div class="grid grid-cols-[auto_1fr_auto] gap-x-4 text-xs text-(--ui-text-muted)">
								<span>Band</span>
								<span class="text-right">In band</span>
								<span class="text-right">Tax</span>
							</div>
							<div
								v-for="(r, i) in payeBreakdown.rows"
								:key="i"
								class="grid grid-cols-[auto_1fr_auto] gap-x-4 tabular-nums"
							>
								<span>{{ r.label }}</span>
								<span class="text-right">{{ formatMoney(r.sliceCents) }}</span>
								<span class="text-right">{{ formatMoney(r.taxCents) }}</span>
							</div>
						</div>
						<div v-else class="text-xs text-(--ui-text-muted) italic">
							No tax — gross is at or below the relief threshold.
						</div>
						<div class="flex items-center justify-between border-t border-(--ui-border) pt-1.5 font-medium tabular-nums">
							<span>Total PAYE</span>
							<span>{{ formatMoney(payePreview) }}</span>
						</div>
					</div>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
	import type { PayeBracket } from "~/lib/statutory";
	import { formatMoney } from "~/lib/money";
	import { formatMonthLabel, resolvePayrollCycle } from "~/lib/payroll-cycle";
	import { computePaye, computeStatutory } from "~/lib/statutory";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Payroll" });

	const store = useSettingsStore();
	const toast = useToast();

	await store.ensureLoaded();

	const periodStart = ref<number>(store.settings?.payroll_period_start_day ?? 1);
	const periodEnd = ref<number>(store.settings?.payroll_period_end_day ?? 31);
	const payDay = ref<number>(store.settings?.payroll_pay_day ?? 31);

	// Statutory config. Percentages in the UI, basis points in the DB
	// (8% <-> 800). Round on the bp boundary so 8.1% survives the trip.
	const statutoryOn = ref<boolean>((store.settings?.statutory_auto_compute ?? 1) === 1);
	const epfEmployeePct = ref<number>((store.settings?.epf_employee_rate_bp ?? 800) / 100);
	const epfEmployerPct = ref<number>((store.settings?.epf_employer_rate_bp ?? 1200) / 100);
	const etfPct = ref<number>((store.settings?.etf_rate_bp ?? 300) / 100);

	const toBp = (pct: number) => Math.round((pct || 0) * 100);

	const previewBase = 10_000_000; // Rs 100,000 in cents
	const previewStatutory = computed(() => computeStatutory(previewBase, {
		epfEmployeeBp: toBp(epfEmployeePct.value),
		epfEmployerBp: toBp(epfEmployerPct.value),
		etfBp: toBp(etfPct.value)
	}));

	// PAYE config. Bands are edited as { upToCents, ratePct }; converted to
	// basis points for storage / compute. The last band has upToCents null
	// (the open "balance" band) and is never removable.
	interface PayeBandEdit { upToCents: number | null, ratePct: number }
	const parsePayeBands = (json: string | undefined): PayeBandEdit[] => {
		try {
			const arr = JSON.parse(json ?? "[]") as PayeBracket[];
			if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
			return arr.map((b) => ({ upToCents: b.upToCents, ratePct: b.rateBp / 100 }));
		} catch {
			return [{ upToCents: null, ratePct: 0 }];
		}
	};

	const payeOn = ref<boolean>((store.settings?.paye_auto_compute ?? 0) === 1);
	const payeReliefCents = ref<number>(store.settings?.paye_relief_cents ?? 15_000_000);
	const payeDeductEpf = ref<number>(store.settings?.paye_deduct_epf ?? 1);
	const payeBands = ref<PayeBandEdit[]>(parsePayeBands(store.settings?.paye_brackets));

	const bandsToBrackets = (bands: PayeBandEdit[]): PayeBracket[] =>
		bands.map((b) => ({ upToCents: b.upToCents, rateBp: Math.round((b.ratePct || 0) * 100) }));
	const payeBracketsJson = () => JSON.stringify(bandsToBrackets(payeBands.value));

	const addBand = () => {
		// Insert a new finite band just before the open "balance" band.
		const lastFinite = payeBands.value.filter((b) => b.upToCents !== null).at(-1);
		const seed = (lastFinite?.upToCents ?? payeReliefCents.value) + 5_000_000;
		payeBands.value.splice(payeBands.value.length - 1, 0, { upToCents: seed, ratePct: 0 });
	};
	const removeBand = (i: number) => {
		if (payeBands.value[i]?.upToCents === null) return; // never remove the balance band
		payeBands.value.splice(i, 1);
	};

	const payePreviewBase = ref<number>(25_000_000); // Rs 250,000 gross
	const payePreview = computed(() => computePaye(payePreviewBase.value, {
		reliefCents: payeReliefCents.value,
		brackets: bandsToBrackets(payeBands.value)
	}));
	// Per-band breakdown for the interactive preview: how much of the
	// taxable income falls in each band and the tax on that slice. The
	// authoritative total is `payePreview` (computePaye, rounded once).
	const payeBreakdown = computed(() => {
		const brackets = bandsToBrackets(payeBands.value);
		const base = Math.max(0, Math.trunc(payePreviewBase.value));
		const taxable = Math.max(0, base - Math.max(0, payeReliefCents.value));
		const rows: { label: string, sliceCents: number, taxCents: number }[] = [];
		let prev = 0;
		for (const b of brackets) {
			if (taxable <= prev) break;
			const cap = b.upToCents == null ? taxable : Math.min(taxable, b.upToCents);
			const slice = cap - prev;
			if (slice > 0) {
				rows.push({ label: `${b.rateBp / 100}%`, sliceCents: slice, taxCents: Math.round((slice * b.rateBp) / 10000) });
			}
			prev = b.upToCents == null ? taxable : b.upToCents;
		}
		return { taxable, rows };
	});

	const initial = ref({
		start: periodStart.value,
		end: periodEnd.value,
		pay: payDay.value,
		on: statutoryOn.value,
		epfEmp: epfEmployeePct.value,
		epfEr: epfEmployerPct.value,
		etf: etfPct.value,
		payeOn: payeOn.value,
		payeRelief: payeReliefCents.value,
		payeDeductEpf: payeDeductEpf.value,
		payeBrackets: payeBracketsJson()
	});

	const dirty = computed(() =>
		periodStart.value !== initial.value.start
		|| periodEnd.value !== initial.value.end
		|| payDay.value !== initial.value.pay
		|| statutoryOn.value !== initial.value.on
		|| epfEmployeePct.value !== initial.value.epfEmp
		|| epfEmployerPct.value !== initial.value.epfEr
		|| etfPct.value !== initial.value.etf
		|| payeOn.value !== initial.value.payeOn
		|| payeReliefCents.value !== initial.value.payeRelief
		|| payeDeductEpf.value !== initial.value.payeDeductEpf
		|| payeBracketsJson() !== initial.value.payeBrackets
	);

	// Preview against today's month so the user sees concrete dates for
	// the cycle they just configured.
	const today = new Date();
	const previewYear = today.getFullYear();
	const previewMonth = today.getMonth() + 1;
	const previewMonthLabel = formatMonthLabel(previewYear, previewMonth);
	const preview = computed(() =>
		resolvePayrollCycle(previewYear, previewMonth, {
			payroll_period_start_day: periodStart.value,
			payroll_period_end_day: periodEnd.value,
			payroll_pay_day: payDay.value
		})
	);

	const saving = ref(false);
	const onSave = async () => {
		saving.value = true;
		try {
			await store.save({
				payroll_period_start_day: periodStart.value,
				payroll_period_end_day: periodEnd.value,
				payroll_pay_day: payDay.value,
				statutory_auto_compute: statutoryOn.value ? 1 : 0,
				epf_employee_rate_bp: toBp(epfEmployeePct.value),
				epf_employer_rate_bp: toBp(epfEmployerPct.value),
				etf_rate_bp: toBp(etfPct.value),
				paye_auto_compute: payeOn.value ? 1 : 0,
				paye_relief_cents: payeReliefCents.value,
				paye_deduct_epf: payeDeductEpf.value,
				paye_brackets: payeBracketsJson()
			});
			initial.value = {
				start: periodStart.value,
				end: periodEnd.value,
				pay: payDay.value,
				on: statutoryOn.value,
				epfEmp: epfEmployeePct.value,
				epfEr: epfEmployerPct.value,
				etf: etfPct.value,
				payeOn: payeOn.value,
				payeRelief: payeReliefCents.value,
				payeDeductEpf: payeDeductEpf.value,
				payeBrackets: payeBracketsJson()
			};
			toast.add({ title: "Payroll cycle saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	const reset = () => {
		periodStart.value = initial.value.start;
		periodEnd.value = initial.value.end;
		payDay.value = initial.value.pay;
		statutoryOn.value = initial.value.on;
		epfEmployeePct.value = initial.value.epfEmp;
		epfEmployerPct.value = initial.value.epfEr;
		etfPct.value = initial.value.etf;
		payeOn.value = initial.value.payeOn;
		payeReliefCents.value = initial.value.payeRelief;
		payeDeductEpf.value = initial.value.payeDeductEpf;
		payeBands.value = parsePayeBands(initial.value.payeBrackets);
	};
</script>
