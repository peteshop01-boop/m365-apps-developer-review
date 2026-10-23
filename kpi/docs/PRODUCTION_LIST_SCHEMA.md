# KCF KPI Performance System — Production SharePoint Schema

**Action:** KCF-KPI-008 baseline; KCF-KPI-018 additive Workplan model

**Version:** 1.2-workplan-model

**Date:** 21 August 2026

**Status:** KCF-KPI-009 baseline implemented; KCF-KPI-018 additive schema provisioned and read back with zero mismatches

## Schema conventions

- Names in the **Column/internal name** column are the required internal names. Provision them with those names before applying friendly display names.
- All keys and foreign keys are Single line of text, maximum 255 characters, and immutable after create.
- Email values are trimmed and lower-cased for comparison. Display casing is not identity.
- Dates are stored as SharePoint Date and Time in UTC unless explicitly “Date only”. `PerformanceYear` is a Number with zero decimals; `Quarter` is a Choice.
- JSON fields are Multiple lines of plain text with a documented schema and size validation in the service layer. Rich text is disabled.
- Standard SharePoint `ID`, `Created`, `Created By`, `Modified`, `Modified By` and version history remain enabled. The built-in `Title` column is made optional and hidden from app forms unless named below.
- Enforce unique values only on the listed unique key. Conditional rules such as “one current version” require service validation and reconciliation tests.
- Core query relationships use stable text keys, not SharePoint Lookup fields.
- Single-column indexes shown for each asset are the approved production baseline. Compound indexes are optional physical optimisations only; none is currently required. The disposition of all 30 previously proposed combinations is recorded in the reconciliation table below.
- “Raw access: No” means the asset is omitted from normal navigation and users work through SPFx. It does not replace SharePoint permissions.
- Folders are enabled on employee transactional lists. `Workplans`, `WorkplanItems` and `ProgressNotes` use `/YYYY/PersonKey/`; `QuarterReviews` and `QuarterReviewItems` use `/YYYY/PersonKey/Qn/`. Apply the state-appropriate employee/assigned-manager/Admin/Automation ACL once on the folder and require children to inherit it. Folder path is not a foreign key; `PersonKey`, `PerformanceYear` and (for quarterly assets) `Quarter` remain mandatory/indexed. Per-row permission breaking is exception-only.

Allowed choices use exact stored values shown below. Changing a stored choice after production use requires a CONTROL change request and migration plan.

## 1. `KCFKPI_People`

**Purpose:** Controlled identity and current manager/team/app-role mapping without Graph.
**Key:** `PersonKey` (unique). `Email` is also unique in the production population.
**Lifecycle:** Admin-created; update with audit; leavers become inactive, never deleted while referenced.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Display Name. |
| `PersonKey` | Single line text, unique | Yes | Generated | Immutable GUID string. |
| `Email` | Single line text, unique | Yes | — | Normalised sign-in email. |
| `EmployeeNumber` | Single line text | No | blank | HR identifier if CONTROL supplies it; not identity fallback. |
| `ManagerPersonKey` | Single line text | No | blank | FK → People; blank only for top-level or unresolved mapping. |
| `ManagerEmail` | Single line text | No | blank | Controlled denormalised manager email. |
| `Team` | Single line text | No | blank | Controlled team label. |
| `JobRole` | Single line text | No | blank | Business job title/role, not permission role. |
| `AppRoles` | Choice, multi-select | Yes | `Employee` | `Employee`; `Manager`; `SeniorManagerAdmin`; `SystemAdmin`; `BoardReadOnly`. UI hint only; SharePoint groups enforce access. |
| `Active` | Yes/No | Yes | Yes | Current population state. |
| `DefaultLanding` | Choice | No | `Overview` | `Overview`; `Manager`; `Admin`; `Board`. |
| `ManagerEffectiveFrom` | Date only | No | blank | Effective date of current manager mapping. |
| `SourceReference` | Single line text | No | blank | HR/CONTROL source reference. |
| `LastValidatedAt` | Date and Time | No | blank | Last administrative validation. |
| `LastValidatedByEmail` | Single line text | No | blank | Normalised admin email. |

**Relationships:** parent of Workplans; self-reference via `ManagerPersonKey`.
**Indexes:** unique `PersonKey`; unique `Email`; `Active`; `ManagerPersonKey`.
**Access:** Employee reads own row; Manager reads own/direct-report rows; Senior/Admin/System Admin manage; Board none. No employee approval.
**Raw access:** No for normal users; controlled Admin view only.

## 2. `KCFKPI_KPIMaster`

**Purpose:** Versioned permanent Core GOLD catalogue.
**Key:** `KPIVersionKey` (unique); `KPIID` is the permanent, indexed non-unique identity.
**Lifecycle:** Draft version → Provisional/Active or rejected; active versions are superseded/retired, not overwritten or deleted.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Display label, normally `KPIID`. |
| `KPIVersionKey` | Single line text, unique | Yes | — | `KPIID\|vNN`. |
| `KPIID` | Single line text | Yes | — | CONTROL-issued stable Core ID. |
| `VersionNumber` | Number (0 decimals) | Yes | 1 | Positive integer. |
| `KPIWording` | Multiple lines plain text | Yes | — | Controlled definition; not employee-editable. |
| `Pillar` | Single line text | Yes | — | Controlled strategy pillar. |
| `Workstream` | Single line text | Yes | — | Controlled workstream. |
| `AccountableOwnerPersonKey` | Single line text | No | blank | FK → People. Required before Active unless approved external owner. |
| `AccountableOwnerEmail` | Single line text | No | blank | Snapshot/search field. |
| `DefinitionStatus` | Choice | Yes | `Provisional` | `Provisional`; `Active`; `Retired`. |
| `StrategyTarget` | Multiple lines plain text | No | blank | Multi-year strategic outcome; annual values live in Annual Targets. |
| `AggregationMethod` | Choice | Yes | — | `DirectMetric`; `Additive`; `WeightedContribution`; `Composite`; `Milestone`; `AccountableOwner`. |
| `ScoringDirection` | Choice | Yes | — | `HigherIsBetter`; `LowerIsBetter`; `TargetRange`; `Milestone`; `TBC`. `TBC` is fail-closed/`NotRated`. |
| `MetricType` | Choice | Yes | — | `Count`; `Number`; `Percentage`; `Currency`; `Rate`; `Days`; `Score`; `Milestone`; `Other`; `TextStatus`. Percentage scoring also requires an explicit Fraction/Whole source scale in the approved rule metadata. |
| `UnitLabel` | Single line text | Yes | — | E.g. `%`, `people`, `£`, `days`, `stage`. |
| `ReportingStatus` | Choice | Yes | `Included` | `Included`; `ContextOnly`; `Excluded`. |
| `PortfolioWeight` | Number | No | blank | 0–100; Admin-only; separate from workplan/contribution weights. |
| `RAGRuleType` | Choice | Yes | `ProgressThreshold` | `ProgressThreshold`; `TargetRange`; `MilestoneRule`. |
| `GreenThresholdPct` | Number | No | 100 | Physical imported/default value; not an effective override merely because populated. Use only as part of an explicit audited KPI/version/period override satisfying `100 >= Green > Amber >= 0`. |
| `AmberThresholdPct` | Number | No | 80 | Physical imported/default value; not an effective override merely because populated. Must be below Green in an explicit audited override. |
| `RAGParametersJSON` | Multiple lines plain text | No | blank | Versioned controlled parameters such as range/milestone/status maps and Percentage source scale. Non-standard rules require an approval/change reference; no unapproved parameter is authoritative. |
| `SourceOrigin` | Single line text | Yes | `KPI GOLD` | Canonical source/origin reference. |
| `EffectiveFrom` | Date only | Yes | — | Inclusive. |
| `EffectiveTo` | Date only | No | blank | Inclusive; blank = open-ended. |
| `IsCurrent` | Yes/No | Yes | No | Exactly one effective current version per KPI by service rule. |
| `ChangeReference` | Single line text | Yes | — | CONTROL/CR/import reference. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Active. |
| `ApprovedAt` | Date and Time | No | blank | Required for Active. |

**Relationships:** KPIID/KPIVersionKey referenced by targets, Core workplan items, reviews, results and mappings.
**Indexes:** unique `KPIVersionKey`; `KPIID`; `DefinitionStatus`; `IsCurrent`; `EffectiveFrom`.
**Access:** All app users read Active/current; Senior/Admin drafts and edits non-effective versions; System Admin provisions; only CONTROL-authorised Senior/Admin approves/activates.
**Raw access:** No for Employees/Managers; controlled catalogue Admin view.

