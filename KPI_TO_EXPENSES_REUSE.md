# Read-only KPI Save lessons for Expenses

## Is KPI Save actually working?

**Not proved by the latest evidence inspected.** Ordinary non-admin identity and reads of the prepared private workplan/draft were demonstrated. Later source wiring was reviewed, but its release remained disabled. The subsequent test-window record was prepared, not active. No real employee Save, cold browser reopen, edit/resave, unrelated-user direct denial or receipt proof was supplied.

This corrects the premise that Expenses can simply copy a known-working KPI implementation. There are useful code and test ideas, but no native acceptance result to transfer.

## Source identity

The committed direct-Save repair is `8a76057c45b31eba627d5d371f89d00ba9bb87b5`. The later connection work has three modified files and one untracked private binding file on that base, not a new committed candidate. The private binding contains actual test configuration and is deliberately excluded.

The broad prepared KPI snapshot is older (`e9f2deb` lineage); the [focused Save slice](kpi/save-path/) retains the later correction. See [code map](REVIEW_GUIDE.md). Neither is an installed acceptance certificate.

## Actor and connector pattern

KPI ordinary draft Save uses **signed-in SPFx SPHttpClient -> SharePoint REST**. It is not a Standard Power Automate SharePoint-connector flow. Admission reads the native current user and checks the expected ordinary actor. The protected gateway checks the employee, year, status and exact private-draft link. Microsoft storage permissions must enforce the boundary independently of the screen.

Later KPI Standard-host Submit/Approve designs are separate. Their presence in source does not prove a deployed manager service.

Expenses has a different trust boundary: private request, Microsoft-stamped Author, active roster, service actor, permitted monthly claim, trusted Standard workflow and multiple financial stores. It must independently qualify that route, receipts, totals, audit and raw access denial. Do not import KPI's list schema, record identities, grants or release authority.

## What is worth reusing

| Idea | KPI source behaviour | Expenses qualification needed |
|---|---|---|
| One in-flight attempt | Repeated Save clicks share the current attempt; newer edits remain unsaved. | The server still needs durable operation identity across separate requests/sessions. |
| Conditional update | Specific IF-MATCH ETag; 412 becomes conflict; no wildcard overwrite. | Check every parent/line/ledger concurrency boundary, not only the UI row. |
| Truthful success | Readback matches save ID, canonical content, digest and changed ETag. | Reconcile line, claim totals, receipt, result and audit before reporting terminal success. |
| Uncertain network response | Read rather than blindly resubmit; retain user input when outcome is unknown. | Prove safe recovery after each partial financial write. |
| Scoped write surface | Four draft-content fields only; ownership and approval state are separate. | Define the financial field allowlist and trusted transition owner separately. |
| Identity before data proof | An admin response was rejected as proof of the ordinary employee session. | Use two distinct actual ordinary accounts plus the service actor; no administrator substitute. |

The KPI four fields are DraftPayloadJSON, DraftPayloadSHA256, ClientSaveID and ClientSavedAt. The digest checks content; it is not a signature, authentication mechanism or encryption. Updating one existing aggregate is not the same as a financial multi-record exactly-once transaction.

## Evidence table

| Question | Actual evidence at the cut |
|---|---|
| Ordinary identity and private draft read | Demonstrated in dated native read prerequisites. |
| Latest ordinary employee Save | Not proved. The readable payload was a setup fixture. |
| Fresh-session reopen after Save and second edit/Save | Not executed/proved in the current returns. Historical mocked/CI runs do not substitute. |
| Other employee denied through raw storage and app | Not proved. Owner access does not imply unrelated denial. |
| Receipt bytes, correct-line binding and privacy | No proof from this KPI draft route. |
| Current package installed and tested | Not proved for the later private connection. |

Internal evidence summaries inspected: PM148 actions 004/008 read prerequisites, 010 source wiring, 011 prepared window and 012 candidate identity. The latest is dated **23 October 2026, 23:40 BST**. Real account addresses, tenant URLs, record IDs and raw payloads are withheld.

## Next step for the existing Expenses PM

Compare its existing transport/controller with these behaviours and reuse affected test ideas. Keep financial privacy and receipts in Expenses' own acceptance plan. No new writer, source changes, tenant changes or credentials are authorised by this mapping. The complete private evidence/path handoff has separately been delivered to the existing Expenses project; availability does not prove that its PM chat has read it.