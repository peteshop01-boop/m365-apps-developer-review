# KCF Expenses Hub — external technical review

This is a **sanitised source-code snapshot for external review**, prepared on 23 October 2026. It is not a working TEST application, a release package, or permission to process real expenses.

## Business goal

Employees enter multiple expense lines, select a nominal code, add receipt or no-receipt evidence, enter mileage and save drafts. Managers approve/query individual lines. Finance reviews claims and exports for payroll. Access controls must prevent unrelated staff from reading or modifying each other's records.

The replacement uses SharePoint Framework (SPFx), React, TypeScript, SharePoint Lists and proposed standard Microsoft 365 workflows. The critical first proof is: authorised employee A saves one TEST expense, closes and reopens the same persisted record, while employee B is denied access.

## Files to inspect

- `app/kcf-expenses-hub/src/`: screens, domain rules, validation, persistence and permissions code
- `app/kcf-expenses-hub/flow/`: proposed native actor-admission processor/flow sources
- `app/kcf-expenses-hub/package.json`: tooling
- `docs/DEVELOPER_HANDOVER.md`, `docs/START_HERE.md`: project context
- `docs/PROJECT_DELIVERY_PLAN.md`, `docs/DEPLOYMENT_ISSUES.md`: delivery plan and blockers
- `requirements/traceability_v1.csv`: requirements and acceptance criteria

## What we want expert reviewers to challenge

1. Is this the right architecture for a low-cost Microsoft 365 expense system?
2. How can the first authenticated Save/reopen and reciprocal security denial be proven quickly?
3. Are private SharePoint scopes, roster/actor admission, WDL and recovery mechanisms needlessly complicated?
4. Why haven't source checks and local UI demonstrations produced a usable installed application?
5. How should the existing code be rescued, tested, governed and delivered, and what realistic development effort remains?

## Redactions and limitations

Snapshot provenance: Mini PC local `feature/D04-overnight-15oct-integration`, recorded HEAD `8b0fc3a`, with four local text modifications. The original Git history was deliberately excluded. Personal identities, tenant domains, internal environment references and GUIDs were anonymised.

**The 195 nominal codes in the snapshot are synthetic examples**, not real Foundation financial master data. Original receipts, payroll data, native tenant evidence, logs and some binary assets are excluded. This source may not build or pass its original tests after redaction.

Real TEST Save, independent installed QA and sponsor UAT are **not passed**. No LIVE system was changed.

If you find a possible vulnerability or private value, contact the maintainers privately. Copyright 2026 Kent Cricket Foundation. All rights reserved. See `LICENSE.md`.