**KCF-KPI-015D scoring precedence:** explicit audited KPI/version/period override → valid active Production Config → exact code fallback `90/50`. KCF-KPI-015D approved no KPI-specific override. Lower-Is-Better, Milestone and Score remain `NotRated` until their additional controlled formula/map/meaning is approved; Currency remains a unit and does not infer direction.

## 3. `KCFKPI_AnnualTargets`

**Purpose:** Versioned year-end and quarterly targets, separate from permanent KPI definitions.
**Key:** `TargetVersionKey` (unique); `KPIYearKey` groups versions.
**Lifecycle:** Draft → Submitted → Approved; a controlled change creates a new version and supersedes the prior row.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Display label. |
| `TargetVersionKey` | Single line text, unique | Yes | — | `KPIID\|YYYY\|vNN`. |
| `KPIYearKey` | Single line text | Yes | — | `KPIID\|YYYY`. |
| `KPIID` | Single line text | Yes | — | FK → KPI Master stable ID. |
| `KPIVersionKey` | Single line text | Yes | — | Definition version used to approve target. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Four-digit year. |
| `VersionNumber` | Number (0 decimals) | Yes | 1 | Positive integer. |
| `YearEndTargetValue` | Number | No | blank | Quantitative target. |
| `YearEndTargetText` | Single line text | No | blank | Milestone/qualitative label. |
| `Q1TargetValue` | Number | No | blank | Q1 quantitative target. |
| `Q2TargetValue` | Number | No | blank | Q2 quantitative target. |
| `Q3TargetValue` | Number | No | blank | Q3 quantitative target. |
| `Q4TargetValue` | Number | No | blank | Q4 quantitative target. |
| `Q1TargetText` | Single line text | No | blank | Q1 milestone/qualitative label. |
| `Q2TargetText` | Single line text | No | blank | Q2 milestone/qualitative label. |
| `Q3TargetText` | Single line text | No | blank | Q3 milestone/qualitative label. |
| `Q4TargetText` | Single line text | No | blank | Q4 milestone/qualitative label. |
| `TargetParametersJSON` | Multiple lines plain text | No | blank | Bounds/stage metadata with controlled schema. |
| `TargetStatus` | Choice | Yes | `Draft` | `Draft`; `Submitted`; `Approved`; `Superseded`; `Retired`. |
| `IsCurrent` | Yes/No | Yes | No | One current Approved version per KPI/year/effective period. |
| `EffectiveFrom` | Date only | Yes | — | Effective start. |
| `EffectiveTo` | Date only | No | blank | Prior version end. |
| `ChangeReference` | Single line text | Yes | — | Initial approval or change reference. |
| `ChangeReason` | Multiple lines plain text | No | blank | Mandatory for version > 1. |
| `SubmittedByEmail` | Single line text | No | blank | Submission metadata. |
| `SubmittedAt` | Date and Time | No | blank | Submission metadata. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Approved. |
| `ApprovedAt` | Date and Time | No | blank | Required for Approved. |

At least one value/text representation appropriate to the KPI metric must exist for each required reporting period.
**Relationships:** KPI Master parent; target version referenced/snapshotted by Workplan and Quarter Review Items.
**Indexes:** unique `TargetVersionKey`; `KPIYearKey`; `KPIID`; `PerformanceYear`; `TargetStatus`.
**Access:** Employees/Managers read Approved effective targets; Senior/Admin creates/submits; designated target approver approves; System Admin administers.
**Raw access:** No for normal users; controlled target Admin view.

## 4. `KCFKPI_Behaviours`

**Purpose:** Versioned five-behaviour framework assigned to annual workplans.
**Key:** `BehaviourVersionKey` (unique); `BehaviourID` is stable across versions.
**Lifecycle:** Provisional → Published → Retired/Superseded; locked workplans retain their version.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Behaviour name. |
| `BehaviourVersionKey` | Single line text, unique | Yes | — | `BehaviourID\|vNN`. |
| `BehaviourID` | Single line text | Yes | — | Stable controlled ID. |
| `VersionNumber` | Number (0 decimals) | Yes | 1 | Positive integer. |
| `Description` | Multiple lines plain text | Yes | — | Controlled wording. |
| `AssessmentGuidance` | Multiple lines plain text | No | blank | Scoring examples/guidance. |
| `DefaultWorkplanWeight` | Number (0 decimals) | No | 20 | Default per-Behaviour share; 0–100. Workplan-level overrides remain controlled and must total 100. |
| `DisplayOrder` | Number (0 decimals) | Yes | — | 1–5 in published baseline. |
| `Status` | Choice | Yes | `Provisional` | `Provisional`; `Published`; `Retired`. |
| `EffectiveFrom` | Date only | Yes | — | Inclusive. |
| `EffectiveTo` | Date only | No | blank | Inclusive. |
| `IsCurrent` | Yes/No | Yes | No | One current published version per BehaviourID. |
| `ChangeReference` | Single line text | Yes | — | CONTROL/CR reference. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Published. |
| `ApprovedAt` | Date and Time | No | blank | Required for Published. |

**Relationships:** referenced by Behaviour Workplan Items and snapshotted into quarter items.
**Indexes:** unique `BehaviourVersionKey`; `BehaviourID`; `Status`; `DisplayOrder`.
**Access:** All app users read Published; Senior/Admin manages versions; authorised Senior/Admin publishes.
**Raw access:** No for normal users; controlled Admin view.

## 5. `KCFKPI_Workplans`

**Purpose:** One annual employee workplan and its manager approval context.
**Key:** `WorkplanKey` (unique).
**Lifecycle:** Draft → Submitted → ChangesRequested/Approved → Locked/Archived, as defined in the state model.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Employee/year display label. |
| `WorkplanKey` | Single line text, unique | Yes | — | `PersonKey\|YYYY`. |
| `PersonKey` | Single line text | Yes | — | FK → People. |
| `EmployeeDisplayName` | Single line text | Yes | — | Annual snapshot. |
| `EmployeeEmail` | Single line text | Yes | — | Annual snapshot/current query field. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Four-digit year. |
| `ManagerPersonKey` | Single line text | No | blank | Required before submission. |
| `ManagerDisplayName` | Single line text | No | blank | Annual/current assignment snapshot. |
| `ManagerEmail` | Single line text | No | blank | Required before submission. |
| `TeamSnapshot` | Single line text | No | blank | Team at workplan creation/approval. |
| `State` | Choice | Yes | `Draft` | `Draft`; `Submitted`; `ChangesRequested`; `Approved`; `Locked`; `Archived`. |
| `AccessState` | Choice | Yes | `EmployeeEdit` | `EmployeeEdit`; `ManagerDecision`; `ReadOnly`; `RecoveryHold`. Must match folder ACL. |
| `TransitionStatus` | Choice | Yes | `Ready` | `Ready`; `InProgress`; `Failed`. Non-Ready blocks normal actions. |
| `TransitionCorrelationKey` | Single line text | No | blank | Current/last state-and-ACL transition correlation. |
| `CoreCategoryWeight` | Number | Yes | 70 | 0–100. |
| `PersonalCategoryWeight` | Number | Yes | 20 | 0–100. |
| `BehaviourCategoryWeight` | Number | Yes | 10 | 0–100; three fields must total 100. |
| `CategoryWeightingReason` | Multiple lines plain text | No | blank | Required by the application when the proposed category balance differs from 70/20/10. Manager approval of the whole Workplan approves the proposal. |
| `SubmissionComment` | Multiple lines plain text | No | blank | Employee comment. |
| `SubmittedAt` | Date and Time | No | blank | State metadata. |
| `SubmittedByEmail` | Single line text | No | blank | State metadata. |
| `ManagerDecisionComment` | Multiple lines plain text | No | blank | Mandatory for ChangesRequested. |
| `ApprovedAt` | Date and Time | No | blank | State metadata. |
| `ApprovedByEmail` | Single line text | No | blank | State metadata. |
| `LockedAt` | Date and Time | No | blank | State metadata. |
| `LockedByEmail` | Single line text | No | blank | State metadata. |
| `RowVersionToken` | Number (0 decimals) | Yes | 1 | App optimistic-concurrency counter in addition to ETag. |

**Relationships:** People parent; contains Workplan Items and Quarter Reviews.
**Indexes:** unique `WorkplanKey`; `PersonKey`; `EmployeeEmail`; `PerformanceYear`; `ManagerPersonKey`; `State`; `TransitionStatus`.
**Access:** Employee reads/edits own Draft/ChangesRequested; Manager reads direct reports and decides Submitted; Senior/Admin exception access; System Admin; Board none.
**Raw access:** No.

## 6. `KCFKPI_WorkplanItems`

