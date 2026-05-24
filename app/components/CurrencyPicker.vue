<template>
	<div class="space-y-3">
		<USelect
			v-model="dropdownValue"
			:items="dropdownOptions"
			value-key="value"
			class="w-full"
		/>

		<!-- Custom-currency inputs. Inline (not a modal) so the user sees
			what they're configuring without leaving the form. Visible
			whenever the user picked "Custom currency…" or arrived on the
			page with a code that isn't in the built-in list. -->
		<div v-if="isCustom" class="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3">
			<UFormField label="Code" hint="ISO 4217 short code (e.g. NZD, ZAR, JPY).">
				<UInput
					v-model="customCode"
					placeholder="NZD"
					:maxlength="6"
					class="uppercase"
				/>
			</UFormField>
			<UFormField label="Symbol" hint="Printed before every amount.">
				<UInput v-model="customSymbol" placeholder="NZ$" :maxlength="6" />
			</UFormField>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { CURRENCIES, isBuiltinCurrency } from "~/lib/money";

	// Currency picker that supports both the curated CURRENCIES list and a
	// per-business custom entry (free-text code + symbol). The picker is
	// the only place that knows the picker-specific "__custom" sentinel —
	// the parent form just binds `code` (string) and `symbolOverride`
	// (string | null) v-models.
	//
	// On load:
	//   - If `code` is a built-in currency → dropdown selects it, custom
	//     inputs hidden.
	//   - If `code` isn't built-in → dropdown selects "Custom currency…",
	//     custom inputs reveal pre-filled from `code` + `symbolOverride`.
	//
	// On save (parent reads emitted values):
	//   - Built-in pick → `code` = chosen code, `symbolOverride` = null.
	//   - Custom pick → `code` = uppercase of customCode, `symbolOverride`
	//     = customSymbol (trim left to caller).

	interface Props {
		code: string
		symbolOverride: string | null
	}
	const props = defineProps<Props>();
	const emit = defineEmits<{
		"update:code": [v: string]
		"update:symbolOverride": [v: string | null]
	}>();

	const CUSTOM_SENTINEL = "__custom";

	// Internal state. Initialised from props once; afterwards mutations
	// are pushed back to the parent via the emit/watch loop below.
	const isCustom = ref(!isBuiltinCurrency(props.code));
	const dropdownValue = ref<string>(isCustom.value ? CUSTOM_SENTINEL : props.code);
	const customCode = ref<string>(isCustom.value ? props.code : "");
	const customSymbol = ref<string>(props.symbolOverride ?? "");

	const dropdownOptions = computed(() => {
		const items: { label: string, value: string }[] = Object.values(CURRENCIES)
			.filter((c) => isBuiltinCurrency(c.code))
			.map((c) => ({ label: `${c.code} — ${c.label}`, value: c.code }));
		items.push({ label: "Custom currency…", value: CUSTOM_SENTINEL });
		return items;
	});

	// When the user picks something from the dropdown:
	//   - A built-in code → exit custom mode, emit code, clear symbol override
	//   - "Custom currency…" sentinel → enter custom mode, seed customCode
	//     from the previous code if it's not built-in, otherwise blank
	watch(dropdownValue, (next) => {
		if (next === CUSTOM_SENTINEL) {
			isCustom.value = true;
			if (!customCode.value) {
				customCode.value = isBuiltinCurrency(props.code) ? "" : props.code;
			}
			emit("update:code", customCode.value.trim().toUpperCase());
			emit("update:symbolOverride", customSymbol.value.trim() || null);
		} else {
			isCustom.value = false;
			emit("update:code", next);
			emit("update:symbolOverride", null);
		}
	});

	// While in custom mode, push code/symbol edits straight to the parent.
	watch([customCode, customSymbol], () => {
		if (!isCustom.value) return;
		emit("update:code", customCode.value.trim().toUpperCase());
		emit("update:symbolOverride", customSymbol.value.trim() || null);
	});
</script>
