# GBF Copilot — Product Spec Tree

This folder is the **executable spec tree**: the canonical PRD (`../.docs/PRD.md`, v5.0) broken down into Epics and User Stories.

## Purpose

- Give every Epic a single-page contract (`epic.md`) with in/out of scope, dependencies, non-functional constraints, and definition of done.
- Give every User Story a Given/When/Then AC set that can be implemented in one focused commit.
- Preserve traceability: every US points back to a PRD section (`§X.Y`).

## Reading order

1. This file — pick an Epic from the index below.
2. The Epic's `epic.md` — understand scope, deps, MVP status.
3. The Epic's `USER_STORY/` — pick a US to implement.

## Epic index

*Populated in Phase 2. Ordering reflects dependency, not necessarily implementation order.*

| # | Epic | MVP | Status |
|---|------|-----|--------|
| E01 | Extension shell & activation lifecycle | ✅ | pending |
| E02 | Account Scanner (manual, single tab) | ✅ | pending |
| E03 | Local storage & repository layer | ✅ | pending |
| E04 | Game Data & Strategy Packs | ✅ | pending |
| E05 | Multilingual Knowledge & Terminology | Partial | pending |
| E06 | Planner: strategy matching & substitutions | ✅ | pending |
| E07 | Raid Plan lifecycle | ✅ | pending |
| E08 | Calibration Lab | ❌ | pending |
| E09 | Run Logger | ❌ | pending |
| E10 | Run Diagnosis & Optimization | ❌ | pending |
| E11 | Live Coach & Rules Engine | ❌ | pending |
| E12 | Update Center & migration/rollback | ✅ | pending |
| E13 | Storage dashboard & Cleanup | ✅ | pending |

## Cross-cutting constraints (referenced by every Epic — not their own Epics)

- **Privacy & security** (PRD §41): no persistent credentials, sanitization pipeline, CSP, safe rendering.
- **Permission model** (PRD §40): least privilege, no `<all_urls>`, contextual justification.
- **Graceful degradation** (PRD §7.5): reduce/suspend guidance on invalid state.
- **Explainability** (PRD §7.4): every recommendation carries reason + evidence + confidence.
- **Data versioning** (PRD §42): schema/version/provenance on every persisted record.
- **Accessibility** (PRD §43): keyboard nav, color-blind-safe, reduced motion.
- **Testing categories** (PRD §44) apply per Epic.

## Open Questions

Tracked against PRD §49 during Phase 5. See per-Epic `epic.md` for scoped questions.