**Purpose:** Annual Core, Local/Personal and Behaviour rows.
**Key:** `WorkplanItemKey` (unique); `WorkplanItemNaturalKey` prevents duplicate Core/Behaviour selection.
**Lifecycle:** Editable only while parent Workplan is Draft/ChangesRequested; retained with locked workplan.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | No | blank | Display label only. |
| `WorkplanItemKey` | Single line text, unique | Yes | Generated | Immutable GUID string. |
| `WorkplanItemNaturalKey` | Single line text, unique | Yes | — | `WorkplanKey\|ItemType\|ReferenceID`; Local uses item GUID. |
| `WorkplanKey` | Single line text | Yes | — | FK → Workplans. |
| `PersonKey` | Single line text | Yes | — | Denormalised security/query key. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Denormalised query key. |
| `ItemType` | Choice | Yes | — | `CoreGold`; `LocalPersonal`; `Behaviour`. |
| `DisplayOrder` | Number (0 decimals) | Yes | 0 | Within category. |
| `KPIID` | Single line text | No | blank | Required only for CoreGold. |
| `KPIVersionKey` | Single line text | No | blank | Required only for CoreGold. |
| `TargetVersionKey` | Single line text | No | blank | Required only for CoreGold before workplan approval. |
| `BehaviourID` | Single line text | No | blank | Required only for Behaviour. |
| `BehaviourVersionKey` | Single line text | No | blank | Required only for Behaviour. |
| `BehaviourObjectiveSource` | Choice | No | blank | `Library`; `Custom`. Required by the application for active Behaviour items. |
| `BehaviourObjectiveKey` | Single line text | No | blank | Library source key; blank only when the selected objective is Custom. |
| `BehaviourObjectiveTitle` | Single line text | No | blank | Annual copied/custom objective wording. |
| `BehaviourObjectiveDescription` | Multiple lines plain text | No | blank | Annual copied/custom objective detail. |
| `BehaviourMeasure` | Multiple lines plain text | No | blank | Observable measure for the selected Behaviour objective. |
| `BehaviourEvidenceDefinition` | Multiple lines plain text | No | blank | Agreed evidence definition for the selected Behaviour objective. |
| `Q1BehaviourTargetRating` | Number (0 decimals) | No | blank | 1–4; service supplies the logical default 3. |
| `Q2BehaviourTargetRating` | Number (0 decimals) | No | blank | 1–4; service supplies the logical default 3. |
| `Q3BehaviourTargetRating` | Number (0 decimals) | No | blank | 1–4; service supplies the logical default 3. |
| `Q4BehaviourTargetRating` | Number (0 decimals) | No | blank | 1–4; service supplies the logical default 3. |
| `LocalKPIWording` | Multiple lines plain text | No | blank | Required only for LocalPersonal; frozen at approval. |
| `LocalMeasure` | Multiple lines plain text | No | blank | Required only for LocalPersonal. |
| `LocalKPIDescription` | Multiple lines plain text | No | blank | LocalPersonal objective/context; conditionally required by the application. |
| `LocalMetricType` | Choice | No | blank | `Count`; `Number`; `Percentage`; `Currency`; `Rate`; `Days`; `Score`; `Milestone`; `Other`; `TextStatus`. |
| `LocalScoringDirection` | Choice | No | blank | `HigherIsBetter`; `LowerIsBetter`; `TargetRange`; `Milestone`; `TBC`. Unresolved policies remain `NotRated`. |
| `LocalPercentageScale` | Choice | No | blank | `Fraction`; `Whole`. Required for Percentage LocalPersonal scoring. |
| `LocalBaselineValue` | Number | No | blank | Required when the approved LocalPersonal scoring rule needs a baseline. |
| `YearEndTargetValue` | Number | No | blank | Local target or approved Core snapshot reference support. |
| `YearEndTargetText` | Single line text | No | blank | Milestone/qualitative target. |
| `Q1TargetValue` | Number | No | blank | LocalPersonal numeric Q1 target. |
| `Q1TargetText` | Single line text | No | blank | LocalPersonal/Behaviour Q1 measurable target. |
| `Q2TargetValue` | Number | No | blank | LocalPersonal numeric Q2 target. |
| `Q2TargetText` | Single line text | No | blank | LocalPersonal/Behaviour Q2 measurable target. |
| `Q3TargetValue` | Number | No | blank | LocalPersonal numeric Q3 target. |
| `Q3TargetText` | Single line text | No | blank | LocalPersonal/Behaviour Q3 measurable target. |
| `Q4TargetValue` | Number | No | blank | LocalPersonal numeric Q4 target. |
| `Q4TargetText` | Single line text | No | blank | LocalPersonal/Behaviour Q4 measurable target. |
| `UnitLabel` | Single line text | No | blank | Required for LocalPersonal. |
| `ContributionWeight` | Number | No | blank | Core only; 0–100; not category or portfolio weight. |
| `CoreWorkplanWeight` | Number | No | blank | Employee allocation within the Core section; 0–100. Selected Core rows must total 100%. |
| `EmployeeKpiRole` | Choice | No | blank | `AccountableOwner`; `DeliveryLead`; `Contributor`; `Oversight`; `EvidenceProvider`. |
| `PersonalItemWeight` | Number | No | blank | Local item share within the 20% category. |
| `BehaviourItemWeight` | Number | No | blank | Behaviour share within the 10% category. |
| `ActiveInWorkplan` | Yes/No | Yes | Yes | Removal before approval uses No; approved history remains. |
| `AddedByEmail` | Single line text | Yes | — | Attribution. |
| `AddedAt` | Date and Time | Yes | Current time | Attribution. |

**Relationships:** child of Workplan; references KPI/Target or Behaviour version; parent of review snapshots/progress ledger.
**Indexes:** unique `WorkplanItemKey`; unique `WorkplanItemNaturalKey`; `WorkplanKey`; `PersonKey`; `PerformanceYear`; `ItemType`; `KPIID`.
**Access:** same item scope as parent; Employee edits own rows only in parent editable states; Manager decision at header, not silent item edit; Admin controlled corrections.
**Raw access:** No.

## 7. `KCFKPI_QuarterReviews`

**Purpose:** One formal employee submission and manager decision per workplan quarter.
**Key:** `QuarterReviewKey` (unique).
**Lifecycle:** Draft → Submitted → ChangesRequested/Approved → Locked; Archived is lifecycle presentation, not editable state.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Employee/year/quarter display. |
| `QuarterReviewKey` | Single line text, unique | Yes | — | `WorkplanKey\|Qn`. |
| `WorkplanKey` | Single line text | Yes | — | FK → Workplans. |
| `PersonKey` | Single line text | Yes | — | Employee. |
| `EmployeeDisplayName` | Single line text | Yes | — | Submission snapshot. |
| `EmployeeEmail` | Single line text | Yes | — | Submission/query snapshot. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Four-digit year. |
| `Quarter` | Choice | Yes | — | `Q1`; `Q2`; `Q3`; `Q4`. |
| `ManagerPersonKey` | Single line text | Yes | — | Submission/assignment manager. |
| `ManagerDisplayName` | Single line text | Yes | — | Snapshot. |
| `ManagerEmail` | Single line text | Yes | — | Snapshot/query field. |
| `State` | Choice | Yes | `Draft` | `Draft`; `Submitted`; `ChangesRequested`; `Approved`; `Locked`. |
| `AccessState` | Choice | Yes | `EmployeeEdit` | `EmployeeEdit`; `ManagerDecision`; `ReadOnly`; `RecoveryHold`. Must match quarter-folder ACL. |
| `TransitionStatus` | Choice | Yes | `Ready` | `Ready`; `InProgress`; `Failed`. Non-Ready blocks normal actions. |
| `TransitionCorrelationKey` | Single line text | No | blank | Current/last state-and-ACL transition correlation. |
| `EmployeeSubmissionComment` | Multiple lines plain text | No | blank | Optional. |
| `SubmittedAt` | Date and Time | No | blank | Required in Submitted+. |
| `SubmittedByEmail` | Single line text | No | blank | Required in Submitted+. |
| `ManagerDecisionComment` | Multiple lines plain text | No | blank | Mandatory for ChangesRequested. |
| `ApprovedAt` | Date and Time | No | blank | Required in Approved/Locked. |
| `ApprovedByEmail` | Single line text | No | blank | Required in Approved/Locked. |
| `LockedAt` | Date and Time | No | blank | Required in Locked. |
| `LockedByEmail` | Single line text | No | blank | Required in Locked. |
| `PublishedAt` | Date and Time | No | blank | Quarter publish metadata. |
| `PublishBatchKey` | Single line text | No | blank | Correlation to GOLD/output publish. |
| `CoreCategoryScorePct` | Number | No | blank | Employee Core category score; not organisational GOLD. |
| `PersonalCategoryScorePct` | Number | No | blank | Employee Personal category score. |
| `BehaviourCategoryScorePct` | Number | No | blank | Employee Behaviour category score. |
| `OverallWorkplanScorePct` | Number | No | blank | Weighted 70/20/10 employee result; never a GOLD input. |
| `CoreCategoryWeightSnapshot` | Number | No | blank | Approved Workplan Core category weight copied when a Quarter Review is prepared. |
| `PersonalCategoryWeightSnapshot` | Number | No | blank | Approved Workplan Personal category weight copied when a Quarter Review is prepared. |
| `BehaviourCategoryWeightSnapshot` | Number | No | blank | Approved Workplan Behaviour category weight copied when a Quarter Review is prepared. |
| `WorkplanApprovalCorrelationKey` | Single line text | No | blank | Links the Quarter Review snapshot to the controlled Workplan approval/lock transition. |
| `RowVersionToken` | Number (0 decimals) | Yes | 1 | Optimistic concurrency counter. |

