import * as React from 'react';
import type { ICoreKpiCatalogueItem, IProductionPerson } from '../models/ProductionModels';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import { createAdminPeopleUatState } from '../services/AdminPeopleUat';
import { createAdminTeamsUatState } from '../services/AdminTeamsUat';
import type { IAdminConfigSourceRecord } from '../services/AdminConfigDomain';
import { ADMIN_CONFIG_DEFINITIONS, ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY } from '../services/AdminConfigDomain';
import { CONFIG_KEYS } from '../services/ProductionConfigMapper';
import { buildKpiDataQualityQueue } from '../services/KpiDataQuality';
import type { IAdminReportingReadinessInput } from '../services/AdminDataQualityDomain';
import AdminFoundationPage from './AdminFoundationPage';

export interface IAdminFoundationUatHarnessProps {
  productionIdentity: string;
}

export const ADMIN_UAT_ACTOR_EMAIL = 'synthetic.system.admin@example.invalid';
const twoDigits = (value: number): string => value < 10 ? `0${value}` : String(value);

export const buildAdminUatPeople = (): IProductionPerson[] => {
  const people: IProductionPerson[] = [];
  for (let index = 1; index <= 24; index += 1) {
    const personKey = `SYN-P-${twoDigits(index)}`;
    let managerIndex: number | undefined;
    if (index > 1 && index <= 3) managerIndex = 1;
    else if (index >= 4 && index <= 9) managerIndex = index % 2 === 0 ? 2 : 3;
    else if (index >= 10) managerIndex = 4 + ((index - 10) % 6);
    const managerPersonKey = managerIndex ? `SYN-P-${twoDigits(managerIndex)}` : undefined;
    people.push({
      id: -2000 - index,
      personKey,
      displayName: `Synthetic Person ${twoDigits(index)}`,
      email: index === 1 ? ADMIN_UAT_ACTOR_EMAIL : `synthetic.person.${twoDigits(index)}@example.invalid`,
      managerPersonKey,
      managerEmail: managerIndex === 1
        ? ADMIN_UAT_ACTOR_EMAIL
        : managerIndex ? `synthetic.person.${twoDigits(managerIndex)}@example.invalid` : undefined,
      jobRole: index === 1 ? 'Synthetic top-level lead' : index <= 9 ? 'Synthetic manager or lead' : 'Synthetic employee',
      appRoles: index === 1 ? ['SystemAdmin'] : index <= 9 ? ['Employee', 'Manager'] : ['Employee'],
      active: index !== 24
    });
  }
  return people;
};

export const buildAdminUatBehaviourLibrary = (): IBehaviourObjectiveLibraryRecord[] => {
  const records: IBehaviourObjectiveLibraryRecord[] = [];
  BEHAVIOUR_KEYS.forEach(behaviourKey => {
    for (let index = 1; index <= 6; index += 1) {
      records.push({
        id: -(records.length + 1),
        etag: 'LOCAL-ADMIN-UAT',
        behaviourObjectiveKey: `${behaviourKey}-SYN-${twoDigits(index)}`,
        behaviourKey,
        objectiveTitle: `Synthetic ${behaviourKey} objective ${index}`,
        objectiveDescription: 'Synthetic browser-memory objective used only to test the Admin experience.',
        suggestedMeasure: 'Synthetic completion measure',
        suggestedUnit: 'synthetic actions',
        suggestedEvidence: 'Synthetic evidence note',
        active: true,
        sortOrder: index * 10,
        effectiveFrom: '2026-04-01'
      });
    }
  });
  return records;
};

