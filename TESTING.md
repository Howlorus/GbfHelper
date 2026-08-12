# Testing GBF Copilot on a personal machine

This is a step-by-step guide for exercising the extension end-to-end on a
personal Chromium browser — the dev-marathon work landed without the user
being able to test in a real browser, so this document is where the user
picks up the loop.

The extension is passive-observation only. Every action described here is
manual — the extension never triggers a game request, never sends
credentials, and never uploads anything.

## 1. Clone and self-check (no browser)

```bash
git clone <this-repo> gbf-copilot
cd gbf-copilot
npm test
```

`npm test` runs the native `node --test` suite (no Jest, no dependencies).
Expect `pass 333` (as of the E14 commit) with zero failures. The suite
covers the pure libs — everything that runs in the service worker is
exercised without a browser. If this fails, do **not** proceed to browser
testing.

## 2. Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and pick the `gbf-copilot/` directory (the one
   with `manifest.json` at its root).
4. Confirm the extension appears with version `0.0.1` and no errors in the
   "Errors" button.

If the load fails, check the errors button — usually a typo in
`manifest.json` or a missing HTML file the popup references.

## 3. Confirm the extension chrome

- Extension icon → popup opens with **Dormant** state.
- Open a non-GBF tab → popup stays Dormant.
- Open a GBF tab (`game.granbluefantasy.jp/...`) → popup switches to
  **Ready**, four action buttons enable.
- Popup footer links open the standalone pages: Planner, Calibration,
  Updates, Storage, Review, Diagnostics, Settings.

Each footer page should load without a console error. If one does, that
page's `<script>` is the first place to look — everything is
`type="module"` and CSP-clean, so a broken import shows up immediately.

## 4. Feasibility capture (§49) — the real payload work

This is the point of the whole exercise: bring back real GBF payload
shapes so the Q1 (endpoint list), Q2 (battle events), Q6 (raid/phase),
and Q11 (quota) parsers can be pinned.

1. Open the extension **Options** page → toggle **feasibility mode ON**.
   This bypasses the endpoint allowlist so the DevTools adapter can log
   any traffic the game emits, capped at `MAX_BODY_BYTES = 512 KiB` per
   payload.
2. Open a GBF tab → open **DevTools (F12)** on that tab → check the
   **GBF Copilot** panel is visible. The panel is the capture attachment
   point (`src/devtools/`).
3. Open the extension **Diagnostics** page — this is where captured
   payloads accumulate under `devCaptureLog`.
4. Do the following in-game and let each round of capture accumulate a
   handful of samples before doing the next:
   - Load the character list, weapon list, summon list, teams.
     → feeds Q1 endpoint discovery.
   - Enter a Trial Battle. Do 3 turns of auto-attack, one skill, one CA,
     one full-chain, watch the raid boss omen appear.
     → feeds Q2 (battle event shape) and Q6 (raid boss / phase transition).
   - Enter a real raid you regularly clear. Fight one full battle end to
     end. **Do not** switch tabs mid-fight — the state-quality signal
     depends on continuous observation.
     → feeds Q2 / Q6 more richly.
5. In Diagnostics, hit **Copy captured payloads** → paste into a scratch
   text file. Tag which action you performed for each payload if the
   URL doesn't make it obvious.
6. Toggle **feasibility mode OFF** when done. The capture buffer clears
   with a single click; the allowlist takes over again immediately.

Bring the scratch file back to the next dev-marathon session. That's
the whole point — the parsers under `src/lib/parsers/` deliberately do
not fabricate field maps and downstream Epics (E10 classifier, E11
rules engine) refuse to hallucinate categories until this data lands.

## 5. Golden paths per Epic

Each Epic gets one honest golden-path check. Perform them on the
personal machine after step 4.

### E01 — Extension shell & lifecycle

- Popup opens on a GBF tab → Ready.
- Click **Scan Account** → session panel appears, badge switches to
  `SCAN`, session runs on the correct tab. Close the tab → session
  auto-stops.
- Reload the extension from `chrome://extensions` → session is dropped
  on cold start (§43: no session auto-resumes).

### E02 — Account scanner

- Popup → **Scan Account** → open DevTools → browse Party / Grid /
  Summons in the game → progress ticks in the popup for each category.
- **Save & stop** — inventory `current` is written; previous inventory
  (if any) is archived as `previous`. Confirm by opening the Storage
  page and looking at the `inventory` store count.

