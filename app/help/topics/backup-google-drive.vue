<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What it is" icon="i-lucide-cloud-upload">
			<p>
				A copy of your business — the books, your logos and every attached scan — kept in
				<strong>your own Google Drive</strong>. If this computer is lost, stolen or simply dies, you install
				Sakoram on another one, sign in to Google, and restore.
			</p>
			<p>
				It is a <strong>backup</strong>, not sync. Nothing uploads in the background; a backup happens when you
				press <strong>Back up now</strong>. Sakoram reminds you when it has been a while.
			</p>
			<HelpCallout variant="info" title="Your Drive, not ours">
				Sakoram has no servers and never sees your data. The backup goes straight from this computer to your
				Google account and uses your own free Google storage (15 GB, shared with Gmail and Google Photos).
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Setting it up" icon="i-lucide-log-in">
			<ol class="list-decimal pl-5 space-y-1">
				<li>
					Open
					<NuxtLink to="/settings/businesses#google-drive" class="text-(--ui-primary) hover:underline">
						Settings → Businesses
					</NuxtLink>
					and scroll to <strong>Google Drive backup</strong>. Press <strong>Connect Google Drive</strong>.
				</li>
				<li>Your browser opens Google's sign-in page. Choose your Google account.</li>
				<li>
					On the permissions screen, <strong>tick the Google Drive box</strong> — it reads
					<em>"See, edit, create and delete only the specific Google Drive files you use with this app"</em> —
					then press <strong>Continue</strong>.
				</li>
				<li>
					The browser tab says you can close it. Back in Sakoram the card now shows your Google photo, name and
					email, so you can always see which account your backups go to.
				</li>
			</ol>
			<HelpCallout variant="warning" title="The Google Drive box starts unticked">
				Google lists the Drive permission as a checkbox, and it is <strong>not ticked</strong> when the page
				opens. If you press Continue without ticking it, Google gives Sakoram your email address and nothing
				else — and Sakoram refuses the connection, because it would have nowhere to put a backup. Press
				<strong>Try again</strong> and tick the box.
			</HelpCallout>
			<HelpCallout variant="info" title="What Sakoram can and cannot see">
				Two things only: <em>files it created itself</em> in your Drive, and your <em>email address</em> (used
				just to show which account is connected). It cannot read the rest of your Drive, your mail or your
				photos.
			</HelpCallout>
			<p>
				Closed the browser tab by mistake? While Sakoram is waiting you can press <strong>Open sign-in again</strong>
				for a fresh page, or <strong>Cancel</strong> to stop. You connect once per computer; after that it stays
				connected until you press <strong>Disconnect</strong>.
			</p>
		</HelpSection>

		<HelpSection title="Backing up" icon="i-lucide-hard-drive-upload">
			<p>
				Press <strong>Back up now</strong> on the card. A progress window shows the snapshot being taken and the
				attachments being transferred; you can keep working while it runs, or press <strong>Cancel</strong>.
			</p>
			<ul class="list-disc pl-5 space-y-1">
				<li>
					<strong>What is included:</strong> the whole business — every document, client, vendor, employee and
					setting — plus your logos, your PDF letterhead and every attachment.
				</li>
				<li>
					<strong>The first backup is the slow one.</strong> Attachments upload once and are reused by every
					later backup, so after the first time a backup is usually a few megabytes and takes seconds.
				</li>
				<li>
					<strong>A backup covers the business that is open.</strong> To back up another business, open it
					first. A password-protected business must be unlocked.
				</li>
				<li>
					<strong>An interrupted backup is not a backup.</strong> If the connection drops halfway, nothing
					half-finished is kept — just press Back up now again, and it carries on from the attachments already
					uploaded.
				</li>
			</ul>
			<HelpCallout variant="tip" title="Let Sakoram remind you">
				Under <strong>Remind me to back up</strong> choose every day, week, two weeks or month — or never. When a
				backup is due, a banner appears at the top of every page with a <strong>Back up now</strong> button.
				<strong>Later</strong> hides it until you next start Sakoram. After a busy day of invoicing, back up
				before you shut down.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Your backups on Google Drive" icon="i-lucide-archive">
			<p>
				The card lists every backup of the open business that exists on your Drive — its date and time, the
				computer it came from, and its size. The newest is marked <strong>Latest</strong>. Because the list is
				read from Google Drive itself, backups made on your other computers appear here too. Press
				<strong>Refresh</strong> to check again.
			</p>
			<ul class="list-disc pl-5 space-y-1">
				<li>
					<strong>The 10 newest are kept automatically.</strong> When an eleventh is made, the oldest is removed.
				</li>
				<li>
					<strong>You can delete older backups yourself</strong> with the bin icon. Attachments that only that
					backup still needed are removed with it.
				</li>
				<li>
					<strong>The latest backup cannot be deleted here.</strong> It is the one a restore would use, so there
					is always something to come back to.
				</li>
				<li>
					<strong>Nothing is destroyed immediately.</strong> Everything Sakoram removes goes to your Google Drive
					trash, where Google keeps it for 30 days.
				</li>
			</ul>
			<p>
				In Google Drive you will find a <strong>Sakoram Backups</strong> folder with one folder per business,
				laid out like the business folder on your computer: <code>snapshots</code> holds the dated backups and
				<code>attachments</code> holds your scans.
			</p>
			<HelpCallout variant="warning" title="Leave the files in that folder alone">
				Do not rename, move or edit anything inside <strong>Sakoram Backups</strong>. Sakoram finds its files by
				hidden tags, and files you add yourself are invisible to it. Deleting the whole folder in Drive is safe —
				it simply removes your backups.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Restoring" icon="i-lucide-cloud-download">
			<ol class="list-decimal pl-5 space-y-1">
				<li>
					On the welcome screen choose <strong>Restore from Google Drive…</strong> (close the open business first
					if you are inside one).
				</li>
				<li>Connect the Google account you backed up to, if this computer is not connected yet.</li>
				<li>Pick the business, then the backup — the newest is already selected.</li>
				<li>
					Choose a folder to put it in. Sakoram downloads the books and every attachment, checks each file, and
					tells you how many came back — for example <em>312 of 312 attachments restored</em>.
				</li>
				<li>Press <strong>Open business</strong>.</li>
			</ol>
			<ul class="list-disc pl-5 space-y-1">
				<li>
					<strong>Nothing is overwritten.</strong> A restore always goes into a new folder. If this computer
					already had that business, the old folder is left exactly where it was.
				</li>
				<li>
					<strong>Old backups still work.</strong> A backup made with an older Sakoram is upgraded automatically
					when it opens.
				</li>
				<li>
					<strong>A backup made with a newer Sakoram</strong> than the one installed is refused before anything
					is written — update Sakoram, then restore again.
				</li>
			</ul>
			<HelpCallout variant="tip" title="Using a PC and a laptop">
				Back up on one, restore on the other. There is no merging: the copy you restore is simply what that
				machine uses from then on. So finish your work and back up on one computer <em>before</em> you start on
				the other — work done on both at once cannot be combined.
			</HelpCallout>
			<p>
				You can even restore by hand: download the business's folder from drive.google.com, unzip the newest file
				in <code>snapshots</code> into it, and use <strong>Open a business folder…</strong> on the welcome screen.
			</p>
		</HelpSection>

		<HelpSection title="Password-protected businesses" icon="i-lucide-shield-check">
			<p>
				If the business has
				<NuxtLink to="/settings/security#encryption" class="text-(--ui-primary) hover:underline">
					database encryption
				</NuxtLink>
				turned on, the database inside the backup is encrypted too. After a restore it asks for the same password
				— or the recovery key — exactly as before.
			</p>
			<HelpCallout variant="warning" title="Two things to know">
				Attachments (scans and photos) are <strong>not</strong> encrypted — not on this computer, and not in
				Drive. And a backup of an encrypted business is useless without its password or recovery key, so keep the
				recovery key somewhere that is <em>not</em> this computer.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Drive backup or the Export button?" icon="i-lucide-scale">
			<p>
				Sakoram has two ways to keep a copy, and they are good at different things. Use both.
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium" />
							<th class="px-3 py-2 font-medium">
								Google Drive backup
							</th>
							<th class="px-3 py-2 font-medium">
								Export (.zip)
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Best for
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Getting your books back after losing the computer
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Handing a copy to your accountant, or a USB-stick archive
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Needs
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Internet and a Google account
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Nothing — works fully offline
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Later versions
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Upgraded automatically when restored
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Tied to the Sakoram version that made it — it may not import into a later one
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Where it lives
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Away from the computer, safe from fire and theft
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Wherever you save the file
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p>
				Export and Import are covered in
				<NuxtLink to="/help/security" class="text-(--ui-primary) hover:underline">
					Security &amp; encryption
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="If something goes wrong" icon="i-lucide-life-buoy">
			<ul class="list-disc pl-5 space-y-2">
				<li>
					<strong>"Google Drive access wasn't ticked"</strong> — the Drive checkbox on Google's screen was left
					empty. Press <strong>Try again</strong> and tick it before Continue.
				</li>
				<li>
					<strong>The Connect button keeps waiting</strong> — the browser tab was closed or Google showed an
					error page. Press <strong>Open sign-in again</strong>, or <strong>Cancel</strong>.
				</li>
				<li>
					<strong>"Can't reach Google Drive"</strong> — you are offline. Nothing was changed; try again when the
					internet is back. Everything else in Sakoram carries on working without it.
				</li>
				<li>
					<strong>"Your Google Drive is full"</strong> — the 15 GB is shared with Gmail and Google Photos. Free
					up space (emptying the Drive trash counts), then back up again.
				</li>
				<li>
					<strong>"Reconnect Google Drive"</strong> — access was removed from your Google account, or it
					expired. Connect again; the backups already on Drive are untouched.
				</li>
				<li>
					<strong>Back up now is greyed out</strong> — the business is locked, or another backup or restore is
					still running.
				</li>
				<li>
					<strong>Some attachments were not restored</strong> — the books are complete; only the listed files
					are missing. They may still be in your Google Drive trash.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Putting the business folder inside a synced Drive folder">
				It is tempting to save your business folder inside <em>Google Drive for desktop</em>, Dropbox or OneDrive
				and let that sync it. Don't — those tools copy the database while Sakoram is still writing to it, which
				can corrupt your books. Keep the business folder on the computer and use <strong>Back up now</strong>,
				which always takes a clean, complete copy.
			</HelpCallout>
			<HelpCallout variant="warning" title="Treating it as sync">
				Working on the PC in the morning and the laptop in the afternoon, without backing up and restoring in
				between, gives you two different sets of books that cannot be merged.
			</HelpCallout>
			<HelpCallout variant="warning" title="Connecting and never pressing the button">
				Connecting Google Drive does not back anything up by itself. Press <strong>Back up now</strong>, and
				leave the reminder switched on.
			</HelpCallout>
		</HelpSection>
	</div>
</template>
