# KCF Expenses — Screen and Workflow Design v3
Date: 11 October 2026 | **DESIGN FOR SPONSOR REVIEW — NOT A RELEASE**

## Branding and presentation
Use the **exact user-supplied** `Foundation Logo Portrait Whiteout A04 .png` — white Kent Cricket Foundation crest with FOUNDATION text — on every page, dark navy background, slate/dark blue panels, high-contrast bright text, red only for warnings and design-only disclaimers. Do not substitute any other logo. No pink or pale grey on light backgrounds. Large readable type, no unexpected full-page scrolling.

## Responsive layout
Desktop: compact Expenses or Mileage dated list on the left, selected item or Add/Edit form on the right. Both full available page height with independent internal scroll; fixed footer totals.
Mobile: stack selected details/form ABOVE compact list BELOW, fixed bottom menu. Not side-by-side.

## Universal rules
- Date format **dd-mm-yyyy**.
- Newest-first dated rows on Add/Edit Expenses/Mileage screens. Review Claim shows oldest-first **per column** as requested.
- Expenses, Mileage and combined Grand Total visible and recalculated.
- Nominal directory: ALL 195 codes from preserved approved original master, searchable by code/description/alias e.g. LT. Source is in `design/data/nominals_approved_195.json`. Live SPFx will read the authorised SharePoint list and enforce a reimbursement-eligible subset. Snapshot is *not* evidence of live content.
- All staff may look up/copy nominals, Finance/Admin may maintain with reason/audit.

## Screen-specific design
### Home / My Claims
Latest month's total Expenses/Mileage/Combined plus Draft/Submitted/Approved status. Open Expenses / Open Mileage / Review Claim only; no duplicate My Claim action. Past claims financial-year selector, FY Nov–Oct. Prior month totals + status; avoid unexplained Closed labels.

### Expenses
No Category selector. One searchable nominal dropdown that fills nominal name automatically. Date, supplier, description, amount, receipt upload, notes, required reason when no receipt. Images show thumbnail and enlarge on click; PDF shows name/icon and in-app viewer with new-tab fallback. Add and Edit supported for authorised non-submitted lines. Lists show date, supplier, **code and name** and amount.

### Mileage
One-way/Return designation on list for manager. Programme dropdown defaults CTS Schools, includes CTS Street, ACE, Disability/LT, VI, LD, W&G, Cricket Cities and Misc. Suggest actual approved travel nominal 20600,20650,25600,40600,40700,40800,55605,30600,15700 respectively and allow review/change. Each entry shows travel nominal. Route/manual miles, round payable miles to whole, configured rate, currency 2 decimals. Add/Edit and real persisted journey metadata once connected.

### Review Claim
Three columns: Expenses left (total top + dated lines oldest to newest), Mileage middle wider (total top + dated lines oldest to newest), Grand Total right **with nothing below**. Inner panel scrolling for long lists. Show submission deadline **10th of following month**, from authoritative SharePoint configuration, including policy exceptions.

### Manager My Team
Headline Draft/Submitted/Approved counts. Each employee shows Expenses, Mileage, Combined Total and status, from authorised manager's team only.

### Manager Review
Expenses and Mileage separate tabs; all details of each row and receipts, large type. Approve or Query each line (Query requires written reason); approved other lines remain approved. Shortcut to approve remaining unqueried only with explicit per-line audit. Complete Manager Review once all resolved. Queried claims Needs Changes and only changed lines require reapproval.

### Finance / Payroll
Headline count/value, financial year and month selector; alphabetical whole-foundation employee listing with owner manager, Expenses/Mileage/Total/status. Open same complete line detail as manager. Chaser to worker/manager (real messages NOT in prototype). Finance-controlled reasoned nominal correction, worker notification and financial material changes may require reapproval. Preview/override export with before/after, approval, audit. Final lock/export is a separate permission-gated action; archive historical periods read-only.

### Admin
User list, verified line-manager/team relationships (e.g. Synthetic User/Synthetic User only where authoritative), staff roles, nominal reference, mileage rate, month policies and audit. Finance/Admin maintenance with versioning.

### Help / Profile
10th-next-month deadline, what happens when queried, steps for receipts, mileage, reimbursements, errors and how to contact Finance. Profile Home postcode and preferences.

## Critical conditions
The standalone browser preview is a **mock interface only**: no SharePoint read/write, Azure Maps, live approvals, email, payroll or real identity. Nothing should be marked tested as a financial transaction. First real acceptance remains authorised TEST claimant + actual eligible nominal + receipt/no-receipt reason → SAVE → REOPEN → verify SharePoint row and unauthorised-access refusal.

## Approval policy recommendation
Historical expense-app research (SAP Concur, Expensify, Zoho Expense, Pleo) supports query/return of an individual expense while retaining decisions on compliant lines. This is a KCF proposal requiring Sponsor confirmation.

## Separate outstanding decisions
Which nominal codes are reimbursable? Return mileage one stored line or two? May approved unaffected lines be paid when another remains queried (recommend NO)? Material changes requiring manager reapproval? Exact submission cutoff and exceptions? Finance/payroll export specification?

User-supplied logo should be copied into the new private SPFx repository **once its binary is imported through an authorised file transfer**. This document does NOT claim the logo image file or compiled web app has been committed to GitHub.
