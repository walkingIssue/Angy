<!-- @wc-ignore-file -->
<script lang="ts">
	import { browser, dev } from "$app/environment";
	import { page } from "$app/state";
	import { loadLocale } from "wuchale/load-utils";
	import { onMount } from "svelte";
	import { draggable } from "./dragItem";
	import PendingChangesDialog from "./PendingChangesDialog.svelte";
	import TranslationHelperForm from "./TranslationHelperForm.svelte";
	import {
		readSuggestionCache,
		requestTranslationSuggestions
	} from "./translationSuggestions";
	import {
		getCandidateList,
		getEffectiveResolvedKey,
		getEntryOrigin,
		getEntryOriginalValue,
		sameResolvedKey,
		translationKey,
		type DraftTranslation,
		type ResolvedKey,
		type TranslationContextResult
	} from "./toggleQA.shared";

	const runtimeConfig = globalThis as typeof globalThis & {
		__ANGY_ROUTE_PATH__?: string;
		__ANGY_LOCALES__?: string[];
	};

	const defaultEndpoint =
		typeof runtimeConfig.__ANGY_ROUTE_PATH__ !== "undefined"
			? runtimeConfig.__ANGY_ROUTE_PATH__
			: "/api/translations";
	const defaultLocales =
		Array.isArray(runtimeConfig.__ANGY_LOCALES__) && runtimeConfig.__ANGY_LOCALES__.length
			? [...runtimeConfig.__ANGY_LOCALES__]
			: ["en", "sv"];

	let { endpoint = defaultEndpoint } = $props<{
		endpoint?: string;
	}>();

	let dragQua = $state(true);
	let selectedResolvedKey = $state<ResolvedKey | null>(null);
	let focusedAltKey = $state<string | null>(null);

	let contextPending = $state(false);
	let contextError = $state<string | null>(null);
	let contextResult = $state<TranslationContextResult | null>(null);

	let stagedTranslations = $state<Record<string, DraftTranslation>>({});

	let currentLocale = $state(defaultLocales);
	let locale = 0;

	let activeSwitchLocale = $state(true);
	let selectionStarted = false;
	let capturedSelection: string | undefined = $state(undefined);
	let spawnTranslation = $state(false);
	let translatedValue = $state("");

	let pending = $state(false);
	let rotatePending = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let renderedLocale = $state<string>(currentLocale[locale] ?? "en");
	let showPendingChangesDialog = $state(false);
	let suggestionLookup = $state<Record<string, string>>(readSuggestionCache());
	let suggestionPending = $state(false);

	let panelEl: HTMLDivElement | null = null;
	let translationInputEl: HTMLTextAreaElement | null = null;

	function setTranslationInputEl(element: HTMLTextAreaElement | null) {
		translationInputEl = element;
	}

	function getLocale(increase = true) {
		if (increase) {
			locale = locale >= currentLocale.length - 1 ? 0 : locale + 1;
		}

		renderedLocale = currentLocale[locale];
		return currentLocale[locale];
	}

	function focusTranslationInput() {
		queueMicrotask(() => {
			translationInputEl?.focus();
			translationInputEl?.select();
		});
	}

	function handleLocaleToggle(event: MouseEvent) {
		if (activeSwitchLocale) return;
		event.preventDefault();
		loadLocale(getLocale());
	}

	function getStaged(msgid: string, msgctxt: string | null) {
		return stagedTranslations[translationKey(msgid, msgctxt)] ?? null;
	}

	function getSuggestion(msgid: string, msgctxt: string | null) {
		return suggestionLookup[translationKey(msgid, msgctxt)] ?? "";
	}

	function isStaged(msgid: string, msgctxt: string | null) {
		return Boolean(getStaged(msgid, msgctxt));
	}

	function isSelectedAlt(msgid: string, msgctxt: string | null) {
		return sameResolvedKey(selectedResolvedKey, { msgid, msgctxt });
	}

	function setFocusedAltKey(key: string | null) {
		focusedAltKey = key;
	}

	function resetFeedback() {
		error = null;
		success = null;
	}

	async function rotateCatalogs() {
		if (rotatePending || pending) return;
		if (!confirm("Rotate catalogs? This will back up both catalogs and promote the working catalog into the base catalog.")) {
			return;
		}

		rotatePending = true;
		resetFeedback();

		try {
			const response = await fetch(`${endpoint}?intent=rotate-catalogs`, {
				method: "POST"
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				error = payload?.error ?? "Catalog rotation failed";
				return;
			}

			success = payload?.message ?? "Catalogs rotated";
		} catch {
			error = "Catalog rotation failed";
		} finally {
			rotatePending = false;
		}
	}

	function resetContextState() {
		contextError = null;
		contextResult = null;
	}

	function hasDirtyStagedTranslations() {
		return Object.values(stagedTranslations).some((item) => item.isDirty);
	}

	function applyCommittedTranslations(
		currentContext: TranslationContextResult | null,
		items: DraftTranslation[]
	): TranslationContextResult | null {
		if (!currentContext || !items.length) return currentContext;

		const updates = new Map(
			items.map((item) => [translationKey(item.msgid, item.msgctxt), item.value])
		);

		const updateEntry = <T extends { msgid: string; msgctxt: string | null; msgstr: string[]; hasTranslation?: boolean; isCommittedToWorking?: boolean; isFuzzy?: boolean | null; translationOrigin?: "base" | "working" | null }>(
			entry: T
		): T => {
			const nextValue = updates.get(translationKey(entry.msgid, entry.msgctxt));
			if (!nextValue) return entry;

			return {
				...entry,
				msgstr: [nextValue],
				hasTranslation: true,
				isCommittedToWorking: true,
				matchesTargetTranslation: false,
				isFuzzy: false,
				translationOrigin: "working"
			};
		};

		return {
			...currentContext,
			entry: updateEntry(currentContext.entry),
			alternatives: currentContext.alternatives.map((alternative) => updateEntry(alternative))
		};
	}

	function selectResolvedKey(msgid: string, msgctxt: string | null, focusInput = false) {
		selectedResolvedKey = { msgid, msgctxt };
		translatedValue =
			getStaged(msgid, msgctxt)?.value ||
			getSuggestion(msgid, msgctxt) ||
			getEntryOriginalValue(contextResult, msgid, msgctxt);

		resetFeedback();

		if (focusInput) {
			focusTranslationInput();
		}
	}

	function hasActiveSuggestion() {
		const resolved = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
		if (!resolved) return false;

		if (getStaged(resolved.msgid, resolved.msgctxt)) {
			return false;
		}

		const suggestion = getSuggestion(resolved.msgid, resolved.msgctxt);
		if (!suggestion) return false;

		const originalValue = getEntryOriginalValue(contextResult, resolved.msgid, resolved.msgctxt);
		return translatedValue === suggestion && suggestion !== originalValue;
	}

	function handleSelectAlt(event: Event, msgid: string, msgctxt: string | null) {
		event.preventDefault();
		event.stopPropagation();
		selectResolvedKey(msgid, msgctxt, true);
	}

	function moveSelection(direction: 1 | -1) {
		const items = getCandidateList(contextResult);
		if (!items.length) return false;

		const current = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
		const currentIndex = current
			? items.findIndex(
					(item) =>
						item.msgid === current.msgid &&
						(item.msgctxt ?? null) === (current.msgctxt ?? null)
				)
			: -1;

		for (let step = 1; step <= items.length; step++) {
			const nextIndex =
				((Math.max(currentIndex, 0) + direction * step) % items.length + items.length) %
				items.length;
			const next = items[nextIndex];
			const skipForKeyboard = next.hasTranslation && !next.isFuzzy;

			if (skipForKeyboard) continue;

			selectResolvedKey(next.msgid, next.msgctxt, true);
			return true;
		}

		const nextIndex =
			((Math.max(currentIndex, 0) + direction) % items.length + items.length) % items.length;
		const next = items[nextIndex];
		selectResolvedKey(next.msgid, next.msgctxt, true);
		return true;
	}

	function onAltKeydown(event: KeyboardEvent, msgid: string, msgctxt: string | null) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			selectResolvedKey(msgid, msgctxt, true);
			return;
		}

		if (event.key === "Tab") {
			event.preventDefault();
			moveSelection(event.shiftKey ? -1 : 1);
		}
	}

	function stageCurrentTranslation(event?: Event) {
		event?.preventDefault();

		const resolved = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
		if (!resolved?.msgid) {
			error = "No resolved translation key selected";
			return;
		}

		const value = translatedValue.trim();
		if (!value) {
			error = "No translation";
			return;
		}

		const originalValue = getEntryOriginalValue(contextResult, resolved.msgid, resolved.msgctxt);
		stagedTranslations = {
			...stagedTranslations,
			[translationKey(resolved.msgid, resolved.msgctxt)]: {
				msgid: resolved.msgid,
				msgctxt: resolved.msgctxt,
				value,
				origin: getEntryOrigin(contextResult, resolved.msgid, resolved.msgctxt),
				originalValue,
				isDirty: value !== originalValue
			}
		};

		error = null;
		success = "Staged";

		if (!moveSelection(1)) {
			focusTranslationInput();
		}
	}

	async function commitStagedTranslations() {
		const payload = Object.values(stagedTranslations).filter((item) => item.isDirty);
		if (!payload.length) {
			error = "No changed translations to submit";
			return false;
		}

		pending = true;
		resetFeedback();

		const res = await fetch(`${endpoint}?intent=commit-batch`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				items: payload.map((item) => ({
					resolvedMsgid: item.msgid,
					resolvedMsgctxt: item.msgctxt,
					translationValue: item.value
				}))
			})
		});

		const json = await res.json();
		pending = false;

		if (!res.ok) {
			error = json.error ?? "Batch commit failed";
			return false;
		}

		success = json.message ?? "Translations committed";

		const next = { ...stagedTranslations };
		for (const item of payload) {
			delete next[translationKey(item.msgid, item.msgctxt)];
		}
		stagedTranslations = next;
		contextResult = applyCommittedTranslations(contextResult, payload);
		return true;
	}

	async function submitStagedTranslations(event: SubmitEvent) {
		if (!event.defaultPrevented) {
			event.preventDefault();
		}

		await commitStagedTranslations();
	}

	function openTranslation(text: string) {
		capturedSelection = text;
		translatedValue = "";
		resetFeedback();
		resetContextState();
		spawnTranslation = true;
		showPendingChangesDialog = false;
	}

	async function fetchContext() {
		if (!capturedSelection) return;

		contextPending = true;
		resetContextState();
		resetFeedback();

		const body = new FormData();
		body.set("translationKey", capturedSelection);
		body.set("currentPath", page.url.pathname);

		const res = await fetch(`${endpoint}?intent=context`, {
			method: "POST",
			body
		});

		const json = await res.json();
		contextPending = false;

		if (!res.ok) {
			contextError = json.error ?? "Context lookup failed";
			return;
		}

		contextResult = json;
		selectedResolvedKey = {
			msgid: json.entry.msgid,
			msgctxt: json.entry.msgctxt
		};
		translatedValue =
			getStaged(json.entry.msgid, json.entry.msgctxt)?.value ||
			getSuggestion(json.entry.msgid, json.entry.msgctxt) ||
			json.entry.msgstr?.[0] ||
			"";

		if (!suggestionPending) {
			suggestionPending = true;
			void requestTranslationSuggestions(json, endpoint)
				.then((nextSuggestions) => {
					suggestionLookup = nextSuggestions;

					const resolved = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
					if (!resolved) return;

					const staged = getStaged(resolved.msgid, resolved.msgctxt);
					const original = getEntryOriginalValue(contextResult, resolved.msgid, resolved.msgctxt);
					const currentSuggestion = getSuggestion(resolved.msgid, resolved.msgctxt);

					if (!staged && translatedValue === original && currentSuggestion) {
						translatedValue = currentSuggestion;
					}
				})
				.catch(() => {
					// Suggestion lookup is best-effort in this dev tool.
				})
				.finally(() => {
					suggestionPending = false;
				});
		}

		focusTranslationInput();
	}

	function closeTranslation() {
		spawnTranslation = false;
		capturedSelection = undefined;
		selectionStarted = false;
		translatedValue = "";
		selectedResolvedKey = null;
		focusedAltKey = null;
		showPendingChangesDialog = false;
		resetFeedback();
		resetContextState();
	}

	function requestCloseTranslation() {
		if (pending) return;

		if (hasDirtyStagedTranslations()) {
			showPendingChangesDialog = true;
			return;
		}

		closeTranslation();
	}

	function discardAndCloseTranslation() {
		stagedTranslations = {};
		closeTranslation();
	}

	async function submitAndCloseTranslation() {
		const committed = await commitStagedTranslations();
		if (committed) {
			closeTranslation();
		}
	}

	function getElementTranslationCandidate(target: EventTarget | null): string | null {
		const el =
			target instanceof Element
				? target.closest(
						'button, a, [role="button"], input[type="button"], input[type="submit"]'
					)
				: null;

		if (!el) return null;

		if (el instanceof HTMLInputElement) {
			return (
				el.value?.trim() ||
				el.getAttribute("aria-label")?.trim() ||
				el.title?.trim() ||
				null
			);
		}

		return (
			el.getAttribute("aria-label")?.trim() ||
			el.textContent?.trim() ||
			el.getAttribute("title")?.trim() ||
			null
		);
	}

	function translationForm() {
		if (!browser || !dev) return;

		const onSelectStart = () => {
			selectionStarted = dragQua;
		};

		function onCaptureInteractivePointerDown(event: PointerEvent) {
			if (!event.altKey) return;

			const text = getElementTranslationCandidate(event.target);
			if (!text) return;

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();

			openTranslation(text);
			void fetchContext();
		}

		const onMouseUp = () => {
			if (!selectionStarted) return;

			const text = document.getSelection()?.toString().trim();
			if (text) {
				openTranslation(text);
				void fetchContext();
			}

			selectionStarted = false;
		};

		const onDocumentMouseDown = (event: MouseEvent) => {
			if (!spawnTranslation) return;
			if (showPendingChangesDialog) return;

			const target = event.target as Node | null;
			if (panelEl && target && panelEl.contains(target)) return;

			requestCloseTranslation();
		};

		function onCtrlDown(event: KeyboardEvent) {
			dragQua = !event.ctrlKey;
		}

		function onCtrlUp() {
			dragQua = true;
		}

		document.addEventListener("selectstart", onSelectStart);
		document.addEventListener("mouseup", onMouseUp);
		document.addEventListener("mousedown", onDocumentMouseDown);
		document.addEventListener("keydown", onCtrlDown);
		document.addEventListener("keyup", onCtrlUp);
		document.addEventListener("pointerdown", onCaptureInteractivePointerDown, true);

		return () => {
			document.removeEventListener("selectstart", onSelectStart);
			document.removeEventListener("mouseup", onMouseUp);
			document.removeEventListener("mousedown", onDocumentMouseDown);
			document.removeEventListener("keydown", onCtrlDown);
			document.removeEventListener("keyup", onCtrlUp);
			document.removeEventListener("pointerdown", onCaptureInteractivePointerDown, true);
		};
	}

	onMount(translationForm);
