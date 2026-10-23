# Developer collaboration

- `main`: the reviewed source baseline. A merge never deploys SharePoint.
- `develop`: integrated development; create short-lived `feature/<issue>-<description>` or `fix/<issue>-<description>` branches from it.
- Open a pull request into develop with the problem, changes, tests, data/permission impact and linked issue. Promote tested integration through a PR from develop to main.
- One independent reviewer must approve. Require both `build-test` and `dependency-security` checks, resolve discussions, prevent direct/force pushes, and use squash merges for feature PRs.
- Releases are immutable tags `test/v<solution-version>-<short-sha>`, created only after exact candidate approval. Tags themselves do not deploy.
- Never commit tenant tokens, staff exports, operational reports, packages, local configuration or private evidence. Use synthetic fixtures.
- Run `npm ci`, `npm run test:privacy`, and `npm run build` before requesting review.
- Source repairs require focused developer regression. Permission, sensitive-data, persistence and trust changes need independent Security and QA. Build success does not replace those gates.
- Repository owners retain Admin. Add a named developer/team with Write only after Sponsor authorisation. Do not share credentials or grant organisation-wide access.

Branch protection is a repository setting, not created by this document. Confirm enforcement before inviting contributors. CODEOWNERS requires an actual Foundation reviewer/team; do not invent a team identifier.

Current enforcement limitation: GitHub returns HTTP 403 for private branch protection on the current plan. See Issue #4. Keep the repository private and observe reviews/checks manually until the Sponsor resolves the plan and names reviewers.
