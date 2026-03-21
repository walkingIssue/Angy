# Angy

Dev-only SvelteKit translation helper for in-app PO workflow.

## Install

```bash
npm install @walkinissue/angy
```

## Project links

- Repository: [github.com/walkingIssue/Angy](https://github.com/walkingIssue/Angy)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Roadmap: [docs/roadmap.md](./docs/roadmap.md)
- Wuchale runtime wiring: [docs/wuchale-runtime.md](./docs/wuchale-runtime.md)

## What it is

- A QA widget for in-app translation work
- A PO catalog lookup and commit layer
- A suggestion pipeline for untranslated strings
- A SvelteKit-friendly integration shape

## Showcase

Angy is meant to keep translators and developers inside the app while they work.

Core loop:

- select visible copy directly in the UI
- inspect the matched PO key, references, flags, and nearby alternatives
- stage a translation into the working catalog
- request AI suggestions for untranslated strings
- rotate locales to visually QA layout and copy fit
- commit reviewed changes back to the working PO

Planned repo assets:

- screenshots in [`docs/images`](./docs/images)
- short workflow recordings once the capture set is ready

## UX flow

### 1. Capture text in the app

- select text on the page
- or hold `Alt` and click an interactive element
- Angy opens with the selected string prefilled

### 2. Resolve the key

- Angy looks up the best PO match
- it shows the matched key, context, references, comments, and flags
- it also expands nearby alternatives so repeated copy can be resolved safely

### 3. Stage and review

- edit the translation in place
- press `Enter` to stage quickly
- use `Tab` to move through unresolved candidates
- compare target candidates and existing working/base state through the status icons

### 4. Suggest and commit

- ask for AI suggestions when a string is untranslated
- keep or edit the suggestion
- commit reviewed changes into the working catalog

### 5. QA in the page

- use the QA locale toggle to rotate rendered locales
- compare source and target visually
- catch wrapping, spacing, and hierarchy regressions before leaving the page

### 6. Promotion workflow

- if a project is using Angy for migration or catalog promotion work, the rotate action can promote the working catalog into the base catalog
- this is intentionally a specialized workflow, not the everyday translation path
- base vs working catalog design still needs a stricter product pass

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
- Commits are written to a draft working catalog
- Entering `*-working` preview promotes that draft into the runtime working catalog

## Integration

Use the plugin for shared config, then mount the component and define the route yourself.

The plugin is optional dev glue:

- injects route/locale defaults into the client
- coordinates watcher behavior during catalog writes
- does not replace the core library/runtime pieces

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
	watchIgnore: ["**/locales/en-working.po"]
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { dev } from "$app/environment";
	import { Angy } from "@walkinissue/angy";
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

- `en.po` is the base catalog
- `en-working.po` is the mutable working catalog
- `en-working.angy-draft.po` is the draft write target during editing
- Base catalog is the source of truth for valid keys
- Working catalog is the source of truth for current translation state
- Lookup reads working state first
- Commit validates against base, then writes to the draft working catalog
- Working preview promotes draft into runtime working

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

## Wuchale Runtime

Angy does not replace Wuchale's runtime setup. The host app still needs to:

- import the generated client loader
- preload server catalogs
- await `loadLocales(...)`
- wrap requests with `runWithLocale(...)`

If that wiring is missing, locale rotation can appear broken and Wuchale may warn:

```text
Catalog for 'main.main' not found.
  Either 'runWithLocale' was not called or the environment has a problem.
```

See [docs/wuchale-runtime.md](./docs/wuchale-runtime.md) for a working pattern, including the localStorage-and-cookie sync used in the smoke test.

## Frequent issues

- Locale toggle changes in Angy, but the page does not rerender
  - Wuchale is usually not fully bootstrapped in the host app yet. Check the generated loader imports, awaited `loadLocales(...)`, and server locale wiring first.
- Working locale is visible in the QA rotation, but edit/commit controls are disabled
  - This is intentional. `*-working` is preview-only so Angy does not write while the working catalog is the actively rendered runtime source.
- Rotation shows a warning modal
  - This is a preview of the working-vs-base differences that rotation will promote into base. It is not the same thing as a catalog integrity failure.
- Angy refuses to operate with a catalog integrity error
  - The working catalog no longer matches the base key set, or it is missing translations that base already has. Regenerate or replace the working catalog before continuing.
- Commit succeeded, but the helper still looks unsure
  - Angy now keeps local drafts until the server truth matches the committed value. If Wuchale/Vite reloads at a bad moment, your staged edits stay cached instead of being silently discarded.

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
import { defineAngyConfig, type SuggestionProvider } from "@walkinissue/angy/server";

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

- `Angy` from `@walkinissue/angy`
- `handler` and `defineAngyConfig` from `@walkinissue/angy/server`
- `angy` from `@walkinissue/angy/plugin`

## Notes

- The default `handler` returns a `404` outside dev.
- The package still has fallback internal paths, but consumers should define their own explicit catalog paths.
- Override paths, locales, `routePath`, `apiKey`, `systemMessage`, `suggestionModel`, `watchIgnore`, and `suggestionProvider` through `angy.config.ts`.
- The default export surface is intentionally small: plugin, component, config helper, and server handler.

## Future work

- Handle server paths for single config and single app
- Support multiple catalogs
- Support multiple translations from a single source locale
- Add a compact focus mode so the helper can hide dead detail, keep a smaller matched-key summary, and only show the active alternative by default
- Revisit how commit feedback is surfaced so successful or failed commits stay visible without making the helper flow awkward
- Improve cross-page reference browsing, likely through a popup/details surface instead of always-visible reference noise
- Make working-locale rotation trustworthy and visually explicit so users can tell when the app is actually rendering the working catalog
- Harden the base-vs-working catalog design and decide how much of promotion/rotation should be exposed in the default UX
- This seems trivially implemented with the current setup
