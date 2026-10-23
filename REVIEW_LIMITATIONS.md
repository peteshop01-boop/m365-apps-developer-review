# Exact scope, omissions and reproducibility

This repository is sufficient for an external **source, architecture and delivery-process review**. It is not a complete runnable/deployable reproduction or an independently accepted app release.

## Inputs and non-modification

The supplied sanitised source snapshots were verified against commits `122fda604cace23341e3efcda27878e568d5757e` (KPI) and `181fcfcc358f066bb296206634440fdf331d86ea` (Expenses). They contained 753 and 205 tracked files respectively before the final two-file exclusion. Only their file contents, not their Git history or private remotes, enter this repository.

KPI's snapshot README records the underlying application branch at `e9f2deb`. Expenses records `8b0fc3a` with stated local text modifications. These input hashes identify sanitised snapshots; they are not claims about installed software. The source preparation and this publication did not modify either LIVE application.

## Deliberate final exclusions

| Withheld path relative to Expenses snapshot | Reason and consequence |
|---|---|
| `app/kcf-expenses-hub/src/webparts/kcfExpensesHub/components/approvedNominals.ts` | An additional generated financial-master copy still contained organisational account information. It is not published. The separately supplied `src/data/nominals.ts` contains synthetic codes. Its existence does not automatically satisfy every import/test using the withheld module. |
| `app/kcf-expenses-hub/flow/D01ExpenseProcessor.json` | A generated workflow export embedded the same business master. Generator source remains available. No replacement generated workflow is claimed to have been built or tested. |

Raw findings and the withheld files stay outside the public tree. Values from those files are not reproduced in the public review report.

## Material already excluded by the preparers

Original Git history, real employees/records, tenant access configuration, credentials, operational logs, receipts/payroll, evidence captures and some branding/build artefacts are absent. Some synthetic-contract fixture inputs and original master-data files are also withheld. Original private repository links have been replaced in the source documents.

The [missing-reference inventory](review/MISSING_REFERENCES.csv) records unresolved literal relative imports/requires found by a fresh static pass. It is not a compiler: generated stylesheet declarations, dynamic file access, platform packages and external dependencies require separate examination. Redacted links in historical source documents are not working access routes. Maintained reviewer navigation starts at the repository README.

### Known execution consequences

KPI source/tooling refers to excluded master imports and captured-history test inputs. Some preview scripts assume an example developer-machine Playwright path. Expenses references original design-data/branding outside its application folder and the omitted nominal module. Sanitised IDs and synthetic data can invalidate golden assertions or hashes even when syntax parses.

Do not represent `npm install`, `npm test`, `npm run build` or workflow generation as verified for this public tree. No application compilation, dependency audit, end-to-end tests, tenant changes or installation was performed by the final publication review. Do not fill in real credentials to make it run.

## Version reconciliation

The earlier focused KPI repair linked in [REVIEW_GUIDE.md](REVIEW_GUIDE.md) is a different, later source view. It is useful for comparing Save changes but is not merged into the supplied broad package. Historical test successes belong to their exact original candidates and do not certify either public snapshot.

## Review tasks still possible

An engineer can trace the actual screen-to-service composition, inspect Save/approval code and source tests, challenge the storage/permission design, identify disabled/missing connections, inspect the requirement/sprint material supplied for Expenses, and propose a small recovery sequence. Reproducing a live Save or giving a firm deployment estimate additionally requires a reconciled candidate, fictional runnable fixtures, qualified TEST configuration and actual test evidence.

## Rights and account identity

Copyright notices and KCF/company references may remain. This is not an anonymity guarantee. The existing per-project licence files are preserved. This publication grants no access to the private repositories or tenant and does not automatically apply review feedback to the working projects.


## Separate later KPI source slice

The final snapshot also retains the earlier prepared focused source under kpi/save-path/ from committed Save repair 8a76057c. It has its own fictional dataset and supporting references. It is not overlaid into the older broad KPI source and is not a runnable third application. Its file identities are covered by the final manifest. No new application exports or tests were performed to supply this already-prepared slice.


Static source check: [review/MISSING_REFERENCES_FINAL.csv](review/MISSING_REFERENCES_FINAL.csv) records 40 unresolved literal references, including generated outputs, excluded private fixtures, withheld branding and some template-text matches. This is not 40 compiler errors. Final review documents have no unresolved relative links. The source is useful for a technical review but has not been compiled or tested as a runnable redacted distribution.