**Relationships:** Workplan parent; contains Quarter Review Items.
**Indexes:** unique `QuarterReviewKey`; `WorkplanKey`; `PersonKey`; `PerformanceYear`; `Quarter`; `ManagerPersonKey`; `State`; `TransitionStatus`.
**Access:** Employee edits own Draft/ChangesRequested; assigned Manager decides Submitted; Admin exception/reopen; Board none.
**Raw access:** No.

## 8. `KCFKPI_QuarterReviewItems`

**Purpose:** Quarter-specific employee input, manager outcome and immutable snapshot per Workplan Item.
**Key:** `QuarterReviewItemKey` (unique).
**Lifecycle:** Follows parent review; immutable to normal users after Approved/Locked.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | No | blank | Display label. |
| `QuarterReviewItemKey` | Single line text, unique | Yes | — | `QuarterReviewKey\|WorkplanItemKey`. |
| `QuarterReviewKey` | Single line text | Yes | — | FK → review header. |
| `WorkplanItemKey` | Single line text | Yes | — | FK → annual item. |
| `WorkplanKey` | Single line text | Yes | — | Query/security key. |
| `PersonKey` | Single line text | Yes | — | Query/security key. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Snapshot. |
| `Quarter` | Choice | Yes | — | `Q1`; `Q2`; `Q3`; `Q4`. |
| `ItemType` | Choice | Yes | — | `CoreGold`; `LocalPersonal`; `Behaviour`. |
| `KPIID` | Single line text | No | blank | Core only. |
| `KPIVersionKey` | Single line text | No | blank | Definition snapshot reference. |
| `TargetVersionKey` | Single line text | No | blank | Approved target snapshot reference. |
| `ItemWordingSnapshot` | Multiple lines plain text | Yes | — | Controlled snapshot; never master source. |
| `ItemDescriptionSnapshot` | Multiple lines plain text | No | blank | Immutable Personal/Behaviour description copied from the approved Workplan item. |
| `MeasureSnapshot` | Multiple lines plain text | No | blank | Immutable Personal/Behaviour measure copied from the approved Workplan item. |
| `MetricTypeSnapshot` | Choice | No | blank | Same controlled Local Metric Type choices as Workplan Items. |
| `ScoringDirectionSnapshot` | Choice | No | blank | Same controlled Local Scoring Direction choices as Workplan Items. |
| `PercentageScaleSnapshot` | Choice | No | blank | `Fraction`; `Whole`. |
| `BaselineValueSnapshot` | Number | No | blank | Approved Local baseline snapshot when applicable. |
| `YearEndTargetValueSnapshot` | Number | No | blank | Approved annual numeric target snapshot. |
| `YearEndTargetTextSnapshot` | Single line text | No | blank | Approved annual text target snapshot. |
| `WorkplanItemWeightSnapshot` | Number | No | blank | Employee item weight within its Workplan section; never organisational GOLD weight. |
| `BehaviourIDSnapshot` | Single line text | No | blank | Fixed Behaviour banner identity. |
| `BehaviourVersionKeySnapshot` | Single line text | No | blank | Published Behaviour definition version at approval. |
| `BehaviourTitleSnapshot` | Single line text | No | blank | Published Behaviour banner title. |
| `BehaviourDescriptionSnapshot` | Multiple lines plain text | No | blank | Published Behaviour description. |
| `BehaviourGuidanceSnapshot` | Multiple lines plain text | No | blank | Published five-prompt guidance snapshot. |
| `BehaviourObjectiveKeySnapshot` | Single line text | No | blank | Library source key when applicable. |
| `BehaviourObjectiveTitleSnapshot` | Single line text | No | blank | Approved copied/custom primary Behaviour objective title. |
| `BehaviourObjectiveSourceSnapshot` | Choice | No | blank | `Library`; `Custom`. |
| `BehaviourEvidenceDefSnapshot` | Multiple lines plain text | No | blank | Approved Behaviour evidence definition. |
| `BehaviourTargetRating` | Number (0 decimals) | No | blank | Quarter-specific agreed target rating, 1–4. |
| `EmployeeBehaviourRating` | Number (0 decimals) | No | blank | Employee self-assessment, 1–4; never silently overwritten by manager input. |
| `ManagerBehaviourRating` | Number (0 decimals) | No | blank | Assigned manager assessment, 1–4. |
| `FinalBehaviourRating` | Number (0 decimals) | No | blank | Approved/final assessment, 1–4; drives final Behaviour RAG. |
| `PillarSnapshot` | Single line text | No | blank | Core reporting snapshot. |
| `WorkstreamSnapshot` | Single line text | No | blank | Core reporting snapshot. |
| `OwnerEmailSnapshot` | Single line text | No | blank | Core reporting snapshot. |
| `UnitLabelSnapshot` | Single line text | No | blank | Display/calculation unit. |
| `QuarterTargetValue` | Number | No | blank | Numeric target. |
| `QuarterTargetText` | Single line text | No | blank | Milestone/qualitative target. |
| `EmployeeActualValue` | Number | No | blank | Numeric actual. |
| `EmployeeActualText` | Single line text | No | blank | Milestone/qualitative actual. |
| `ProgressPct` | Number | No | blank | Calculated raw achievement; may exceed 100. |
| `CalculatedRAG` | Choice | No | blank | `Green`; `Amber`; `Red`; `NotRated`. |
| `CalculationRuleVersion` | Single line text | No | blank | Reproducibility reference. |
| `StatusUpdate` | Multiple lines plain text | No | blank | Optional during Draft saves; service validation requires meaningful commentary at formal submission. |
| `EvidenceCount` | Number (0 decimals) | Yes | 0 | Reconciled count; files live in Evidence library. |
| `BTGType` | Choice | No | blank | `Delivery`; `Resource`; `Dependency`; `DataQuality`; `Decision`; `TargetChange`; `AcceptedHold`; `Other`. Required for Amber/Red Core or Personal results unless an approved exception applies. |
| `BTGAction` | Multiple lines plain text | No | blank | Required for Amber/Red Core or Personal results unless an accepted hold/change rationale applies. |
| `NextReviewDate` | Date only | No | blank | Required for Amber/Red Core or Personal results. |
| `QuarterEndForecastValue` | Number | No | blank | Numeric forecast. |
| `QuarterEndForecastText` | Single line text | No | blank | Milestone/qualitative forecast. |
| `ManagerComment` | Multiple lines plain text | No | blank | Manager review comment. |
| `ManagerOverrideRAG` | Choice | No | blank | `Green`; `Amber`; `Red`; `NotRated`. |
| `OverrideReason` | Multiple lines plain text | No | blank | Mandatory when override populated. |
| `OverrideByEmail` | Single line text | No | blank | Mandatory with override. |
| `OverrideAt` | Date and Time | No | blank | Mandatory with override. |
| `FinalRAG` | Choice | No | blank | Approved official RAG; same allowed choices. |
| `ContributionWeightSnapshot` | Number | No | blank | Core aggregation input only where applicable. |
| `ManagerApproved` | Yes/No | Yes | No | True only when parent approved. |
| `ApprovedByEmail` | Single line text | No | blank | Approval snapshot. |
| `ApprovedAt` | Date and Time | No | blank | Approval snapshot. |
| `Locked` | Yes/No | Yes | No | True when parent Locked. |
| `BTGRoute` | Choice | No | blank | `Recover`; `Mitigate`; `Reforecast`; `Escalate`. Required for Amber/Red Core or Personal submission. |
| `BTGOwnerPersonKey` | Single line text | No | blank | Stable People owner reference for a Recovery action. |
| `BTGDueDate` | Date only | No | blank | Recovery action due date. |
| `BTGStatus` | Choice | No | blank | `Draft`; `Active`; `Complete`; `Superseded`; `Escalated`. |
| `BTGExpectedReturnToGreenDate` | Date only | No | blank | Recover-route expected return date. |
| `BTGExpectedReducedOutcome` | Multiple lines plain text | No | blank | Mitigate-route reduced outcome/residual impact. |
| `ReforecastProposedTarget` | Single line text | No | blank | Proposed target only; never overwrites KPI Master or Annual Target. |
| `ReforecastProposedDate` | Date only | No | blank | Proposed revised target date. |
| `ReforecastReason` | Multiple lines plain text | No | blank | Controlled Reforecast reason. |
| `ReforecastApprovalStatus` | Choice | No | blank | `NotRequested`; `Pending`; `Approved`; `Rejected`. |
| `EscalationDependency` | Multiple lines plain text | No | blank | Escalation dependency or decision required. |
| `EscalatedTo` | Single line text | No | blank | Escalation destination. |
| `EscalationTargetDecisionDate` | Date only | No | blank | Target decision date. |
| `BehaviourExamples` | Multiple lines plain text | No | blank | Employee Behaviour examples/reflection. |
| `ManagerBehaviourAssessment` | Choice | No | blank | `ExceedsExpectations`; `MeetsExpectations`; `Developing`; `InsufficientEvidence`. |

