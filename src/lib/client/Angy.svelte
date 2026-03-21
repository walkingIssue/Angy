<!-- @wc-ignore-file -->
<script lang="ts">
	import { browser, dev } from "$app/environment";
	import { page } from "$app/state";
	import { loadLocale } from "wuchale/load-utils";
	import { onMount } from "svelte";
	import { draggable } from "./dragItem";
	import PendingChangesDialog from "./PendingChangesDialog.svelte";
	import RotationWarningDialog from "./RotationWarningDialog.svelte";
	import TranslationHelperForm from "./TranslationHelperForm.svelte";
	import {
		clearDraftValue,
		getDraftValue,
		readDraftCache,
		setDraftValue,
		type DraftCacheItem
	} from "./translationDrafts";
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
	const LOCALE_STORAGE_KEY = "angy:locale";
	const LOCALE_COOKIE_KEY = "locale";

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
	let draftLookup = $state<Record<string, DraftCacheItem>>(readDraftCache());

	let currentLocale = $state(defaultLocales);
	let locale = 0;

	let activeSwitchLocale = $state(false);
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
	let showRotationWarningDialog = $state(false);
	let rotationImpact = $state<
		Array<{ msgid: string; msgctxt: string | null; baseValue: string; workingValue: string }>
	>([]);
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

	function peekNextLocale() {
		const nextIndex = locale >= currentLocale.length - 1 ? 0 : locale + 1;
		return currentLocale[nextIndex];
	}

	function persistLocaleSelection(nextLocale: string) {
		if (!browser) return;
		localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
		document.cookie = `${LOCALE_COOKIE_KEY}=${nextLocale}; path=/; SameSite=Lax`;
	}

	function isWorkingLocaleName(value: string | null | undefined) {
		return Boolean(value?.endsWith("-working"));
	}

	const previewOnly = $derived(isWorkingLocaleName(renderedLocale));

	function focusTranslationInput() {
		queueMicrotask(() => {
			translationInputEl?.focus();
			translationInputEl?.select();
		});
	}

	async function handleLocaleToggle(event: MouseEvent) {
		if (activeSwitchLocale || pending) return;
		event.preventDefault();
		const nextLocale = peekNextLocale();
		persistLocaleSelection(nextLocale);

		if (isWorkingLocaleName(nextLocale)) {
			resetFeedback();
			pending = true;

			try {
				const response = await fetch(`${endpoint}?intent=promote-working-preview`, {
					method: "POST"
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok) {
					error = payload?.error ?? "Failed to prepare working preview";
					return;
				}
			} catch {
				error = "Failed to prepare working preview";
				return;
			} finally {
				pending = false;
			}
		}

		await loadLocale(getLocale());
	}

	function getStaged(msgid: string, msgctxt: string | null) {
		return stagedTranslations[translationKey(msgid, msgctxt)] ?? null;
	}

	function getSuggestion(msgid: string, msgctxt: string | null) {
		return suggestionLookup[translationKey(msgid, msgctxt)] ?? "";
	}

	function getDraft(msgid: string, msgctxt: string | null) {
		return getDraftValue(draftLookup, msgid, msgctxt);
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

	function persistDraft(msgid: string, msgctxt: string | null, item: DraftCacheItem) {
		draftLookup = setDraftValue(draftLookup, msgid, msgctxt, item);
	}

	function clearDraft(msgid: string, msgctxt: string | null) {
		draftLookup = clearDraftValue(draftLookup, msgid, msgctxt);
	}

	function resetFeedback() {
		error = null;
		success = null;
	}

	async function runRotation(confirmDestructive = false) {
		rotatePending = true;
		resetFeedback();

		try {
			const response = await fetch(`${endpoint}?intent=rotate-catalogs`, {
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({ confirmDestructive })
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				if (payload?.code === "rotation_confirmation_required") {
					rotationImpact = Array.isArray(payload?.affected) ? payload.affected : [];
					showRotationWarningDialog = true;
					error = payload?.error ?? "Catalog rotation requires confirmation";
					return;
				}

				error = payload?.error ?? "Catalog rotation failed";
				return;
			}

			showRotationWarningDialog = false;
			rotationImpact = [];
			success = payload?.message ?? "Catalogs rotated";
		} catch {
			error = "Catalog rotation failed";
		} finally {
			rotatePending = false;
		}
	}

	async function rotateCatalogs() {
		if (rotatePending || pending) return;
		try {
			const response = await fetch(`${endpoint}?intent=rotate-preflight`, {
				method: "POST"
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				error = payload?.error ?? "Catalog rotation failed";
				return;
			}

			if (Array.isArray(payload?.affected) && payload.affected.length) {
				rotationImpact = Array.isArray(payload?.affected) ? payload.affected : [];
				showRotationWarningDialog = true;
				resetFeedback();
				return;
			}

			if (
				!confirm(
					"Rotate catalogs? This will back up both catalogs and promote the working catalog into the base catalog."
				)
			) {
				return;
			}

			await runRotation(false);
		} catch {
			error = "Catalog rotation failed";
		}
	}

	function resetContextState() {
		contextError = null;
		contextResult = null;
	}

	function hasDirtyStagedTranslations() {
		return Object.values(stagedTranslations).some((item) => item.isDirty);
	}

	function getResolvedInputValue(msgid: string, msgctxt: string | null) {
		return (
			getStaged(msgid, msgctxt)?.value ||
			getDraft(msgid, msgctxt)?.value ||
			getSuggestion(msgid, msgctxt) ||
			getEntryOriginalValue(contextResult, msgid, msgctxt)
		);
	}

	function syncDraftForResolved(msgid: string, msgctxt: string | null, value: string) {
		const originalValue = getEntryOriginalValue(contextResult, msgid, msgctxt);
		const trimmedValue = value.trim();
		if (!trimmedValue || trimmedValue === originalValue) {
			clearDraft(msgid, msgctxt);
			return;
		}

		persistDraft(msgid, msgctxt, {
			value,
			isDirty: trimmedValue !== originalValue
		});
	}

	function handleTranslationInput() {
		const resolved = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
		if (!resolved) return;
		syncDraftForResolved(resolved.msgid, resolved.msgctxt, translatedValue);
	}

	async function refreshContextAndReconcile(payload: DraftTranslation[]) {
		if (!capturedSelection) return true;

		await fetchContext();

		let allReconciled = true;
		for (const item of payload) {
			const latest = getEntryOriginalValue(contextResult, item.msgid, item.msgctxt);
			if (latest === item.value) {
				clearDraft(item.msgid, item.msgctxt);
			} else {
				allReconciled = false;
				persistDraft(item.msgid, item.msgctxt, { value: item.value, isDirty: true });
			}
		}

		return allReconciled;
	}

	function selectResolvedKey(msgid: string, msgctxt: string | null, focusInput = false) {
		selectedResolvedKey = { msgid, msgctxt };
		translatedValue = getResolvedInputValue(msgid, msgctxt);

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
		if (previewOnly) {
			error = "Working locale is preview-only. Rotate back to a non-working locale before staging.";
			return;
		}

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
		persistDraft(resolved.msgid, resolved.msgctxt, {
			value,
			isDirty: value !== originalValue
		});

		error = null;
		success = "Staged";

		if (!moveSelection(1)) {
			focusTranslationInput();
		}
	}

	async function commitStagedTranslations() {
		if (previewOnly) {
			error = "Working locale is preview-only. Commit from the base or target locale instead.";
			return false;
		}

		const payload = Object.values(stagedTranslations).filter((item) => item.isDirty);
		if (!payload.length) {
			error = "No changed translations to submit";
			return false;
		}

		pending = true;
		resetFeedback();

		try {
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

			const json = await res.json().catch(() => null);

			if (!res.ok) {
				error = json?.error ?? "Batch commit failed";
				return false;
			}

			const reconciled = await refreshContextAndReconcile(payload);
			const next = { ...stagedTranslations };
			for (const item of payload) {
				if (reconciled || getEntryOriginalValue(contextResult, item.msgid, item.msgctxt) === item.value) {
					delete next[translationKey(item.msgid, item.msgctxt)];
				}
			}
			stagedTranslations = next;
			success = reconciled
				? (json?.message ?? "Translations committed")
				: "Commit may have landed; verifying catalog state. Your edits were kept locally.";
			return true;
		} finally {
			pending = false;
		}
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
		const currentDraft = getDraft(json.entry.msgid, json.entry.msgctxt);
		translatedValue =
			getStaged(json.entry.msgid, json.entry.msgctxt)?.value ||
			currentDraft?.value ||
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

					const draft = getDraft(resolved.msgid, resolved.msgctxt);
					if (!staged && !draft && translatedValue === original && currentSuggestion) {
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

		if (!previewOnly) {
			focusTranslationInput();
		}
	}

	function closeTranslation() {
		spawnTranslation = false;
		capturedSelection = undefined;
		selectionStarted = false;
		translatedValue = "";
		selectedResolvedKey = null;
		focusedAltKey = null;
		showPendingChangesDialog = false;
		showRotationWarningDialog = false;
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
		for (const item of Object.values(stagedTranslations)) {
			clearDraft(item.msgid, item.msgctxt);
		}
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
				el.getAttribute("aria-label")?.trim() ||
				el.value?.trim() ||
				el.title?.trim() ||
				null
			);
		}

		function getFirstDescendantTextCandidate(root: Element) {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
			let current = walker.nextNode();

			while (current) {
				if (current instanceof HTMLElement) {
					const text = current.innerText?.trim() || current.textContent?.trim() || "";
					if (text) {
						return text;
					}
				}

				current = walker.nextNode();
			}

			return "";
		}

		const directText = [...el.childNodes]
			.filter((node) => node.nodeType === Node.TEXT_NODE)
			.map((node) => node.textContent?.trim() ?? "")
			.filter(Boolean)
			.slice(0,1)[0]
			.trim();
		const descendantText = getFirstDescendantTextCandidate(el);

		return (
			el.getAttribute("aria-label")?.trim() ||
			el.getAttribute("title")?.trim() ||
			directText ||
			descendantText ||
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

	onMount(() => {
		if (!browser) return;
		const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
		if (!storedLocale) return;
		const nextIndex = currentLocale.findIndex((item) => item === storedLocale);
		if (nextIndex >= 0) {
			locale = nextIndex;
			renderedLocale = currentLocale[nextIndex];
		}
	});
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
			disabled={activeSwitchLocale || pending}
			aria-disabled={activeSwitchLocale || pending}
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
			{previewOnly}
			hasDraft={Boolean(
				selectedResolvedKey &&
					getDraft(selectedResolvedKey.msgid, selectedResolvedKey.msgctxt)?.isDirty
			)}
			onClose={requestCloseTranslation}
			onSubmit={submitStagedTranslations}
			onStage={stageCurrentTranslation}
			onInputValue={handleTranslationInput}
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

	{#if showRotationWarningDialog}
		<RotationWarningDialog
			pending={rotatePending}
			affected={rotationImpact}
			onCancel={() => {
				showRotationWarningDialog = false;
				rotationImpact = [];
			}}
			onConfirm={() => void runRotation(true)}
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
