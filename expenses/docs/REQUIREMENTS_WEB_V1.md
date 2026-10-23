# Web Expenses — new/changed requirements and acceptance tests (v1)
**Owner:** KCF Sponsor. **State:** proposed controlled web baseline for review; old 182 IDs retained in `requirements/legacy_182_baseline.csv` and mapped in `requirements/traceability_v1.csv`. These IDs are *additions or explicit supersessions*, not a replacement for the historical register.

Each new ID has one **measurable result in the real deployed TEST application**, not merely an HTML demonstration.

| ID | Delivery | Requirement | Acceptance test |
|---|---|---|---|
| WEB-001 | D00 | New **native SPFx** application with separate TEST/PROD | Same code builds as compatible stable SPFx package; actual KCF Automation page opens; Production untouched. |
| WEB-002 | D00 | Exact supplied KCF **portrait white crest + FOUNDATION** on every screen | Binary user-supplied logo used at correct aspect ratio on desktop/phone; no substituted KCF badge. |
| WEB-003 | D00/D07 | Accessible, distinguishable soft multi-tone styling for KCF app family; Expenses slate/blue/grey | No pink; clear bright/high-contrast text, 4.5:1 text contrast target, WCAG 2.2 AA, focus/keyboard/touch, no colour-only statuses; KPI current look preserved. |
| WEB-004 | D00/D02/D03 | Fixed-height desktop two-panel list + editor, phone editor ABOVE list; internal scrolling only | At desktop 1366x768 and phone 390x844 all fields/buttons visible or reachable, readable, no horizontal scrolling, no stacked ten-page website. |
| WEB-005 | D01/D04 | UK dates, Nov–Oct fiscal years, month/year selector and truthful statuses | `dd-mm-yyyy` everywhere; November begins next FY; no misleading "Closed" status; previous claims show totals and exact Draft/Submitted/Approved state. |
| WEB-006 | D01 | **All 195 approved nominal master codes** available in an expense searchable dropdown and directory | Matches preserved approved 195-code master, searchable by code/name/aliases (e.g. "LT" returns all matching Lord's Taverners), exact code/name auto-filled, no separate Category field; reject unselected free text. Current TEST source cross-check required. |
| WEB-007 | D01/D02 | Expense list shows code/description, supplier, date, amount, receipt and latest-first rows | Real saved TEST rows ordered newest first (stable ties); totals update exactly once and read back. |
| WEB-008 | D02 | Receipt attachment upload/view for camera/file, JPG/PNG/PDF; mandatory no-receipt reason | Image shows real thumbnail and enlarged viewer; PDF displays filename/icon, in-app viewer or new-tab fallback; persistence and row isolation demonstrated; if no receipt, reason required; notes saved. |
| WEB-009 | D01/D02 | Edit, Duplicate, Cancel, Delete/void only while claim editable | Save updates original ID; Cancel/invalid no write; Duplicate one new ID; void retains audit and excludes totals; submitted/approved denied by backend. |
| WEB-010 | D03 | One-way or Return visible on each journey and manager review | "One-way" or "Return" saved, appears in list/details/reopen; reverse is calculated independently where Maps approved. |
| WEB-011 | D03 | Programme + effective-dated **travel nominal** selector (CTS Schools and Misc as quick defaults) | Lists include all approved active choices, programme's travel nominal shown by code and name; saved exact pair; fallback explicit, no invented codes. |
| WEB-012 | D03 | Round total route miles to whole miles, then apply effective rate, round GBP 2dp | Separate A→B / B→A distance where return, total raw distance then nearest whole payable miles, multiply effective-dated central rate and GBP rounding; same value after reopen and in summary. |
| WEB-013 | D03 | Azure Maps or alternative routing with **guaranteed £0 additional charge** | No auto-routing activation until independently verified no-charge hard limit/service contract; approved manual fallback shown honestly, no silent fictitious calculated route. |
| WEB-014 | D04 | Three-column Review Claim arrangement | Expenses total & oldest-to-newest list left, wider Mileage total & oldest-to-newest list middle, Grand Total box only right with nothing below; scroll inside lists when long. |
| WEB-015 | D04 | Month due 10th following month, authoritative configuration and correct action labels | Due date shown in Home/Help/Review; authoritative cutoff server-checked in UK time, timezone/exception configuration; consistent Review Claim label. |
| WEB-016 | D05 | Manager dashboard shows expenses/mileage/total per worker and status counts | Current-month team only, counts Draft/Submitted/Approved, proper row-level grand totals, search and phone/PC. |
| WEB-017 | D05 | Manager may approve or **Query individual lines** with written reason | One queried line retains approvals of others; unqueried/unapproved cannot count as approved, unresolved query blocks final claim and payroll; corrected line re-reviewed, actual audit correct. |
| WEB-018 | D05 | Delegated/alternate manager, time-limited team coverage | Named authorised deputy sees only delegated team's claims during approved dates, audit records acting manager and original manager; expiry removes access, direct URL denied. |
| WEB-019 | D05/D06 | Exceptional **self-approval** with explicit Finance acceptance | Highly visible self-approved flag + reason; Finance may acknowledge/accept or query, with identity/date/reason; zero payroll release before acceptance. |
| WEB-020 | D06 | Finance view of all 24 employees alphabetically by month/year | Employee + manager + Expenses + Mileage + Overall + exact status; headline Draft/Submitted/Approved counts/values; historical months browsable. |
| WEB-021 | D06 | Finance may alter nominal code with **visible permanent audit** | Old/new code & names, actor, time, reason, and changed indicator in user/manager/Finance views; direct editing without Finance authority fails. Monetary alterations have additional explicit approval rule. |
| WEB-022 | D06 | Chasers and notifications managed safely | TEST uses no external recipients (only Sponsor if explicitly approved); real chaser action uses unique identity, logs Send result and avoids duplicates. |
| WEB-023 | D06 | Finance 16-column payroll preview, justified adjustment, export, lock, archive | Actual TEST CSV/manifest output checked line-by-line and totals; single export, rollback strategy, no changed data lost, authorised scope only. |
| WEB-024 | D07 | All roles can search/copy nominal directory; Finance/Admin can maintain codes and teams | Reuse authoritative list, active/inactive handling, change log, role check; allow all 195 display while controlling edits. |
| WEB-025 | D07 | Profile/default home, Help, inclusive guide and recovery | Home postcode private to authorised actor; clear route fallback and receipt/no-receipt guidance; simple PC/phone help and errors. |
| WEB-026 | D00/D08 | **£0 extra cost** controls and no hidden Premium/billable dependencies | Verify all 24 Office 365 Standard entitlements, Standard-only flow inventory, actual monthly use vs allowance; no paid service, premium connector or unrestricted Maps. |
| WEB-027 | D00/D05/D08 | Secure originator and action authorisation in backend/list permissions | Test direct raw URLs and forged request payloads; unauthorised claimant/manager/Finance actions rejected regardless of UI; no access via site-wide Members/Edit bypass; audit negative tests. |
| WEB-028 | D00/D08 | GitHub release trace: Sprint → Build → Test → QA → Sponsor UAT → Prod | Exact commit, tag, SPFx package hash/version, deployed URL, tests, rollback and explicit Sponsor sign-off per release; no unsupported "done". |

## Original requirement conflicts: approved current interpretation
The old 182 are historical input **not** the authority when a newer Sponsor-approved UX/business decision contradicts them.

| Older IDs | Old meaning | Superseding current decision |
|---|---|---|
| `EXP-S02-003`, `EXP-S02-005`, `PCFIX-02` | Required Category selector | **WEB-006:** No separate Category on Expense form. One searchable 195-entry nominal; Programme only where relevant. Finance retains master data maintenance. |
| `PCFIX-07` | Form above list; oldest expense first | **WEB-004/007:** PC list LEFT/form RIGHT, phone form ABOVE list; newest first on input pages. Summary oldest first per column. |
| `PCFIX-12` | One list-only scroll area below form | **WEB-004:** Each desktop panel may scroll internally; no competing or nested widget scroll traps. |
| `PCFIX-17` | PC release first; defer mobile | **WEB-004/028:** both PC and phone accepted per deployed release (tablet outside MVP). |
| `PCFIX-18`, `PCFIX-20` | Mileage full-width form above list | **WEB-004:** PC two-panel, phone stacked; full available area. |
| `EXP-S06-006`, `EXP-S06-007`, `EXP-AUT-005` | Whole-claim approve/return model | **WEB-017/019:** Query/Approve per line with preserved unaffected approvals, delegate/self-approval exception; final approval blocked by unresolved queries. |
| `EXP-SEC-002`, `EXP-SEC-003` | Claimant-only and team-only access | **RETAIN SECURITY INTENT:** Any broad staff visibility policy must be signed explicitly after privacy/risk review; don't silently waive due to low technical skill of staff. |
| `EXP-S03-009`–`011` | Provider-independent whole-mile/return rule | **RETAIN:** already matches whole-mile rounding and A→B + B→A rule. Maps billing remains WEB-013 gate. |

## Authoritative precedence for builders
1. Written new Sponsor decision logged here and accepted through review.
2. Retained original requirement where not changed.
3. SharePoint verified schema/security reality; bring conflicts to Sponsor, do not fabricate compatibility.
4. Legacy Power Apps implementation detail is reference only, not build authority.

**Do not mark a requirement fully PASSED until corresponding deployed TEST runtime and Sponsor UAT results are recorded.** Maintain `requirements/traceability_v1.csv` and deployment issue checklist with evidence links. All new WEB IDs are proposals pending Sponsor acceptance of this version.

## Sponsor additions — 13 October 2026

These two additions are explicitly approved in Issue #4 comment 6135096894 and Issue #2 comment 6135101763. The preceding 210 references remain unchanged. Approval of scope does not confer build, deployment, QA or UAT credit.

| ID | Delivery | Requirement | Acceptance test |
|---|---|---|---|
| WEB-029 | D02 | Receipt capture and local viewing on phone and desktop | Mobile rear-camera capture where supported; detected desktop webcam with permission on click; Capture/Retake/Cancel; choose JPEG/PNG/PDF, readable HEIC only where supported; no receipt requires a written reason; type/size/content checks, thumbnail/enlarge and safe PDF fallback; stream stops on navigation, cancel, disposal and line changes. Local selections prominently labelled DEMO / NOT saved to SharePoint until separately authorised backend Save/Close/Reopen proof. Physical phone and installed host checks remain required. |
| WEB-030 | D00 | Accessible KCF Apps TEST landing and dedicated Expenses area | Exact white Foundation portrait logo, page-local navy/slate styling, responsive accessible app cards. Link only verified TEST pages and accurately label app availability. Unavailable/coming-soon cards have no dead links. Create only new approved TEST pages; preserve existing KPI, site-wide home/navigation/theme, permissions, data and flows. Record exact rendered URLs, package version/hash, rollback and independent review. |
