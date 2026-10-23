# KCF Expenses Web — Controlled delivery plan v1
**Baseline plan status: PROPOSED FOR SPONSOR REVIEW | drafted 11 October 2026.** Since drafting, 0.0.2.0 mock-only SPFx was installed in TEST (confirmed 13 October), and later local 0.0.5 source was built; an actual new SharePoint Save has **still not** been demonstrated. Later scope approvals do not approve every line of this proposed plan. The previous Power Apps system is preserved but **is not** the build base.

## Objective and exclusions
Build a staff Expenses web app in native SharePoint Framework (SPFx) with responsive, accessible screens, using the existing KCF SharePoint Lists and document storage. Do **not** replicate the broken Power Apps UI, source, Power Apps-specific triggers or legacy project-management machinery.

- TEST site: `https://example.invalid/sites/REVIEW-TEST-SITE`.
- Production site: KCF Digital Operations, confirmed SPFx capable; deployment **never** authorised by a TEST sign-off alone.
- Private source: `https://example.invalid/private-development-repository`.
- Users: approximately 24, fewer than 20 claim lines and up to five receipts per user/month; no separate storage service required.
- Additional recurring/usage-based cost **£0 maximum**. Existing SharePoint / Microsoft 365 Standard connectors only unless an independently confirmed zero-billable solution is approved. No new Azure Functions, Key Vault, Premium connector, trial, premium Maps request or hosting purchase.
- Maps: existing Azure Maps Gen2 account exists and current reported bill was £0 on 11 Oct 2026. **That does not guarantee no future charges.** Auto-routing is an explicitly held release gate until an enforceable no-charge solution and safe quota are demonstrated; do not replace this with a fictitious PASS.
- Existing 182 permanent IDs remain traceable; newer approved design changes supersede conflicting old wording. See `requirements/legacy_182_baseline.csv`, `requirements/traceability_v1.csv`, `docs/REQUIREMENTS_WEB_V1.md`.
- Existing `KCFEXP_TEST102_*` TEST lists are the first candidate data store, **after** a field/permissions/actor reconciliation. Production `KCFEXP_*` remain untouched.

## Delivery method
**Deployment = a named, immutable SPFx package + commit/hash actually installed and opened in TEST.**
The existing register has 19 sprint labels: D00 has S00-A/B/C (including Sponsor-approved WEB-030); D01–D08 have A/B. Every sprint produces demonstrable output, developer tests and defect evidence. The deployment's complete scope undergoes fresh independent QA before Sponsor UAT. A successful HTML demo or local component render is not an installed TEST pass.

Each deployment is assessed in this order:
1. Requirement and acceptance criteria agreed, dependencies and TEST dummy data identified.
2. Feature branch source built; engineer runs automated/unit tests plus PC and phone checks.
3. Pull request and technical/security challenge; one integration owner merges the exact approved commit.
4. Build the SPFx package; record commit SHA, package SHA-256, version, app/page URL and rollback reference.
5. Install in **KCF Automation only** and run actual browser tests against authorised TEST fixtures.
6. Independent QA (not the builder); actual rendered 1366x768 desktop and 390x844 phone, keyboard/accessibility and negative security cases as relevant.
7. Give Sponsor the app URL, numbered short UAT plan and exact changed requirement IDs. **Sponsor alone** marks business UAT PASS.
8. Correct failures on a new version and run targeted regressions. Only then mark deployment TEST accepted.
9. Only a separately approved Production release goes to Digital Operations; protect historical lists, Live app, flows, alerts and receipts.

## Deployment and Sprint register
All stages are **NOT STARTED** unless a deployment-specific evidence link proves otherwise. A design prototype does not count as a deployment.

