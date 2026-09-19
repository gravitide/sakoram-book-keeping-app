<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What it is" icon="i-lucide-cloud-upload">
			<p>
				A copy of your business — the books, your logos and every attached scan — kept in
				<strong>your own Google Drive</strong>. If this computer is lost or dies, you install Sakoram on
				another one, sign in to Google, and restore.
			</p>
			<p>
				It is a <strong>backup</strong>, not sync. Nothing uploads in the background; a backup happens when you
				press <strong>Back up now</strong>. Sakoram reminds you when it has been a while.
			</p>
		</HelpSection>

		<HelpSection title="Setting it up" icon="i-lucide-log-in">
			<ol class="list-decimal pl-5 space-y-1">
				<li>
					Open
					<NuxtLink to="/settings/businesses#google-drive" class="text-(--ui-primary) hover:underline">
						Settings → Businesses
					</NuxtLink>
					and press <strong>Connect Google Drive</strong>.
				</li>
				<li>Your browser opens. Sign in and allow access.</li>
				<li>Back in Sakoram, press <strong>Back up now</strong> next to the open business.</li>
			</ol>
			<HelpCallout variant="info">
				Sakoram asks Google for two things: permission to see <em>files it created itself</em>, and your
				<em>email address</em> — used only to show which account is connected. It cannot read the rest of your
				Drive, your mail or your photos. Leave the Google Drive permission ticked on Google's screen; without it
				there is nothing to back up to. The storage used comes out of your own free 15 GB.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Restoring" icon="i-lucide-cloud-download">
			<p>
				On the welcome screen choose <strong>Restore from Google Drive…</strong>, pick the business and the
				backup you want (the newest is preselected), then choose a folder. The business is restored into a
				<strong>new folder</strong> — nothing already on the computer is overwritten. A backup made with an
				older Sakoram is upgraded automatically when it opens.
			</p>
			<HelpCallout variant="tip">
				Using a PC and a laptop? Back up on one, restore on the other. There is no merging: whichever copy you
				restore replaces what that machine was using, so finish and back up on one machine before switching.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What is kept, and for how long" icon="i-lucide-archive">
			<p>
				The last <strong>10 backups</strong> are kept. Older ones move to your Google Drive trash, where Google
				holds them for 30 days. Attachments upload once and are reused by later backups, so a routine backup is
				small and quick.
			</p>
			<p>
				In Drive you will see a <strong>Sakoram Backups</strong> folder laid out like your business folder. You
				can even restore by hand: download that folder, unzip the newest file in <code>snapshots</code> into it,
				and use <strong>Open a business folder…</strong>.
			</p>
		</HelpSection>

		<HelpSection title="Encryption" icon="i-lucide-shield-check">
			<p>
				If the business has
				<NuxtLink to="/settings/security#encryption" class="text-(--ui-primary) hover:underline">
					database encryption
				</NuxtLink>
				turned on, the database in the backup is encrypted too and opens with the same password or recovery key.
			</p>
			<HelpCallout variant="warning">
				Attachments (scans and photos) are <strong>not</strong> encrypted — on this computer or in Drive. And a
				backup of an encrypted business is useless without its password or recovery key: keep the recovery key
				somewhere that is not this computer.
			</HelpCallout>
		</HelpSection>
	</div>
</template>
