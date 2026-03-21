# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Improve working catalog preview stability in dev
- Route draft translation writes through a draft working catalog before preview promotion
- Persist selected locale more reliably across preview-triggered reloads
- Enforce stricter base/working catalog path validation
- Improve helper capture for nested interactive labels
- Fix the QA/locale toggle interaction inside the draggable helper
- Suppress drag-release clicks so dragging the QA control does not switch locale on drop
- Replace the remaining slot usage with Svelte 5 `{@render}`
- Suppress Vite dynamic-import analysis noise for runtime config loading
- Refine working/base catalog status handling and reduce false out-of-sync warnings
- Stabilize preview flow across reloads and browser engines
- Allow `apiKey` to be omitted in `AngyConfigInput` and normalize it to an empty string at runtime
- Keep `SuggestionProviderInput.apiKey` compatible with environment-driven config values
- Document the required Wuchale runtime wiring for locale switching, including the need to await `loadLocales(...)`
- Document the need to revisit how commit success and failure feedback is surfaced in the helper UX
- Add roadmap notes for a compact focus mode and calmer reference browsing
- Track the high-priority rough edge where rotating into the working locale may not give clear enough visual confirmation that the working catalog is actually being rendered
- Catalog promotion and base/working catalog design still need a follow-up product pass before being treated as settled
- Track the known issue where suggestion requests can still send `reasoning` for model families that do not support it

## 0.2.17

First public release.

### Added

- Public npm package under `@walkinissue/angy`
- MIT license
- GitHub metadata for repository, homepage, and issue tracker
- Clean public README with integration, config, and suggestion provider examples
- Dev-only server handler guard that returns `404` outside dev

### Changed

- Package scope moved from local-only `angy` to `@walkinissue/angy`
- Lookup now prefers the effective working catalog state
- Status indicators distinguish between:
  - missing translation
  - fuzzy translation
  - target/working agreement
  - working override
- UI tightened for smaller screens and clearer key/context display
- Working catalog watch behavior now suppresses self-triggered races instead of permanently ignoring the file

### Added In The Release Series

- Catalog rotation action with backup creation
- Working catalog locale included in the QA toggle rotation
- `targetLocale: "working"` alias support
- Suggestion request logging for easier API debugging
- Smoke-tested integration in clean SvelteKit consumer apps
