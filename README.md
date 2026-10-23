# Two Microsoft 365 apps: external developer review

**Start here.** This repository brings the KPI/Workplan and Expenses source snapshots together for an external technical and delivery review. It is a separate review copy, not either working repository, a deployed application or a release candidate.

The immediate question is why roughly two months of AI-assisted work have not produced a verified, installed **Save -> close -> reopen**, with another employee denied access. We want specific technical findings and a small delivery plan, not reassurance or an assumed full rewrite.

## Read in this order

1. [Review guide and code entry points](REVIEW_GUIDE.md).
2. [Current issues, evidence and next actions](CURRENT_BLOCKERS.md).
3. [Architecture, Save and approval diagrams](ARCHITECTURE_REVIEW.md).
4. [Tests and user acceptance](TEST_PLAN.md).
5. [Missing material and exact snapshot limits](REVIEW_LIMITATIONS.md).
6. [Final publication-security review](SECURITY_REVIEW.md) and [individual scanner dispositions](review/SCANNER_FINDINGS_REVIEW.csv).
7. [Combined blog/forum post](BLOG_POST.md), which can be shared with this repository link.

## Actual source, not just explanations

| Project | Source | Process and data |
|---|---|---|
| KPI/Workplans | [SPFx/React/TypeScript application and tests](kpi/src/webparts/performanceHub) | [Processor/host source](kpi/power-platform), [list-schema documentation](kpi/docs/PRODUCTION_LIST_SCHEMA.md), [snapshot README](kpi/README.md) |
| Expenses | [Application and tests](expenses/app/kcf-expenses-hub/src) | [Workflow generator and tests](expenses/app/kcf-expenses-hub/flow), [requirements](expenses/requirements/traceability_v1.csv), [delivery plan](expenses/docs/PROJECT_DELIVERY_PLAN.md), [snapshot README](expenses/README.md) |

The supplied KPI package is based on its recorded `e9f2deb` application source. The Expenses package records `8b0fc3a` plus stated local text changes. These are different projects and versions. A later KPI Save repair previously uploaded to this same public repository is linked separately in the review guide; it is not silently merged into the supplied KPI package.

## What reviewers should deliver

Identify the smallest safe route to first Save for each project; list the next three to five physical changes and tests; challenge unnecessary architectural or agent-management complexity; and separate coding effort from configuration, testing and external waiting. Refer to exact files/functions and distinguish demonstrated faults from questions needing runtime evidence.

Public technical feedback can be raised in [Issues](https://github.com/peteshop01-boop/m365-apps-developer-review/issues). Do not post credentials, confidential records or suspected sensitive values in an issue. No production access is requested.

## Important boundaries

This is **reviewable source, not a guaranteed runnable checkout**. Missing fixtures, assets and private deployment settings are listed explicitly. No full application tests, deployment, activation or real-account Save tests were run to publish it. Historical status documents remain source material, not a live report of a running agent or installed version.

Company abbreviations and copyright notices may remain. Real staff/financial records, tenant credentials, original private Git history and source-to-alias mappings are not part of the publication. Two residual business-data files were caught by the final review and withheld, rather than trusting an earlier 'sanitised' label.

No LIVE application was changed. Feedback here does not automatically change either development project. The existing [KPI licence](kpi/LICENSE.md) and [Expenses licence](expenses/LICENSE.md) remain applicable; public visibility is not a general licence to deploy or commercialise the code.


## Current Save evidence and cross-project reuse

[Read the KPI-to-Expenses mapping](KPI_TO_EXPENSES_REUSE.md). It identifies committed versus uncommitted source, the actual actor/connector design, ETag and duplicate handling, and the absence of native Save/cold-reopen/receipt proof. [Later focused KPI Save source](kpi/save-path/) is separate from the older broad package. No original working repository is exposed.
