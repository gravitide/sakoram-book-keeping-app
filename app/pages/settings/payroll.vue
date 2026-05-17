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
			<UCard>
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
						hint="When the pay period begins (e.g. 1st of the month)."
						:show-last-day-toggle="false"
					/>
					<DayOfMonthField
						v-model="periodEnd"
						label="Period end day"
						hint="When the pay period ends. If smaller than the start day, the period straddles two months (e.g. 26 → 25)."
					/>
					<DayOfMonthField
						v-model="payDay"
						label="Pay date"
						hint="When salaries are paid out. Used for voucher dates on auto-paid payslips."
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
		</div>
	</div>
</template>

<script setup lang="ts">
	import { formatMonthLabel, resolvePayrollCycle } from "~/lib/payroll-cycle";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Payroll" });

	const store = useSettingsStore();
	const toast = useToast();

	await store.ensureLoaded();

	const periodStart = ref<number>(store.settings?.payroll_period_start_day ?? 1);
	const periodEnd = ref<number>(store.settings?.payroll_period_end_day ?? 31);
	const payDay = ref<number>(store.settings?.payroll_pay_day ?? 31);

	const initial = ref({
		start: periodStart.value,
		end: periodEnd.value,
		pay: payDay.value
	});

	const dirty = computed(() =>
		periodStart.value !== initial.value.start
		|| periodEnd.value !== initial.value.end
		|| payDay.value !== initial.value.pay
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
				payroll_pay_day: payDay.value
			});
			initial.value = {
				start: periodStart.value,
				end: periodEnd.value,
				pay: payDay.value
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
	};
</script>
