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

- [Showcase and docs](https://walkingissue.github.io/Angy/)
- [Release notes](./docs/changelog/0.2.19.md)

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
	apiKey: "",
	suggestionModel: { model: "gpt-4.1-mini" }
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
| `suggestionModel` | No | Object config, defaults to `{ model: "gpt-4.1-mini" }` |
| `watchIgnore` | No | Extra Vite watch ignore patterns |
| `suggestionProvider` | No | Custom suggestion pipeline |

Reasoning is validated per model. Non-reasoning models like `gpt-4.1-mini` do not accept it.

## Custom suggestion pipeline

If you want to plug in your own LLM or translation backend, use `suggestionProvider`.

```ts
// translationPipeline.ts
export async function translationPipeline({
	context,
	items,
	sourceLocale,
	targetLocale,
	systemMessage,
	suggestionModel
}) {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
			"anthropic-version": "2023-06-01"
		},
		body: JSON.stringify({
			model: "claude-sonnet-4-20250514",
			system: systemMessage,
			max_tokens: 1200,
			messages: [
				{
					role: "user",
					content: JSON.stringify({
						sourceLocale,
						targetLocale,
						suggestionModel,
						context,
						items
					})
				}
			]
		})
	});

	const data = await response.json();
	const text = data?.content?.[0]?.text ?? "";
	const parsed = JSON.parse(text);

	return parsed.items;
}
```

```ts
// angy.config.ts
import { defineAngyConfig } from "@walkinissue/angy/server";
import { translationPipeline } from "./translationPipeline";

export default defineAngyConfig({
	...
	basePoPath: "./src/locales/en.po",
	workingPoPath: "./src/locales/en-working.po",
	sourceLocale: "sv",
	targetLocale: "en",
	suggestionProvider: translationPipeline
});
```

Your provider gets:

- the resolved context and alternatives around the selected key
- the untranslated items that need suggestions
- the normalized `suggestionModel` object if you still want to route by model
- user edits restore locally until commit or discard
- suggestions are cached by `msgid`

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

- [Release notes](./docs/changelog/0.2.19.md)
- [Roadmap](./docs/roadmap.md)
- [Wuchale runtime wiring](./docs/wuchale-runtime.md)

## License

MIT
