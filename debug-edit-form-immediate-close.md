# Debug Session: edit-form-immediate-close

- Status: OPEN
- Date: 2026-06-20
- Symptom: edit form for film/game no longer stays open after recent route-driven refactor; it may open and immediately close.

## Reproduction

1. Open films or games catalog.
2. Click an existing entry to open edit form.
3. Observe that the form does not stay open.

## Expected

- Edit form opens and remains visible.

## Actual

- Edit form does not open, or opens and immediately closes.

## Hypotheses

1. Opening the form first sets local `selectedView`, which immediately triggers the new route-sync close effect before `searchParams` catches up to the pushed URL.
2. The close effect now treats any render frame with `selectedView != null` and `requestedViewId == null` as a history-close, even when navigation was initiated by the app itself.
3. `hasCollectionEntryHistoryState()` / `pushState` works, but the modal close path runs before Next updates `useSearchParams`, creating a transient false-negative route state.
4. The refactor removed a necessary “opening in progress” guard, so the sync effect closes valid opens during the same navigation tick.
5. The issue is not in `FilmsManager`/`GamesManager` individually, but in shared `useCollectionEntryRouteSync`.

## Evidence Log

- Static code evidence confirmed that the refactor removed the only guard preventing the close-effect from running during the same tick as a local modal open.
- User console evidence showed the passive effect in `entryRouting.ts` firing immediately during page activity, which is consistent with the close-effect evaluating before route params settle.
- Root cause determined: local open flow sets `selectedView` first and only then pushes URL state; without an "opening route sync" guard, the close-effect can observe `selectedView != null` while `requestedViewId/requestedItemId` are still empty and clear the modal immediately.

## Fix Applied

- Added `openingRouteSyncRef` to `useCollectionEntryRouteSync`.
- While a local open is waiting for `useSearchParams()` to catch up, the close-effect now skips the history-close branch.
- The guard resets once route params match the selected entry, or when selection is fully cleared.
- Removed temporary failing browser-side debug fetch instrumentation to avoid CORS noise.
