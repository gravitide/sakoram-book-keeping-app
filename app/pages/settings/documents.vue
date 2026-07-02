<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels aren't selectable;
			form fields stay selectable via the input rule in main.css. -->
		<header class="mb-6 max-w-5xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Quotes &amp; invoices
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Defaults and footer notes that apply to the quotes and invoices you create.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<div class="space-y-6">
				<div id="footer-notes" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-file-text"
						title="Footer notes"
						subtitle="Appended at the bottom of the generated quote / invoice PDF — payment instructions, thanks, fine print."
					>
						<UFormField label="Invoice footer" name="invoice_footer_notes">
							<UTextarea v-model="form.invoice_footer_notes" :rows="5" autoresize class="w-full" />
						</UFormField>
						<UFormField label="Quote footer" name="quote_footer_notes">
							<UTextarea v-model="form.quote_footer_notes" :rows="5" autoresize class="w-full" />
						</UFormField>
					</SectionCard>
				</div>

				<div id="defaults" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-pen-line"
						title="Defaults"
						subtitle="Pre-filled onto a new quote or invoice — you can still change it on any individual document."
					>
						<UFormField
							label="Prepared by"
							name="default_prepared_by"
							help="The name shown on the sign-off line of the PDF. Seeded onto new quotes and invoices."
						>
							<UInput v-model="form.default_prepared_by" placeholder="e.g. Your name" class="w-full sm:w-1/2" />
						</UFormField>
					</SectionCard>
				</div>
			</div>

			<!-- Sticky save bar — same shape as the other settings pages. -->
			<div
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="store.saving || !dirty"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="store.saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							Save changes
						</UButton>
					</div>
				</div>
			</div>
		</UForm>
	</div>
</template>

<script setup lang="ts">
	import type { SettingsUpdate } from "~/stores/settings";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Quotes & invoices" });

	const store = useSettingsStore();
	const toast = useToast();

	// Document-level content + defaults for quotes / invoices. Footer notes
	// moved here from the PDF page (they're document content, not render
	// config); default_prepared_by is new (migration 0038).
	type DocForm = Pick<SettingsUpdate, "invoice_footer_notes" | "quote_footer_notes" | "default_prepared_by">;

	const form = reactive<DocForm>({
		invoice_footer_notes: "",
		quote_footer_notes: "",
		default_prepared_by: ""
	});

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.invoice_footer_notes = s.invoice_footer_notes ?? "";
		form.quote_footer_notes = s.quote_footer_notes ?? "";
		form.default_prepared_by = s.default_prepared_by ?? "";
	};

	await store.ensureLoaded();
	hydrate();

	// Dirty tracking via JSON snapshot — same shape as the other settings pages.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const onSubmit = async () => {
		try {
			await store.save({
				invoice_footer_notes: form.invoice_footer_notes,
				quote_footer_notes: form.quote_footer_notes,
				default_prepared_by: form.default_prepared_by?.trim() || null
			});
			refreshBaseline();
			toast.add({ title: "Saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onDiscard = () => {
		hydrate();
		refreshBaseline();
		toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
	};
</script>
