<template>
	<div class="flex items-center gap-2">
		<UPopover v-model:open="open" :content="{ align: 'end' }">
			<UButton
				size="xs"
				color="neutral"
				variant="soft"
				icon="i-lucide-signature"
				trailing-icon="i-lucide-chevron-down"
				:ui="{ trailingIcon: 'size-3' }"
			>
				Signatures
			</UButton>

			<template #content>
				<div class="w-80 p-1">
					<div class="px-2 py-1.5 text-[11px] uppercase tracking-wide text-(--ui-text-muted)">
						Insert a saved sign-off
					</div>

					<div v-if="sigStore.signatures.length === 0" class="px-2 py-3 text-sm text-(--ui-text-muted)">
						No saved signatures yet.
					</div>
					<ul v-else class="max-h-64 overflow-y-auto">
						<li v-for="s in sigStore.signatures" :key="s.id">
							<button
								type="button"
								class="w-full text-left rounded-md px-2 py-2 hover:bg-(--ui-bg-elevated) transition flex flex-col gap-0.5"
								@click="apply(s)"
							>
								<span class="flex items-center gap-2">
									<span class="text-sm font-medium truncate">{{ s.name }}</span>
									<UBadge v-if="s.is_default === 1" size="xs" color="primary" variant="subtle">
										Default
									</UBadge>
								</span>
								<span
									v-for="(line, i) in previewLines(s.body_json)"
									:key="i"
									class="text-xs text-(--ui-text-muted) truncate leading-snug"
								>
									{{ line }}
								</span>
								<span
									v-if="previewLines(s.body_json).length === 0"
									class="text-xs text-(--ui-text-muted) italic"
								>
									Empty
								</span>
							</button>
						</li>
					</ul>

					<div class="border-t border-(--ui-border) mt-1 pt-1">
						<button
							type="button"
							class="w-full text-left rounded-md px-2 py-2 hover:bg-(--ui-bg-elevated) transition flex items-center gap-2 text-sm"
							@click="openNew"
						>
							<UIcon name="i-lucide-plus" class="size-4 shrink-0" />
							Save current as new signature…
						</button>
						<NuxtLink
							to="/settings/company#signatures"
							class="w-full rounded-md px-2 py-2 hover:bg-(--ui-bg-elevated) transition flex items-center gap-2 text-sm text-(--ui-text-muted)"
							@click="open = false"
						>
							<UIcon name="i-lucide-settings-2" class="size-4 shrink-0" />
							Manage in Business details
						</NuxtLink>
					</div>
				</div>
			</template>
		</UPopover>

		<!-- Create-a-template modal, seeded with the current sign-off so "save
			current as new" captures whatever is in the editor right now. -->
		<LetterSignatureFormModal v-model:open="modalOpen" :signature="null" :initial-body="model" />
	</div>
</template>

<script setup lang="ts">
// Shared "insert a saved sign-off" picker for rich-text signature fields —
// the quote / invoice "Prepared by" and the letter Signature. Backed by the
// shared letter_signatures store (managed on Business details → Signatures).
// Applying a signature COPIES its rich text into the bound model (the field
// stays freely editable afterwards); "save current as new" opens the create
// modal seeded with the current field so the user can name and store it.
	import type { LetterSignatureRow } from "~/stores/letter_signatures";
	import { signaturePreviewLines } from "~/lib/signature-preview";
	import { useLetterSignaturesStore } from "~/stores/letter_signatures";

	// The bound rich-text body_json (TipTap JSON string). Applying a saved
	// signature overwrites it; the parent's dirty tracking picks up the change.
	const model = defineModel<string>({ required: true });

	const sigStore = useLetterSignaturesStore();
	const open = ref(false);
	const modalOpen = ref(false);

	onMounted(() => void sigStore.ensureLoaded());

	const previewLines = (bodyJson: string) => signaturePreviewLines(bodyJson, 3);

	const apply = (s: LetterSignatureRow) => {
		model.value = s.body_json;
		open.value = false;
	};

	const openNew = () => {
		open.value = false;
		modalOpen.value = true;
	};

	// Refetch when the create modal closes so a freshly-saved signature appears
	// in the list next time the picker opens.
	watch(modalOpen, (isOpen) => {
		if (!isOpen) void sigStore.load();
	});
</script>
