# Security and privacy

Report vulnerabilities privately to a Foundation repository administrator. Do not place credentials or sensitive staff records in public issues, logs or pull requests.

CI runs a source privacy scan and npm dependency audit. The scanner detects common token/private-key/JWT patterns, non-synthetic email addresses, personal machine paths and excluded file types. It complements review; it does not certify that all possible secrets or personal data are absent.

Third-party vulnerability results must distinguish runtime dependencies from build tooling. A critical/high audit failure blocks the required check until a compatible fix or explicit documented Security exception is approved. Do not silently weaken audit thresholds.

Original Git history, unreviewed archives, the private anonymisation map and operational data stay offline. Do not push original local branches or tags. Clone the Foundation repository for new work.

A controlled deployment must restore approved TEST identity configuration without publishing staff information. Prefer reviewed runtime configuration backed by the existing permission model. Any private build binding changes package bytes and needs an exact new candidate, manifest and validation. Never widen permissions to make anonymised fixtures work.

Tracked blockers: [dependency advisories](https://example.invalid/private-development-repository) and [private branch enforcement](https://example.invalid/private-development-repository).