**Relationships:** review/workplan item parents; Evidence child; eligible Core rows feed KPI Results.
**Indexes:** unique `QuarterReviewItemKey`; `QuarterReviewKey`; `WorkplanItemKey`; `WorkplanKey`; `PersonKey`; `PerformanceYear`; `Quarter`; `ItemType`; `KPIID`; `FinalRAG`; `Locked`.
**Access:** same scope as parent; Employee edits input fields only in Draft/ChangesRequested; Manager edits manager fields only in Submitted; Admin exceptions; Board none.
**Raw access:** No.

**KCF-KPI-015A/015B applied delta:** all 15 optional/non-indexed Recovery/Behaviour fields above were created and read back with zero missing fields or mismatches. `StatusUpdate` was subsequently changed to `Required=No` and read back exactly for incremental Draft saves; submission readiness still requires meaningful commentary. No existing field was deleted or repurposed, and KPI Master/Annual Target data was not changed.

## 9. `KCFKPI_KPIResults`

**Purpose:** GOLD OUTPUT — one organisational result per Core KPI/performance year/quarter.
**Key:** `KPIResultKey` (unique).
**Lifecycle:** Calculating → Validated → Approved → Published → Superseded; Published values immutable except controlled correction.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | KPI/year/quarter display. |
| `KPIResultKey` | Single line text, unique | Yes | — | `KPIID\|YYYY\|Qn`. |
| `KPIID` | Single line text | Yes | — | Core KPI only. |
| `KPIVersionKey` | Single line text | Yes | — | Definition used. |
| `TargetVersionKey` | Single line text | Yes | — | Target used. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Four-digit year. |
| `Quarter` | Choice | Yes | — | `Q1`; `Q2`; `Q3`; `Q4`. |
| `AggregationMethod` | Choice | Yes | — | Six accepted stored values from KPI Master. |
| `OfficialTargetValue` | Number | No | blank | Numeric target. |
| `OfficialTargetText` | Single line text | No | blank | Milestone/qualitative target. |
| `CalculatedActualValue` | Number | No | blank | Deterministic result before override. |
| `CalculatedActualText` | Single line text | No | blank | Milestone/qualitative result. |
| `CalculatedProgressPct` | Number | No | blank | Raw achievement. |
| `CalculatedRAG` | Choice | Yes | `NotRated` | `Green`; `Amber`; `Red`; `NotRated`. |
| `AggregationInputsJSON` | Multiple lines plain text | Yes | — | Source keys/values/weights/hash. |
| `CalculationVersion` | Single line text | Yes | — | Code/rule version. |
| `AggregationOverrideValue` | Number | No | blank | Separate approved override. |
| `AggregationOverrideText` | Single line text | No | blank | Separate approved qualitative override. |
| `AggregationOverrideReason` | Multiple lines plain text | No | blank | Mandatory when override exists. |
| `AggregationOverrideByEmail` | Single line text | No | blank | Mandatory when override exists. |
| `AggregationOverrideAt` | Date and Time | No | blank | Mandatory when override exists. |
| `FinalActualValue` | Number | No | blank | Official approved value. |
| `FinalActualText` | Single line text | No | blank | Official approved qualitative value. |
| `FinalProgressPct` | Number | No | blank | Official raw achievement. |
| `FinalRAG` | Choice | Yes | `NotRated` | Official approved RAG. |
| `CappedScorePct` | Number | No | blank | 0–100 Board/pillar/workstream scoring value. |
| `ResultStatus` | Choice | Yes | `Calculating` | `Calculating`; `Validated`; `Approved`; `Published`; `Superseded`. |
| `ValidationExceptionsJSON` | Multiple lines plain text | No | blank | Blocking/warning checks. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Approved/Published. |
| `ApprovedAt` | Date and Time | No | blank | Required for Approved/Published. |
| `PublishBatchKey` | Single line text | No | blank | Required for Published. |
| `PublishedAt` | Date and Time | No | blank | Required for Published. |

**Relationships:** KPI/target parent; inputs reference review-item keys; output consumed by mappings and reporting files.
**Indexes:** unique `KPIResultKey`; `KPIID`; `PerformanceYear`; `Quarter`; `ResultStatus`; `FinalRAG`; `PublishBatchKey`.
**Access:** Employees/Managers read Published relevant results only through dashboards; Senior/Admin validates/approves; automation creates/calculates/publishes; Board reads Published.
**Raw access:** No except controlled Admin/reconciliation and Board export views.

## 10. `KCFKPI_ReportingMap`

**Purpose:** Versioned many-to-many Core KPI-to-report output mappings.
**Key:** `ReportingMapVersionKey` (unique); `ReportingMapNaturalKey` groups versions.
**Lifecycle:** Draft → Approved/Active → Superseded/Retired; mapping changes are audited.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | KPI/output display. |
| `ReportingMapVersionKey` | Single line text, unique | Yes | — | `KPIID\|OutputCode\|vNN`. |
| `ReportingMapNaturalKey` | Single line text | Yes | — | `KPIID\|OutputCode`. |
| `VersionNumber` | Number (0 decimals) | Yes | 1 | Positive integer. |
| `KPIID` | Single line text | Yes | — | FK → KPI Master. |
| `OutputCode` | Single line text | Yes | — | FK → Output Definitions. |
| `ExternalKey` | Single line text | No | blank | ECB/output row or field key. |
| `AllocationPct` | Number | Yes | 100 | 0–100. |
| `Treatment` | Choice | Yes | `Direct` | `Direct`; `Allocated`; `CompositeComponent`; `Narrative`; `Exclude`. |
| `TreatmentRuleJSON` | Multiple lines plain text | No | blank | Required for non-Direct complex treatment. |
| `ReportingCadence` | Choice | Yes | `Quarterly` | `Quarterly`; `Annual`; `YearEndNarrative`; `AdHoc`. |
| `Status` | Choice | Yes | `Draft` | `Draft`; `Approved`; `Active`; `Superseded`; `Retired`. |
| `EffectiveFrom` | Date only | Yes | — | Inclusive. |
| `EffectiveTo` | Date only | No | blank | Inclusive. |
| `ChangeReference` | Single line text | Yes | — | CONTROL/CR/reference. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Approved/Active. |
| `ApprovedAt` | Date and Time | No | blank | Required for Approved/Active. |

**Relationships:** many KPI Master rows to many Output Definitions; consumed at publish.
**Indexes:** unique `ReportingMapVersionKey`; `ReportingMapNaturalKey`; `KPIID`; `OutputCode`; `Status`; `EffectiveFrom`.
**Access:** Senior/Admin creates; separate CONTROL-authorised approver approves/activates; reporting users read Active through generated outputs; System Admin provisions.
**Raw access:** Admin/reconciliation only.

## 11. `KCFKPI_Config`

