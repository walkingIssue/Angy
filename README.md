# Angy

Dev-only SvelteKit translation helper for in-app PO workflows.

<video src="./docs/images/Backdrop_And_Caching.webm" controls muted playsinline width="100%"></video>

## Install

```bash
npm install @walkinissue/angy
```

## What it does

- select copy directly in the app
- resolve the best PO key with nearby alternatives
- stage and commit translations without leaving the page
- request AI suggestions for untranslated strings
- rotate locales for visual QA

## Quick flow

1. Select text or `Alt`+click an interactive element.
2. Review the matched key and alternatives.
3. Edit or accept a suggestion.
4. Stage and commit.
5. Rotate locales and verify the page visually.

## Docs site

- [Showcase and docs](./docs/index.html)
- [Release notes](./docs/changelog/0.2.18.md)

## Integration

Use the plugin for dev glue, mount the component, and expose the server handler.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { angy } from "@walkinissue/angy/plugin";

export default defineConfig({
	plugins: [angy(), sveltekit()]
});
```

```ts
// angy.config.ts
import { defineAngyConfig } from "@walkinissue/angy/server";

export default defineAngyConfig({
	basePoPath: "./src/locales/en.po",
	workingPoPath: "./src/locales/en-working.po",
	sourceLocale: "sv",
	targetLocale: "en",
	routePath: "/api/translations",
	apiKey: ""
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { dev } from "$app/environment";
	import { Angy } from "@walkinissue/angy";

	let { children } = $props();
</script>

{#if dev}
	<Angy />
{/if}

{@render children?.()}
```

```ts
// src/routes/api/translations/+server.ts
export { handler as POST } from "@walkinissue/angy/server";
```

## Catalog model

- `en.po` is base
- `en-working.po` is runtime working state
- `en-working.angy-draft.po` is the draft write target
- commits write to draft first
- entering `*-working` preview promotes draft into runtime working

## Config

| Key | Required | Notes |
| --- | --- | --- |
| `basePoPath` | Yes | Base catalog path |
| `workingPoPath` | Yes | Working catalog path |
| `sourceLocale` | Yes | Source language for suggestions |
| `targetLocale` | Yes | Target language for suggestions |
| `routePath` | No | Defaults to `/api/translations` |
| `apiKey` | No | Empty string disables built-in suggestions |
| `systemMessage` | No | Custom suggestion prompt |
| `suggestionModel` | No | Defaults to `gpt-4.1-mini` |
| `watchIgnore` | No | Extra Vite watch ignore patterns |
| `suggestionProvider` | No | Custom suggestion pipeline |

## Frequent issues

- Locale changes in Angy, but the page does not rerender
  - Wuchale usually is not fully bootstrapped in the host app.
- `*-working` is visible, but commit is disabled
  - Working locale is preview-only by design.
- Rotation shows a warning modal
  - That is a preview of what rotation will promote into base.
- Angy refuses to operate with a catalog integrity error
  - Regenerate or replace the working catalog.

## Docs

- [Release notes](./docs/changelog/0.2.18.md)
- [Roadmap](./docs/roadmap.md)
- [Wuchale runtime wiring](./docs/wuchale-runtime.md)

## License

MIT
