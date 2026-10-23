# Where to inspect the code

Use this guide with [the limitations](REVIEW_LIMITATIONS.md). The two source folders contain the supplied sanitised packages, apart from the explicit financial-data exclusions. They are not a merged application.

## KPI / Workplans

All paths below are under [kpi/src/webparts/performanceHub](kpi/src/webparts/performanceHub).

| Entry point | Review question |
|---|---|
| [PerformanceHubWebPart.ts](kpi/src/webparts/performanceHub/PerformanceHubWebPart.ts) | Which services does the real host construct? The supplied source calls `createOptionEDraftCreateIntegration()` without dependencies and wraps the private gateway with `createTestHeldDraftGateway`. What must be connected before a real write is possible? |
| [OptionEDraftSaveController.ts](kpi/src/webparts/performanceHub/components/OptionEDraftSaveController.ts) and adjacent test | How are pending, success, conflict and ambiguous network outcomes handled? |
| [OptionEDraftSharePointGateway.ts](kpi/src/webparts/performanceHub/services/OptionEDraftSharePointGateway.ts) | Inspect the conditional MERGE, allowed fields, response format, saved content and readback. |
| [OptionEProtectedDraftGateway.ts](kpi/src/webparts/performanceHub/services/OptionEProtectedDraftGateway.ts) | Are owner, workplan and draft consistently linked? Which checks are client-side and which rely on stored permissions? |
| [OptionEDraftCreateIntegration.ts](kpi/src/webparts/performanceHub/services/OptionEDraftCreateIntegration.ts) | Identify the real creator/authority inputs. A prepared test record is not general first-workplan creation. |
| [OptionEWorkplanPhysicalSchema.ts](kpi/src/webparts/performanceHub/services/OptionEWorkplanPhysicalSchema.ts) and [list bindings](kpi/src/webparts/performanceHub/services/OptionEWorkplanListBindings.ts) | What fields and connections are required? Do not infer they exist in the tenant. |
| [OptionEWorkplanAclPlan.ts](kpi/src/webparts/performanceHub/services/OptionEWorkplanAclPlan.ts) | Is the proposed permission design proportionate and enforceable for an ordinary user? |
| [Power Platform source](kpi/power-platform) | Trace submission/approval processors and hosts separately from ordinary Draft Save. Source contracts do not prove a connected service. |

### A later KPI repair is separate

The supplied broad snapshot still contains the older `odata=nometadata` header form. A later focused source repair changed the private Save path to v4-compatible headers and was source-reviewed, but not executed or installed in the recorded result. Its previously published, sanitised [focused snapshot](kpi/save-path/) is now retained separately under `kpi/save-path/`, without requiring access to superseded publication history. This is not a link to a private repository.

Do not overwrite one candidate with the other or count the later fix as tested. First establish which candidate should be integrated and validated. The supplied broad snapshot and that focused copy are not interchangeable complete releases.

## Expenses

Paths below are under [expenses/app/kcf-expenses-hub](expenses/app/kcf-expenses-hub).

| Entry point | Review question |
|---|---|
| [KcfExpensesHubWebPart.ts](expenses/app/kcf-expenses-hub/src/webparts/kcfExpensesHub/KcfExpensesHubWebPart.ts) and components | Which actual service is passed to the screen? Distinguish mock storage from a live request connection. |
| [Domain contracts](expenses/app/kcf-expenses-hub/src/domain/contracts.ts) and [expense rules](expenses/app/kcf-expenses-hub/src/domain/expenseRules.ts) | Check money, dates, required fields and nominal validation. |
| [Persistence services](expenses/app/kcf-expenses-hub/src/services/persistence) | Follow command identity, expected version and truthful stored-result handling. |
| [BrowserRequestTransport.ts](expenses/app/kcf-expenses-hub/src/processor/BrowserRequestTransport.ts) and [SharePointRequestChannel.ts](expenses/app/kcf-expenses-hub/src/processor/SharePointRequestChannel.ts) | How are the employee and private request/result paths established? |
| [ActorScopedProcessor.ts](expenses/app/kcf-expenses-hub/src/processor/ActorScopedProcessor.ts) and [SharePointStandardStore.ts](expenses/app/kcf-expenses-hub/src/processor/SharePointStandardStore.ts) | Check actor, claim/month, private storage, duplicate handling and partial-write recovery. |
| [actor-writer.cjs](expenses/app/kcf-expenses-hub/flow/actor-writer.cjs), [actor-writer-machine.cjs](expenses/app/kcf-expenses-hub/flow/actor-writer-machine.cjs), [build-flow.cjs](expenses/app/kcf-expenses-hub/flow/build-flow.cjs) | These generate the intended native workflow. Does the number of checks and calls remain justified? What is needed for deployment? |
| [private-fixture.cjs](expenses/app/kcf-expenses-hub/flow/private-fixture.cjs), [bindings schema](expenses/app/kcf-expenses-hub/flow/bindings.schema.json) | Review all nine resource contracts, then reconcile the newer private-scope registry extension. |
| [Workflow tests](expenses/app/kcf-expenses-hub/flow) and [source tests](expenses/app/kcf-expenses-hub/src) | Which guarantees are simulated, and which require real Microsoft 365 evidence? |

## Context and delivery process

[Expenses requirements](expenses/requirements/traceability_v1.csv) and [sprints](expenses/docs/PROJECT_DELIVERY_PLAN.md) retain that project's original references. Do not apply its requirement/sprint counts to KPI. The complete private KPI control register is not included.

[Delivery review](DELIVERY_REVIEW.md) sets out the management questions. Existing AGENTS files describe the team's historical operating rules; they are review material, not instructions to activate flows, contact private systems or run agents indefinitely.


## Current native evidence and Expenses reuse

The latest inspected KPI return at 23 October 2026 23:40 BST reports ordinary-user read prerequisites and source wiring, not accepted native Save. Read [the exact reuse/evidence mapping](KPI_TO_EXPENSES_REUSE.md). Later private binding changes are uncommitted and intentionally excluded. Do not infer a working Save from either public source tree.
