# Local fictional package journey host

LOCAL / NOT INSTALLED. This tooling loads an explicitly supplied frozen `.sppkg` AMD WebPart, with its real manifest, entry, strings and referenced images. It uses existing dependencies from an explicitly supplied repository. Nothing is installed or written to that repository. Package SHA must match the operator's independent frozen receipt. The source commit is an operator-supplied reference; this host does not establish source-to-binary correspondence or native permission.

Portable runtime files to copy together: `start-local-package-host.mjs`, `index.html`, `host.css`, `host.mjs`, `fixture.mjs`, `fixture-seed.json`. Evidence-only extraction, tests and logs are not runtime inputs.

In PowerShell, set `NodeExecutable`, `RepoRoot`, `PackagePath`, `PackageSHA256` (uppercase) and `SourceCommit` from the approved local inputs, then run from this tooling directory:

```powershell
& $NodeExecutable ./start-local-package-host.mjs --repoRoot $RepoRoot --packagePath $PackagePath --packageSha256 $PackageSHA256 --sourceCommit $SourceCommit --port 4488
```

Open `http://127.0.0.1:4488/package-host/`. Optional `?screen=CoreBuilder`, `ImpactBuilder`, `BehaviourBuilder`, `SavedSummary`, `ManagerScreen` or `employeeLanding`; optional `actor=0`, `1`, `2` selects the three declared fictional `.invalid` identities. Screen controls navigate actual app buttons. ManagerScreen switches to the fictional manager and shows the actual held My Team context, with no simulated approval completion. Unknown routes or unavailable controls display an error rather than substitute a screen.

Edit the active IMPACT wording using the actual app's Edit button, then Review & Weight → Save Draft. A new Saved result requires the existing protected V3 gateway/controller and matching persisted readback. Close app calls disposal/unmount, retaining only this page's fictional committed memory. Reopen creates a fresh WebPart/controller. Actor switching disposes the previous app. Reset clears only fictional memory. Page reload/tab closure/server restart is outside the retained lifetime; no cross-device or M365 persistence is claimed. Unsaved component state is discarded by explicit Close/actor disposal.

The response selector supplies ordinary local 403 denial, 412 conflict, commit-then-500 uncertainty, or committed-readback-denial scenarios. Leave actual recovery messages visible; do not blindly repeat a Save. All unrelated service mutators and native SPHttpClient methods reject. Transport has only the fixed fictional endpoint and exact four-field Draft MERGE, without fetch or native fallback. HTTP server binds `127.0.0.1`, serves only allowlisted GET assets, and sets self-only CSP connections. Stop with Ctrl+C; it closes the server.

Known scoped limitation: frozen Core Builder renders its embedded 109-item catalogue rather than the finite lab catalogue. The exact retained historical HISTORIC-KPI has no displayed current card. The host labels this mismatch and preserves its bytes, zeros/unset distinction, native pairs, weights, inactive history, classification, private notes and Behaviour claims. Full Core editor qualification is not claimed. The Behaviour route uses the actual existing component and preserves historical claims; no newly governed catalogue authority is supplied.

Developer checks (no browser, screenshots, independent QA or native proof):

```powershell
$env:KCF_PREVIEW_REPO_ROOT=$RepoRoot
& $NodeExecutable --test ./local-host.test.mjs ./amd-dom.test.mjs
```

The AMD DOM check uses the supplied loose AMD bytes and jsdom; the parser also has an explicitly labelled ordinary archive fixture. Actual frozen-package Developer startup/SaveCloseReopen and independent predecessor-browser evidence are recorded separately from these tooling checks. Current pixel assessment is limited; current independent browser checks remain blocked. Required Security and genuine M365/installed TEST/UAT remain unproved. Use the exact frozen package SHA and an operator-supplied source reference; identical version text is not byte identity.
