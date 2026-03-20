# Angy

Dev-only SvelteKit translation helper for in-app PO workflow.

## Install

```bash
npm install angy
```

## What it is

- A QA widget for in-app translation work
- A PO catalog lookup and commit layer
- A suggestion pipeline for untranslated strings
- A SvelteKit-friendly integration shape

## Packages used

- `svelte`
  UI for the helper widget
- `@sveltejs/kit`
  Route handler shape and dev/server integration
- `wuchale`
  Runtime i18n layer and locale switching
- `gettext-parser`
  Read and write `.po` catalogs
- `fuse.js`
  Fuzzy lookup for key discovery
- `esbuild`
  Load `angy.config.ts` in dev and server contexts
- OpenAI API
  Optional translation suggestions

## What problem it solves

- Large apps are painful to internationalize late
- Many strings have weak or missing context
- Repeated copy appears in many components
- PO workflows are slow when you must search manually
- Existing i18n libraries solve extraction/runtime, not translator workflow
- Teams need a way to select text in the app, inspect context, and commit safely

## Why it exists

- Plain catalog editing was too slow
- Context from extraction alone was not enough
- Similar strings caused ambiguity
- Repeated strings needed reference-aware lookup
- Suggestion workflows needed to stay inside the app
- A dev-only helper reduced friction enough to keep the migration moving

## Workflow

- Developer runs app in dev
- Developer mounts `<Angy />` in layout
- App exports `POST` from the package handler
- User selects text or uses the helper trigger in the UI
- Client asks server for PO context and alternatives
- Server matches best key, expands related entries, and returns alternatives
- User edits, stages, tabs through unresolved strings, and commits
- Suggestions can be requested for untranslated strings
- Commits are written to the working catalog

## Integration

Use the plugin for shared config, then mount the component and define the route yourself.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { angy } from "angy/plugin";

export default defineConfig({
	plugins: [angy(), sveltekit()]
});
```

```ts
// angy.config.ts
import { defineAngyConfig } from "angy/server";

export default defineAngyConfig({
	basePoPath: "./src/locales/en.po",
	workingPoPath: "./src/locales/en-working.po",
	sourceLocale: "sv",
	targetLocale: "en",
	routePath: "/api/translations",
	apiKey: "",
	watchIgnore: ["**/locales/en-working.po"]
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { dev } from "$app/environment";
	import { Angy } from "angy";
</script>

{#if dev}
	<Angy />
{/if}

<slot />
```

```ts
// src/routes/api/translations/+server.ts
export { handler as POST } from "angy/server";
```

## Catalog model

- `en.po` is the base catalog
- `en-working.po` is the mutable working catalog
- Base catalog is the source of truth for valid keys
- Working catalog is the source of truth for current translation state
- Lookup reads working state first
- Commit validates against base, then writes to working

## Discovery algorithm

- User sends selected text and current route path
- Server creates lookup variants from the selected text
- Fuzzy search runs against the effective working view of the catalog
- Best match must clear a score threshold
- Top 4 similar direct matches are kept
- Server infers a page reference like `src/routes/.../+page.svelte`
- It then pulls entries that share PO references with the best match
- It then pulls entries whose references look similar to the current route
- If space remains, it fills with similar unresolved strings
- It also keeps a smaller translated slice for cohesion

## Why the lookup works like this

- Direct fuzzy match alone is not enough
- Repeated UI copy often exists in several components
- Shared PO references are strong local context
- Route similarity helps reconstruct page-level context
- A translated slice helps keep wording consistent
- An untranslated-heavy pool focuses effort where work remains

## Retrieval targets

- Up to 300 alternatives
- Roughly 80% untranslated
- Roughly 20% already translated
- Enough translated context for tone and syntax
- Enough untranslated context for efficient batch work

## Suggestions

- Suggestions are dev-only
- Server-side request to OpenAI
- Prompt aims to preserve placeholders, markup, casing, and product terminology
- Existing translations are used as style anchors
- Suggestions are cached client-side to avoid repeat requests
- Built-in suggestions are disabled when `apiKey` is empty
- Consumers can replace the suggestion pipeline with `suggestionProvider`

## Config

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `basePoPath` | Yes | None | Path to base catalog |
| `workingPoPath` | Yes | None | Path to working catalog |
| `sourceLocale` | Yes | None | Source language for suggestions. Can be set to `"base"` to infer from `basePoPath` |
| `targetLocale` | Yes | None | Target language for suggestions. Can be set to `"working"` to infer from `workingPoPath` |
| `routePath` | No | `/api/translations` | Route used by the helper client and consumer server handler |
| `apiKey` | Yes | None | Used by built-in suggestion pipeline. If empty, suggestions are disabled |
| `systemMessage` | No | Built from locales | Default AI system prompt |
| `suggestionModel` | No | `gpt-4.1-mini` | Cheap default to avoid cost surprises |
| `watchIgnore` | No | `["**/en-working.po"]` | Extra Vite watch ignore patterns |
| `suggestionProvider` | No | None | Custom suggestion pipeline hook |

## Route config

- The server route path is defined by the consumer app
- The default route path is `/api/translations`
- `routePath` lives in `angy.config.ts`
- The `Angy` `endpoint` prop is optional
- Use the prop only if you want to override `routePath` per instance

## Custom suggestion provider

Use `suggestionProvider` if you want your own AI pipeline.

Input:

- `context`
- `items`
- `sourceLocale`
- `targetLocale`
- `systemMessage`
- `model`
- `apiKey`

Return:

- `Array<{ msgid: string; msgctxt: string | null; suggestion: string }>`

Example:

```ts
import { defineAngyConfig, type SuggestionProvider } from "angy/server";

const suggestionProvider: SuggestionProvider = async ({ items }) => {
	return items.map((item) => ({
		msgid: item.msgid,
		msgctxt: item.msgctxt,
		suggestion: `TODO: ${item.msgid}`
	}));
};

export default defineAngyConfig({
	basePoPath: "./src/locales/en.po",
	workingPoPath: "./src/locales/en-working.po",
	sourceLocale: "sv",
	targetLocale: "en",
	routePath: "/api/translations",
	apiKey: "",
	suggestionProvider
});
```

## Exports

- `Angy` from `angy`
- `handler` and `defineAngyConfig` from `angy/server`
- `angy` from `angy/plugin`

## Notes

- The default `handler` returns a `404` outside dev.
- The package still has fallback internal paths, but consumers should define their own explicit catalog paths.
- Override paths, locales, `routePath`, `apiKey`, `systemMessage`, `suggestionModel`, `watchIgnore`, and `suggestionProvider` through `angy.config.ts`.
- The default export surface is intentionally small: plugin, component, config helper, and server handler.

## Future work

- Handle server paths for single config and single app
- Support multiple catalogs
- Support multiple translations from a single source locale
- This seems trivially implemented with the current setup
