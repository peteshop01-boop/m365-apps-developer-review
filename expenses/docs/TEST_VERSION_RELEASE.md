# TEST, version control, acceptance and Production release rules
**Release-gate baseline: proposed.** The 13 October checked TEST site contained SPFx Expenses **0.0.2.0 DEMO only**; no real SharePoint expense Save. The local 0.0.5 upgrade has not been independently verified as installed. These historical test/release rules are not themselves deployment authority.

## Where the code lives
- GitHub repo: `kent-cricket-foundation/kcf-expenses` (Private).
- `main`: protected reviewed accepted source. Feature branches named `feature/Dxx-Sxx-name`; fixes `fix/Dxx-topic`; planning `plan/name`.
- PRs and Issues are the change/defect audit. No shared working-branch edits by parallel agents. Real financial data/credentials never in Git.
- Each deployment has one GitHub Issue (D00–D08), its mapped sprint checklists (D00 A/B/C; D01–D08 A/B), linked PRs, requirement IDs and evidence. Use Issues list/labels for To do / Build / Test / QA / UAT / Done.

## Actual gates
| Gate | What must be proven | Owner |
|---|---|---|
| Requirements/design | Explicit IDs, acceptance actions, user roles, local+TEST data and approved design | Sponsor and PM |
| Build | Source checked in with matching branch/PR, lint/typecheck/build, no secrets/premium deps | Developer |
| Developer test | Affected controls clicked, data contract/validator/error cases, PC+phone responsive | Builder |
| Technical review | Independent PR/code and data/identity contract challenge, exact files/integration | Technical reviewer |
| Installed TEST | Exact compiled package installed on KCF Automation, URL/version/commit and SHA-256 pinned; actual Preview/Play, not mock | Integration lead |
| Security | Actual authenticated wrong-actor/wrong-record/direct-list tests, no premium/billing unsafe route | Independent security reviewer |
| Independent QA | Real TEST transactions and negative/duplicate/concurrency recovery, 1366x768 PC+390x844 phone, WCAG target | QA (not builder) |
| Sponsor UAT | Sponsor performs supplied exact numbered tests in real TEST app, records PASS/FAIL | Sponsor |
| Release approval | All P0/P1 fixed, no hidden Maps cost, rollback verified, explicit written Production GO | Sponsor |
| Production smoke | Correct protected Digital Operations package, no test emails or data mix, owner and rollback | Release lead + QA |

**Build passes are not permission to publish Production.** Every failed stage is OPEN with who/action and reason.

## Version naming
- Source tag after each independently accepted TEST deployment: `v0.DD.0-test` for D00 through D08 (example D01 `v0.1.0-test`), subsequent repair `v0.DD.P-test`.
- Package name e.g. `KCFExpenses-SPFx-D01-v0.1.0-test.sppkg`; record SHA-256, commit SHA, timestamp, exact site/app page and identity.
- First accepted Production release (after D08) is `v1.0.0`, not a disguised re-tag of a failed TEST package.
- When package/version labels differ by SharePoint implementation, record **all** identity fields and compare content; never infer deploy success from tag alone.
- Rollback: protected prior `.sppkg` and instructions, reverse migration plan where schema changes; preserve source and historical files.

## Minimum TEST fixtures per stage
- Two different authorised employee accounts, one unrelated employee negative user, designated manager, alternate manager and Finance identity as appropriate.
- Synthetic approved ClaimMonth/Draft and dummy financial lines on `KCFEXP_TEST102_*`; never use real employee historical claims to test Create/Approve/Payroll.
- Test methods: Create → Save → Close → Reopen → raw SharePoint readback; invalid Save zero writes; duplicate click produces one line; browser reload and lost network; two-user edit/version conflict; submitted immutability; Claim→Manager→Finance workflow; query one line while retaining others.
- External test notifications/Finance delivery **OFF** unless Sponsor approves a test to himself only.

## Release registers
For each `Dxx` issue append:
`Dxx | Sprint(s) | Permanent requirement IDs | Source SHA | Package SHA | TEST URL | Developer PASS/FAIL | Technical review | Security | Independent QA | Sponsor UAT | Production release | Rollback | Defects | Open blockers`.
Store short screenshot/video and synthetic proof links; do not put real claim details on public artefacts.

## Zero cost operational assurance
SPFx and SharePoint list storage use existing Microsoft 365. Standard connectors only, within licence/request limits; current 24 staff have same licence per Sponsor. Existing Power Apps `PowerAppV2` flow triggers are not reusable unchanged from SPFx. Prove a Standard-compatible trusted actor/request design. Azure Maps account currently £0 but free transactions may incur charges after allowance: NO unrestricted Maps activation without an enforceable £0 guarantee and separate Sponsor approval.
