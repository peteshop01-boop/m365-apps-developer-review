# KCF KPI System development rules

Work only in an isolated clone and an authorised branch. Preserve user changes. Use synthetic data. Do not deploy, publish, change SharePoint lists/flows/permissions, enable native adapters, contact staff, or modify LIVE without explicit current authority.

Read README.md and the bounded issue/PR before changing source. Preserve existing fail-closed actor, role, origin, TEST routing and canonical persistence checks. Do not reconstruct live governance from synthetic fixtures.

Run the affected checks and the full build/test CI before merge. Keep implementation, developer test, independent Security/QA, installed TEST, Sponsor UAT and release separate. Record exact commit and package hash for consequential actions.

Original-history and control evidence are outside this repository. No automated workflow in this repository may access or deploy to SharePoint.
