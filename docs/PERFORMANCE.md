# Performance & Offline — measurement protocol (issue #18)

Epic 7: usable offline and smooth closet scrolling. This file is the repeatable
protocol for the three measurements the card asks for, plus a log of the
results captured on a real device.

Targets come from **PRD §4 (Non-Functional Requirements)**:

| Requirement | Target |
|---|---|
| Weather sync | < 1s |
| Closet item auto-tagging | < 3s |
| Outfit generation | 8–12s |
| Offline | cached wardrobe + last-known weather available |
| Images | fast local caching, smooth scrolling through large closets |

## What ships in this pass

- **Offline cache** — `utils/queryCache.ts` selects which TanStack Query
  entries are written to AsyncStorage: the wardrobe (`closet`), the last
  weather reading (`weather`) and the last generated look (`outfit-last`).
  `app/_layout.tsx` rehydrates them on launch, so an airplane-mode cold start
  paints the closet and today's outfit before any network call.
- **Last outfit** — `hooks/useOutfit.ts` persists each generated look and, when
  a look for the current UTC day is restored, renders it as-is instead of
  regenerating. This is what makes an offline open show a real outfit.
- **Image tuning** — every `expo-image` surface sets `cachePolicy="memory-disk"`,
  `recyclingKey`, `transition` and `enforceEarlyResizing`; private photos keep
  `cacheKey = <storage path>` so rotating signed URLs never re-download.
- **Virtualization** — the closet grid and the new `/lookbook` grid are
  `FlatList`s with batched rendering (`initialNumToRender`,
  `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`). The profile
  shows only a 4-tile preview and links to the full grid.
- **Prefetch** — `utils/image.ts` warms permanent thumbnails (saved AI renders)
  for the lookbook grid. Signed private photos are intentionally not prefetched
  (their cache key is the storage path, not the URL — see the file's comment).

## 1. Cold start

Dev signal (logged automatically in `__DEV__`):

```bash
npx expo start          # open in a development build
# Watch the Metro/device console for:
#   [perf] boot (module eval → first frame): <ms>
```

The log is emitted by `utils/perf.ts` the first time the app reaches its first
frame after fonts + session restore. Use it as a fast regression signal.

Release measurement (most trustworthy):

- **Android**: `adb shell am start -W -n com.sidahmed113.myOutfit/.MainActivity`
  and read `TotalTime`.
- **iOS**: Instruments → App Launch template, or the Xcode Organizer
  "Launch Time" metric for a TestFlight build.

## 2. Closet scroll FPS

1. Open the **Closet** tab with a large wardrobe (seed ≥ 200 items).
2. Fling the grid top-to-bottom and back several times.
3. Record a trace and read the frame rate:
   - **Android**: `adb shell dumpsys gfxinfo com.sidahmed113.myOutfit framestats`
     (after scrolling), or the *Profile GPU rendering* / *HWUI* developer
     options overlay.
   - **iOS**: Instruments → Core Animation, watch *Animation Hitches*.
   - **Either**: React Native DevTools Perf monitor (dev builds).

Acceptance: no sustained dropped-frame stretches while flinging; tiles load
without blank flashes (disk cache hit after the first pass).

## 3. Offline open

1. Open the app online once and generate an outfit (so the cache is warm).
2. Force-quit the app.
3. Enable **airplane mode**.
4. Relaunch and open **Today**, then **Closet**, then **Generate today's
   outfits**.

Acceptance (issue #18 "Done"):

- [ ] Closet renders the last-synced wardrobe (no empty state).
- [ ] Home shows the last-known weather reading (or its graceful error card if
      none was ever cached).
- [ ] The outfit screen shows **today's** previously generated look instead of
      a spinner, without spending an AI generation.

## Results

Numbers must be captured on a physical device; the CI host cannot measure them.

| Device / OS | Cold start | Closet scroll | Offline open |
|---|---|---|---|
| _(fill in per device)_ | | | |
