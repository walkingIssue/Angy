# Angy Roadmap

This is the working product-direction note for Angy.

It is intentionally lightweight and can hold:

- feature ideas
- UX simplifications
- workflow improvements
- open design questions

## Current UX concerns

## Known issues

### Working-locale rotation can be misleading

This is currently the highest-priority UX/data-confidence issue.

Current risk:

- Angy can rotate into the inferred working locale
- but the rendered app does not always make that state obvious enough
- if the page does not visibly reflect the working locale, it becomes hard to tell whether newly committed translations are actually being rendered

Why this is dangerous:

- users can lose confidence about whether work was applied
- working translations may exist in the catalog without clear visual confirmation
- the helper can appear to rotate correctly while the page still looks unchanged

This needs to be addressed before the working-locale rotation can be considered trustworthy UX.

Likely directions:

- make working-locale state much more explicit in the UI
- verify that QA rotation always produces a clearly visible rendered locale change when the working locale is selected
- consider whether working-locale rotation should be gated differently until that feedback is reliable

### Commit race can leave the UI in a misleading state

This is less severe than before, but still worth watching.

Current state:

- draft-to-preview promotion removed the worst hot-write failure mode
- preview promotion can still reload the page in dev
- helper state still needs to stay trustworthy across reloads

Why it still matters:

- reload-heavy flows can still feel abrupt
- helper state should remain obviously trustworthy after reload

UI clarification needed:

- green check should mean the translation exists in the base catalog
- working-only commits should continue to show the hammer-and-screwdriver state
- status icons should never imply "safely in base" when the item only exists in working

### Working-preview promotion can interrupt staged helper state

Rotating into the working locale can promote the draft catalog and reload the page in dev.

Current concern:

- the helper closes during that reload
- it is not clear enough whether staged-but-uncommitted translations survive that transition

Why it matters:

- users can lose confidence in whether staged work was preserved
- even if committed work is safe, staged helper state needs clearer guarantees

Desired direction:

- make staged-state survival explicit
- or block promotion while staged work is still pending

### User edit cache is missing

The helper now keeps draft edits locally, but the UX can still be clearer.

Desired direction:

- keep draft restore obvious in the UI
- keep staged vs draft vs committed state easy to read

### Compact focus mode

The helper is useful, but it can still feel intrusive during normal page work.

Current pain points:

- too much information competes for attention at once
- the originally selected text keeps taking space after the key is already resolved
- alternatives are useful, but rendering the whole list at once can feel noisy
- the helper reads more like a debugger than a focused translation surface

Desired direction:

- add a compact focus mode
- hide the original selected text by default after resolution
- keep only a compact matched-key summary visible in the main surface
- show only the currently active alternative while preserving keyboard navigation
- keep `Tab` and `Shift+Tab` navigation working exactly as it does now

### Commit feedback

Commit success and failure feedback should stay visible long enough to be useful.

Open question:

- should feedback live inside the helper
- or move to a bottom-of-screen toast/status area

### Capture coverage gaps

The pickup/capture algorithm can still miss valid strings in real pages.

This matters because:

- missed strings reduce trust in the tool
- users cannot easily tell whether a string is unsupported, missed by heuristics, or just not found yet

Desired direction:

- improve coverage for normal visible UI strings
- make failures easier to reason about when a string is not picked up
- treat capture coverage as a first-class quality metric, not just a heuristic side effect

### Cross-page references

If a string is reused across multiple pages, references should be easier to inspect without crowding the main panel.

Possible direction:

- add a references action that opens a popup or secondary details surface
- if necessary later, generate a route-oriented map from keys to component references and likely pages

### Suggestion feedback loop

Edited suggestions should be able to improve later suggestion quality.

Current gap:

- a suggestion can be accepted, edited, and committed
- but that edited result is not explicitly fed back into later suggestion generation as a stronger style/example signal

Desired direction:

- treat accepted edited suggestions as better local examples for future suggestion requests
- improve forward consistency without pretending this is full model training
- keep the feedback loop grounded in project-local translation choices and approved wording

## Catalog design

The catalog model still needs a follow-up design pass.

Questions still open:

- how protected the base catalog should be in default mode
- whether working catalog creation should always be automatic when missing
- how much of promotion/rotation should be visible in everyday translator UX
- whether promotion should be limited to an explicit migration mode

## Runtime independence

Longer term, Angy should depend less on Wuchale-specific assumptions.

Possible direction:

- make Angy runtime-agnostic enough to work with other catalog systems, including `.inlang`
- move Wuchale-specific behavior behind integration hooks instead of treating it as the default mental model
- allow a config-level locale switcher method that accepts a locale string and lets the host app decide how locale loading/rendering happens

## Documentation

Planned repo showcase material:

- screenshots in `docs/images`
- keep the docs page tidy as the showcase grows
