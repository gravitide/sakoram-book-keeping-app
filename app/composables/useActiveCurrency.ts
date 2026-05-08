// Reactive view of the active business's currency. UI components that need
// to render the symbol/code in templates (MoneyInput's prefix, payment
// recorder header, voucher headline) read this so a settings change updates
// the UI without a reload.
//
// The non-reactive side — formatMoney() in lib/money.ts — uses a
// module-level cache that the settings store keeps in sync via
// setActiveCurrency(). This composable just bridges that cache into Vue's
// reactivity by reading from the settings store directly.

import type { CurrencyMeta } from "~/lib/money";
import { computed } from "vue";
import { CURRENCIES } from "~/lib/money";
import { useSettingsStore } from "~/stores/settings";

export const useActiveCurrency = () => {
	const settings = useSettingsStore();
	return computed<CurrencyMeta>(() => {
		const code = settings.settings?.currency_code ?? "LKR";
		return CURRENCIES[code] ?? CURRENCIES.LKR!;
	});
};
