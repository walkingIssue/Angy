<script lang="ts">
	import { tick } from "svelte";
	import VibeTooltip from "./VibeTooltip.svelte";
	import TranslationAlternativeItem from "./TranslationAlternativeItem.svelte";
	import {
		getEffectiveResolvedKey,
		getTranslationStatus,
		TRANSLATION_STATUS_TOOLTIP,
		translationKey,
		type DraftTranslation,
		type TranslationContextResult
	} from "./toggleQA.shared";

	let {
		capturedSelection,
		contextPending,
		contextError,
		contextResult,
		selectedResolvedKey,
		focusedAltKey,
		translatedValue = $bindable(),
		stagedTranslations,
		hasActiveSuggestion,
		hasDraft,
		pending,
		previewOnly,
		error,
		success,
		onClose,
		onSubmit,
		onStage,
		onInputValue,
		onAltFocusChange,
		onAltKeydown,
		onSelectAlt,
		isStaged,
		isSelectedAlt,
		setTranslationInputEl,
		moveSelection
	}: {
		capturedSelection: string | undefined;
		contextPending: boolean;
		contextError: string | null;
		contextResult: TranslationContextResult | null;
		selectedResolvedKey: { msgid: string; msgctxt: string | null } | null;
		focusedAltKey: string | null;
		translatedValue: string;
		stagedTranslations: Record<string, DraftTranslation>;
		hasActiveSuggestion: boolean;
		hasDraft: boolean;
		pending: boolean;
		previewOnly: boolean;
		error: string | null;
		success: string | null;
		onClose: () => void;
		onSubmit: (event: SubmitEvent) => void;
		onStage: (event?: Event) => void;
		onInputValue: () => void;
		onAltFocusChange: (key: string | null) => void;
		onAltKeydown: (event: KeyboardEvent, msgid: string, msgctxt: string | null) => void;
		onSelectAlt: (event: Event, msgid: string, msgctxt: string | null) => void;
		isStaged: (msgid: string, msgctxt: string | null) => boolean;
		isSelectedAlt: (msgid: string, msgctxt: string | null) => boolean;
		setTranslationInputEl: (element: HTMLTextAreaElement | null) => void;
		moveSelection: (direction: 1 | -1) => boolean;
	} = $props();

	const hasDirtyTranslations = $derived(
		Object.values(stagedTranslations).some((item) => item.isDirty)
	);
	const commitTarget = $derived(
		getEffectiveResolvedKey(selectedResolvedKey, contextResult)?.msgid
	);
	const selectedAlternativeKey = $derived.by(() => {
		const selected = getEffectiveResolvedKey(selectedResolvedKey, contextResult);
		if (!selected || !contextResult?.alternatives.length) return null;

		const matchesAlternative = contextResult.alternatives.some(
			(alt) =>
				alt.msgid === selected.msgid && (alt.msgctxt ?? null) === (selected.msgctxt ?? null)
		);

		return matchesAlternative ? translationKey(selected.msgid, selected.msgctxt) : null;
	});
	let translationInputElement: HTMLTextAreaElement | null = null;
	let alternativesListEl = $state<HTMLUListElement | null>(null);

	$effect(() => {
		setTranslationInputEl(translationInputElement);
	});

	$effect(() => {
		void (async () => {
			if (!alternativesListEl || !selectedAlternativeKey) return;

			await tick();

			const item = [...alternativesListEl.querySelectorAll<HTMLElement>("[data-alt-key]")].find(
				(element) => element.dataset.altKey === selectedAlternativeKey
			);

			if (!item) return;
			item.scrollIntoView({
				block: "nearest",
				inline: "nearest",
				behavior: "smooth"
			});
		})();
	});
</script>

