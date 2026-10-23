# KCF KPI & Workplan — external technical review

This is a **sanitised source-code snapshot for external review**, prepared on 23 October 2026. It is not a release package, a working TEST installation, or approval to deploy anything.

## Business goal

Employees select annual Core KPIs, create Impact KPIs, choose development behaviours, enter their quarterly targets and save a workplan. The workplan must reopen intact and be available only to the employee and specifically authorised managers/administrators. Quarterly updates and consolidated performance reporting follow.

The system uses SharePoint Framework (SPFx), React, TypeScript and Microsoft 365. AI-assisted development has produced substantial code, tests and documentation, but fully authenticated, installed TEST Save/reopen and role-based access have not yet been demonstrated end to end.

## Files to inspect

- `src/webparts/performanceHub/`: workplan, employee, manager, admin, quarterly and reporting application code
- `power-platform/`: disabled/unbound processor and host integration designs
- `config/`, `scripts/`, `package.json`: application configuration, tooling and tests
- `docs/TEST-DELIVERY.md`: admission, installed TEST verification, release and rollback rules
- `docs/MIGRATION.md`: provenance of the earlier source integration
- `CONTRIBUTING.md`: development approach and controls

## What we want expert reviewers to challenge

1. Is SPFx plus standard Microsoft 365 a proportionate architecture?
2. What is the shortest secure path to employee Save, fresh SharePoint readback, close/reopen, manager approval and denial of unauthorised access?
3. What code or engineering structure should be simplified, reused or replaced?
4. Which source tests have been mistaken for proof of a working product?
5. How should branches, PRs, independent security/QA checks and sponsor UAT be organised?
6. What would an experienced developer do first, and what realistic effort would be involved?

## Redactions and limitations

Snapshot provenance: local `feature/pm128-save-activation`, recorded HEAD `e9f2deb`. Other branches exist, so this must not be represented as a complete current release. All original Git history has been excluded. Staff identities, tenant hostnames, internal environment references and GUIDs were anonymised. Real business master data and some evidence/binary assets were excluded. Synthetic fixtures are not production data.

The code may not compile or pass the original test suite after redaction, and **must not be deployed to SharePoint**. No changes were made to LIVE.

If you notice a security issue, do not post sensitive details in public issues. Please contact the maintainers privately. Copyright 2026 Kent Cricket Foundation. All rights reserved. See `LICENSE.md`.