| Deployment | Sprint | Deliverable to build | Real TEST acceptance and evidence | Critical dependencies |
|---|---|---|---|---|
| **D00 — Foundation** | S00-A | Native stable SPFx project, exact KCF portrait logo, accessible multi-tone Expenses theme, fixed app-style desktop/phone shell, GitHub/CI and rollback convention | `npm build`/packaging PASS; new web part opens in KCF Automation on PC/phone; correct version visible | Supported SPFx/Node versions; logo asset transfer |
| | S00-B | Current schema, existing 195-code feed equality, staff/roles/access audit; separately authorised and independently qualified private empty TEST foundation | Exact native capture, private containment, truthful creation provenance and rollback; no financial Save, activation or messages implied by this plan | Exact current native authority; schema/security owner; Standard entitlement |
| | S00-C | Existing Sponsor-approved WEB-030 KCF Apps TEST landing and dedicated Expenses area | Verified URL/version/hash/rollback, accessible cards and exact Foundation logo; preserve unrelated site, KPI, data, flows and permissions | Existing 13 October scope; reuse completed source; no diversion from first Save |
| **D01 — First genuine expense** | S01-A | Home/current month; Expenses split panels; full 195-code searchable nominal (number, description, LT); no Category field; Add form; status/totals | Shows actual authorised TEST nominal records and current month; 24-person scope; accessible PC/phone | D00 |
| | S01-B | **Add Expense → Save → Close → Reopen** for two ordinary TEST employees using one roster-driven product; minimum early S02-A receipt proof | Correct raw source ID, linked claimant/month parent and totals; Cancel or invalid input writes nothing. Each reopens own same item and JPG/PNG/PDF bytes or distinct mandatory reason; duplicate Save produces one line/amount; reciprocal raw expense/file/request/result denial | Private actor-neutral storage/Standard processor; authoritative roster/Draft discovery; exact installed app; independent Security/QA before Sponsor |
| **D02 — Receipts & expense maintenance** | S02-A | Images/PDF upload/view; thumbnail, PDF fallback, mandatory no-receipt reason; phone camera; notes | TEST file persisted and reopened; correct line, filename, image viewer/PDF; permissions; no missing reason | D01 |
| | S02-B | Expense Edit, Duplicate, void/Delete, list date order and internal scrolling; recalculated totals | Same ID on edit; one duplicate; historical audit retained; submitted claims cannot be edited; PC/phone | D01 and D02-A |
| **D03 — Mileage** | S03-A | Manual journey Add/Edit/Cancel, Use Home, programme/travel nominal, outward/Return, whole-mile total/rate, history | Save/reopen real TEST row with each leg, correct whole-mile rounding × dated rate to 2dp, no duplicate; protected selection | D01 identity, valid rate and Programme/Travel codes |
| | S03-B | Geocoding, genuine outward/reverse route, map preview, cost/abuse guard | Two actual valid provider responses, separate A→B and B→A, readable map, fail-safe fallback and **enforceable £0 additional billable use**. **BLOCKED FOR ACTIVATION until zero-charge provider guarantees pass.** | Provider terms, billing gate, ownership |
| **D04 — Review & submission** | S04-A | Review Claim: Expenses oldest-first left, wider Mileage oldest-first middle, Grand Total only right; claim history and submission due 10th of following month | Every row/receipt and totals match TEST backend and month configuration; UK dates; no duplicate labels | D02, D03-A |
| | S04-B | Validate, Submit, Take Back, Needs Changes/Resubmit; locks; lifecycle audit | Authenticated distinct actors, duplicate clicks/concurrency and after-reopen statuses PASS; never send Finance/Payroll test messages | Standard-only secure operation, no real notifications |
| **D05 — Manager** | S05-A | My Team: delegated authorised team, employee month/status, Expenses/Mileage/Grand Total, Draft/Submitted/Approved counts | Positive manager/negative unrelated team; sorted filtering; phone/PC | D04, manager-team source |
| | S05-B | Detailed Expenses/Mileage review, approve/query **per line**, reason, unaffected approval retained; temporary alternate manager; exceptional self-approval requiring Finance acknowledgement; Complete Review | Query one of multiple lines; other decisions unchanged; unresolved query blocks whole-claim final approval/payroll; delegated time window and Finance exception audit; negative tests | Delegation authority and audit contract |
| **D06 — Finance/Payroll** | S06-A | Foundation-wide alphabetical queue with managers, month/year, three totals and status counts; detailed review, chaser preview, audited nominal correction | View all test employees; every correction shows old/new code, reason/actor/time; non-Finance denied; no real chasers | D05 |
| | S06-B | Preview 16-column payroll file; controlled adjustment and locking/export; finance acceptance of self-approved exception; historical exports | Export file created once in TEST, 16 columns exactly, totals reconcile, readback and controlled rollback; no external delivery | Export contract, month roster and £0 connector checks |
| **D07 — Administration, Help & accessibility** | S07-A | Staff/manager/deputy mapping, month/rate/nominal maintenance, all-staff read/copy nominals, Profile/Home postcode; KCF app family theme | Audit all changes, active-only role guards, correct actor and dates | D05/D06 |
| | S07-B | Role-aware Help, submission timing, visual and screen-reader/keyboard/mobile verification; support and recovery documents | Actual desktop/phone full regression; zero unresolved P0/P1; accessibility WCAG 2.2 AA target | All earlier deployments |
| **D08 — Pilot and release** | S08-A | Controlled claimant→manager→Finance→export pilot, recovery and multi-user concurrency | Sponsor executes UAT on exact TEST candidate; independent QA + Security accepted; known defects triaged | Prior TEST gates |
| | S08-B | KCF Digital Operations production promotion and support handover | **Sponsor's explicit GO**; package provenance and rollback; smoke test; no unapproved external messages; owner/deputy/support documented | Pilot PASS; production sign-off |

