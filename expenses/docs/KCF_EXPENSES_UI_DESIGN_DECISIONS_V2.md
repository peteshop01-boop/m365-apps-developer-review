# KCF Expenses Hub — UI Design Decisions v2
Date: 11 October 2026
Status: Sponsor feedback incorporated into standalone interactive design preview; not yet connected to SharePoint or deployed as SPFx.

## Screen layout
- Keep the current APPROVED DIRECTION of Expenses, Mileage and Claim Summary design. Do not restore the old Power Apps layout.
- Desktop/web: compact two-column panel, dated item list on the LEFT and selected item / Add editor on the RIGHT. Avoid oversized cards and unused vertical whitespace.
- Phone <=800px: same two panels STACKED, with selected item / Add editor ABOVE and the compact date-ordered list BELOW. Do not squeeze desktop columns onto a narrow phone.
- App-shell fills available height. Keep header and mobile bottom navigation fixed. Scroll INSIDE editor and list panels where more content than fits; do not stack all screens into one long document.
- Every navigation opens its own screen. Use KCF Foundation logo in the header on EVERY screen; preserve aspect ratio on desktop and mobile. Existing KCF logo asset located in KCF workspaces; move a copy to a local project asset on SPFx implementation.
- Palette: deep navy + slate/dark blues, high-contrast bright/white text, KCF red for warnings and DRAFT-DEMONSTRATION information only. NO pink and no faint grey lettering.
- Display demo-only warnings in red; ensure removed/replaced in finished connected release.

## Home
- Latest current-month claim: Expenses total; Mileage total; Combined grand total; Draft/Submitted status.
- Three consistent actions only: **Open Expenses**, **Open Mileage**, **Review Claim**. Do not also display `My Claim` for same destination.
- Previous claims: compact month rows, scroll within that panel. No duplicated destination labels.

## Expenses
- **NO separate Category field.** One active **Nominal Code** choice and its automatically populated description/name.
- Search the full live SharePoint `KCFEXP_Nominals` list by code, name, or abbreviation/aliases (e.g. "LT" returns Lord's Taverners matches). This MUST be verified against actual data. The visual preview shows only labelled fictional examples; it does NOT contain the full KCF list.
- Add/Edit: date, supplier, business purpose/description, nominal search/selection, amount, receipt upload, no-receipt reason, additional notes. Data contracts and backend validator to be reconciled before production.
- Receipt: select image or PDF via upload. Image displays thumbnail beside filename and opens enlarged viewer. PDF displays PDF icon/name; click opens embedded PDF viewer with "open in a new tab" fallback. If no attachment, receipt reason mandatory. These in-browser previews do NOT upload to SharePoint.
- On Save, item appears immediately in the compact list in **descending date order (newest first)**, and totals update once. The preview's Save is temporary browser state only; final acceptance requires real TEST list write and reopen.
- Keep current Expenses, Mileage and Grand total together and visible within each screen, including when the new-line form is open.

## Mileage
- Same desktop side-by-side / phone stacked behaviour and compact dated journey list, newest first.
- Add/Edit, From/To, Use Home, route/manual distance, whole-mile rounding, configured rate and GBP two-decimal amount.
- Display Expenses, Mileage, combined total at same location as on Expenses.
- Azure Maps NOT connected in the current interactive design preview.

## Claim Summary
- Totals from Expenses + Mileage; chronological list of all lines with most recent first; one consistent Review Claim destination.
- Submission/approvals are not connected in the current visual preview.

## Navigation
10 main areas: Home/My Claims, Expenses, Mileage, Claim Summary, My Team, Manager Review, Finance/Payroll, Help, My Profile, Admin.
Desktop: left nav; phone: bottom nav (Home, Expenses, Mileage, Claim, More), role restricted items behind More.

## Build / assurance rules
- Prototype is visual and local; do not claim Microsoft sign-in, real SharePoint persistence, uploads, routing or manager authorisation work.
- UI components to be built in shared SPFx React/TypeScript/CSS repo. Backend connections and secure access rights to be implemented and tested independently.
- Parallel builders own separate screen folders and feature branches; single integrator owns shared nav/theme/API contracts.
- Initial real-data acceptance: authorised TEST claimant → Add Expense → pick actual nominal → receipt/no-receipt reason → Save → reopen → verify persisted record and deny an unrelated user.
- Keep old Power Apps and KPI projects unchanged.

Design source: sponsor feedback on 11 October 2026 and independently inspected standalone design preview v2. This file is not a production approval or an SPFx deployable build.