**Purpose:** Typed, auditable system configuration without code changes.
**Key:** `ConfigKey` (unique).
**Lifecycle:** Version history and audit enabled; sensitive secrets are prohibited.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Friendly setting name. |
| `ConfigKey` | Single line text, unique | Yes | — | Stable machine key. |
| `Category` | Choice | Yes | — | `Period`; `Deadline`; `Scoring`; `Feature`; `Reporting`; `Retention`; `Operations`. |
| `ValueType` | Choice | Yes | `Text` | `Text`; `Number`; `Boolean`; `Date`; `JSON`. |
| `TextValue` | Single line text | No | blank | One typed value field populated. |
| `NumberValue` | Number | No | blank | One typed value field populated. |
| `BooleanValue` | Yes/No | No | No | Used only when ValueType Boolean. |
| `DateValue` | Date and Time | No | blank | Used only when ValueType Date. |
| `JSONValue` | Multiple lines plain text | No | blank | Validated JSON; no credentials/tokens. |
| `Environment` | Choice | Yes | `Production` | `Development`; `Test`; `Production`. |
| `Active` | Yes/No | Yes | Yes | Current setting state. |
| `Description` | Multiple lines plain text | Yes | — | Meaning and consumer. |
| `ChangeReference` | Single line text | Yes | — | CONTROL/change reference. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Production changes. |
| `ApprovedAt` | Date and Time | No | blank | Required for Production changes. |

**Relationships:** governs application, automation, scoring, retention and reporting.
**Indexes:** unique `ConfigKey`; `Category`; `Environment`; `Active`.
**Access:** All app users may read a deliberately non-sensitive published subset via service; Senior/Admin proposes; System Admin and authorised approver change production.
**Raw access:** No except controlled Admin. Never store secrets.

## 12. `KCFKPI_Audit`

**Purpose:** Append-only business audit events across controlled objects.
**Key:** `AuditKey` (unique).
**Lifecycle:** Append-only; no normal edits/deletes; retention subject to approved policy.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Event display. |
| `AuditKey` | Single line text, unique | Yes | Generated | Immutable GUID string. |
| `EventType` | Choice | Yes | — | Minimum events defined in Data Model; extend only by CR. |
| `SubjectType` | Choice | Yes | — | `Person`; `KPI`; `Target`; `Behaviour`; `Workplan`; `QuarterReview`; `KPIResult`; `ReportingMap`; `Config`; `PublishBatch`; `Evidence`. |
| `SubjectKey` | Single line text | Yes | — | Stable business key. |
| `PerformanceYear` | Number (0 decimals) | No | blank | Query context. |
| `Quarter` | Choice | No | blank | `Q1`; `Q2`; `Q3`; `Q4`. |
| `ActorEmail` | Single line text | Yes | — | User/technical principal. |
| `ActorRole` | Single line text | Yes | — | Effective role at event time. |
| `EventAt` | Date and Time | Yes | Current time | UTC. |
| `Reason` | Multiple lines plain text | No | blank | Mandatory for overrides/reopen/admin corrections. |
| `BeforeJSON` | Multiple lines plain text | No | blank | Relevant prior controlled values. |
| `AfterJSON` | Multiple lines plain text | No | blank | Relevant resulting values. |
| `CorrelationKey` | Single line text | Yes | — | Request/flow/publish correlation. |
| `Source` | Choice | Yes | — | `SPFx`; `PowerAutomate`; `AdminImport`; `Migration`. |
| `SourceReference` | Single line text | No | blank | Commit, flow run, file or CR. |
| `Success` | Yes/No | Yes | Yes | Failed controlled attempts may be logged. |

**Relationships:** generic subject relationship by stable key; no cascading delete.
**Indexes:** unique `AuditKey`; `EventType`; `SubjectKey`; `PerformanceYear`; `EventAt`; `CorrelationKey`.
**Access:** System/automation creates; application users see relevant human-readable history through SPFx; Senior/Admin/System Admin read all; no one edits/approves an audit row.
**Raw access:** System Admin/auditor only.

**Folder model:** enable folders. Personal events use `/YYYY/PersonKey/` and inherit the relevant employee/manager read ACL; catalogue/config/reporting events use Admin-only folders. Automation appends events into the appropriate folder. The list root does not grant normal-user browse access.

## 13. `KCFKPI_Evidence` document library

**Purpose:** Supporting files linked to workplan/review items.
**Key:** `EvidenceKey` (unique metadata).
**Lifecycle:** Draft evidence may be replaced before submission; submitted/approved evidence is versioned and becomes read-only at review lock.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `EvidenceKey` | Single line text, unique | Yes | Generated | Immutable GUID string. |
| `PersonKey` | Single line text | Yes | — | Security/query key. |
| `WorkplanKey` | Single line text | Yes | — | Context. |
| `WorkplanItemKey` | Single line text | Yes | — | Context. |
| `QuarterReviewKey` | Single line text | No | blank | Required once submitted for a quarter. |
| `QuarterReviewItemKey` | Single line text | No | blank | Review-item link. |
| `KPIID` | Single line text | No | blank | Core context. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Context. |
| `Quarter` | Choice | No | blank | `Q1`; `Q2`; `Q3`; `Q4`. |
| `EvidenceStatus` | Choice | Yes | `Draft` | `Draft`; `Submitted`; `Approved`; `Locked`; `Withdrawn`. |
| `EvidenceDescription` | Multiple lines plain text | Yes | — | Accessible description. |
| `UploadedByEmail` | Single line text | Yes | — | Attribution. |
| `LockedAt` | Date and Time | No | blank | Lock metadata. |
| `RetentionCategory` | Choice | Yes | `PerformanceEvidence` | Controlled records category. |

**Folder model:** annual setup evidence may use `/YYYY/PersonKey/Workplan/`; quarter evidence uses `/YYYY/PersonKey/Qn/`. The employee, assigned manager and Admin/Automation ACL follows review state; documents inherit the folder scope to avoid a scope per file. Users cannot share files onward. Version history is enabled.
**Relationships:** files reference Workplan, Workplan Item and optional Quarter Review/Review Item stable keys; review items reconcile `EvidenceCount` against active linked files.
**Indexes:** unique `EvidenceKey`; `PersonKey`; `WorkplanItemKey`; `QuarterReviewItemKey`; `PerformanceYear`; `EvidenceStatus`.
**Access:** Employee creates/edits own Draft files; assigned Manager reads and reviews; Admin/System Admin exception access; Board none unless an approved output explicitly includes evidence. No separate approval action at file level; review approval governs.
**Raw access:** No normal library browsing; SPFx file picker/list only.

## 14. `KCFKPI_Reporting` document library

**Purpose:** Generated Board packs, external extracts, manifests and immutable publish snapshots.
**Key:** `ReportingFileKey` (unique metadata).
**Lifecycle:** Generated → Validated → Published → Superseded; Published file versions are immutable and retained.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `ReportingFileKey` | Single line text, unique | Yes | Generated | Immutable GUID string. |
| `PublishBatchKey` | Single line text | Yes | — | Groups all quarter-close outputs. |
| `OutputCode` | Single line text | Yes | — | FK → Output Definitions; internal snapshot code allowed. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Context. |
| `Quarter` | Choice | No | blank | `Q1`; `Q2`; `Q3`; `Q4`. |
| `FileStatus` | Choice | Yes | `Generated` | `Generated`; `Validated`; `Published`; `Superseded`; `Failed`. |
| `DataContractVersion` | Single line text | Yes | — | GOLD OUTPUT contract version. |
| `InputManifestJSON` | Multiple lines plain text | Yes | — | Result keys/checksums/mapping versions. |
| `FileSHA256` | Single line text | Yes | — | Upper-case hex checksum. |
| `GeneratedAt` | Date and Time | Yes | Current time | UTC. |
| `GeneratedBy` | Single line text | Yes | — | Automation/admin identity. |
| `ValidatedByEmail` | Single line text | No | blank | Required for Validated/Published. |
| `PublishedAt` | Date and Time | No | blank | Required for Published. |
| `RetentionCategory` | Choice | Yes | `PerformanceOutput` | Controlled records category. |

**Folder model:** `/YYYY/Qn/PublishBatchKey/`; files inherit role-based library/folder permissions. Version history is enabled; ad-hoc sharing disabled.
**Relationships:** each file belongs to one Publish Batch and Output Definition and records the KPI Result/mapping inputs in its immutable manifest.
**Indexes:** unique `ReportingFileKey`; `PublishBatchKey`; `OutputCode`; `PerformanceYear`; `Quarter`; `FileStatus`.
**Access:** automation creates; Senior/Admin validates/publishes; Board/Leadership reads Published authorised outputs; Employees/Managers only see outputs explicitly exposed in the app.
**Raw access:** Board may use a read-only Published view; write access remains Admin/automation only.

## 15. `KCFKPI_ProgressNotes`

