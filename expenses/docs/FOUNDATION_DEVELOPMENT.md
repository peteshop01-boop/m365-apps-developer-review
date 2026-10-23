# D00/S00-A native foundation development

Existing official SPFx 1.23.2 React/Heft app: app/kcf-expenses-hub. Keep one integration owner on feature/D00-S00-A-spfx-foundation. SharePoint TEST URL: NONE.

## Toolchain and commands

Use the installed portable Node 22.21.1 and bundled npm 10.9.4. React/ReactDOM 17.0.1, TypeScript 5.8.3 and Heft 1.2.17 are exact direct dependencies. Microsoft compatibility: https://learn.microsoft.com/en-us/sharepoint/dev/spfx/compatibility.

From repo root on Windows:

~~~powershell
$env:PATH = 'C:\\REVIEW\\Toolchains\node-v22.21.1-win-x64;' + $env:PATH
npm.cmd ci --prefix app/kcf-expenses-hub
npm.cmd run verify
~~~

Use npm.cmd to avoid npm.ps1 execution-policy restrictions. The native build guard rejects other Node/npm versions. No system-wide runtime changes or global install are needed.

The app build prepares assets, runs Heft production TypeScript/ESLint/Webpack, then native package-solution. Output: app/kcf-expenses-hub/sharepoint/solution/KCFExpenses-SPFx-D00-0.0.1-demo.sppkg; solution version 0.0.1.0. This is a source/demo package, not an accepted TEST release.

## Existing source boundaries

- src/domain/contracts.ts: typed nominal, claim, expense and future receipt contracts.
- src/services/MockExpensesService.ts: isolated synthetic claim in memory, mock month/version/idempotency checks. No HTTP, tenant data, persistence, file-body upload or notifications. Mock guards are not backend security proof.
- src/webparts/kcfExpensesHub/KcfExpensesHubWebPart.ts: one service factory per web-part instance; future authenticated adapter requires independent D00/S00-B verification.
- components: existing responsive Expenses Add/Edit shell, nominal directory and explicit future-module placeholders. Navigation preserves unsaved editor state.
- design/data/nominals_approved_195.json: untouched reference snapshot. Generated src/data/nominals.ts preserves every property. Eligibility and current tenant equality remain unverified.
- public/assets/foundation-logo.png: exact derived preview header PNG. Asset sync copies unchanged bytes and has an exact-preview fallback. Full-resolution original not acquired.

Receipt selection is synthetic filename metadata or a required no-receipt reason. It does not upload/view a receipt. Other business workflows remain placeholders. Source tests exercise actual domain/mock functions and static palette calculations; they do not render the UI.

## Verification and rollback

Actual results and immutable hashes: [D00/S00-A evidence](evidence/D00_S00_A_BUILD.md). Verify native compiler/build/package separately from mock tests, rendered desktop/phone tests, independent review, installed TEST, security, QA and Sponsor UAT.

Manual-only CI workflow has read-only repository permissions and no tenant/deploy step. It was not dispatched; verify existing included allowance before any dispatch to preserve £0 additional spend.

Rollback: revert the isolated source commit or close the unmerged PR. No tenant state is affected. Do not merge, install, publish, activate flows or change permissions from a source build result.
