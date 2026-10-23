# D00/S00-C page factory — frozen source interface

13 October 2026. Sponsor scope: Issue #2 comment 6134687035. Source/demo only, not tenant authority.
Integration PM in thread 72054465-7955-4452-a2ec-ee076cd9b909 owns shell/routes/common SCSS, domain/services, PageContracts.ts, build/package and integration branch feature/D00-S00-C-clickable-pages.

Page exports named HomeScreen, ReviewClaimScreen, MyTeamScreen, ManagerReviewScreen, FinanceScreen, ProfileScreen, AdminScreen, HelpScreen. Props are frozen in components/PageContracts.ts. Each lane owns only its named TSX, its private SCSS module and named test files. Import common domain rules/types read-only. No edit to another lane or shared files. No network/storage/auth, real staff data, file export, messaging, installation, certificate trust or tenant action. Visible red DEMO/NO SHAREPOINT SAVE. Keep component state mounted through navigation; root owns shared demo decision/exception state.

Use native React17 functional components, semantic inputs/buttons, 44px touch targets, keyboard focus, private internal-scroll flex/grid styles. Desktop1366x768, phone390x844. All references remain exact approved195. No Category field. Add bounded failure-sensitive Jest tests; no install/build in lane worktrees (PM runs native combined verification). Tests are developer evidence only. New package requires fresh separate reviewer approval.

Manager/Finance records are explicitly separate synthetic colleagues. Caller-visible role simulation grants no authority. Review demo current-month expense/mileage uses real in-memory provider lines, oldest-first. Home uses same totals and three primary actions. Neither historical examples nor date/rate defaults prove authoritative configuration.

Local branch checkpoint contains initial integration prototypes (ReviewScreen, ManagerScreen, SupportingScreens) which are not the final assigned page modules. Preserve their history; PM removes unused prototypes only after integrated replacements exist.
