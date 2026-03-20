<script lang="ts">
	import { dev } from "$app/environment";
	import { Angy } from "$lib";
</script>

{#if dev}
	<Angy />
{/if}

<slot />
