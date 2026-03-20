<svelte:head>
	<title>Angy</title>
</svelte:head>

<script lang="ts">
	const examples = [
		"Highlight text on the page to open the helper.",
		"Hold Alt and click an interactive element to extract its label.",
		"Use the route handler at /api/translations during dev."
	];
</script>

<section class="hero">
	<p class="eyebrow">Angy</p>
	<h1>Translation helper sandbox</h1>
	<p class="lede">
		A small SvelteKit-first extraction of the QA translation overlay, lookup route, and working
		catalog commit flow.
	</p>
	<ul>
		{#each examples as example}
			<li>{example}</li>
		{/each}
	</ul>
</section>

<style>
	:global(body) {
		margin: 0;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		background:
			radial-gradient(circle at top, rgba(90, 170, 120, 0.14), transparent 42%),
			linear-gradient(180deg, #0e1210 0%, #121918 100%);
		color: #f2f6f3;
		min-height: 100vh;
	}

	.hero {
		max-width: 48rem;
		padding: 5rem 1.5rem 6rem;
		margin: 0 auto;
	}

	.eyebrow {
		margin: 0 0 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.72rem;
		color: rgba(194, 242, 208, 0.72);
	}

	h1 {
		margin: 0 0 1rem;
		font-size: clamp(2.2rem, 5vw, 4rem);
		line-height: 0.95;
	}

	.lede {
		max-width: 42rem;
		font-size: 1.02rem;
		line-height: 1.6;
		color: rgba(242, 246, 243, 0.76);
	}

	ul {
		margin: 2rem 0 0;
		padding-left: 1.1rem;
		color: rgba(242, 246, 243, 0.84);
	}

	li + li {
		margin-top: 0.55rem;
	}
</style>
