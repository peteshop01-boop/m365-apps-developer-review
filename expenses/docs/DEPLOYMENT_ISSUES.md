# KCF Expenses — live GitHub deployment issue tracker
**Planning reference:** [PR #1](https://example.invalid/private-development-repository) (review before coding). **Issue list:** https://example.invalid/private-development-repository

Every row is a deployment to **KCF Automation TEST**, not permission to deploy Production. Each issue has its mapped sprint checklists and acceptance gates: D00 includes the existing S00-C/WEB-030 landing scope as well as A/B; other deployments have A/B. No new issue or sprint is introduced.

| Order | Deployment issue | Sprint A | Sprint B |
|---|---|---|---|
| 1 | [D00: Foundation](https://example.invalid/private-development-repository) | S00-A stable SPFx shell/first deployed app | S00-B schema/permissions/£0 checks and separately authorised private empty foundation; existing S00-C landing/Expenses area |
| 2 | [D01: First Save](https://example.invalid/private-development-repository) | S01-A Home, Expenses, 195-code dropdown | S01-B **actual TEST Add → Save → Close → Reopen** |
| 3 | [D02: Receipts/Edit](https://example.invalid/private-development-repository) | S02-A real upload/view/PDF and no-receipt | S02-B edit/duplicate/cancel/delete & totals |
| 4 | [D03: Mileage](https://example.invalid/private-development-repository) | S03-A manual one-way/Return and accurate payment | S03-B Maps **only** when enforceable zero-cost gate passes |
| 5 | [D04: Claim](https://example.invalid/private-development-repository) | S04-A Review Claim and due date | S04-B Submit/TakeBack/Resubmit with controls |
| 6 | [D05: Manager](https://example.invalid/private-development-repository) | S05-A My Team | S05-B line Approve/Query, delegation, self-approval with Finance exception |
| 7 | [D06: Finance/Payroll](https://example.invalid/private-development-repository) | S06-A all-staff finance/adjustment/chaser control | S06-B tested export, controls, archive |
| 8 | [D07: Admin/QA](https://example.invalid/private-development-repository) | S07-A staff/nominal/month/rate admin | S07-B Help, accessibility, QA |
| 9 | [D08: Pilot/Production](https://example.invalid/private-development-repository) | S08-A separate-role pilot and Sponsor UAT | S08-B explicit Sponsor GO, protected Production deploy and smoke |

GitHub issue status is **NOT STARTED** until a named owner actually begins. Use the issue checkboxes to track work and attach PRs, TEST app URLs, screenshots, package SHA, defects, independent QA and Sponsor UAT. Sponsor does not need a spreadsheet to see this.

**Current Sponsor order (22 October):** S00-B secure foundation, S01-A roster/195-feed/authenticated composition, then S01-B two ordinary employees' genuine Save/receipt/cold reopen and reciprocal raw denial. Minimum S02-A receipt proof is brought forward as a dependency; primary mappings stay unchanged. Empty tenant setup still needs exact current independent native qualification. No financial execution or flow activation is authorised by a tracker row.
