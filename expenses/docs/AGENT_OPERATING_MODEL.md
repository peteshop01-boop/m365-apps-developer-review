# Agent and developer operating model — Expenses Web
**Status:** Proposed, 11 October 2026.

## One accountable PM, a few bounded specialist lanes
The historical Expenses project became fragmented because many agents created drafts and reports without one tested deployable application. New project is deliberately smaller.

| Role | Accountable output | Can change | Cannot certify |
|---|---|---|---|
| **Delivery PM (one visible Codex thread)** | Sprint order, blockers, GitHub Issues/PRs, release evidence, timeline, Sponsor status | Plan, issue status, non-production coordination | Pretend local source is deployed or sign Sponsor UAT |
| **Technical/integration lead (one)** | Stable SPFx toolchain, common layout, data contracts, merge, reproducible deployed package | Common app shell, shared APIs, integration branch | Independent QA/security approval |
| **UI builders (1–6 parallel after framework)** | Separate screen modules with PC/phone and self-tests | Their own feature branches/folders only | Same shared theme/nav file simultaneously or backend permission rules |
| **Backend/workflow specialist** | Standard-only SharePoint connection, trusted Save/Approve/Export path, error/concurrency handling | Isolated backend branch and synthetic TEST fixture after scoped authority | Financial security approval |
| **Independent technical/security reviewer** | Verify authorisation, direct-URL access, identity, cost and integration correctness | Evidence, comments, review approval; no change to candidate under review | Own code |
| **Independent QA** | Verify exact deployed TEST version, desktop/phone journeys, negative cases and bug reproducibility | QA evidence/defect issue; no candidate mutations | Business acceptance |
| **Sponsor (Sponsor)** | Business choices, exact UAT result, approve/decline Production | Business acceptance and release decision | Auto-inferred PASS |

## Practical parallelisation
1. Lead creates **one stable SPFx app shell**: fonts, exact logo, theme, navigation, accessibility components, typed data interfaces and example fake data.
2. Freeze component exports and interfaces for one deployment. Assign screen areas on separate branches:
   - B1 Home + Claim Summary
   - B2 Expenses + Receipts
   - B3 Mileage + manual/Maps UI
   - B4 My Team + Manager Review
   - B5 Finance + Payroll
   - B6 Profile + Admin + Help
3. Backend/security specialist works in parallel on TEST access/flow authority. **Only the integration lead** changes shared app shell, data service implementation and released package.
4. Technical lead integrates small reviewed PRs into one branch, runs full build/regression, then installs **one immutable TEST package**.
5. Independent QA tests; Sponsor tests the *same* exact version. Repair via separate PR, rebuild, retest.
6. The number of active builders may vary with real available capability. Do **not** claim six have started until their branches/tasks and outputs are visible.

## Every Sprint Issue must contain
- Sprint ID, deployment ID, owner, exact permanent EXP-/PCFIX-/WEB- requirement IDs, acceptance tests and true dependency.
- Source branch and PR, TEST URL/version/package hash, test claimant/dummy data, manual and automated tests.
- Status: NOT STARTED → BUILDING → DEV TEST PASS → CODE REVIEW PASS → INSTALLED TEST → INDEPENDENT QA PASS → Sponsor UAT PASS → TEST ACCEPTED. Then separately Production GO/NO-GO.
- Defects linked to original requirement, reproducer and fixed release.
- Blocker: what failed, owner, exact action, Sponsor action or NONE, and what safe work continues.

## Model and tool choice
Codex is primary code editor on Mini PC/GitHub. GitHub Copilot in VS Code is an optional additional author, **not** a second uncontrolled writer to the same files. SharePoint Copilot can inspect lists/permissions where authorised. GitHub keeps independent branches/reviews; no need to build an external Sites prototype first.

Do not copy old Expenses `AGENTS.md` wholesale. It contains Power Apps identity, old 9 Oct deadlines, deprecated PM routing paths and exact old app instructions. Retain only permanent Sponsor plain-English, preservation, traceability and assurance principles.

## Weekly and Sprint reporting
Only one authoritative GitHub `docs/CURRENT_STATUS.md`; one GitHub Issue per deployment. PM updates after meaningful Sprint or material blocker. Do not add dozens of disconnected status files. Quality gates must never be quietly skipped to meet a time target.

## 15 October AiCore methods transfer — bounded reconciliation (not a second framework)
Source: Sponsor's five-page `KCF_Expenses_AiCore_Handover.docx`, received in the existing Expenses conversation. Reviewed against THIS SPFx repository. This section records the disposition inside the existing operating model; no new PM, role title, approval, context percentage policy or release authority is created. `KEEP` preserves an existing rule; `ADAPT` uses a limited method; `REPAIR` closes a specific gap; `REJECT` excludes an unsafe/irrelevant import. Tests marked **OPEN** are requirements, not passes.

