<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; the textarea stays selectable via the input rule
			in main.css. -->

		<header class="mb-6 max-w-3xl mx-auto">
			<h1 class="text-2xl font-semibold">
				License
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Manage your Sakoram license key and view your current plan.
			</p>
		</header>

		<div class="max-w-3xl mx-auto space-y-6">
			<!-- ── Status card ──────────────────────────────────────── -->
			<UCard>
				<template #header>
					<div class="font-medium">
						Current plan
					</div>
				</template>

				<div class="space-y-3">
					<!-- Tier badge -->
					<div class="flex items-center gap-3">
						<span
							class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--ui-primary)/15 text-(--ui-primary)"
						>
							{{ TIER_LABELS[license.tier] }}
						</span>
					</div>

					<!-- Trial indicator -->
					<div v-if="license.isTrial" class="flex items-center gap-2 text-sm">
						<UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-(--ui-primary)" />
						<span>
							Trial — <span class="font-medium">{{ license.trialDaysLeft }} {{ license.trialDaysLeft === 1 ? 'day' : 'days' }}</span> of Premium left.
						</span>
					</div>

					<!-- Licensed-to block (paid key active) -->
					<div v-if="license.buyerName" class="space-y-0.5">
						<div class="text-sm font-medium">
							Licensed to {{ license.buyerName }}
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ license.buyerEmail }}
						</div>
					</div>

					<!-- Free plan (no key, not trialling) -->
					<div v-if="!license.buyerName && !license.isTrial" class="text-sm text-(--ui-text-muted)">
						You're on the free Basic plan.
						<NuxtLink to="/upgrade" class="text-(--ui-primary) underline">
							See plans
						</NuxtLink>
					</div>
				</div>
			</UCard>

			<!-- ── License key card ─────────────────────────────────── -->
			<UCard>
				<template #header>
					<div class="font-medium">
						License key
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Paste a SAKORAM-... license key to activate a paid plan.
					</div>
				</template>

				<div class="space-y-4">
					<UFormField label="License key">
						<UTextarea
							v-model="keyInput"
							:disabled="submitting"
							placeholder="Paste your SAKORAM-... license key"
							:rows="3"
							class="font-mono"
						/>
					</UFormField>

					<div class="flex items-center gap-2 flex-wrap">
						<UButton
							:loading="submitting"
							:disabled="submitting || !keyInput.trim()"
							icon="i-lucide-key-round"
							@click="onActivate"
						>
							Activate
						</UButton>

						<UButton
							v-if="license.buyerName"
							variant="soft"
							color="neutral"
							icon="i-lucide-trash-2"
							:disabled="submitting"
							@click="onRemoveKey"
						>
							Remove key
						</UButton>
					</div>
				</div>
			</UCard>

			<!-- ── Help line ─────────────────────────────────────────── -->
			<p class="text-sm text-(--ui-text-muted)">
				Tiers unlock more features. Compare plans on the
				<NuxtLink to="/upgrade" class="text-(--ui-primary) underline">
					plans page
				</NuxtLink>.
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
// Settings → License management page.
// Shows the current tier (Basic / Plus / Premium), trial status, and
// buyer info when a paid key is active. Lets the user paste + activate a
// new license key, or remove an existing one to fall back to Basic / trial.

	import { useLicenseStore } from "~/stores/license";

	definePageMeta({ title: "License" });

	const license = useLicenseStore();
	const toast = useToast();

	await license.ensureLoaded();

	// Map numeric tier → human label. Mirrors the Tier enum from lib/licensing.ts.
	const TIER_LABELS: Record<number, string> = {
		0: "Basic",
		1: "Plus",
		2: "Premium"
	};

	const keyInput = ref("");
	const submitting = ref(false);

	async function onActivate(): Promise<void> {
		const key = keyInput.value.trim();
		if (!key || submitting.value) return;

		submitting.value = true;
		try {
			const err = await license.enterKey(key);
			if (err === null) {
				toast.add({ title: "License activated", color: "success", icon: "i-lucide-check" });
				keyInput.value = "";
			} else {
				toast.add({ title: "Invalid license key", description: err, color: "error", icon: "i-lucide-circle-alert" });
			}
		} finally {
			submitting.value = false;
		}
	}

	async function onRemoveKey(): Promise<void> {
		if (submitting.value) return;
		submitting.value = true;
		try {
			await license.clearKey();
			toast.add({ title: "License key removed", color: "neutral", icon: "i-lucide-trash-2" });
		} finally {
			submitting.value = false;
		}
	}
</script>