const configValue = (key: string): string | number | boolean => {
  if (key === CONFIG_KEYS.performanceYear) return '2026/27';
  if (key === CONFIG_KEYS.performanceYearStart) return '2026-04-01';
  if (key === CONFIG_KEYS.performanceYearEnd) return '2027-03-31';
  if (key === CONFIG_KEYS.q1) return 'April to June';
  if (key === CONFIG_KEYS.q2) return 'July to September';
  if (key === CONFIG_KEYS.q3) return 'October to December';
  if (key === CONFIG_KEYS.q4) return 'January to March';
  if (key === CONFIG_KEYS.greenThreshold) return 90;
  if (key === CONFIG_KEYS.amberThreshold) return 50;
  if (key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY) return true;
  if (key === CONFIG_KEYS.coreWeight) return 70;
  if (key === CONFIG_KEYS.personalWeight) return 20;
  if (key === CONFIG_KEYS.behaviourWeight) return 10;
  if (key === CONFIG_KEYS.aggregationMethods) return JSON.stringify(['DirectMetric', 'Additive', 'Milestone']);
  if (key === CONFIG_KEYS.retentionStatus) return 'CONTROL review pending';
  if (key === CONFIG_KEYS.quarterEarlyReviewReminderDays) return 30;
  if (key === CONFIG_KEYS.quarterPreparationReminderDays) return 14;
  if (key === CONFIG_KEYS.quarterFinalReminderDays) return 7;
  if (key === CONFIG_KEYS.employeeSubmissionDaysAfterQuarter) return 10;
  if (key === CONFIG_KEYS.managerReviewDaysAfterSubmissionDeadline) return 5;
  return '';
};

export const buildAdminUatConfig = (): IAdminConfigSourceRecord[] => ADMIN_CONFIG_DEFINITIONS.map((definition, index) => {
  const value = configValue(definition.key);
  return {
    id: -(3000 + index),
    key: definition.key,
    valueType: definition.valueType,
    textValue: definition.valueType === 'Text' ? String(value) : undefined,
    numberValue: definition.valueType === 'Number' ? Number(value) : undefined,
    booleanValue: definition.valueType === 'Boolean' ? Boolean(value) : undefined,
    dateValue: definition.valueType === 'Date' ? String(value) : undefined,
    jsonValue: definition.valueType === 'JSON' ? String(value) : undefined,
    active: true,
    modifiedAt: '2026-08-21T09:00:00.000Z',
    modifiedBy: ADMIN_UAT_ACTOR_EMAIL
  };
});

const adminUatCatalogue = (): ICoreKpiCatalogueItem[] => [{
  kpiId: 'SYN-DQ-001',
  kpiVersionKey: 'SYN-DQ-001|v01',
  targetVersionKey: 'SYN-DQ-001|2026|v01',
  wording: 'Synthetic KPI with unresolved scoring metadata',
  pillar: 'Synthetic Pillar',
  workstream: 'Synthetic Workstream',
  ownerSourceCode: 'TBC',
  scoringDirection: 'TBC',
  metricType: 'Number',
  unitLabel: 'TBC',
  classificationStatus: 'UnresolvedTBC',
  q4TargetValue: undefined
}];

const reportingChecks: readonly IAdminReportingReadinessInput[] = [{
  checkKey: 'reporting-map',
  label: 'Reporting Map is not configured',
  ready: false,
  detail: 'Release D does not yet provide Reporting Map administration.',
  recommendedResolution: 'Complete the separately controlled Admin/Reporting slice before publication.',
  sourceReference: 'KCF-KPI-020A bounded scope',
  priority: 'P2',
  owner: 'CONTROL'
}];

const AdminFoundationUatHarness: React.FC<IAdminFoundationUatHarnessProps> = ({ productionIdentity }) => {
  const [peopleState, setPeopleState] = React.useState(() => createAdminPeopleUatState(buildAdminUatPeople()));
  const [teamsState, setTeamsState] = React.useState(() => createAdminTeamsUatState([]));
  const [library, setLibrary] = React.useState<IBehaviourObjectiveLibraryRecord[]>(() => buildAdminUatBehaviourLibrary());
  const [config, setConfig] = React.useState<IAdminConfigSourceRecord[]>(() => buildAdminUatConfig());
  const queue = React.useMemo(() => buildKpiDataQualityQueue(adminUatCatalogue()), []);

  return <AdminFoundationPage
    peopleState={peopleState}
    teamsState={teamsState}
    behaviourLibrary={library}
    configRecords={config}
    kpiDataQualityQueue={queue}
    reportingChecks={reportingChecks}
    localUat
    productionIdentity={productionIdentity}
    actorEmail={ADMIN_UAT_ACTOR_EMAIL}
    loadMessage="Synthetic Admin data only. Refresh clears every mutation. Production lists, permissions, flows and notifications are untouched."
    onPeopleChange={setPeopleState}
    onTeamsChange={setTeamsState}
    onBehaviourLibraryChange={setLibrary}
    onConfigChange={setConfig}
  />;
};

export default AdminFoundationUatHarness;