### E03 — Storage layer

- Storage page → all 12 §7.6 stores listed with counts and tier badges.
- Advanced Cleanup on a Critical-tier store demands typed `DELETE`
  confirmation before proceeding.
- Wipe All demands the same, always.

### E04 — Data packs / E12 — Update Center

- Update Center → **Load pack** → pick a valid pack manifest zip. Plan
  view shows install vs update vs downgrade honestly (never blocks a
  downgrade, but flags it).
- Apply → the pack lands in its store (`gameData`, `strategyPacks`, or
  `terminologyPacks`).

### E05 — Knowledge (multilingual)

- Manually paste two claim objects with the same YouTube video id via
  DevTools console (see `src/lib/knowledge/dedup.js`). Confirm
  `findDuplicates` links them with `reason: "same-video"`.
- Manually paste a conflicting claim pair — confirm `detectConflicts`
  reports both sides, never a merged average.

### E07 — Raid Plan

- Planner page → pick a Strategy Pack → **Match** → each dimension
  (Characters / Weapons / Summons) shows Ready / Not owned states.
- Substitutions appear under the mismatched rows (from the
  Strategy Pack's `substitutions` array).

### E08 — Calibration Lab

- On a GBF tab, popup → **Calibration Lab** → the Lab tab opens.
- Pick **Normal Attack** → fill in some fingerprint fields (party,
  main class, `gameDataVersion`) → **Start protocol**.
- Enter a Trial Battle. Auto-attack; after each turn, read the damage
  number and add a sample (value + state quality). Add ~15 samples.
- Confirm live confidence promotes to HighConfidence or Confirmed as
  spread stays tight and samples reach the minimum (10 for Normal Attack).
- **Finalize** → the record lands in the `calibration` store; the tab
  switches to the result view with the §22.2 fields populated.
- Bump the gameData pack version via Update Center → confirm the
  saved calibration is auto-marked `invalidated-pack` (visible in the
  Past calibrations list at the bottom of the Lab tab).

### E09 — Run logger / E10 — Diagnosis

- Popup → **Raid Session** on a real raid → play through → auto-stops
  when the raid ends (or Stop manually).
- Review page → run appears in the list → open it → diagnosis renders.
  For now, expect the classifier to answer with `ObservationFailure`
  or `VarianceIssue` only (§27 refuses to fabricate Setup/Rotation/
  Execution verdicts until §49 Q2/Q6 land — this is deliberate).

### E11 — Live Coach

- Popup → **Raid Session** → a compact overlay window opens.
- With no Strategy Pack rules loaded, the overlay honestly reports
  "Waiting for synchronized state" (until §49 event parsers land, the
  state-quality signal will stay PartiallySynchronized and the overlay
  will show "Guidance suspended: PartiallySynchronized" — this is
  correct behavior).
- Drag the overlay's title bar → close the window → reopen on the
  next session → the window returns to the saved position.
- **Alt+O** toggles collapse without stealing focus.

### E13 — Storage dashboard

- Storage page → **Backup** → downloads a JSON envelope covering the
  requested stores.
- Import that same bundle back into a fresh profile (or after a Wipe
  All) → **Restore** → contents match.

### E14 — Optimization

- Planner page → scroll to **Optimization** → the objective picker
  lists all 8 §30 objectives → picking one shows the weights table
  (↑ / ↓ / · per metric).
- Proposals section honestly reports "No proposals available… waiting
  on §49 event parsers". This is correct — no source ships yet.

## 6. What to report back

After the round of testing, the scratch file from step 4 is the single
most valuable artifact. In addition, please note:

- **Endpoint patterns** — the URLs the game hit during each activity.
- **Payload shapes** for characters / weapons / summons / teams — raw
  JSON is fine.
- **Battle event shapes** — turn envelope, action envelope, damage
  envelope. Even one clean sample per shape unblocks Q2.
- **Raid boss + phase transition signals** — how does the game
  announce "phase 2 has started"? Q6.
- **Real usage quota headroom** — after a week of runs, what does the
  Storage page show for total bytes and per-store counts? Q11.
- Anything that looked wrong in a UI page (a stale count, a control
  that did nothing) — with the page name and one-line repro.

The dev-marathon Epics (E05 post-MVP, E08, E11, E14) all landed without
browser testing, so bug reports from real usage are expected. Report
them at commit granularity when possible — every Epic sits in a
reviewable commit on `main`.
