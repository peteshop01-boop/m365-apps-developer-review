# Test and acceptance plan for the first useful release

These are proposed/reconciled test journeys for external review, **not newly executed tests**. Source suites remain beside their implementation. [Expenses' detailed UAT cases](review/EXPENSES_TEST_AND_UAT.md) and the source project's own delivery rules add detail.

Use fictional data and two distinct ordinary sign-ins, A and B, in a separately authorised TEST environment. Record source revision, app/package/flow versions, tester, result and evidence for each case. An administrator impersonating an employee is not an ordinary-user permission test.

| Ref | Applies to | Test | Required outcome |
|---|---|---|---|
| T01 | Both | Identify employee and correct plan/year or claim/month | Microsoft-stamped identity and correct eligible parent; no browser-selected actor overrides |
| T02 | KPI | Select multiple Core KPIs, add Impact KPIs, select behaviours and set quarterly targets | All intended sections reach the persisted aggregate, not only the first row |
| T03 | Expenses | Save a valid expense with required notes and receipt/no-receipt information | One correct stored line, correct parent and coherent total/result |
| T04 | Both | Close browser and reopen in a fresh session | Same stored identity and values, not memory or localStorage substitution |
| T05 | Both | Edit and save again | Same logical record updated; no duplicates or lost unchanged sections |
| T06 | Both | Repeat the same operation/double-click | One business outcome; no duplicate expense or plan |
| T07 | Both | Two stale editing sessions | Clear conflict; newer work not silently overwritten |
| T08 | Both | Lose response after server write | Reconciliation reports truthful outcome without creating another record |
| T09 | Both | Missing/invalid required inputs | Clear error and no unintended business write |
| T10 | Both | B opens A's app and direct-storage links | Server-enforced denial for all sensitive records and intermediate results |
| T11 | Both | First creation and repeat creation | Private from initial meaningful content; one employee/year or employee/month parent; safe repeat behaviour |
| T12 | Expenses | Interrupt expense/receipt/result/audit write | Coherent recovery or explicit hold, never false success or wrong totals |
| T13 | Later workflow | Submit, request changes, resubmit and approve | Only assigned authorised reviewer decides; history retained; protected fields cannot be self-approved |
| T14 | Release | Match tested source to installed app/workflow | Exact versions verified, then owner tests same candidate |

Passing mocked tests supports implementation confidence but does not prove live permission enforcement, connector behaviour or installation. A privacy publication check is not an application security acceptance.

The first testable slice should be explicitly agreed. Do not quietly describe an Add-only, no-receipt slice as complete editing, receipt persistence or manager approval. Conversely, later reporting and payroll should not delay ordinary private Draft Save without a demonstrated dependency.
