# AGENTS.md — KCF Expenses Web (SPFx) — rules for Codex, GitHub Copilot and specialist agents

> **Read first, before touching code:** `docs/PROJECT_DELIVERY_PLAN.md`, `docs/REQUIREMENTS_WEB_V1.md`, `requirements/traceability_v1.csv`, `docs/AGENT_OPERATING_MODEL.md`, `docs/TEST_VERSION_RELEASE.md`. Sponsor decisions outrank old Power Apps implementation directions. Do not assume documentation is approved until the planning pull request is merged.

## Single source of truth
- This repo **only**: `kent-cricket-foundation/kcf-expenses`. Separate from KCF KPI and the historical `C:\\REVIEW\\Builds\Expenses` Power Apps project. Use old project files **read-only for schema/requirements**.
- Existing SharePoint TEST: KCF Automation. Production: KCF Digital Operations; both support SPFx. No testing against PROD or exporting genuine records to GitHub.
- Keep the original 182 permanent IDs, do not silently renumber/delete. Supplement with WEB-001…030 for web-specific requirements (WEB-029/030 scope explicitly approved on 13 October); original differences are recorded as explicit supersessions. Traceability currently contains 212 IDs, of which 182 are original and 30 WEB.
- Mandatory £0 **additional** spend. Reuse licensed Microsoft 365 SharePoint and Standard connectors. **NO** Azure Functions, new chargeable storage, Premium connector, paid hosting, API gateway, licence upgrade, Azure Key Vault or unrestricted Maps. A £0 bill today is not a billing stop. No service provisioning without explicit Sponsor approval.
- Product scope: 24 users, up to 195 real approved master nominals selectable; dates `dd-mm-yyyy`; Nov–Oct financial years; due 10th following month; Expenses, Mileage, Review Claim, My Team, Manager, Finance, Profile, Admin, Help; exact uploaded white KCF Foundation portrait logo; accessible soft slate/blue-grey design, desktop two panels/phone stacked.
- Expense Category control has been **removed by newer Sponsor decision**; don't reintroduce just because an older requirement mentions it.

## Delivery and agents
- **One visible Delivery PM** owns sequencing, issue status, blockers, forecasts and progress reporting. PM must challenge developer evidence; Sponsor adviser independently challenges material PM updates before presenting advice.
- **One integration/technical lead** owns shared files, app shell, data contracts, branches/releases and integration with TEST. Do not run concurrent writers on the same branch or mutable SharePoint/Power Automate target.
- UI agents may work **in parallel on isolated feature folders/branches** only after shared design components and data interface contract are frozen. Specialist backend/security agent owns trusted identity, zero-cost standard SharePoint operations and authorisation; independent QA/security reviewers must not self-certify their own builds.
- Split substantive assignments by deployment/sprint, not hundreds of micro-chats. One agent can own a related 1–3 day Sprint; more agents do not make insecure Save code correct.
- Preserve issue scope, exact requirement IDs/AC and dependency gates. For a conflict, first check the latest recorded Sponsor decision and apply it where it clearly resolves the issue. Ask only about a genuine remaining business conflict; do not invent policy or ask again about an already resolved choice.
- Routine continuation clarification, Sponsor 23 October 2026: a worker finishing its bounded task does not finish the PM's approved delivery objective. Check its result and continue the next dependency-ready step already within the agreed scope, budget and run window, using supported tools. Do not require another 'continue' from Sponsor for ordinary sequencing, clerical work or in-scope technical choices. Each return names the next task and owner, or one precise missing condition.
- Reuse applicable recorded approvals without widening them. Explicit read-only assignments remain read-only; subsequent changes need their existing authority and conditions. Distinguish code/script faults, browser timeouts, missing capabilities and provider denials. Do not retry, split, reword, reroute or delegate denied actions, and do not remove any existing hold. Ask immediately for a verified human-only step, with its exact screen/action, effect and what resumes; never invent an approval button.
- This workflow clarification grants no new financial/data/tenant/permission/export/publication/test-run/release authority, changes no model or safeguard settings, and waives no independent review. Privacy, £0 additional spend, current operation limits and Production controls remain unchanged.

