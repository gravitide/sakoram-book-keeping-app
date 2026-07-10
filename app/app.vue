<template>
	<Html class="overflow-x-hidden">
		<Body class="font-sans antialiased">
			<!-- Toasts pop at the top-centre so they don't fight the
				sticky save bar pinned to the bottom-right of the
				content area on every detail / settings page. -->
			<UApp :locale="en_gb" :toaster="{ position: 'top-center' }">
				<!-- Top-of-viewport progress bar that animates whenever
					a route transition is in flight. -->
				<NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
				<NuxtLayout>
					<!-- keep-alive=true means each list page mounts once
						per tenant session and stays mounted in memory
						after the user navigates away. Revisits skip the
						full re-mount + re-render cycle entirely — which
						matters when the heavy work isn't the data load
						(that's cached at the store level) but Vue's DOM
						reconciliation of hundreds of table rows. With
						this, /invoices → /bills → /invoices is two
						instant switches instead of two ~3s remounts.

						Tenant switch does `window.location.assign("/")`
						which wipes the whole tree, so keep-alive doesn't
						leak data across tenants. -->
					<NuxtPage keepalive />
				</NuxtLayout>
			</UApp>
		</Body>
	</Html>
</template>

<script setup lang="ts">
	// App-wide locale = en-GB. NuxtUI's UInputDate / UCalendar omit a per-
	// component `locale` prop and read it from UApp's ConfigProvider instead;
	// the locale's BCP47 code drives the date SEGMENT ORDER via
	// @internationalized/date. en-GB gives day/month/year (dd/mm/yyyy) — the
	// Sri Lankan convention — instead of the en-US default of month/day/year.
	import { en_gb } from "@nuxt/ui/locale";
</script>
