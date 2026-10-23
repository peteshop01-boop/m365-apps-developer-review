# What to give a developer — KCF Expenses SPFx
**Private repo:** https://example.invalid/private-development-repository

## Compact start for the existing PM or a bounded specialist
Read root `AGENTS.md` and `docs/START_HERE.md` first. Then identify the **actual owned worktree/branch, exact Dxx Sprint, current review gates and current source commit** before editing. Read only the task-relevant requirements/acceptance rows, source and evidence; use the wider reference list below when necessary. `docs/CURRENT_STATUS.md` contains older checkpoints and is not live deployment proof. A configured agent is not evidence of a running worker: check the actual process, its owned branch and recent output. Record task **PREPARED, SENT, RUNNING, RETURNED, REVIEWED, INTEGRATED, INSTALLED TEST** separately.

This is a focused onboarding procedure, not an additional PM or control ledger. Do not import KPI-specific context thresholds, agent model pins, worker caps or its unaccepted context-monitor repair. Existing conversations and project names remain unchanged.

## Reference files (open as relevant)
1. Root `AGENTS.md` — binding agent/developer rules.
2. `docs/PROJECT_DELIVERY_PLAN.md` — 9 TEST deployments with 19 existing sprint labels and exact acceptance.
3. `docs/REQUIREMENTS_WEB_V1.md` — current approved design direction and conflicts with old forms.
4. `requirements/traceability_v1.csv` — 212 preserved IDs (182 legacy + WEB-001–030) with separate scope, Build, TEST, QA, UAT and Production states.
5. `requirements/legacy_182_baseline.csv` — original requirement wording, for reference only when newer decisions conflict.
6. `docs/TEST_VERSION_RELEASE.md` — actual TEST, QA, UAT and rollback gates.
7. `docs/AGENT_OPERATING_MODEL.md` — branch/module ownership and independent assurance.
8. `docs/KCF_EXPENSES_DESIGN_DECISIONS_V3.md` and `design/preview/KCF_Expenses_Design_Review_v3.html` — current interactive design reference (HTML is **mock only**, not deployment-ready).
9. `design/data/nominals_approved_195.json` — approved nominal snapshot, **NOT a live SharePoint read**.

## Environment / scope
- KCF Automation = TEST; KCF Digital Operations = Production. Both confirmed SPFx deployment support.
- Build **new SPFx from scratch**; not Power Apps. Historical Power Apps source may be searched read-only for fields/requirements, but must not be installed or become architecture authority.
- Use existing authorised TEST102 lists, only after mapping their current internal field names and permissions. Retain actual SharePoint production Lists untouched.
- No extra licence/resource spend, no premium connectors or unrestricted Azure Maps; no live email, payroll or permission changes during development without express approval.
- Exact white user-supplied Foundation portrait logo, accessible multi-tone body, PC side-by-side, phone editor over list.

## Historical first assignment = D00/S00-A (already built as a demo)
Do not restart this foundation Sprint: the latest integrated local demo is on `feature/D04-overnight-15oct-integration` at `e60fb80`, while real D01 Save is still outstanding. The original D00 instructions below remain as the historical acceptance specification, not the next task.

**Original goal:** One true SPFx package that installs and renders our new app shell in KCF Automation. Choose stable compatible Microsoft SPFx/Node dependencies; check installed Mini PC tooling rather than assume Node 24 works.

**Deliver:**
- `src` SPFx project, package lock and standard build scripts.
- Shared layout/header/sidebar/bottom phone navigation, full-height viewport, correct logo, thematic tokens.
- Clear demo-only placeholder Expenses/Add screen (no SharePoint write assertions).
- Browser test screenshots at 1366x768 and 390x844, typecheck/build results, package hash.
- Branch `feature/D00-S00-A-spfx-foundation`, PR, release identity and TEST URL only after authenticated install authorised.

**Acceptance:** KCF Automation actually loads deployed full-page application from exact version; mobile and PC readable and interactive, no external calls or costs. A local HTML demo is NOT acceptance.

## Next Sprint = D00/S00-B
Read-only TEST102/schema/permission/flow audit. Propose and independently test secure originator validation for Standard SharePoint request-list workflow or other no-Premium, least-privilege path. Do not install paid Azure service. No real claim writes/manager approvals without authorised dummy fixture.

## First business milestone = D01/S01-B
**One real expense Save/Reopen.** Current authenticated TEST claimant, code selected from actual SharePoint authorised master, amount and receipt/no-receipt validation; exactly one TEST ExpenseLine persisted and linked to correct ClaimSubmission; close/reopen same ID; unrelated user cannot change it, invalid/duplicate request rejected. Only then scale features.

## Sharing with outside developer
Send them this repository URL **after granting appropriate read access** and the specific GitHub Issue/feature branch. Do not email tenant secrets, API keys, real claims, employee lists, payroll records or raw receipts. Grant least-privilege repository access and remove it when engagement ends. A developer can contribute through PRs without site owner/admin access. Any TEST tenant access should be separately authorised, time-limited and traceable.

## Handover request to developer
"Read AGENTS.md and the linked delivery plan. Estimate D00/S00-A from actual toolchain, then submit a source-only PR and test evidence. Do not modify any old Power Apps/KPI project, SharePoint production data, tenant connections or premium Azure resources. Show the exact dependencies and who needs to act if blocked."