## Mandatory build order and real tests
1. D00: supported stable native SPFx build, shared accessible shell, separate TEST installation, actual SharePoint read/permission/licence audit.
2. D01: **real authenticated Add Expense → select exact nominal → Save → Close → Reopen** on approved `KCFEXP_TEST102_*` fixture. Verify raw TEST record, ID, month link, no duplicates, no hidden mutations.
3. Only after D01 first Save proof: receipts, Mileage/manual and safe Maps, Submission, Manager queries, Finance/export, Admin, whole-system UAT per plan. Visual parallel work may continue, but no fictitious business PASS.
4. Every deployment must show BUILD evidence, developer tests, exact TEST URL + commit/package hash, separate independent QA and Sponsor-only business UAT. A screenshot, mock localStorage Save, HTML demo or source test != SharePoint Save.
5. Treat security as real: never rely on hidden buttons; preserve least privileges/accurate Created By and owner/team assignment; refuse forged claim IDs, wrong-month writes, self-approval outside exception, duplicate Save, stale version and out-of-scope manager.
6. Windows desktop 1366x768 plus physical phone 390x844/845 required for final UAT. Keyboard/focus/contrast/WCAG 2.2 AA checks. Tablet excluded MVP.

## Financial and information controls
- No real claims, payments, employee data, receipts, payroll, emails/Teams/notifications, shares, ACL/list/flow or tenant changes without exact, current Sponsor authorisation. Developer may create **source code, tests, fake data and unmerged PRs** within this repo under the agreed Sprint.
- All TEST messages remain disabled; any explicitly permitted TEST communication goes to Sponsor only. No external SEND authority is implied by a configured recipient or an existing workflow.
- Do not commit credentials, access tokens, private employee contact lists, expense records, attachment bodies or live SharePoint URLs with secrets. The approved 195 nominal **reference codes** may be retained in private repo as read-only design sample; they do not prove current tenant list equality.
- Financial actions need actor/time/version, append-only audit (as far as backend permits), permission checks, error/retry/idempotency and no silent data loss. Query one line, retain other approvals and block whole-claim approval/export until resolved. Delegated manager and self-approval Finance acceptance must be auditable. Finance nominal corrections show old/new, actor, reason and date.
- Manual mileage may work as fallback, but never claim Azure Maps routing DONE until genuine routing and a real zero-cost hard limit are proved.

## Git/version and quality
- `main` = protected reviewed source, never agent-direct edit. New work branches: `feature/Dxx-Sxx-topic`, `fix/Dxx-topic`, `plan/topic`.
- One work item = one GitHub Issue; one substantive Sprint = one PR; no commit directly to `main`. PR includes exact IDs, tests, TEST target, risk, changes, screenshots and rollback.
- Before first coding: check official supported SPFx/Node versions and lock dependencies; the Mini PC's current Node 24 is **not** automatically compatible with the chosen stable SPFx.
- Build/reproducibility checks in CI or offline source; verify deployed TEST matches frozen commit/package. Version/tag after passing a meaningful deployment; release record includes `v0.DD.PP-test`, commit SHA, package SHA-256, env, URL, rollback, QA/UAT.
- Do not change PROD, publish/activate flows, invite users or deploy LIVE on the strength of a PR, green unit tests or a local preview.
- A repair retains failing defect and requirement IDs and triggers affected regression plus critical route smoke. Never assert an end-to-end PASS from static tests.

## Sponsor-facing reporting (short, plain UK English)
After a Sprint or material blocker: **RAG; scope; exact requirement IDs; current working TEST URL or NONE; what truly works; what fails/blocks; who fixes it; next concrete task; Sponsor action or NONE; next deployment and confidence**. Record design/build/DevTest/integrated/QA/PeteUAT/Production separately. No invented % or target date. Let Sponsor test immediately when a safe, real bounded TEST screen exists, without claiming formal release.

## Stop condition
When a tool, permission, licence, provider, identity or dataset is unverified, do **read-only** verification, build safe mock/local screen work in parallel, and clearly record BLOCKED for the sensitive action. Never lower privacy, approve self, use a dummy override, or enable chargeable services to make a green demo.
