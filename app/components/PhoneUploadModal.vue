<template>
	<UModal
		:open="open"
		title="Upload using phone"
		:ui="{ content: 'w-[min(94vw,460px)]' }"
		@update:open="onOpenChange"
	>
		<template #body>
			<div class="select-none">
				<!-- Starting: waiting for the Rust side to spin up the server. -->
				<div v-if="state === 'starting'" class="py-10 text-center">
					<UIcon name="i-lucide-loader-circle" class="size-8 mx-auto animate-spin text-(--ui-primary)" />
					<p class="text-sm text-(--ui-text-muted) mt-3">
						Starting the upload server…
					</p>
				</div>

				<!-- Error: no LAN, port issue, no active business, etc. -->
				<div v-else-if="state === 'error'" class="py-8 text-center space-y-3">
					<UIcon name="i-lucide-wifi-off" class="size-8 mx-auto text-(--ui-error)" />
					<p class="text-sm font-medium">
						Couldn't start phone upload
					</p>
					<p class="text-xs text-(--ui-text-muted)">
						{{ errorMessage }}
					</p>
					<UButton size="sm" icon="i-lucide-rotate-ccw" @click="begin">
						Try again
					</UButton>
				</div>

				<!-- Expired: the 2-minute window ran out with no upload. -->
				<div v-else-if="state === 'expired'" class="py-8 text-center space-y-3">
					<UIcon name="i-lucide-timer-off" class="size-8 mx-auto text-(--ui-warning)" />
					<p class="text-sm font-medium">
						Session expired
					</p>
					<p class="text-xs text-(--ui-text-muted)">
						The QR code is no longer valid. Generate a fresh one to try again.
					</p>
					<UButton size="sm" icon="i-lucide-rotate-ccw" @click="begin">
						New QR code
					</UButton>
				</div>

				<!-- Waiting: QR shown, listening for photos. -->
				<div v-else class="space-y-4">
					<p class="text-sm text-(--ui-text-muted)">
						Scan this code with your phone's camera, then take a photo of the
						document. It attaches here automatically — add as many as you need.
					</p>

					<div class="flex justify-center">
						<div class="p-3 bg-white rounded-xl border border-(--ui-border)">
							<canvas ref="qrCanvas" class="block" />
						</div>
					</div>

					<div>
						<div class="text-xs text-(--ui-text-muted) mb-1.5 text-center">
							Or open this address on your phone:
						</div>
						<div class="relative rounded-lg border border-(--ui-border) bg-(--ui-bg-muted)">
							<code class="select-text block text-xs break-all text-(--ui-text) px-3 py-2.5 pr-10 leading-relaxed">
								{{ url }}
							</code>
							<UButton
								size="xs"
								variant="ghost"
								color="neutral"
								:icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
								:title="copied ? 'Copied' : 'Copy address'"
								class="absolute top-1.5 right-1.5"
								@click="copyUrl"
							/>
						</div>
					</div>

					<div class="flex items-center justify-center gap-2 text-xs text-(--ui-text-muted)">
						<UIcon name="i-lucide-clock" class="size-3.5" />
						<span>Code valid for {{ countdownLabel }}</span>
					</div>

					<div v-if="received.length > 0" class="rounded-lg border border-(--ui-success)/40 bg-(--ui-success)/10 p-3">
						<div class="text-xs font-medium text-(--ui-text) mb-1.5">
							{{ received.length }} photo{{ received.length === 1 ? "" : "s" }} received
						</div>
						<ul class="space-y-1">
							<li
								v-for="(r, i) in received"
								:key="i"
								class="flex items-center gap-2 text-xs text-(--ui-text-muted)"
							>
								<UIcon name="i-lucide-check" class="size-3.5 text-(--ui-success)" />
								<span class="truncate">{{ r.filename }}</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="finish">
					{{ received.length > 0 ? "Done" : "Cancel" }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Phone-upload modal.
//
// On mount it asks the Rust side to start a LAN HTTP server and mint a
// session token, renders the resulting URL as a QR code, and listens for
// `phone-upload-received` events. Each event (filtered to this invoice)
// is surfaced to the parent via `uploaded` so the parent writes the
// attachment row. The session is one server-side token good for multiple
// photos — the user taps Done (or closes the modal) to end it, which
// fires `cancel_phone_upload`.

	import type { UnlistenFn } from "@tauri-apps/api/event";
	import type { AttachmentFile } from "~/stores/invoice_attachments";
	import { invoke } from "@tauri-apps/api/core";
	import { listen } from "@tauri-apps/api/event";

	interface Props {
		invoiceId: number
	}
	const props = defineProps<Props>();

	const emit = defineEmits<{
		uploaded: [file: AttachmentFile]
		close: []
	}>();

	type State = "starting" | "waiting" | "expired" | "error";

	const open = ref(true);
	const state = ref<State>("starting");
	const errorMessage = ref("");
	const url = ref("");
	const token = ref("");
	const expiresAt = ref(0);
	const now = ref(Date.now());
	const received = ref<AttachmentFile[]>([]);
	const qrCanvas = ref<HTMLCanvasElement | null>(null);
	const copied = ref(false);

	let unlisten: UnlistenFn | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;

	// Server-side TTL is 120s and slides forward on every upload — we mirror
	// that locally so the countdown stays roughly in sync.
	const SESSION_TTL_MS = 120_000;

	const remainingMs = computed(() => Math.max(0, expiresAt.value - now.value));
	const countdownLabel = computed(() => {
		const total = Math.ceil(remainingMs.value / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${String(s).padStart(2, "0")}`;
	});

	const stopTicker = () => {
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	};

	const drawQr = async () => {
		await nextTick();
		if (!qrCanvas.value || !url.value) return;
		const QRCode = (await import("qrcode")).default;
		await QRCode.toCanvas(qrCanvas.value, url.value, { width: 220, margin: 1 });
	};

	// Tear the current session down (best-effort) without closing the modal.
	const teardown = async () => {
		stopTicker();
		if (unlisten) {
			unlisten();
			unlisten = null;
		}
		if (token.value) {
			await invoke("cancel_phone_upload", { token: token.value }).catch(() => { /* best-effort */ });
			token.value = "";
		}
	};

	const begin = async () => {
		await teardown();
		received.value = [];
		state.value = "starting";
		try {
			const session = await invoke<{ url: string, token: string, expires_at: number }>(
				"start_phone_upload",
				{ invoiceId: String(props.invoiceId) }
			);
			url.value = session.url;
			token.value = session.token;
			expiresAt.value = session.expires_at;
			now.value = Date.now();
			state.value = "waiting";

			unlisten = await listen<{
				invoice_id: string
				file_path: string
				filename: string
				size: number
				mime: string
			}>("phone-upload-received", (event) => {
				const p = event.payload;
				// Filter: only photos for this invoice's session.
				if (p.invoice_id !== String(props.invoiceId)) return;
				const file: AttachmentFile = {
					file_path: p.file_path,
					filename: p.filename,
					size: p.size,
					mime: p.mime
				};
				received.value = [...received.value, file];
				// Server slides its TTL forward on each upload — match it.
				expiresAt.value = Date.now() + SESSION_TTL_MS;
				emit("uploaded", file);
			});

			ticker = setInterval(() => {
				now.value = Date.now();
				if (remainingMs.value <= 0) {
					stopTicker();
					teardown();
					state.value = "expired";
				}
			}, 1000);

			await drawQr();
		} catch (err) {
			errorMessage.value = err instanceof Error ? err.message : String(err);
			state.value = "error";
		}
	};

	const copyUrl = async () => {
		try {
			await navigator.clipboard.writeText(url.value);
			copied.value = true;
			setTimeout(() => {
				copied.value = false;
			}, 1500);
		} catch { /* clipboard blocked — the code is select-text as a fallback */ }
	};

	const finish = () => {
		open.value = false;
		emit("close");
	};

	const onOpenChange = (next: boolean) => {
		if (!next) finish();
	};

	onMounted(begin);
	onBeforeUnmount(teardown);
</script>
