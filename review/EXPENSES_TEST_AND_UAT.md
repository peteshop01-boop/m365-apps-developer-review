# First Save: review and user acceptance tests

Status: cases prepared, NOT EXECUTED in the external review copy. This document grants no tenant or testing authority. Use fictional people, suppliers, account codes and receipts in an independently qualified TEST environment.

## Preconditions

Record the exact source snapshot, installed app version, workflow version/state and configured storage. Use two distinct ordinary employee sign-ins, A and B. Administrator access must not substitute for either identity. Verify the scoped test permission and recovery arrangements before writes. Do not use real receipts, payroll data, notifications or Production.

## Owner's short test journey

1. Sign in as employee A. Open the agreed test month and select the fictional account code.
2. Enter a valid date, fictional supplier, description, amount, notes and the agreed receipt/no-receipt information. Save once.
3. Check the saved row appears once with the correct values and total. Close the browser session.
4. Reopen and sign in again. Check the same saved entry is present. Change a field, save and reopen again.
5. Sign in separately as employee B. Verify A's claim cannot be opened. QA must also prove direct-storage denial; a missing button is not enough.

The first milestone may be an Add-only release. Existing-line editing and receipts must be explicitly included or excluded in that milestone, rather than silently assumed to work.

## Detailed evidence cases

| Ref | Test | Expected result | Assigned role |
|---|---|---|---|
| ER-T01 | Check identity, active roster and month binding | A is server-identified; only A's eligible draft month is selected. | Developer and independent QA |
| ER-T02 | Save one valid expense without a receipt but with the required explanation | Exactly one stored expense and coherent parent/result/audit records; truthful success message. | QA, then owner |
| ER-T03 | Close and reopen a fresh session | Same stored ID and exact entered values, not a memory/localStorage substitute. | Owner and QA |
| ER-T04 | Save two valid expenses in the same month | Two distinct lines; correct total; no cross-month or cross-user linkage. | Owner and QA |
| ER-T05 | Missing required values, invalid amount or wrong-month date | Clear field errors; no business expense created. | Developer and QA |
| ER-T06 | Double-click or repeat the same operation ID | One business expense/outcome; no duplicate charge or inflated totals. | Developer and QA |
| ER-T07 | Two sessions make conflicting edits to one record | Conflict shown and newer data retained; no silent overwrite. Only after edit is in accepted scope. | Developer and QA |
| ER-T08 | Network response lost after a successful write | Reconciliation finds the stored result; no false fresh success, duplicate expense or unexplained data loss. | Developer and QA |
| ER-T09 | Interrupted multi-store write | Safe recovery/hold; parent totals, ledger, result, audit and receipt reconcile; no false terminal success. | Developer and Security |
| ER-T10 | B opens A's application URL and direct expense/request/result/receipt links | Access denied at stored data, including all confidential intermediate resources. | Independent Security/QA |
| ER-T11 | Attempt forged actor, claim, month or receipt binding in the approved test harness | Server rejects unrelated/invalid binding. Browser-selected identity never authorises access. | Independent Security |
| ER-T12 | Receipt upload and fresh reopen | Correct authorised image/PDF belongs to the right line; unrelated user denied. Separate from no-receipt milestone. | QA and owner |
| ER-T13 | Compare observed app/workflow/package to approved candidate | Exact version matches; uninstalled source is not counted as delivered. | Release/QA |
| ER-T14 | Later Submit, Query and Approve journey | Only assigned authorised manager can decide; one queried line preserves others; unresolved queries prevent final approval/export. | QA and owner after Save |

## Result record

For each case retain: test reference, date/time and timezone, tester role, fictional identity alias, source/app/workflow versions, actual result, evidence location, failure reference and retest result. Keep private tenant addresses and real identities out of the external pack. Preserve the original failed result after a repair.

A source review, a fake-storage test and an installed real-account check are separate evidence levels. Only the last appropriate level earns a usable TEST link or user acceptance. Do not add overlapping historical test counts together or relabel authored cases as passed.