</script>

<div class="translator-actions sticky-rotate">
	<button
		type="button"
		class="translator-action-button"
		onclick={rotateCatalogs}
		disabled={rotatePending || pending}
		aria-disabled={rotatePending || pending}
		title="Rotate catalogs"
	>
		{rotatePending ? "Rotating..." : "Rotate"}
	</button>

	{#if success}
		<div class="translator-feedback success">{success}</div>
	{:else if error}
		<div class="translator-feedback error">{error}</div>
	{/if}
</div>

<div
	class="translator-shell sticky"
	bind:this={panelEl}
	use:draggable={{
		active: (activate: boolean) => {
			activeSwitchLocale = activate;
		},
		drag: () => dragQua
	}}
>
	<div class="translator-toggle">
		<button
			type="button"
			class="translator-toggle-button"
			onclick={handleLocaleToggle}
			title="qa-button"
			disabled={activeSwitchLocale}
			aria-disabled={activeSwitchLocale}
		>
			[-QA-] {renderedLocale}
		</button>
	</div>

	{#if spawnTranslation}
		<TranslationHelperForm
			{capturedSelection}
			{contextPending}
			{contextError}
			{contextResult}
			{selectedResolvedKey}
			{focusedAltKey}
			bind:translatedValue
			{stagedTranslations}
			hasActiveSuggestion={hasActiveSuggestion()}
			{pending}
			{error}
			{success}
			onClose={requestCloseTranslation}
			onSubmit={submitStagedTranslations}
			onStage={stageCurrentTranslation}
			onAltFocusChange={setFocusedAltKey}
			{onAltKeydown}
			onSelectAlt={handleSelectAlt}
			{isStaged}
			{isSelectedAlt}
			{setTranslationInputEl}
			{moveSelection}
		/>
	{/if}

	{#if showPendingChangesDialog}
		<PendingChangesDialog
			{pending}
			onCancel={() => (showPendingChangesDialog = false)}
			onDiscard={discardAndCloseTranslation}
			onSubmit={() => void submitAndCloseTranslation()}
		/>
	{/if}
</div>

<style>
	.translator-shell {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	.translator-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
	}

	.translator-action-button {
		appearance: none;
		border: 1px solid rgba(255, 213, 128, 0.45);
		background: linear-gradient(180deg, rgba(58, 42, 16, 0.96), rgba(39, 28, 10, 0.96));
		color: #fff2d7;
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		font: inherit;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 0 10px 24px rgba(7, 10, 8, 0.22);
		transition:
			transform 0.16s ease,
			box-shadow 0.16s ease,
			opacity 0.16s ease,
			border-color 0.16s ease;
	}

	.translator-action-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 14px 28px rgba(7, 10, 8, 0.28);
		border-color: rgba(255, 213, 128, 0.7);
	}

	.translator-action-button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.translator-feedback {
		max-width: min(20rem, calc(100vw - 2rem));
		padding: 0.45rem 0.7rem;
		border-radius: 0.75rem;
		font-size: 0.74rem;
		line-height: 1.35;
	}

	.translator-feedback.success {
		background: rgba(70, 255, 170, 0.12);
		border: 1px solid rgba(102, 255, 178, 0.28);
		color: rgba(236, 255, 243, 0.98);
	}

	.translator-feedback.error {
		background: rgba(255, 110, 110, 0.12);
		border: 1px solid rgba(255, 130, 130, 0.28);
		color: rgba(255, 224, 224, 0.98);
	}

	.translator-toggle {
		display: inline-flex;
		opacity: 0.72;
		transition: opacity 0.18s ease;
	}

	.translator-toggle-button {
		appearance: none;
		border: 1px solid rgba(145, 214, 176, 0.4);
		background:
			linear-gradient(180deg, rgba(33, 54, 43, 0.96), rgba(20, 30, 25, 0.96));
		color: #e9fff1;
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 0 10px 24px rgba(7, 10, 8, 0.22);
		transition:
			transform 0.16s ease,
			box-shadow 0.16s ease,
			opacity 0.16s ease,
			border-color 0.16s ease;
	}

	.translator-toggle-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 14px 28px rgba(7, 10, 8, 0.28);
		border-color: rgba(145, 214, 176, 0.7);
	}

	.translator-toggle-button:disabled {
		opacity: 0.38;
		cursor: default;
	}

	.translator-toggle:hover {
		opacity: 1;
	}

	.sticky {
		position: fixed;
		top: 10%;
		left: 5%;
		z-index: 500000;
	}

	.sticky-rotate {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 500000;
	}

	@media (max-width: 640px) {
		.sticky {
			left: 0.75rem;
			right: 0.75rem;
			top: auto;
			bottom: 5rem;
		}

		.sticky-rotate {
			left: 0.75rem;
			right: 0.75rem;
		}
	}
</style>
