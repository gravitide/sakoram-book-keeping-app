<template>
	<div class="w-full max-w-md select-none">
		<header class="text-center mb-6">
			<img
				:src="sakoramLogo"
				alt="Sakoram"
				class="h-16 w-auto mx-auto mb-5 dark:invert dark:hue-rotate-180"
			>
			<h1 class="text-2xl font-semibold flex items-center justify-center gap-2">
				<UIcon name="i-lucide-lock" class="size-5 text-(--ui-primary)" />
				Unlock business
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span class="font-medium">{{ tenants.activeTenant?.name ?? "This business" }}</span>
				is password-protected. Enter its password to continue.
			</p>
		</header>

		<div class="bg-(--ui-bg) border border-(--ui-border) rounded-lg p-5 space-y-4">
			<UFormField v-if="!useRecovery" label="Password" :error="error">
				<PasswordInput
					v-model="password"
					placeholder="Business password"
					autofocus
					:disabled="busy"
					@enter="onSubmit"
				/>
			</UFormField>

			<UFormField v-else label="Recovery key" :error="error" help="The key shown when you enabled encryption.">
				<UTextarea
					v-model="recovery"
					placeholder="XXXX-XXXX-XXXX-…"
					:rows="3"
					:disabled="busy"
				/>
			</UFormField>

			<UButton
				block
				icon="i-lucide-lock-open"
				:loading="busy"
				:disabled="busy || (useRecovery ? !recovery.trim() : !password)"
				@click="onSubmit"
			>
				Unlock
			</UButton>

			<div class="flex items-center justify-between text-xs">
				<button
					type="button"
					class="text-(--ui-primary) hover:underline disabled:opacity-50"
					:disabled="busy"
					@click="toggleMode"
				>
					{{ useRecovery ? "Use password instead" : "Use recovery key instead" }}
				</button>
				<NuxtLink to="/welcome" class="text-(--ui-text-muted) hover:underline">
					Switch business
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Unlock screen for an encrypted business. Decrypts the active tenant's vault
// via the Rust unlock_tenant command, then hard-reloads so every store
// re-hydrates against the now-open DB.

	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({
		layout: "welcome",
		title: "Unlock"
	});

	const tenants = useTenantsStore();

	const useRecovery = ref(false);
	const password = ref("");
	const recovery = ref("");
	const error = ref("");
	const busy = ref(false);

	const toggleMode = () => {
		useRecovery.value = !useRecovery.value;
		error.value = "";
	};

	const onSubmit = async () => {
		if (busy.value) return;
		const secret = useRecovery.value ? recovery.value.trim() : password.value;
		if (!secret) return;
		busy.value = true;
		error.value = "";
		try {
			await tenants.unlock(secret, useRecovery.value);
			window.location.assign("/");
		} catch (err) {
			// unlock_tenant maps a bad password/recovery key to an auth error.
			const raw = err instanceof Error ? err.message : String(err);
			error.value = /invalid password|recovery key|auth/i.test(raw)
				? (useRecovery.value ? "That recovery key isn't right." : "Incorrect password.")
				: raw;
			busy.value = false;
		}
	};
</script>
