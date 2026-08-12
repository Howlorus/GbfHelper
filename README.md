# GBF Copilot (GbfHelper)

A **local-first Chromium MV3 extension** that helps Granblue Fantasy players
prepare for difficult raids, personalize strategies from their actual account
resources, and progressively improve setups through Trial Battle calibration
and post-run diagnosis. Passive observation only — no gameplay automation.

## Quick start

```bash
git clone <this-repo> gbf-copilot
cd gbf-copilot
npm test                 # native `node --test`, no dependencies
```

Then load `gbf-copilot/` unpacked from `chrome://extensions` (Developer mode).
Full step-by-step testing guide: [`TESTING.md`](./TESTING.md).

## Status

Dev-marathon complete — every Epic has landed:

| Epic                        | Status                                    |
|-----------------------------|-------------------------------------------|
| E01 shell & lifecycle       | ✅                                        |
| E02 account scanner         | ✅ (parsers await §49 real payloads)      |
| E03 storage repositories    | ✅                                        |
| E04 data packs              | ✅                                        |
| E05 knowledge (multilingual)| ✅ MVP + post-MVP dedup/conflict/youtube  |
| E06 planner matching        | ✅                                        |
| E07 raid plan lifecycle     | ✅                                        |
| E08 calibration lab         | ✅                                        |
| E09 run logger              | ✅                                        |
| E10 run diagnosis           | ✅ (§27: honest two-verdict classifier)   |
| E11 live coach              | ✅ engine + overlay land together         |
| E12 update center           | ✅                                        |
| E13 storage dashboard       | ✅                                        |
| E14 optimization / A/B      | ✅                                        |

The classifier and parsers deliberately refuse to fabricate categories
until §49 Q1/Q2/Q6/Q11 feasibility parsers land — the feasibility toggle
in the Diagnostics page exists so the user can bring back real payload
shapes from a browser we can actually run.

## Specs

All product documentation is local, not versioned:

- Canonical PRD (v5.0 Master Draft): `./.docs/PRD.md`
- Executable spec tree — Epics and User Stories: `./.docs/prd/`
- Session handoff (dev-marathon context): `./.docs/HANDOFF.md`

## Repo layout

```
gbf-copilot/
├── manifest.json           # MV3, narrow host_permissions, strict CSP
├── package.json            # type: module, test = node --test
├── src/
│   ├── background.js       # service worker — all message handlers
│   ├── lib/                # pure modules — never import chrome.*
│   ├── devtools/           # the one place chrome.devtools.* lives
│   ├── popup/ options/ planner/ calibration/ live-coach/
│   ├── update-center/ storage/ review/ diagnostics/
│   └── data/               # host + endpoint allowlists
└── tests/                  # `node:test` suites (333 passing)
```

Conventions worth knowing before contributing are enumerated in the
handoff — envelope-wrapped writes, no `innerHTML`, `chrome.*` forbidden
in `src/lib/**`, §7.8 confidence labels only (never a probability), §27
classifier refuses to fabricate, versioned raid-plan storage ids
(`${planId}@v${n}`), and native `node --test` only (no Jest / Vitest).

## License

MIT — see [`LICENSE`](./LICENSE).