**Purpose:** Monthly light-touch check-ins without creating twelve rows/scopes per Workplan Item.
**Key:** `ProgressLedgerKey` (unique), one ledger per item/year.
**Lifecycle:** Created with first note; editable while corresponding workplan/review period is open; retained and locked at year close.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | No | blank | Display label. |
| `ProgressLedgerKey` | Single line text, unique | Yes | — | `WorkplanItemKey\|YYYY`. |
| `WorkplanItemKey` | Single line text | Yes | — | FK → Workplan Items. |
| `WorkplanKey` | Single line text | Yes | — | Query/security key. |
| `PersonKey` | Single line text | Yes | — | Query/security key. |
| `PerformanceYear` | Number (0 decimals) | Yes | — | Four-digit year. |
| `ItemType` | Choice | Yes | — | `CoreGold`; `LocalPersonal`; `Behaviour`. |
| `KPIID` | Single line text | No | blank | Core only. |
| `ProgressEntriesJSON` | Multiple lines plain text | Yes | `[]` | Array of max 12 entries: month, note, optional actual/forecast, status, actor, UTC timestamp. No file content. |
| `LatestMonth` | Single line text | No | blank | `YYYY-MM`; indexed query helper. |
| `LatestStatus` | Choice | No | blank | `OnTrack`; `AtRisk`; `OffTrack`; `Complete`; `NotRated`. |
| `LatestUpdatedAt` | Date and Time | No | blank | Query/display helper. |
| `Locked` | Yes/No | Yes | No | True at annual close. |
| `RowVersionToken` | Number (0 decimals) | Yes | 1 | ETag/concurrency support; every change also audited. |

**Relationships:** one-to-one with annual Workplan Item; quarter form may read relevant months but does not copy JSON into GOLD.
**Indexes:** unique `ProgressLedgerKey`; `WorkplanItemKey`; `WorkplanKey`; `PersonKey`; `PerformanceYear`; `LatestMonth`.
**Access:** same scope as Workplan Item; Employee edits own ledger while open; assigned Manager reads/comments only through separate manager review fields, not by rewriting employee notes; Admin exceptions.
**Raw access:** No.

## 16. `KCFKPI_OutputDefinitions`

**Purpose:** Controlled definitions of report destinations so future outputs require data changes, not React changes.
**Key:** `OutputCode` (unique).
**Lifecycle:** Draft → Active → Retired; referenced definitions are never deleted.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Output display name. |
| `OutputCode` | Single line text, unique | Yes | — | Initial: `MAIN_CWOP`; `CITIES_CWOP`; `EDI_CWOP`; `WG_CWOP`; `CWSP`. Future controlled values allowed. |
| `Description` | Multiple lines plain text | Yes | — | Audience/purpose. |
| `OutputFormat` | Choice | Yes | `XLSX` | `XLSX`; `CSV`; `JSON`; `WebFeed`; `Other`. |
| `ReportingCadence` | Choice | Yes | `Quarterly` | `Quarterly`; `Annual`; `YearEndNarrative`; `AdHoc`. |
| `SchemaVersion` | Single line text | Yes | — | External/output contract version. |
| `Status` | Choice | Yes | `Draft` | `Draft`; `Active`; `Retired`. |
| `EffectiveFrom` | Date only | Yes | — | Inclusive. |
| `EffectiveTo` | Date only | No | blank | Inclusive. |
| `OwnerEmail` | Single line text | Yes | — | Business output owner. |
| `ChangeReference` | Single line text | Yes | — | CONTROL/CR reference. |
| `ApprovedByEmail` | Single line text | No | blank | Required for Active. |
| `ApprovedAt` | Date and Time | No | blank | Required for Active. |

**Relationships:** parent of Reporting Map and generated Reporting files.
**Indexes:** unique `OutputCode`; `Status`; `EffectiveFrom`.

## 17. `KCFKPI_BehaviourObjectiveLibrary`

**Purpose:** Admin-maintainable suggested annual objectives for the five fixed KCF Behaviour banners.
**Key:** `BehaviourObjectiveKey` (unique).
**Lifecycle:** Admin creates/edits; obsolete suggestions are deactivated, not deleted; approved Workplans retain copied snapshots.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text | Yes | — | Mirrors ObjectiveTitle for SharePoint usability. |
| `BehaviourObjectiveKey` | Single line text, unique | Yes | — | Stable controlled key. Initial seed uses `BHV-0n-OBJ-0n`. |
| `BehaviourKey` | Single line text | Yes | — | `BHV-01` through `BHV-05`; validated by the service. |
| `ObjectiveTitle` | Single line text | Yes | — | Concise employee-facing objective. |
| `ObjectiveDescription` | Multiple lines plain text | Yes | — | Observable objective detail. |
| `SuggestedMeasure` | Multiple lines plain text | Yes | — | Customisable measure suggestion. |
| `SuggestedUnit` | Single line text | Yes | — | Customisable unit suggestion. |
| `SuggestedEvidence` | Multiple lines plain text | Yes | — | Customisable evidence suggestion. |
| `Active` | Yes/No | Yes | Yes | Employee selector shows active records only. |
| `SortOrder` | Number (0 decimals) | Yes | — | Initial seed 10–60 within each Behaviour. |
| `EffectiveFrom` | Date only | Yes | — | Inclusive. Initial seed 1 November 2025. |
| `EffectiveTo` | Date only | No | blank | Inclusive; blank while current. |

**List settings:** generic list (BaseTemplate 100); versioning on; folders off; Quick Launch off.
**Relationships:** `BehaviourKey` references the fixed Behaviour framework logically. Employee selection copies editable values into Workplan Items; library edits never rewrite an approved Workplan.
**Indexes:** unique `BehaviourObjectiveKey`; `BehaviourKey`; `Active`.
**Access:** all app users read active suggestions; SeniorManagerAdmin/SystemAdmin use the app Admin view to add, edit, reorder and deactivate/reactivate. SharePoint ACL enforcement remains an IT/CONTROL dependency.
**Raw access:** No for normal users.

## 18. `KCFKPI_Teams`

**Purpose:** Controlled Team dimension for Admin configuration. Team membership is stored through the existing `KCFKPI_People.Team` field using `TeamKey`; reporting hierarchy remains a separate People manager relationship.
**Key:** `TeamKey` (unique).
**Lifecycle:** Admin-created; update with audit; inactive Teams are retained. An empty list is the legitimate `Teams not configured` state and provisioning must not invent or seed Team names.

| Column/internal name | SharePoint type | Req | Default | Allowed values / notes |
|---|---|:---:|---|---|
| `Title` | Single line text (built-in) | No | blank | Hidden; `TeamName` is the only business display name. |
| `TeamKey` | Single line text, unique | Yes | — | Immutable Admin-controlled Team identity. |
| `TeamName` | Single line text | Yes | — | CONTROL-approved display name; no initial rows are seeded. |
| `TeamLeadPersonKey` | Single line text | No | blank | FK → active People record; does not define the reporting hierarchy. |
| `Active` | Yes/No | Yes | Yes | Current Team configuration state. |
| `SortOrder` | Number (0 decimals) | Yes | — | Non-negative Admin display order. |

**Relationships:** `TeamLeadPersonKey` → People; People `Team` stores the selected `TeamKey` for membership. No Team is inferred from `ManagerPersonKey`.
**Indexes:** unique `TeamKey`; `TeamLeadPersonKey`; `Active`.
**Access:** Authorised Admin application route; SharePoint storage ACL remains a separate release dependency.
**Raw access:** Pending storage-level ACL enforcement; the application route fails closed for non-Admin roles, but inherited SharePoint access is not a security boundary.

**Physical readback (22 August 2026):** list ID `d039a143-586d-44f0-a599-76c3fc7ed9a3`, URL `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_Teams`, BaseTemplate `100`, versioning enabled, folders/Quick Launch disabled, exact five custom fields, built-in `Title` optional and hidden, and zero Team rows. An immediate repeat provision made zero POST requests.

**KCF-KPI-018 additive delta:** one optional Workplan field, 23 optional polymorphic Workplan Item fields, four optional Quarter Review snapshot fields, 22 optional polymorphic Quarter Review Item fields and 11 custom library fields. These 61 additions do not repurpose existing fields, do not alter existing item values, and do not make Personal/Behaviour data eligible for organisational GOLD.

**Physical verification (21 August 2026):** all 61 additive fields were read back with their approved internal names and types, taking the accepted production inventory from 347 custom fields across 16 assets to 408 across 17. The new library contains exactly 30 distinct active seed records, six for each of `BHV-01` through `BHV-05`. An immediate repeat run created zero fields and zero records, proving idempotency. The five affected assets are:

| Asset | SharePoint list ID | Server-relative URL |
|---|---|---|
| `KCFKPI_Workplans` | `94402ca8-b8d5-43de-a7aa-8ca95a91475c` | `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_Workplans` |
| `KCFKPI_WorkplanItems` | `365d40ce-6ce3-4b16-a06d-3afc1629886b` | `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_WorkplanItems` |
| `KCFKPI_QuarterReviews` | `94a25b6a-7848-4899-a18d-8ed98af14efc` | `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_QuarterReviews` |
| `KCFKPI_QuarterReviewItems` | `2182d7ec-10f8-4950-af5e-eeb98787a1e0` | `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_QuarterReviewItems` |
| `KCFKPI_BehaviourObjectiveLibrary` | `14ab1c10-f589-42a2-adb6-8e85dacc5d56` | `/sites/REVIEW-TEST-SITE/Lists/KCFKPI_BehaviourObjectiveLibrary` |