### Dependency rule
D01-S01-B is the **first product go/no-go**. Do not build six unconnected Save-less screens before proving it. Other screen designers may work in parallel after D00-A but may not mark features DONE until deployed and integrated. D03-B cannot be quietly declared PASS if automatic routing remains unpaid/unresolved. D08 release requires all accepted in-scope requirements or explicit, written sponsor deferrals.

## Planning horizon
Use **short, testable 1–3-working-day Sprints as a planning unit**, but do not promise those calendar durations. Sprints that require tenant configuration, security decisions, routing/billing or financial export can run longer. Developers should report completed evidence, remaining likely/optimistic/pessimistic effort and blockers after each deployment. Forecast only after D00/D01 actual results. **No ungrounded overall completion %.**

## Priority of decisions already given by Sponsor
- All 195 approved master nominal codes available in the selector/directory (do not invent another Category dropdown).
- Queries per expense/mileage line. Approve other lines, hold overall approval/payroll until all queries resolved.
- Temporary alternate managers for absence. If exceptional self-approval, flag and require recorded Finance acceptance; no untracked self-pay.
- Finance can correct nominal codes with old/new/reason/actor/time visible to audit and staff; amount-changing adjustments need explicit separate policy.
- UK `dd-mm-yyyy`, fiscal Nov–Oct, due 10th following month; PC two panels, phone stacked; exact portrait logo; large legible text.

## Initial open decisions / non-waivable technical proof
- Is the Standard SharePoint request-list + cloud-flow path secure and correctly licensed for SPFx, including immutable originator and trustworthy actor? Pilot the identity/ACL model before any PROD build.
- Which code types in the 195 master are allowable as employee expense allocations? Sponsor wants all displayed; Finance still owns valid-posting policy (fail closed until agreed).
- £0 Maps **hard cutoff** (ordinary Azure Pay-As-You-Go budget alert is insufficient).
- How do line decisions and claim state map to historic SharePoint columns/ApprovalLog? Any schema changes require explicit approval.
- Which Finance payroll output adjustments are allowed, who authorises amount changes, and whether Finance correction triggers notification.
- Existing user staff access, site licensing and support owner/deputy. £0 additional spend must be verified, not promised.

## Tracking / who marks what
Maintain `requirements/traceability_v1.csv` with requirements and primary sprint; use the existing deployment Issues with their mapped sprint checklists (D00 A/B/C, others A/B), proof links and blockers. Code built != deployed != QA != Sponsor UAT. One PM owns roadmap/status, one integration lead merges only when authorised, independent reviewer verifies, Sponsor signs off. Synthetic evidence only; remote publication requires its own authority.

### 22 October Sponsor execution overlay — primary mappings unchanged
Current S00-B: EXP-01 private foundation; EXP-02 existing195 feed reuse; EXP-03 protected storage; EXP-04 privacy preparation. Next S01-A: EXP-02 selector/feed composition, EXP-05 existing imported flow binding preparation, EXP-06 authenticated app composition. S01-B: EXP-03/04 final execution/privacy proof, EXP-05 qualified flow execution, EXP-06 exact app installation, EXP-07 real two-employee Save/receipt/cold reopen, EXP-08 Sponsor handover. Minimum receipt evidence is brought forward from S02-A without moving EXP-DAT-013, EXP-S02-014/015/016 or WEB-008 primary mappings; remaining camera/viewer/replacement scope stays S02-A. No new Mileage work before genuine first Expense Save proof. Every action records issue, correction, owner, actual timestamp and acceptance proof. None of this overlay grants tenant mutation or treats the single-claimant source fixture as the multi-user product.
