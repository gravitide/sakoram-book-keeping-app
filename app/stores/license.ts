// Sakoram is free — no tiers, no trial, no gating. This store keeps its original
// public shape only so the ~30 existing consumers keep compiling; every
// entitlement now reports the top tier so all gated UI hides itself.
// FeatureLock / UpgradeButton / lock badges / app/lib/licensing.ts are left
// dormant (never render once neutered), pending a follow-up cleanup PR.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Tier } from "~/lib/licensing";

export const useLicenseStore = defineStore("license", () => {
	const loaded = ref(true);
	const buyerName = ref("");
	const buyerEmail = ref("");

	const tier = computed(() => Tier.Premium);
	const isTrial = computed(() => false);
	const trialDaysLeft = computed(() => 0);
	const businessLimit = computed(() => Number.POSITIVE_INFINITY);

	const hasFeature = (_key: string) => true;
	const canCreateBusiness = (_currentCount: number) => true;

	// No-ops: nothing to load, and no key to enter/clear now. Kept because
	// tenant.global.ts calls ensureLoaded (and the soon-to-be-deleted license
	// page referenced enterKey/clearKey).
	const ensureLoaded = async () => {
		loaded.value = true;
	};
	const enterKey = async (_key: string): Promise<string | null> => null;
	const clearKey = async () => { /* no-op */ };

	return {
		loaded,
		tier,
		isTrial,
		trialDaysLeft,
		businessLimit,
		buyerName,
		buyerEmail,
		hasFeature,
		canCreateBusiness,
		ensureLoaded,
		enterKey,
		clearKey,
		Tier
	};
});
