<script lang="ts">
	let {
		text,
		position = 'top',
		disabled = false,
		delay = 120
	}: {
		text: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		disabled?: boolean;
		delay?: number;
	} = $props();

	let visible = $state(false);
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const id = `tooltip-${Math.random().toString(36).slice(2, 10)}`;

	function show() {
		if (disabled || !text) return;
		clearDelay();
		timeout = setTimeout(() => {
			visible = true;
		}, delay);
	}

	function hide() {
		clearDelay();
		visible = false;
	}

	function clearDelay() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	}
</script>

<div
	class="tooltip-wrap"
	onmouseenter={show}
	onmouseleave={hide}
	onfocusin={show}
	onfocusout={hide}
>
	<slot />

	{#if visible && !disabled && text}
		<div
			id={id}
			role="tooltip"
			class={`tooltip tooltip--${position}`}
		>
			{text}
		</div>
	{/if}
</div>

<style>
	.tooltip-wrap {
		position: relative;
		display: inline-flex;
		width: fit-content;
	}

	.tooltip {
		position: absolute;
		z-index: 1000;
		/*max-width: 18rem; /*:S*/
		padding: 0.45rem 0.65rem;
		border-radius: 0.5rem;
		background: rgba(20, 20, 20, 0.96);
		color: white;
		font-size: 0.8rem;
		line-height: 1.2;
		white-space: nowrap;
		pointer-events: none;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.22),
			0 2px 8px rgba(0, 0, 0, 0.14);
	}

	.tooltip::after {
		content: '';
		position: absolute;
		width: 0;
		height: 0;
		border-style: solid;
	}

	.tooltip--top {
		bottom: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip--top::after {
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border-width: 0.35rem 0.35rem 0 0.35rem;
		border-color: rgba(20, 20, 20, 0.96) transparent transparent transparent;
	}

	.tooltip--bottom {
		top: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip--bottom::after {
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		border-width: 0 0.35rem 0.35rem 0.35rem;
		border-color: transparent transparent rgba(20, 20, 20, 0.96) transparent;
	}

	.tooltip--left {
		right: calc(100% + 0.5rem);
		top: 50%;
		transform: translateY(-50%);
	}

	.tooltip--left::after {
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
		border-width: 0.35rem 0 0.35rem 0.35rem;
		border-color: transparent transparent transparent rgba(20, 20, 20, 0.96);
	}

	.tooltip--right {
		left: calc(100% + 0.5rem);
		top: 50%;
		transform: translateY(-50%);
	}

	.tooltip--right::after {
		right: 100%;
		top: 50%;
		transform: translateY(-50%);
		border-width: 0.35rem 0.35rem 0.35rem 0;
		border-color: transparent rgba(20, 20, 20, 0.96) transparent transparent;
	}
</style>
