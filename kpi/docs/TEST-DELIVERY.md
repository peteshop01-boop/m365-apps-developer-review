# Controlled GitHub to SharePoint TEST delivery

## 1. Freeze source and package

Merge only after developer checks and applicable independent Security/QA pass. Record full Git SHA, tree, lockfile hash, Node version, CI run URL and exact package SHA-256. Run `npm ci` then `npm run build`; CI stores the package and checksum as a retained build artifact. Never build a release from an uncommitted tree.

Retain solution ID `34bee229-16d5-4ecb-a2f8-a7ae2353c3bf` and feature ID. Before an authorised TEST upgrade, choose and review the appropriate solution version. Do not infer a version from old local packages.

The current package version is `1.0.0.0`; this migration does not make it a deployable upgrade.

## 2. Obtain TEST admission

Owner: Foundation release lead. Verify the exact existing REVIEW-TEST-SITE TEST site, page, webpart instance, app catalog/site scope, lists, flow state, approved actor identities, routing and rollback package. Capture before-state and current version. Do not upload to a tenant-wide catalog without understanding whether the same solution is used by LIVE.

Resolve synthetic actor placeholders through a reviewed private configuration route. No source fixture grants authority. Re-test any configuration or code change and seal the resulting exact package bytes. Retain view-only/native-write holds until the required existing project admission is granted.

## 3. Deploy only under explicit approval

There is **no automated SharePoint deployment** in this repository. CI has no tenant secrets and no deploy step. A release operator may use the approved manual/catalog route only after Sponsor authorisation names the exact TEST candidate and target.

Upload the sealed .sppkg to the verified TEST-safe catalog scope and upgrade only the existing TEST app. Confirm the installed solution version, correct page/webpart and expected TEST routing. If isolation from LIVE cannot be demonstrated, stop before upload.

## 4. Validate installed TEST

Independent QA records responsive desktop/tablet/phone, role/permission denials, annual/quarter journeys and regression. Save verification must perform an authorised write, fresh readback, reopen, and phone-to-PC draft reload with canonical payload and metadata checks. UI appearance and local tests are insufficient.

Check blocked/unavailable states and late asynchronous completions. Verify blue-grey presentation in the installed runtime. Confirm notifications/flows remain held unless separately authorised.

## 5. Sponsor UAT and rollback

Sponsor accepts business journeys on the exact installed candidate. Record pass/fail, blockers and evidence. No LIVE promotion follows automatically from UAT.

Before deploy retain the last accepted TEST .sppkg, SHA-256, solution version, page/webpart settings and any authorised schema/flow before-state. If verification fails, hold native writes and restore the last accepted TEST package/configuration using the approved catalog route; record installed readback and a focused smoke test. Never delete staff data or reverse schema changes blindly. Any package downgrade restriction requires an approved forward-version recovery build from the accepted source.

A LIVE release requires separate explicit authority and exact candidate gates. This migration performs neither TEST deployment nor LIVE change.
