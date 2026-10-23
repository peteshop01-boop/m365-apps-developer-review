# Final publication privacy and security review

## Decision and scope

**PASS for publication of this specific review snapshot after the two exclusions below, subject to the stated limitations.** This means the final review found no unresolved credential or confidential-data finding in the selected tree. It is not certification of either application's runtime security, a penetration test, a dependency-vulnerability waiver or authority to deploy.

The final owner performed a fresh review separately from the supplied preparation reports. That review used the actual file contents and new scanner results rather than accepting the earlier 'sanitised' label. No separate external human security audit is claimed.

## Exact source scope

The supplied packages were pinned to `122fda604cace23341e3efcda27878e568d5757e` for KPI and `181fcfcc358f066bb296206634440fdf331d86ea` for Expenses. The input trees contained 753 and 205 tracked files respectively. Their private Git histories, remote configuration and mapping files were not copied.

The final source selection retains 753 KPI files and 203 Expenses files. Maintained review documentation and evidence summaries are additional. The exact published file identity is recorded in [review/FILE_MANIFEST.csv](review/FILE_MANIFEST.csv); that manifest excludes itself. Hashes establish identity, not application correctness.

## Findings which were not accepted as safe

A new content check found residual organisational account data in two files in the supplied Expenses package: a generated nominal module and a generated workflow export. Both were excluded before this publication. Their data and raw finding snippets are not included in the public report. Generator/source code and the separately prepared fictional nominal master remain available.

See [the exact exclusions and their consequences](REVIEW_LIMITATIONS.md). The original candidate folders and working applications were not changed. A previous pattern-only privacy assurance was insufficient because it did not establish that every generated copy of the master data had been replaced.

## Generic API-key warnings: fresh review results

Gitleaks **8.30.1** was run afresh with decoding enabled and inline allow-comments not accepted as exclusions. It returned **75 generic-api-key findings**, not zero. Every finding was checked against its source role and recorded individually in [SCANNER_FINDINGS_REVIEW.csv](review/SCANNER_FINDINGS_REVIEW.csv).

| Disposition | Count | Why it is not a live credential |
|---|---:|---|
| Fixture identifiers | 38 | Pseudonymised GUIDs used as command, person, audit or idempotency record keys in test/fixture construction, not authentication secrets |
| Named test/configuration keys | 36 | Explicit synthetic record names, correlation labels and notification/configuration property names |
| Function-parameter match | 1 | The scanner matched across the `keyExpr,creationAllowed=` parameters in the workflow builder; it did not find an assigned API token |

Raw scanner output is retained privately. The public disposition table records file, line, rule, reason and file hash without reproducing potentially sensitive values. The scanner's normal finding exit status was not relabelled as a zero-warning scan; the publication decision follows the documented review.

The full-tree rescan, including this report and the disposition CSV, returned **151 warnings**: the same 75 source findings, 75 matches against the report's SHA-256 digest column, and one quoted copy of the function-parameter example above. Each digest was recomputed against its source file; these additional report matches are not API keys. No other warning is accepted under that explanation.

An initial archive-aware pass misidentified a text test file as compressed Brotli input. The fresh plain-file pass completed without that error. The input tree contains text source/configuration/documentation rather than archived releases or media. Archive scanning is not presented as having checked withheld artefacts.

## Additional checks and adjudications

The review also checked known staff/company-tenant identifiers, personal email patterns, original private repository links, common private-key/token formats, signed URLs, credential-like assignments, file paths, names and embedded data copies. Relevant contexts were inspected, not merely renamed.

- `<!-- ACCESS KEY -->` is an empty template marker in storage configuration, not a populated key.
- `CROSS-CARRIER-SECRET` and `not-a-secret` occur in negative/synthetic tests, not live configuration.
- `RowVersionToken` and workflow expressions are version/control values, not bearer tokens.
- `RoleDefinitionBindings@odata.nextLink` is an OData property name, not an email address.
- A public dependency-author email in npm metadata is third-party package attribution, not a staff contact.
- The `BEGIN ... PRIVATE KEY` text in the privacy checker is a detection regular expression; no key body is present.
- Example developer paths and test/website aliases are not working credentials. They remain execution limitations, not proof that scripts run on another machine.

Company abbreviations/copyright may remain under the owner's instruction. No claim of total organisational anonymity is made.

## Completeness and execution

A static pass checked 3,059 literal relative import/require references and recorded 40 unresolved references for reconciliation. Many are generated build outputs or withheld branding/data; some are string/template references rather than live imports. They are listed in [MISSING_REFERENCES.csv](review/MISSING_REFERENCES.csv), not misreported as 40 compiler failures.

No application code, build, dependency installation, full tests, hosted workflow, tenant request, native permission change or deployment was executed by this publication review. Existing source documents' earlier test counts and preparer parsing checks are not new final-review test passes.

Only the separate public review repository is changed. Workflows retained under the project subfolders are source material; no root GitHub Actions workflow is installed by this pack. A source-inspection review is useful with these limits, but a runnable reproduction or LIVE assessment requires separate work.

## Verification record

Before upload, the final file selection and maintained review links are checked again. After upload, anonymous HTTP reads are used for the repository, its documentation and key code files, and the published file hashes are compared. The resulting access record is stored under `review/PUBLIC_ACCESS_CHECK.json` after the check; it is not inferred from authenticated connector access.

If a reader discovers a suspected confidential value, do not repeat it in a public issue. Arrange a private report with the repository owner. This review is a defined check with documented limits, not a guarantee that no possible inference or undiscovered defect exists.

## Final owner follow-through and later source slice

The supplied-source findings were independently checked again against the exact current combined tree. All 75 source warnings matched the recorded reviewed locations. A full fresh Gitleaks 8.30.1 scan with decoding enabled and inline allow-comments ignored returned 151 warnings: the same 75 source findings, 75 report digest matches and the quoted function-parameter example. No scanner setting was relaxed to make the warnings disappear. The file hashes in the disposition table were refreshed to the actual publication bytes.

The later, already-prepared KPI Save slice is now available at `kpi/save-path/` rather than through an earlier public commit. It is separate from the 753-file broad KPI source. It introduces no extra source secret finding. The content check found one private-key-header pattern only inside the privacy scanner's detection regular expression, with no key material. Curated document links resolved. The static relative-reference inventory has 40 entries; that inventory is not a compiler result.

Current native-status assertions were corrected from the latest read-only evidence: private records and ordinary-user reads exist; current native Save/cold-reopen, unrelated raw denial and receipt proof are not established. The cross-project mapping does not claim that Expenses can copy a working installed KPI service.

## Publication history boundary

An earlier public staging commit, present before this final owner review, retained a company-tenant name in one test assertion and a personal commit email. These are not authentication credentials. The final publication is prepared as a clean, history-free review snapshot with a GitHub no-reply author address; the earlier public history is preserved privately, not imported into that snapshot. No original private development history is exposed.

This removes the earlier draft from the maintained main-branch history. It cannot recall pre-existing external clones, cached pages or commits still addressable by an old identifier. Complete removal of hosted cached references may require GitHub Support. The company name and KCF copyright are intentionally permitted by the owner. No claim of total anonymity or erasure of past public copies is made.

The final verification record will identify the exact post-publication commit and anonymous access results. Earlier verification records remain dated evidence for their own snapshots, not proof of a newer tree. No LIVE application, operational source worktree, tenant permission, workflow or credential was changed.