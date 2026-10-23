# KCF Expenses Web — start here
**Baseline plan status: PROPOSED.** Specific later Sponsor-approved DEMO/receipt/landing scope and local source work are documented in `docs/CURRENT_STATUS.md` and the relevant Issues; do not assume this entire proposed baseline is signed off. At 15 October the latest local SPFx candidate is source-only 0.0.5 and real authenticated Save remains unproved.

**Fast continuation in the existing project:** read `AGENTS.md`, this index, the current Dxx acceptance rows and the exact owned worktree/branch first. Open detailed historical evidence only for the task at hand. The 15 October AiCore method-by-method KEEP/ADAPT/REPAIR/REJECT review is retained inside `docs/AGENT_OPERATING_MODEL.md`; no new PM or second control system. The older Power Apps project is read-only reference.

## Use GitHub as the project control centre
- [Delivery plan and sprints](PROJECT_DELIVERY_PLAN.md): **9 incremental TEST deployments / 19 existing sprint labels**, including the approved S00-C, with acceptance criteria and dependencies.
- [Web requirements and changes](REQUIREMENTS_WEB_V1.md): **30 web-specific rules**, and explicit changes to older Power Apps wording.
- [All requirements mapped to Sprints](../requirements/traceability_v1.csv): **212 rows — original 182 + 30 WEB** (WEB-029/030 approved for scope on 13 October; passing mock tests do not equal deployed acceptance). Never reset IDs; track BUILD, TEST, QA, Sponsor UAT and Release separately.
- [Original 182 reference](../requirements/legacy_182_baseline.csv): historical requirements and full developer/QA/UAT instructions, not automatically controlling when a later accepted Sponsor decision differs.
- [Agent instructions](../AGENTS.md): read first in Codex/GitHub Copilot.
- [Agent assignments and branch owners](AGENT_OPERATING_MODEL.md).
- [Versioning, TEST, QA, UAT, rollback](TEST_VERSION_RELEASE.md).
- [What to send a developer](DEVELOPER_HANDOVER.md).
- [Current delivery state](CURRENT_STATUS.md).
- [Latest approved design direction](KCF_EXPENSES_DESIGN_DECISIONS_V3.md) and [interactive prototype](../design/preview/KCF_Expenses_Design_Review_v3.html) (mock, not deployed).
- [Approved source of 195 nominal codes](../design/data/nominals_approved_195.json) (snapshot, not proof of current TEST list).

## Project stages
**D00 Foundation** → **D01 real first Save** → **D02 expense receipts/editing** → **D03 Mileage** → **D04 Claim submission** → **D05 Manager** → **D06 Finance/payroll** → **D07 Admin/Help/accessibility** → **D08 pilot and Production release**.

Each Dxx contains Sprint A and Sprint B, a reviewed build and an actual KCF Automation TEST deployment. Production is always separately approved by Sponsor.

## Exactly what the Sponsor sees after each deployment
- Direct actual **TEST SharePoint page link** (or NONE if not installed).
- Changed numbered requirements, what can be clicked, PASS/FAIL/BLOCKED with evidence.
- Actual source commit, SPFx package version/hash, known rollback.
- Independent reviewer and QA decision.
- Five-minute Sponsor UAT plan; only Sponsor gives business PASS.
- Practical next Sprint and decisions (not unsupported percentage/dates).

## Hard boundaries
No extra bills. No Azure Functions, Key Vault or Premium flow connectors. Azure Maps is NOT guaranteed charge-free; don't activate unrestricted provider traffic. 24 internal staff, existing 1 TB+ SharePoint storage, existing Standard Power Automate entitlement. External/test emails disabled. Historical Power Apps and KPI untouched.
