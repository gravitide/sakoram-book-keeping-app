<template>
	<div class="space-y-6 select-text">
		<HelpSection title="Two separate kinds of protection" icon="i-lucide-shield-check">
			<p>
				Sakoram has <strong>two independent</strong> security features, both on the
				<NuxtLink to="/settings/security" class="text-(--ui-primary) hover:underline">
					Security
				</NuxtLink> page. They use different passwords and protect different things — don't confuse them:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Feature
							</th>
							<th class="px-3 py-2 font-medium">
								Protects
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Database encryption
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								The whole business — its database file on this computer. Opening the business needs a password.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								PDF protection
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Individual generated PDFs — stops people editing or copying the documents you send out.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Database encryption" icon="i-lucide-database">
			<p>
				This encrypts your whole business database <strong>at rest</strong> — on disk. Without it, anyone
				who can read this computer's files (a stolen laptop, a copied backup, a shared drive) can open
				your books. With it, the database is scrambled and useless until someone enters the password.
			</p>
			<p>Turn it on in one of two places:</p>
			<ul class="list-disc pl-5 space-y-1">
				<li>
					<strong>When creating a business</strong> — the last onboarding step ("Security") lets you set
					a password. Leave it blank to skip.
				</li>
				<li>
					<strong>Any time later</strong> — <NuxtLink to="/settings/security" class="text-(--ui-primary) hover:underline">
						Settings → Security
					</NuxtLink> → <em>Database encryption</em> → set a password.
				</li>
			</ul>
			<HelpCallout variant="warning" title="Save your recovery key — there is no backdoor">
				The moment you enable encryption, Sakoram shows a <strong>recovery key</strong> once. Write it down
				or store it in a password manager. It's the only way back in if you forget your password. If you
				lose <em>both</em> the password and the recovery key, the data is gone for good — nobody, including
				us, can recover it. That's the whole point of real encryption.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Unlocking, locking, and switching" icon="i-lucide-lock-open">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>On launch</strong>, an encrypted business shows an unlock screen. Enter the password (or
					click "Use recovery key instead" if you've forgotten it) to open it.
				</li>
				<li>
					<strong>Lock now</strong> (Settings → Security) seals the business and returns you to the unlock
					screen — handy when you step away from the computer without closing the app.
				</li>
				<li>
					<strong>Closing the app</strong> or <strong>switching to another business</strong> automatically
					locks an encrypted business again.
				</li>
			</ul>
			<HelpCallout variant="info" title="It stays unlocked while you're using it">
				While a business is open, its data is readable on disk so the app can work with it. Encryption
				protects you when the app is closed or locked. If you're worried about someone using your computer
				mid-session, use <strong>Lock now</strong> before stepping away.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Changing or removing the password" icon="i-lucide-key-round">
			<p>
				From <NuxtLink to="/settings/security" class="text-(--ui-primary) hover:underline">
					Settings → Security
				</NuxtLink> (while the business is unlocked):
			</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li><strong>Change password</strong> — set a new one. Your existing recovery key keeps working.</li>
				<li><strong>Remove protection</strong> — decrypts the business back to unencrypted. Requires the current password.</li>
			</ul>
		</HelpSection>

		<HelpSection title="PDF protection" icon="i-lucide-file-text">
			<p>
				A <em>separate</em> owner password applied to the PDFs you generate (quotes, invoices, bills,
				vouchers, payslips). Set it under <NuxtLink to="/settings/security#pdf-protection" class="text-(--ui-primary) hover:underline">
					Settings → Security → PDF protection
				</NuxtLink>, and tick which document types to protect.
			</p>
			<HelpCallout variant="info" title="What it does (and doesn't)">
				A protected PDF still <strong>opens without a prompt</strong> — but editing, copying text, and
				annotating are blocked. <strong>Printing stays allowed.</strong> Use it to stop an issued invoice
				or bill from being quietly altered. It's unrelated to the database password.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't lose the recovery key">
				This is the one that hurts. The recovery key is shown once. If you skip past it and later forget
				your password, your books are unrecoverable. Save it the moment it appears.
			</HelpCallout>
			<HelpCallout variant="warning" title="Backups aren't encrypted yet">
				Exporting a business (Settings → Businesses → Export) currently produces an <strong>unencrypted</strong>
				backup <span class="font-mono text-xs">.zip</span>, even for an encrypted business. Treat exported
				backups as sensitive and store them somewhere safe.
			</HelpCallout>
			<HelpCallout variant="tip" title="Use a password you'll actually remember">
				Because there's no password-reset email or support backdoor, pick something memorable (and store
				the recovery key as your safety net). A forgotten password with no recovery key means starting that
				business over from scratch.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Security help topic — at-rest database encryption (per-business password +
// recovery key, unlock/lock lifecycle, change/remove) and the separate PDF
// owner-password protection. Both live on /settings/security.
</script>