<form method="POST" class="translation-card" onsubmit={onSubmit}>
	<div class="card-header">
		<div class="card-title">Translation helper</div>
		<button
			type="button"
			class="icon-close"
			aria-label="Close translation form"
			onclick={onClose}
		>
			&#215;
		</button>
	</div>

	<input name="translationKey" type="hidden" value={capturedSelection} />

	<div class="meta-block">
		{#if contextPending}
			<p class="meta-status">Looking up PO context...</p>
		{:else if contextError}
			<p class="meta-status error">{contextError}</p>
		{:else if contextResult}
			<div class="context-panel">
				<div
					class="current-target"
					class:staged={isStaged(contextResult.entry.msgid, contextResult.entry.msgctxt)}
				>
					<div class="current-target-copy">
						<span class="context-label">Matched key</span>
						<code class="current-target-key">{contextResult.entry.msgid}</code>
						{#if contextResult.entry.msgctxt}
							<div class="current-target-context">
								<span class="context-label">Context</span>
								<code>{contextResult.entry.msgctxt}</code>
							</div>
						{/if}
					</div>
					<VibeTooltip
						delay={100}
						disabled={false}
						text={TRANSLATION_STATUS_TOOLTIP}
						position="top"
					>
						<span class="alt-status current-target-status">{getTranslationStatus(contextResult.entry)}</span>
					</VibeTooltip>
				</div>

				<div class="context-row">
					<span class="context-label">Match score</span>
					<span>{contextResult.match.score.toFixed(3)}</span>
				</div>

				{#if contextResult.catalogState?.status === "out_of_sync"}
					<div class="catalog-warning">
						<span class="context-label">Warning</span>
						<div>Catalogs are out of sync. Rotation can overwrite working-only translations.</div>
					</div>
				{/if}

				{#if contextResult.entry.flags.length}
					<div class="context-row">
						<span class="context-label">Flags</span>
						<span>{contextResult.entry.flags.join(", ")}</span>
					</div>
				{/if}

				{#if contextResult.entry.references.length}
					<div class="context-row stacked">
						<span class="context-label">References</span>
						<ul>
							{#each contextResult.entry.references as ref}
								<li><code>{ref}</code></li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if contextResult.entry.extractedComments.length}
					<div class="context-row stacked">
						<span class="context-label">Comments</span>
						<ul>
							{#each contextResult.entry.extractedComments as comment}
								<li>{comment}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if contextResult.alternatives.length}
					<div class="context-row stacked">
						<span class="context-label">Alternatives</span>

						<ul class="alt-list" bind:this={alternativesListEl}>
							{#each contextResult.alternatives as alt}
								<TranslationAlternativeItem
									{alt}
									selected={isSelectedAlt(alt.msgid, alt.msgctxt)}
									focused={focusedAltKey === `${alt.msgctxt ?? ""}::${alt.msgid}`}
									staged={isStaged(alt.msgid, alt.msgctxt)}
									onFocusChange={onAltFocusChange}
									onKeydown={onAltKeydown}
									onSelect={onSelectAlt}
								/>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="commit-target-row">
		<span class="context-label">Commit target</span>
		<code>{commitTarget ?? contextResult?.entry.msgid}</code>
	</div>

	<label class="field">
		<span class="field-label">Selected text</span>
		<div class="selected-copy">{capturedSelection}</div>
		{#if previewOnly}
			<div class="preview-note">
				Working locale preview mode is active. Rotate back to a non-working locale to stage or
				commit translations.
			</div>
		{:else}
			<textarea
				bind:this={translationInputElement}
				name="translationValue"
				class="translation-input"
				class:suggested={hasActiveSuggestion}
				class:draft={hasDraft}
				rows="4"
				bind:value={translatedValue}
				placeholder={capturedSelection}
				oninput={onInputValue}
				onkeydown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						onStage(event);
						return;
					}

					if (event.key === "Tab") {
						event.preventDefault();
						moveSelection(event.shiftKey ? -1 : 1);
					}
				}}
			></textarea>
		{/if}
	</label>

	<div class="meta-row">
		<span class="selection-count">{capturedSelection?.length ?? 0} chars</span>
	</div>

	<div class="actions">
		{#if success}
			<p>{success}</p>
		{:else if error}
			<p>Failed: {error}</p>
		{/if}

		{#if !previewOnly}
			<button
				type="button"
				class="tool-btn"
				disabled={!translatedValue.trim() || !commitTarget}
				onclick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onStage(event);
				}}
			>
				Stage
			</button>

			<button
				type="submit"
				class="tool-btn primary"
				disabled={!hasDirtyTranslations || pending}
				aria-disabled={!hasDirtyTranslations || pending}
			>
				{pending ? "Committing..." : "Commit all"}
			</button>
		{/if}
	</div>
</form>

<style>
	.meta-block {
		margin-bottom: 0.85rem;
	}

	.meta-status {
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.meta-status.error {
		color: rgba(255, 120, 120, 0.95);
	}

	.context-panel {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.75rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.045);
		border: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 0.8rem;
	}

	.context-row {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		justify-content: space-between;
		font-size: 0.78rem;
	}

	.context-row.stacked {
		flex-direction: column;
		justify-content: flex-start;
	}

	.context-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.58);
	}

	.context-panel code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		color: rgba(195, 225, 255, 0.95);
		word-break: break-word;
	}

	.context-panel ul {
		margin: 0;
		padding-left: 1rem;
	}

	.translation-card {
		width: clamp(20rem, 32vw, 34rem);
		max-width: min(34rem, calc(100vw - 2rem));
		max-height: min(85vh, 60rem);
		overflow: auto;
		padding: 0.9rem;
		border-radius: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: linear-gradient(180deg, rgba(25, 27, 34, 0.94) 0%, rgba(17, 19, 25, 0.96) 100%);
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.38),
			0 8px 20px rgba(0, 0, 0, 0.22),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		color: rgba(248, 250, 252, 0.96);
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.8rem;
	}

	.card-title {
		font-size: 0.9rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		color: rgba(255, 255, 255, 0.96);
	}

	.icon-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.78);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		transition:
			background 0.18s ease,
			color 0.18s ease,
			transform 0.18s ease;
	}

	.icon-close:hover {
		background: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.96);
		transform: scale(1.03);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.selected-copy {
		padding: 0.75rem 0.85rem;
		border-radius: 0.8rem;
		background: rgba(255, 255, 255, 0.045);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.92rem;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.95);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.field-label {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(255, 255, 255, 0.6);
	}

	.translation-input {
		width: 100%;
		min-height: 7rem;
		max-height: min(40vh, 18rem);
		padding: 0.85rem 0.95rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.85rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.96);
		font: inherit;
		font-size: 0.92rem;
		line-height: 1.45;
		resize: vertical;
		overflow: auto;
		outline: none;
		box-sizing: border-box;
		transition:
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease;
	}

	.translation-input::placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.translation-input:hover {
		background: rgba(255, 255, 255, 0.065);
	}

	.translation-input:focus {
		border-color: rgba(110, 168, 255, 0.55);
		background: rgba(255, 255, 255, 0.07);
		box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.12);
	}

	.translation-input.suggested {
		background: rgba(255, 214, 102, 0.12);
		border-color: rgba(255, 214, 102, 0.4);
		box-shadow: 0 0 0 1px rgba(255, 214, 102, 0.18);
	}

	.translation-input.suggested:hover,
	.translation-input.suggested:focus {
		background: rgba(255, 214, 102, 0.16);
		border-color: rgba(255, 214, 102, 0.48);
		box-shadow: 0 0 0 4px rgba(255, 214, 102, 0.12);
	}

	.translation-input.draft {
		background: rgba(255, 120, 120, 0.12);
		border-color: rgba(255, 130, 130, 0.38);
		box-shadow: 0 0 0 1px rgba(255, 130, 130, 0.16);
	}

	.preview-note {
		padding: 0.8rem 0.9rem;
		border-radius: 0.8rem;
		background: rgba(255, 196, 120, 0.08);
		border: 1px solid rgba(255, 196, 120, 0.24);
		color: rgba(255, 242, 220, 0.96);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.catalog-warning {
		padding: 0.75rem 0.8rem;
		border-radius: 0.8rem;
		background: rgba(255, 188, 88, 0.1);
		border: 1px solid rgba(255, 188, 88, 0.26);
		color: rgba(255, 243, 220, 0.96);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.meta-row {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.45rem;
		margin-bottom: 0.85rem;
	}

	.selection-count {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.48);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.alt-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-height: 31rem;
		overflow-y: auto;
		padding-right: 0.3rem;
		scroll-behavior: smooth;
		scrollbar-gutter: stable;
	}

	.current-target {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.85rem;
		padding: 0.8rem;
		border-radius: 0.85rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.current-target-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		flex: 1 1 auto;
	}

	.current-target-key {
		font-size: 0.9rem;
		line-height: 1.5;
		color: rgba(230, 243, 255, 0.98);
	}

	.current-target-context {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.current-target.staged {
		border-color: rgba(120, 255, 170, 0.45);
		background: rgba(70, 255, 170, 0.08);
		box-shadow: 0 0 0 4px rgba(70, 255, 170, 0.08);
	}

	.current-target-status {
		flex: 0 0 auto;
	}

	.commit-target-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.85rem;
		padding: 0.75rem 0.8rem;
		border-radius: 0.8rem;
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid rgba(255, 255, 255, 0.07);
	}

	.alt-status {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6rem;
		height: 1.6rem;
		font-size: 0.95rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
	}

	.tool-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.7rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.8rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(248, 250, 252, 0.96);
		font: inherit;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			transform 0.16s ease,
			box-shadow 0.16s ease;
	}

	.tool-btn.primary {
		border-color: rgba(102, 255, 178, 0.3);
		background: rgba(70, 255, 170, 0.14);
		color: rgba(236, 255, 243, 0.98);
	}

	.tool-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.09);
		border-color: rgba(255, 255, 255, 0.18);
	}

	.tool-btn.primary:hover:not(:disabled) {
		background: rgba(70, 255, 170, 0.2);
		border-color: rgba(102, 255, 178, 0.45);
	}

	.tool-btn:focus-visible {
		outline: none;
		border-color: rgba(110, 168, 255, 0.55);
		box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.12);
	}

	.tool-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.translation-card {
			width: min(100%, 32rem);
			max-width: 100%;
			max-height: min(78vh, calc(100vh - 6rem));
			padding: 0.8rem;
		}

		.current-target {
			flex-direction: column;
		}

		.context-row {
			flex-direction: column;
			align-items: stretch;
			gap: 0.35rem;
		}

		.alt-list {
			max-height: min(32vh, 18rem);
		}
	}

	@media (max-width: 420px) {
		.translation-card {
			width: min(100vw - 1rem, 32rem);
			border-radius: 0.9rem;
		}

		.actions {
			justify-content: stretch;
		}

		.actions :global(button) {
			flex: 1 1 auto;
		}
	}
</style>
