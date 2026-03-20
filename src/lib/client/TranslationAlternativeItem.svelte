<script lang="ts">
	import VibeTooltip from "./VibeTooltip.svelte";
	import {
		getTranslationStatus,
		TRANSLATION_STATUS_TOOLTIP,
		translationKey,
		type TranslationAlternative
	} from "./toggleQA.shared";

	let {
		alt,
		selected = false,
		focused = false,
		staged = false,
		onFocusChange,
		onKeydown,
		onSelect
	}: {
		alt: TranslationAlternative;
		selected?: boolean;
		focused?: boolean;
		staged?: boolean;
		onFocusChange: (key: string | null) => void;
		onKeydown: (event: KeyboardEvent, msgid: string, msgctxt: string | null) => void;
		onSelect: (event: Event, msgid: string, msgctxt: string | null) => void;
	} = $props();

	function getItemKey() {
		return translationKey(alt.msgid, alt.msgctxt);
	}

	async function copyReferenceCommand(event: MouseEvent, ref: string) {
		event.preventDefault();
		event.stopPropagation();

		const command = `code ${ref}`;
		await navigator.clipboard.writeText(command);
	}
</script>

<li
	data-alt-key={getItemKey()}
	class:selected
	class:focused
	class:staged
	class="alt-item"
	tabindex="0"
	onfocus={() => onFocusChange(getItemKey())}
	onblur={() => onFocusChange(null)}
	onkeydown={(event) => onKeydown(event, alt.msgid, alt.msgctxt)}
>
	<div class="alt-main">
		<div class="alt-row-bet">
			<div class="alt-copy">
				<div class="alt-header">
					<span class="context-label">Key</span>
					<code class="alt-id">{alt.msgid}</code>
				</div>
				{#if alt.hasTranslation}
					<div class="alt-row">
						<span class="context-label">Text</span>
						<code class="alt-translation">{alt.msgstr.join("\n")}</code>
					</div>
				{/if}
				{#each alt.references.slice(0, 3) as ref, index (`${ref}-${index}`)}
					<div class="alt-row">
						<button
							type="button"
							class="ref-btn"
							aria-label={`Copy VS Code command for ${ref}`}
							title="Copy VS Code command"
							onclick={(event) => void copyReferenceCommand(event, ref)}
						>
							#:
						</button>
						<span class="alt-context">{ref}</span>
					</div>
				{/each}
			</div>
			<div class="alt-keycont">
			<button
					type="button"
					class="alt-select-btn"
					class:selected
					aria-label="Use this key"
					title="Use this key"
					onclick={(event) => onSelect(event, alt.msgid, alt.msgctxt)}
				>
					&#8658;
				</button>
					<VibeTooltip delay={100} disabled={false} text={TRANSLATION_STATUS_TOOLTIP} position="top">
						<div class="alt-main">
							<span class="alt-status">{getTranslationStatus(alt)}</span>
							<span class="alt-score">({alt.score.toFixed(3)})</span>
						</div>
					</VibeTooltip>
				</div>
			</div>
		<div class="alt-meta">
			{#if alt.msgctxt}
				<code class="alt-context">{alt.msgctxt}</code>
			{/if}
		</div>
	</div>
</li>

<style>
	.alt-item {
		display: block;
		padding: 0.7rem 0.75rem;
		border-radius: 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.035);
		outline: none;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease,
			transform 0.16s ease;
	}

	.alt-item:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.alt-item:focus,
	.alt-item.focused {
		border-color: rgba(110, 168, 255, 0.5);
		box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.1);
		background: rgba(255, 255, 255, 0.06);
	}

	.alt-item.selected {
		border-color: rgba(102, 255, 178, 0.42);
		box-shadow: 0 0 0 4px rgba(102, 255, 178, 0.08);
		background: rgba(70, 255, 170, 0.05);
	}

	.alt-item.staged {
		border-color: rgba(120, 255, 170, 0.45);
		background: rgba(70, 255, 170, 0.08);
		box-shadow: 0 0 0 4px rgba(70, 255, 170, 0.08);
	}

	.alt-main {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.alt-copy {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-width: 0;
		flex: 1 1 auto;
	}

	.alt-keycont {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		align-items: flex-end;
		gap: 0.45rem;
		flex: 0 0 auto;
	}

	.alt-header {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: start;
		gap: 0.55rem;
	}

	.context-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.58);
	}

	.alt-id {
		white-space: pre-wrap;
		word-break: break-word;
	}

	.alt-translation {
		white-space: pre-wrap;
		word-break: break-word;
		color: rgba(232, 243, 255, 0.94);
	}

	.alt-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.alt-score {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.55);
	}

	.alt-context {
		font-size: 0.7rem;
		color: rgba(195, 225, 255, 0.82);
	}

	.alt-row {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 0.3rem;
		padding-top: 0.15rem;
	}
	.alt-row-bet {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: 0.15rem;
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

	.alt-select-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			transform 0.16s ease,
			box-shadow 0.16s ease;
	}

	.alt-select-btn:hover {
		background: rgba(255, 255, 255, 0.09);
		border-color: rgba(255, 255, 255, 0.18);
		transform: translateX(-1px);
	}

	.alt-select-btn:focus-visible {
		outline: none;
		border-color: rgba(110, 168, 255, 0.55);
		box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.12);
	}

	.alt-select-btn.selected {
		background: rgba(70, 255, 170, 0.12);
		border-color: rgba(102, 255, 178, 0.42);
		color: rgba(220, 255, 235, 0.98);
	}

	.ref-btn {
		padding: 0.05rem 0.28rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.35rem;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.72);
		font: inherit;
		font-size: 0.62rem;
		line-height: 1.2;
		cursor: pointer;
		flex: 0 0 auto;
	}

	.ref-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.92);
	}

	.ref-btn:focus-visible {
		outline: none;
		border-color: rgba(110, 168, 255, 0.55);
		box-shadow: 0 0 0 3px rgba(110, 168, 255, 0.12);
	}

	@media (max-width: 640px) {
		.alt-row-bet {
			flex-direction: column;
		}

		.alt-keycont {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}
</style>
