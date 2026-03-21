# Wuchale Runtime Wiring

Angy can rotate locales on the client, but the host app still needs Wuchale's runtime to be wired correctly.

If that runtime is missing or only half-wired, locale switching can look broken even when Angy itself is working.

## Symptom

Typical server warning:

```text
Catalog for 'main.main' not found.
  Either 'runWithLocale' was not called or the environment has a problem.
```

This usually means one of these is true:

- the server never loaded the generated catalogs
- `runWithLocale(...)` is not wrapping the request
- `loadLocales(...)` was called but not awaited
- the client is asking for a locale that the server did not preload
- the generated Wuchale loader files are not imported into the app

## Frequent Issues

- Angy rotates into `*-working`, but the page does not visibly change
  - The host app is not actually rendering that locale yet, even if the helper is rotating through it.
- Commits are disabled while `*-working` is active
  - This is intentional preview mode. Rotate back to the base or target locale before staging or committing.
- Angy reports a catalog integrity problem
  - Working should be a direct copy of base plus edits. If keys or required translations are missing, regenerate the working catalog before continuing.
- Preview promotion reloads the page in dev
  - This is normal Wuchale/Vite HMR behavior after the runtime working catalog changes.

## Minimum Wiring

### 1. Load the generated client loader

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '../locales/main.loader.svelte.js';
</script>
```

This registers the client-side runtime accessors for the generated catalog.

### 2. Preload the server runtimes

```ts
// src/hooks.server.ts
import * as main from './locales/main.loader.server.svelte.js';
import { loadLocales, runWithLocale } from 'wuchale/load-utils/server';
import { locales } from './locales/data.js';

await loadLocales(main.key, main.loadIDs, main.loadCatalog, locales);
```

The `await` matters. If the hook starts handling requests before the catalogs finish loading, runtime lookups can fail with the "Catalog not found" warning.

### 3. Wrap each request in the locale runtime

```ts
export const handle: Handle = async ({ event, resolve }) => {
	const locale = event.cookies.get('locale') ?? 'en';
	return runWithLocale(locale, () => resolve(event));
};
```

This is what makes server-side Wuchale lookups resolve against the active locale.

### 4. Keep client locale state in sync

For the smoke test, a simple approach is:

- store the active locale in `localStorage`
- mirror it into a cookie
- call `loadLocale(locale)` when it changes

Example:

```ts
const STORAGE_KEY = 'angy:locale';

async function applyLocale(locale: string) {
	await loadLocale(locale);
	localStorage.setItem(STORAGE_KEY, locale);
	document.cookie = `locale=${locale}; path=/; SameSite=Lax`;
}
```

## Practical Smoke-Test Pattern

This is the pattern used in the smoke app:

- `+layout.svelte`
  - imports `../locales/main.loader.svelte.js`
  - reads `angy:locale` from `localStorage`
  - calls `loadLocale(...)` on mount
  - listens for `storage` events so Angy-driven locale changes are reflected in the page
- `hooks.server.ts`
  - imports `./locales/main.loader.server.svelte.js`
  - awaits `loadLocales(...)`
  - resolves the active locale from the `locale` cookie
  - wraps the request with `runWithLocale(...)`

## Draft promotion

Angy does not write directly into the hot runtime working catalog while editing.

Current flow:

- commits write into `*-working.angy-draft.po`
- entering `*-working` preview promotes that draft into the real `*-working.po`
- Wuchale then reloads from the finished promoted file

This avoids the older partial-write race on the runtime working catalog.

## Strategies

### Treat locale switching as two systems

There are two separate responsibilities:

- Angy decides which locale the helper is currently showing
- Wuchale decides which runtime catalog the app is currently rendering

If only one of those systems changes, the page and the helper drift apart.

### Prefer one shared locale key

Use one well-known client key for locale sync, for example:

```text
angy:locale
```

That makes it easy for:

- Angy
- the host app
- smoke tests

to agree on the active locale without custom glue everywhere.

### Always keep the source locale available

Source locale rotation is useful for visual QA:

- compare source and target layouts
- catch overflow and wrapping issues
- verify that the translated copy still fits the page

So source locale should stay available in the rotation, even after catalog promotion.

### Fail fast on missing runtime wiring

When the helper rotates locale but the page does not change:

1. verify the generated loader is imported
2. verify `hooks.server` awaits `loadLocales(...)`
3. verify `runWithLocale(...)` wraps the request
4. verify the requested locale exists in `src/locales/data.js`
5. verify the cookie and localStorage values match a supported locale

### Keep smoke tests honest

A smoke app should not only mount `<Angy />`.

It should also:

- render copy through Wuchale
- support locale switching
- prove that the server/runtime path works

Otherwise the smoke test only proves that the widget renders, not that the translation workflow is actually integrated.
