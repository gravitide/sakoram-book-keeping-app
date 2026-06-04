// Per-install licensing store. Reads license.json via Rust, verifies any
// entered key via Rust (validate_license), computes the effective entitlement
// (tier + trial) via app/lib/licensing.ts, and updates last_seen on load.

import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { effectiveEntitlement, hasFeature as hasFeatureFor, Tier } from "~/lib/licensing";

interface LicenseState { license_key: string | null, trial_start: string | null, last_seen_date: string | null }
interface LicenseInfo { tier: number, license_id: number, name: string, email: string }

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export const useLicenseStore = defineStore("license", () => {
	const loaded = ref(false);
	const licenseTier = ref<Tier | null>(null);
	const buyerName = ref("");
	const buyerEmail = ref("");
	const trialStart = ref<string | null>(null);
	const lastSeen = ref<string | null>(null);

	const entitlement = computed(() =>
		effectiveEntitlement(licenseTier.value, { trialStart: trialStart.value, lastSeen: lastSeen.value }, todayIso()));
	const tier = computed(() => entitlement.value.tier);
	const isTrial = computed(() => entitlement.value.isTrial);
	const trialDaysLeft = computed(() => entitlement.value.trialDaysLeft);
	const businessLimit = computed(() => entitlement.value.businessLimit);

	const hasFeature = (key: string) => hasFeatureFor(tier.value, key);
	const canCreateBusiness = (currentCount: number) => currentCount < businessLimit.value;

	async function ensureLoaded() {
		if (loaded.value) return;
		const st = await invoke<LicenseState>("read_license_state");
		const today = todayIso();
		const seededStart = st.trial_start ?? today;
		const seededLastSeen = !st.last_seen_date || st.last_seen_date < today ? today : st.last_seen_date;
		trialStart.value = seededStart;
		lastSeen.value = seededLastSeen;

		if (st.license_key) {
			try {
				const info = await invoke<LicenseInfo>("validate_license", { key: st.license_key });
				licenseTier.value = info.tier as Tier;
				buyerName.value = info.name;
				buyerEmail.value = info.email;
			} catch {
				licenseTier.value = null;
			}
		}
		await invoke("write_license_state", {
			state: { license_key: st.license_key ?? null, trial_start: seededStart, last_seen_date: seededLastSeen }
		});
		loaded.value = true;
	}

	// Returns null on success, or an error message.
	async function enterKey(key: string): Promise<string | null> {
		try {
			const info = await invoke<LicenseInfo>("validate_license", { key });
			licenseTier.value = info.tier as Tier;
			buyerName.value = info.name;
			buyerEmail.value = info.email;
			await invoke("write_license_state", {
				state: { license_key: key, trial_start: trialStart.value, last_seen_date: lastSeen.value }
			});
			return null;
		} catch (e) {
			return String(e);
		}
	}

	async function clearKey() {
		licenseTier.value = null;
		buyerName.value = "";
		buyerEmail.value = "";
		await invoke("write_license_state", {
			state: { license_key: null, trial_start: trialStart.value, last_seen_date: lastSeen.value }
		});
	}

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
