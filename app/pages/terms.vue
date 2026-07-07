<template>
	<div class="w-full max-w-2xl select-none">
		<header class="text-center mb-6">
			<img :src="sakoramLogo" alt="Sakoram" class="h-16 w-auto mx-auto mb-4 dark:invert dark:hue-rotate-180">
			<h1 class="text-2xl font-semibold">
				Before you start
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				A quick note on how Sakoram works and what it does — and doesn't — promise.
			</p>
		</header>

		<UCard>
			<div class="max-h-[50vh] overflow-y-auto pr-1">
				<TermsContent />
			</div>
			<template #footer>
				<div class="space-y-3">
					<UCheckbox v-model="agreed" label="I have read and agree to the Terms." />
					<div class="flex justify-end">
						<UButton :disabled="!agreed" icon="i-lucide-arrow-right" trailing @click="onContinue">
							Continue
						</UButton>
					</div>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { useTerms } from "~/composables/useTerms";

	definePageMeta({ layout: "welcome", title: "Terms" });

	const { accept } = useTerms();
	const agreed = ref(false);

	const onContinue = async () => {
		if (!agreed.value) return;
		accept();
		await navigateTo("/welcome");
	};
</script>
