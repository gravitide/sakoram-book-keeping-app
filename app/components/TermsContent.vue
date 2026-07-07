<template>
	<div class="space-y-4 text-sm leading-relaxed text-(--ui-text-muted)">
		<p>
			Sakoram is free software made by
			<a href="https://gravitide.dev" class="text-(--ui-primary) hover:underline" @click.prevent="openLink('https://gravitide.dev')">Gravitide</a>.
			By using it you agree to the following.
		</p>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">
				Provided “as is”
			</h3>
			<p>Sakoram is provided free of charge, with no warranty of any kind. It may contain bugs and can change or stop working at any time.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">
				Your data is yours — and your responsibility
			</h3>
			<p>Everything runs offline; your books live in folders on your own computer that you choose. You are responsible for keeping your own backups. Use the Export option regularly. We cannot recover data that is lost, corrupted, or deleted.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">
				No liability
			</h3>
			<p>To the fullest extent allowed by law, Gravitide is not liable for any loss or damage arising from using Sakoram — including lost or corrupted data, inaccurate figures, or decisions and filings made using its output.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">
				Not professional advice
			</h3>
			<p>Sakoram is a bookkeeping tool, not accounting, legal, or tax advice. You are responsible for the accuracy of your records and for your own compliance obligations (for example, IRD filings). When in doubt, consult a qualified professional.</p>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { open as openExternal } from "@tauri-apps/plugin-shell";

	// Open the Gravitide link in the OS browser (a plain href would navigate the
	// Tauri webview away from the app).
	const openLink = (url: string) => {
		openExternal(url).catch(() => { /* best-effort */ });
	};
</script>
