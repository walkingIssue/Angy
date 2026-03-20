<script lang="ts">
	let {
		pending = false,
		onCancel,
		onDiscard,
		onSubmit
	}: {
		pending?: boolean;
		onCancel: () => void;
		onDiscard: () => void;
		onSubmit: () => void;
	} = $props();
</script>

<div class="dialog-backdrop" role="presentation">
	<div
		class="dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="pending-changes-title"
		aria-describedby="pending-changes-description"
	>
		<h2 id="pending-changes-title">Staged changes</h2>
		<p id="pending-changes-description">
			You have staged translations waiting to be committed. Do you want to submit them or discard
			them before closing?
		</p>

		<div class="actions">
			<button type="button" class="secondary-btn" onclick={onCancel}>Cancel</button>
			<button type="button" class="secondary-btn" disabled={pending} onclick={onDiscard}>
				Discard
			</button>
			<button type="button" class="primary-btn" disabled={pending} onclick={onSubmit}>
				{pending ? "Submitting..." : "Submit"}
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
		width: min(28rem, calc(100vw - 2rem));
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: linear-gradient(180deg, rgba(25, 27, 34, 0.98) 0%, rgba(17, 19, 25, 0.99) 100%);
		box-shadow:
			0 24px 60px rgba(0, 0, 0, 0.45),
			0 8px 20px rgba(0, 0, 0, 0.26);
		color: rgba(248, 250, 252, 0.96);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	p {
		margin: 0;
		color: rgba(255, 255, 255, 0.74);
		line-height: 1.45;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1rem;
		flex-wrap: wrap;
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
		border: 1px solid rgba(102, 255, 178, 0.35);
		background: rgba(70, 255, 170, 0.14);
		color: rgba(236, 255, 243, 0.98);
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
