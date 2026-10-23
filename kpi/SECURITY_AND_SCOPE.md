# Public review sanitisation and limitations

Prepared 23 October 2026. This is a source-inspection package, not a deployable release.

## What has been deliberately excluded or changed

- Original development Git commit history and private working-tree files are excluded. This exported snapshot will have a new, single-root history.
- Real employee names and emails have been replaced with synthetic identities.
- SharePoint tenant domains, internal site identifiers and real GUIDs have been masked or consistently pseudonymised.
- Real organisational master data, raw tenant captures, evidence and some binary assets have been withheld.
- Source test fixtures remain only as synthetic examples.
- Internal repository URLs have been replaced, so reviewers cannot access private code or data from hyperlinks here.

## Checks performed on the exported snapshot

- Targeted text scans found no remaining known staff names, real work email patterns, original tenant hostnames, original private-repository URLs or common credential formats.
- Gitleaks 8.30.1 reported 74 **generic-api-key** pattern matches, predominantly test fixture keys, pseudonym identifiers and sample digests. The remaining unusual samples were inspected in context as fixed test/configuration constants, not live credentials. This is not a guarantee that no secret exists.
- JavaScript syntax checked: 70 files, no errors.
- TypeScript/TSX parsing checked: 594 files, no syntactic diagnostics after fixing redaction-induced identifier substitutions.
- Strict JSON parsing was not applicable to two SPFx JSONC configuration files containing comments; other JSON files passed.

## Known omissions and boundaries

Tests have not been rerun end to end after sanitisation; source parsing is not equivalent to an application build. Installed SharePoint TEST Save/readback, staff role controls, admin security and sponsor UAT remain unproved in this published snapshot. Do not deploy from here or insert real tenant credentials.

Anyone finding potentially private information should contact the maintainers privately and avoid posting the value in public discussions.