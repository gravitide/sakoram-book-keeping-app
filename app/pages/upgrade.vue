<template>
	<div class="select-none">
		<div class="max-w-4xl mx-auto px-4 py-6 space-y-8">
			<!-- Header -->
			<header>
				<h1 class="text-2xl font-semibold">
					Plans &amp; licensing
				</h1>
				<p class="text-sm text-(--ui-text-muted) mt-1">
					Compare tiers, activate a purchased license key, or start with Basic for free.
				</p>
			</header>

			<!-- Feature callout — shown when arriving from a gated route -->
			<div
				v-if="queryFeature"
				class="flex items-start gap-3 rounded-lg border border-(--ui-primary)/40 bg-(--ui-primary)/5 px-4 py-3 text-sm"
			>
				<UIcon name="i-lucide-lock" class="size-4 mt-0.5 text-(--ui-primary) shrink-0" />
				<span>
					<span class="font-medium text-(--ui-primary)">{{ queryFeature.name }}</span>
					<span class="text-(--ui-text-muted)"> requires the </span>
					<span class="font-semibold">{{ queryFeature.tier }}</span>
					<span class="text-(--ui-text-muted)"> plan or above.</span>
				</span>
			</div>

			<!-- Tier comparison grid -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<UCard
					v-for="card in TIER_CARDS"
					:key="card.id"
					class="flex flex-col" :class="[
						license.tier === card.id
							? 'ring-2 ring-(--ui-primary)'
							: ''
					]"
				>
					<template #header>
						<div class="flex items-center justify-between gap-2">
							<span class="text-base font-semibold">{{ card.name }}</span>
							<span
								v-if="license.tier === card.id"
								class="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-(--ui-primary)/15 text-(--ui-primary)"
							>
								Current plan
							</span>
						</div>
						<p class="text-sm text-(--ui-text-muted) mt-1">
							{{ card.tagline }}
						</p>
					</template>

					<ul class="space-y-2 text-sm flex-1">
						<li
							v-for="bullet in card.bullets"
							:key="bullet"
							class="flex items-start gap-2"
						>
							<UIcon name="i-lucide-check" class="size-4 mt-0.5 text-(--ui-primary) shrink-0" />
							<span>{{ bullet }}</span>
						</li>
					</ul>
				</UCard>
			</div>

			<!-- Where to buy -->
			<div class="flex items-center gap-3">
				<a :href="BUY_URL" target="_blank" rel="noopener noreferrer">
					<UButton
						color="primary"
						variant="solid"
						icon="i-lucide-external-link"
						trailing
					>
						Get a license key
					</UButton>
				</a>
				<span class="text-sm text-(--ui-text-muted)">
					Purchase at sakoram.gravitide.dev — you'll receive a key by email.
				</span>
			</div>

			<!-- License key entry -->
			<UCard>
				<template #header>
					<h2 class="text-base font-semibold">
						Activate a license key
					</h2>
					<p class="text-sm text-(--ui-text-muted) mt-1">
						Paste the <code class="font-mono text-xs bg-(--ui-bg-elevated) px-1 py-0.5 rounded">SAKORAM-…</code> key you received after purchase.
					</p>
				</template>

				<div class="space-y-3">
					<UTextarea
						v-model="keyInput"
						placeholder="Paste your SAKORAM-... license key"
						:rows="3"
						:disabled="submitting"
						class="font-mono text-sm"
					/>
					<div class="flex items-center gap-3">
						<UButton
							color="primary"
							variant="solid"
							:loading="submitting"
							:disabled="submitting || !keyInput.trim()"
							@click="activateKey"
						>
							Activate
						</UButton>
						<span v-if="license.buyerName" class="text-sm text-(--ui-text-muted)">
							Currently licensed to
							<span class="font-medium text-(--ui-text)">{{ license.buyerName }}</span>
							<template v-if="license.buyerEmail">
								({{ license.buyerEmail }})
							</template>
						</span>
					</div>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
// /upgrade — tier comparison + license key activation.
// Shows the three tiers side-by-side, highlights the user's current tier,
// and lets them paste a SAKORAM-... key to activate a purchased license.

	import { Tier } from "~/lib/licensing";

	// TODO: point at the real storefront
	const BUY_URL = "https://sakoram.gravitide.dev";

	definePageMeta({ title: "Upgrade" });

	const license = useLicenseStore();
	const toast = useToast();
	const router = useRouter();
	const route = useRoute();

	// ----- Feature callout -----
	// Map of route query ?feature= keys to friendly name + tier label.
	const FEATURE_LABELS: Record<string, { name: string, tier: string }> = {
		recurring: { name: "Recurring invoices & bills", tier: "Plus" },
		credit_notes: { name: "Credit notes", tier: "Plus" },
		statements: { name: "Customer statements", tier: "Plus" },
		reconcile: { name: "Bank reconciliation", tier: "Plus" },
		pdf_protection: { name: "PDF password protection", tier: "Plus" },
		encryption: { name: "Per-business encryption", tier: "Plus" },
		payroll: { name: "Payroll", tier: "Premium" },
		businesses: { name: "More than 2 businesses", tier: "Plus" }
	};

	// Normalise reports.* → ("Advanced reports", "Plus")
	function featureLabel(key: string): { name: string, tier: string } | null {
		if (key.startsWith("reports.")) return { name: "Advanced reports", tier: "Plus" };
		return FEATURE_LABELS[key] ?? null;
	}

	const queryFeature = computed(() => {
		const f = route.query.feature;
		if (typeof f !== "string" || !f) return null;
		return featureLabel(f);
	});

	// ----- Tier card data -----
	interface TierCard {
		id: Tier
		name: string
		tagline: string
		bullets: string[]
	}

	const TIER_CARDS: TierCard[] = [
		{
			id: Tier.Basic,
			name: "Basic",
			tagline: "Core invoicing, free forever.",
			bullets: [
				"Quotes, Invoices, Bills, Vouchers",
				"Profit & Loss + VAT reports",
				"PDF export with custom fonts",
				"Local + phone attachments",
				"Up to 2 businesses"
			]
		},
		{
			id: Tier.Plus,
			name: "Plus",
			tagline: "Unlock the full bookkeeping suite.",
			bullets: [
				"Everything in Basic",
				"Recurring invoices & bills",
				"Credit notes",
				"Customer statements",
				"Bank reconciliation",
				"All advanced reports (aged receivables/payables, cash flow, sales-by-client, expenses-by-vendor)",
				"PDF password protection",
				"Per-business encryption",
				"Unlimited businesses"
			]
		},
		{
			id: Tier.Premium,
			name: "Premium",
			tagline: "Full payroll on top of Plus.",
			bullets: [
				"Everything in Plus",
				"Employees & payslips",
				"EPF / ETF / PAYE auto-compute",
				"Payroll dashboard & register",
				"Bulk payslip PDF export"
			]
		}
	];

	// ----- Key entry -----
	const keyInput = ref("");
	const submitting = ref(false);

	async function activateKey() {
		const key = keyInput.value.trim();
		if (!key) return;
		submitting.value = true;
		const err = await license.enterKey(key);
		submitting.value = false;
		if (err === null) {
			toast.add({ title: "License activated", color: "success" });
			router.push("/");
		} else {
			toast.add({ title: "Invalid license key", description: err, color: "error" });
		}
	}
</script>
