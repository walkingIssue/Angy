<script lang="ts">
	let {
		pending = false,
		affected,
		onCancel,
		onConfirm
	}: {
		pending?: boolean;
		affected: Array<{
			msgid: string;
			msgctxt: string | null;
			baseValue: string;
			workingValue: string;
		}>;
		onCancel: () => void;
		onConfirm: () => void;
	} = $props();
</script>

<div class="dialog-backdrop" role="presentation">
	<div
		class="dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="rotation-warning-title"
		aria-describedby="rotation-warning-description"
	>
		<h2 id="rotation-warning-title">Catalog rotation warning</h2>
		<p id="rotation-warning-description">
			These working translations differ from base. Rotating now will promote the working catalog
			and effectively overwrite the current base values for the keys below.
		</p>

		<ul class="impact-list">
			{#each affected as item}
				<li>
					<div class="impact-key">
						<code>{item.msgid}</code>
						{#if item.msgctxt}
							<code>{item.msgctxt}</code>
						{/if}
					</div>
					<div class="impact-values">
						<div>
							<span>Base</span>
							<code>{item.baseValue || "(empty)"}</code>
						</div>
						<div>
							<span>Working</span>
							<code>{item.workingValue || "(empty)"}</code>
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<div class="actions">
			<button type="button" class="secondary-btn" onclick={onCancel}>Cancel</button>
			<button type="button" class="primary-btn" disabled={pending} onclick={onConfirm}>
				{pending ? "Rotating..." : "Rotate anyway"}
			</button>
		</div>
	</div>
</div>

<style>
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.55);
		z-index: 500100;
	}

	.dialog {
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(80vh, 48rem);
		overflow: auto;
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(255, 196, 120, 0.22);
		background: linear-gradient(180deg, rgba(25, 27, 34, 0.98) 0%, rgba(17, 19, 25, 0.99) 100%);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
		color: rgba(248, 250, 252, 0.96);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	p {
		margin: 0 0 1rem;
		color: rgba(255, 255, 255, 0.74);
		line-height: 1.45;
	}

	.impact-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.impact-list li {
		padding: 0.75rem;
		border-radius: 0.8rem;
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.impact-key,
	.impact-values {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.impact-values {
		margin-top: 0.6rem;
	}

	.impact-values span {
		display: inline-block;
		min-width: 4rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.58);
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.76rem;
		word-break: break-word;
		color: rgba(232, 243, 255, 0.94);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1rem;
	}

	.primary-btn,
	.secondary-btn {
		min-height: 2.5rem;
		padding: 0.7rem 1rem;
		border-radius: 0.8rem;
		font: inherit;
		cursor: pointer;
	}

	.primary-btn {
		border: 1px solid rgba(255, 196, 120, 0.35);
		background: rgba(255, 172, 80, 0.14);
		color: rgba(255, 242, 220, 0.98);
	}

	.secondary-btn {
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(248, 250, 252, 0.96);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