The provisioning action did not rewrite employee Workplans, Workplan Items, Quarter Reviews, Quarter Review Items, KPI Master, Annual Targets or Behaviour Master records. The only item creation was the authorised 30-row bootstrap seed in the newly created objective library.

## Physical index reconciliation — KCF-KPI-ADR-009

The original 30 compound-index proposals have the following final, unambiguous disposition. `REMOVED` means SharePoint does not support the proposed secondary field type. `NOT REQUIRED` means the pair is technically supported but does not provide a material demonstrated benefit over the retained selective single indexes, controlled folders and expected KCF volumes. No compound index is currently `CREATED`.

| # | Asset | Primary | Secondary | Intended application/view query | Both fields in high-frequency query? | Expected incremental filtering benefit | Final classification |
|---:|---|---|---|---|:---:|---|---|
| 1 | `KCFKPI_People` | `ManagerPersonKey` | `Active` | Manager team roster restricted to active People | Yes | Unsupported Boolean secondary | **REMOVED** |
| 2 | `KCFKPI_KPIMaster` | `DefinitionStatus` | `IsCurrent` | Current active KPI catalogue | Yes | Unsupported Boolean secondary | **REMOVED** |
| 3 | `KCFKPI_KPIMaster` | `Pillar` | `Workstream` | Group Core KPIs by Pillar and Workstream | Yes | Unsupported Text secondary; catalogue is bounded | **REMOVED** |
| 4 | `KCFKPI_AnnualTargets` | `PerformanceYear` | `TargetStatus` | Approved targets for a year | Yes | Unsupported Choice secondary | **REMOVED** |
| 5 | `KCFKPI_AnnualTargets` | `KPIID` | `PerformanceYear` | Resolve effective annual/quarter target versions for one KPI/year | Yes | Both single indexes are selective; target catalogue is bounded and no telemetry shows compound benefit | **NOT REQUIRED** |
| 6 | `KCFKPI_Behaviours` | `Status` | `IsCurrent` | Published current Behaviour catalogue | Yes | Unsupported Boolean secondary | **REMOVED** |
| 7 | `KCFKPI_Workplans` | `PersonKey` | `PerformanceYear` | Load one employee's annual workplan header | Yes | Unique business key/folder and `PersonKey` first filter already reduce to a very small set | **NOT REQUIRED** |
| 8 | `KCFKPI_Workplans` | `ManagerPersonKey` | `State` | Manager queue by assigned manager and workflow state | Yes | Unsupported Choice secondary | **REMOVED** |
| 9 | `KCFKPI_Workplans` | `PerformanceYear` | `State` | Admin annual workplan-state view | No | Unsupported Choice secondary | **REMOVED** |
| 10 | `KCFKPI_WorkplanItems` | `WorkplanKey` | `ItemType` | Load category items within a selected workplan | Yes | Unsupported Choice secondary | **REMOVED** |
| 11 | `KCFKPI_WorkplanItems` | `KPIID` | `PerformanceYear` | Admin/reference impact search for a KPI/year | No | Core employee reads start with selective `WorkplanKey`; no high-frequency material benefit | **NOT REQUIRED** |
| 12 | `KCFKPI_QuarterReviews` | `PersonKey` | `PerformanceYear` | Load an employee's quarterly review headers for a year | Yes | Person/year/quarter folder plus `PersonKey` first filter already produces at most four headers | **NOT REQUIRED** |
| 13 | `KCFKPI_QuarterReviews` | `ManagerPersonKey` | `State` | Manager decision queue | Yes | Unsupported Choice secondary | **REMOVED** |
| 14 | `KCFKPI_QuarterReviews` | `PerformanceYear` | `Quarter` | Quarter-close/admin review set | Yes | Unsupported Choice secondary | **REMOVED** |
| 15 | `KCFKPI_QuarterReviewItems` | `QuarterReviewKey` | `ItemType` | Load category rows for one selected review | Yes | Unsupported Choice secondary | **REMOVED** |
| 16 | `KCFKPI_QuarterReviewItems` | `KPIID` | `PerformanceYear` | GOLD aggregation inputs for one KPI/year, further filtered by quarter/state/type | Yes | `KPIID` first filter is selective at planned scale; no production telemetry yet supports replacing the single index | **NOT REQUIRED** |
| 17 | `KCFKPI_QuarterReviewItems` | `PerformanceYear` | `Quarter` | Quarter-close candidate item set | Yes | Unsupported Choice secondary | **REMOVED** |
| 18 | `KCFKPI_KPIResults` | `PerformanceYear` | `Quarter` | Published/quarter result set | Yes | Unsupported Choice secondary | **REMOVED** |
| 19 | `KCFKPI_KPIResults` | `ResultStatus` | `PerformanceYear` | Publish validation/reconciliation by state and year | Yes | Result set is bounded; indexed status/year filters are sufficient pending telemetry | **NOT REQUIRED** |
| 20 | `KCFKPI_KPIResults` | `KPIID` | `PerformanceYear` | KPI result/history for a year, further filtered by quarter | Yes | One row per KPI/year/quarter and selective `KPIID` first filter; no demonstrated compound benefit | **NOT REQUIRED** |
| 21 | `KCFKPI_ReportingMap` | `OutputCode` | `Status` | Active mappings for an output | Yes | Unsupported Choice secondary | **REMOVED** |
| 22 | `KCFKPI_ReportingMap` | `KPIID` | `Status` | Active output mappings for a KPI | Yes | Unsupported Choice secondary | **REMOVED** |
| 23 | `KCFKPI_Config` | `Environment` | `Active` | Active Production configuration | Yes | Unsupported Boolean secondary; Config is very small | **REMOVED** |
| 24 | `KCFKPI_Audit` | `SubjectKey` | `EventAt` | Chronological audit history for one business subject | No | Selective `SubjectKey` first filter supports the occasional support/audit path; not a core high-frequency journey | **NOT REQUIRED** |
| 25 | `KCFKPI_Audit` | `PerformanceYear` | `EventType` | Annual audit event reporting | No | Unsupported Choice secondary | **REMOVED** |
| 26 | `KCFKPI_Evidence` | `PersonKey` | `PerformanceYear` | Employee annual evidence browse | No | Selected-item queries use `WorkplanItemKey` or `QuarterReviewItemKey`; person/year folders constrain access | **NOT REQUIRED** |
| 27 | `KCFKPI_Reporting` | `PerformanceYear` | `Quarter` | Reporting files for a quarter | Yes | Unsupported Choice secondary | **REMOVED** |
| 28 | `KCFKPI_Reporting` | `OutputCode` | `FileStatus` | Published files for an output | Yes | Unsupported Choice secondary | **REMOVED** |
| 29 | `KCFKPI_ProgressNotes` | `PersonKey` | `PerformanceYear` | Load an employee's annual progress ledgers | Yes | Person/year folder plus selective `PersonKey` first filter remains below the planned per-person set | **NOT REQUIRED** |
| 30 | `KCFKPI_OutputDefinitions` | `Status` | `EffectiveFrom` | Active output definitions effective on a date | Yes | Very small controlled reference list; no material filtering benefit | **NOT REQUIRED** |

Any future compound index requires a controlled optimisation change supported by an eligible field combination and measured query/scale evidence.
**Access:** All reporting consumers read Active definitions through service; Senior/Admin manages; authorised CONTROL approver activates.
**Raw access:** Admin/reconciliation only.

## Provisioning and validation order for KCF-KPI-009

1. Approve outstanding CONTROL decisions and exact choice values.
2. Create SharePoint groups/technical owner; confirm no inherited broad edit rights.
3. Create controlled reference assets: People, KPI Master, Annual Targets, Behaviours, Output Definitions, Reporting Map, Config.
4. Create transactional assets: Workplans, Workplan Items, Progress Notes, Quarter Reviews, Quarter Review Items, KPI Results, Audit.
5. Create Evidence and Reporting libraries, folder/content-type policy and versioning.
6. Create indexes before bulk seed/import.
7. Apply permissions and raw-list navigation restrictions.
8. Run schema tests: internal names, types, required/default/choice values, uniqueness, indexes, versioning and cross-role access.
9. Record list/library IDs and URLs, export the provisioned schema, and reconcile it to this document.

No seed/import, flow, app deployment or production data use is implied by the schema creation step unless separately authorised.
