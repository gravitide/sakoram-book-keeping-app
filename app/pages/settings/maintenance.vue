<template>
	<div class="select-none">
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Maintenance
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Housekeeping for the currently open business's database. These are safe,
				single-business operations — they don't touch your other businesses.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl mx-auto">
			<!-- Optimize -->
			<UCard id="optimize" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Optimize database
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Reclaims space left behind by deleted records and refreshes the
						database's internal statistics. Worth running after deleting a lot
						of documents, attachments, or the demo data.
					</div>
				</template>

				<div class="flex items-center justify-between gap-4 flex-wrap">
					<div>
						<div class="text-xs text-(--ui-text-muted) uppercase tracking-wider">
							Current size
						</div>
						<div class="text-2xl font-semibold tabular-nums">
							<span v-if="sizeBytes === null" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatBytes(sizeBytes) }}</span>
						</div>
					</div>
					<UButton
						icon="i-lucide-sparkles"
						:loading="optimizing"
						:disabled="optimizing || checking"
						@click="onOptimize"
					>
						Optimize now
					</UButton>
				</div>
			</UCard>

			<!-- Integrity -->
			<UCard id="integrity" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Check integrity
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Verifies the database file isn't corrupted. Good peace-of-mind after
						a crash, or after moving this business folder between drives.
					</div>
				</template>

				<div class="flex items-center justify-between gap-4 flex-wrap">
					<div class="min-h-8 flex items-center">
						<div v-if="integrity === null" class="text-sm text-(--ui-text-muted)">
							Not checked yet.
						</div>
						<div v-else-if="integrity.ok" class="flex items-center gap-2 text-(--ui-success)">
							<UIcon name="i-lucide-circle-check" class="size-5" />
							<span class="text-sm font-medium">Healthy — no problems found.</span>
						</div>
						<div v-else class="text-(--ui-error)">
							<div class="flex items-center gap-2">
								<UIcon name="i-lucide-circle-alert" class="size-5" />
								<span class="text-sm font-medium">Problems found:</span>
							</div>
							<ul class="mt-1 ml-7 list-disc text-xs space-y-0.5">
								<li v-for="(m, i) in integrity.messages" :key="i">
									{{ m }}
								</li>
							</ul>
						</div>
					</div>
					<UButton
						icon="i-lucide-shield-check"
						color="neutral"
						variant="outline"
						:loading="checking"
						:disabled="optimizing || checking"
						@click="onCheck"
					>
						Check now
					</UButton>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
	import type { IntegrityResult } from "~/lib/db-maintenance";
	import { checkDatabaseIntegrity, getDatabaseSizeBytes, optimizeDatabase } from "~/lib/db-maintenance";
	import { formatBytes } from "~/lib/format-bytes";

	definePageMeta({ title: "Maintenance" });

	const toast = useToast();

	const sizeBytes = ref<number | null>(null);
	const optimizing = ref(false);
	const checking = ref(false);
	const integrity = ref<IntegrityResult | null>(null);

	const refreshSize = async () => {
		try {
			sizeBytes.value = await getDatabaseSizeBytes();
		} catch { /* leave as-is; the buttons still work */ }
	};
	onMounted(refreshSize);

	const onOptimize = async () => {
		optimizing.value = true;
		try {
			const { reclaimed } = await optimizeDatabase();
			await refreshSize();
			toast.add({
				title: reclaimed > 0 ? `Optimized — reclaimed ${formatBytes(reclaimed)}` : "Optimized — already compact",
				color: "success",
				icon: "i-lucide-sparkles"
			});
		} catch (err) {
			toast.add({ title: "Optimize failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			optimizing.value = false;
		}
	};

	const onCheck = async () => {
		checking.value = true;
		try {
			integrity.value = await checkDatabaseIntegrity();
			toast.add({
				title: integrity.value.ok ? "Database is healthy" : "Integrity problems found",
				color: integrity.value.ok ? "success" : "error",
				icon: integrity.value.ok ? "i-lucide-circle-check" : "i-lucide-circle-alert"
			});
		} catch (err) {
			toast.add({ title: "Check failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			checking.value = false;
		}
	};
</script>
