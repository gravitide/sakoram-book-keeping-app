<template>
	<div class="select-none">
		<!-- Google Drive backup got its own page (it used to be a card at the
			foot of Settings → Businesses, where nobody looked for it). The
			card itself is unchanged — DriveBackupCard owns connect /
			disconnect, back-up-now, the list of backups on Drive and the
			reminder interval. Per-business local .zip Export stays on the
			Businesses page: that is a file you keep yourself, this is the
			off-machine copy. -->
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Backup
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Keep an off-machine copy of your books in your own Google Drive. For a
				<span class="font-mono text-xs">.zip</span> file you keep yourself, use
				<NuxtLink to="/settings/businesses" class="text-(--ui-primary) hover:underline">
					Businesses
				</NuxtLink>
				→ Export.
			</p>
		</header>

		<div class="max-w-2xl mx-auto">
			<DriveBackupCard />

			<!-- The card hides itself when the build has no Google credentials
				(drive_status.configured = false); say so instead of showing
				an empty page. -->
			<UCard v-if="drive.loaded && !drive.status?.configured">
				<div class="flex items-start gap-3">
					<UIcon name="i-lucide-cloud-off" class="size-5 mt-0.5 shrink-0 text-(--ui-text-muted)" />
					<div>
						<div class="font-medium">
							Google Drive backup isn't available in this build
						</div>
						<p class="text-sm text-(--ui-text-muted) mt-1">
							This copy of Sakoram was built without Google credentials, so it can't sign in to Drive.
							You can still export a <span class="font-mono text-xs">.zip</span> backup from
							the <NuxtLink to="/settings/businesses" class="text-(--ui-primary) hover:underline">
								Businesses
							</NuxtLink> page.
						</p>
					</div>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { useDriveBackupStore } from "~/stores/drive_backup";

	definePageMeta({ title: "Backup" });

	const drive = useDriveBackupStore();
	onMounted(() => drive.ensureLoaded());
</script>
