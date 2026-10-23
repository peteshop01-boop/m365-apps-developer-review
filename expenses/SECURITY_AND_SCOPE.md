# Public review sanitisation and limitations

Prepared 23 October 2026. This is a source-inspection package, not a deployable release.

## What has been deliberately excluded or changed

- Original development Git history, private worktree files, tenant captures, receipts, payroll data, operational reports and QA evidence are excluded.
- Employee names and emails, original tenant domains, private internal site identifiers and actual GUIDs were replaced or pseudonymised.
- The real 195-code nominal master was replaced by **195 synthetic demonstration codes**, maintaining the source data shape.
- Some binary branding, native package assets and evidence artefacts are withheld.
- Review text reflects the latest observed local integration worktree but is not a certified release candidate.
- Internal repository links were replaced; no credentials or real finance records were intentionally exported.

## Checks performed on the exported snapshot

- Targeted scans found no known staff identifiers, original work email/tenant domains, private repository URLs or high-confidence secret strings.
- Gitleaks 8.30.1 reported one **generic-api-key** warning at an expression in the flow source. It was reviewed in context and is not an API credential. This does not guarantee the absence of all secrets.
- JavaScript syntax checked: 60 files, no errors.
- TypeScript/TSX parsing checked: 91 files, no errors.
- Strict JSON parsing was not applicable to two comment-containing configuration files; all other JSON files passed.

## Known omissions and boundaries

The source may not pass full tests or build without withheld assets, configurations and private synthetic-contract support. Native TEST persistence, privacy denial, installed QA, sponsor UAT and finance/policy readiness remain unproved. Do not activate SharePoint flows, mutate production resources or process financial transactions using this public review snapshot.

If a possible vulnerability or private value is found, tell the maintainers privately rather than reproducing it in a public issue.