| Transfer method | Decision | Existing exact file / reason | Accountable owner | Proving test or evidence |
|---|---|---|---|---|
| L1.1–1.2, L2.1–2.4 model metrics/selection | REJECT as Expenses product feature | `docs/PROJECT_DELIVERY_PLAN.md`: deterministic SPFx/SharePoint, £0 new spend; no authorised AI receipt service or model benchmarking requirement | PM/Sponsor | Dependency audit and Standard-licence/£0 readback **OPEN**; no new provider calls |
| L1.3–1.4 effective source, tools and roles | ADAPT | `docs/START_HERE.md`, `app/kcf-expenses-hub/src/webparts/kcfExpensesHub/components/ExpenseDataService.ts`: separate real backend from mock; verify workers by process, branch and changed outputs | Visible PM | Actual worker PID/source SHA; confirm mock service not treated as tenant Save |
| L1.5–1.6 private data and untrusted input | KEEP | `AGENTS.md`, `C:\\REVIEW\\BUILDS\Expenses-Web-SPFx-save-contract\backend\standard-save\SaveContract.ts`: no secrets or real data in Git, no client-stated actor/financial authority | Backend + Security | Forged actor, wrong-month, raw unrelated-user and direct-list negative tests; **tenant tests OPEN** |
| L3.1 short truthful instructions | REPAIR | `docs/START_HERE.md`, `docs/CURRENT_STATUS.md`: both carry old proposed/13 Oct checkpoints, not today's installed state | PM/integration owner | Inspect current branch, package hash and actual TEST version independently before any status upgrade |
| L3.2 narrow delegation/context | ADAPT | This operating model and `docs/DEVELOPER_HANDOVER.md`: one visible PM, one integration owner, isolated specialist branches; no inherited KPI thresholds, pins or worker cap | PM | Verify one source writer; each worker PREPARED/SENT/RUNNING/RETURNED/REVIEWED/INTEGRATED separately |
| L3.3 reusable procedures/evidence | KEEP | `requirements/traceability_v1.csv`, `docs/TEST_VERSION_RELEASE.md`: permanent IDs and existing stage/PR registers; no additional ledger | PM/QA | Count preserved IDs/supersessions; exact source, tests, QA and installed record per Sprint |
| L3.4–3.5 teaching command guard and link checker | REJECT as enforcement | `AGENTS.md`, `docs/TEST_VERSION_RELEASE.md`: course examples fail path-containment and PowerShell-command probes; financial trust must be enforced by actual permissions | Security | Real ACL, forged request and denied direct-list tests **OPEN**; no illustrative guard installed |
| KPI 12-file role/model alignment | ADAPT principle only | `docs/AGENT_OPERATING_MODEL.md`: roles already defined; no evidence of approved equivalent model pins or installed `.toml` requirements in Expenses | PM/integration | Validate actual agent runtime if used; do not claim named agent RUNNING merely from config |
| KPI context-tool candidate | REJECT | `docs/DEVELOPER_HANDOVER.md`: KPI context repair failed Security/HOLD, QA absent; it is not an accepted Expenses dependency | PM | No imported threshold, context monitor or central control script |
| L4.1–4.2 deterministic financial decisions | KEEP | `docs/REQUIREMENTS_WEB_V1.md` WEB-006/012/017/019/023: nominal, whole-mile then rate and GBP 2dp, line-level approvals and Finance exception | App + backend lead | Existing local domain cases; final monetary/readback/actor proofs **OPEN** |
| L4.3–4.4 retries, stale version and recovery | REPAIR | `C:\\REVIEW\\BUILDS\Expenses-Web-SPFx-save-contract\backend\standard-save\SaveContract.ts` and sibling `ExpenseReadback.ts`: pending contract/readback code, no trusted tenant writer yet | Backend lead | 210/210 offline readback/Save checks at 15 Oct; independent review and real duplicate/race/recovery tests **OPEN** |
| Receipts, Category and data-field conflicts | REPAIR | `docs/REQUIREMENTS_WEB_V1.md` WEB-006/008/029; `C:\\REVIEW\\BUILDS\Expenses-Web-SPFx-save-contract\backend\standard-save\README.md`: no Category UI; TEST ExpenseLines still requires it, reason field unverified | SharePoint schema owner + backend | Exact TEST102 field/ACL reconciliation and persisted receipt/reason readback **OPEN** |
| Workflow routes, approval/notifications | ADAPT | `docs/TEST_VERSION_RELEASE.md` and historical `C:\\REVIEW\\Builds\Expenses\sharepoint-build` (read-only): old PowerAppV2/SendEmailV2 flows not approved SPFx processors | Integration/security | Actual Standard connector, actor, recipients, off-state, duplicate/retry test **OPEN** |
| L4.5 evidence-based release | KEEP | `docs/CURRENT_STATUS.md`, `docs/TEST_VERSION_RELEASE.md`: source/build, installed TEST, TECH, Security, QA, Sponsor UAT and Production remain distinct | PM/QA/Sponsor | Frozen hash + exact installed webpart and negative user proof; Production only after explicit Sponsor GO |

**Transfer state at this checkpoint:** RECEIVED and RECONCILED in these existing files; bounded onboarding CONTROL CHANGE implemented in `docs/DEVELOPER_HANDOVER.md`. Separate backend repair `ce0beef` is local source only and awaits independent acceptance. Neither the AiCore transfer nor any passing offline test makes the application installed, secure or UAT-ready. No course guard, KPI control scripts, model pins or context percentages are imported. Preserve all historical requirements and conversation/project names.
