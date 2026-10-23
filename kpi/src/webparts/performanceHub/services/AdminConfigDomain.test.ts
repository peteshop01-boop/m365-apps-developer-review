import type { IAdminConfigSourceRecord } from './AdminConfigDomain';
import {
  ADMIN_CONFIG_CATEGORY_ORDER,
  ADMIN_CONFIG_DEFINITIONS,
  ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY,
  buildAdminConfigView,
  getAdminConfigDefinition,
  validateAdminConfigGroupReplacements,
  validateAdminConfigReplacement,
  validateAdminConfigSet
} from './AdminConfigDomain';

const records = (): IAdminConfigSourceRecord[] => [
  { id: 1, key: 'PerformanceYear.Current', valueType: 'Text', textValue: '2025/26', active: true, modifiedAt: '2026-08-20T09:00:00Z', modifiedBy: 'person015@example.invalid' },
  { id: 2, key: 'PerformanceYear.Start', valueType: 'Date', dateValue: '2025-11-01T00:00:00Z', active: true },
  { id: 3, key: 'PerformanceYear.End', valueType: 'Date', dateValue: '2026-10-31T00:00:00Z', active: true },
  { id: 4, key: 'Period.Q1', valueType: 'Text', textValue: 'Nov-Jan', active: true },
  { id: 5, key: 'Period.Q2', valueType: 'Text', textValue: 'Feb-Apr', active: true },
  { id: 6, key: 'Period.Q3', valueType: 'Text', textValue: 'May-Jul', active: true },
  { id: 7, key: 'Period.Q4', valueType: 'Text', textValue: 'Aug-Oct', active: true },
  { id: 8, key: 'Workplan.Weight.Core', valueType: 'Number', numberValue: 70, active: true },
  { id: 9, key: 'Workplan.Weight.LocalPersonal', valueType: 'Number', numberValue: 20, active: true },
  { id: 10, key: 'Workplan.Weight.Behaviours', valueType: 'Number', numberValue: 10, active: true },
  { id: 11, key: 'RAG.GreenThresholdPct', valueType: 'Number', numberValue: 90, active: true },
  { id: 12, key: 'RAG.AmberThresholdPct', valueType: 'Number', numberValue: 50, active: true },
  { id: 13, key: 'Aggregation.PermittedMethods', valueType: 'JSON', jsonValue: '["DirectMetric","Additive","WeightedContribution","Composite","Milestone","AccountableOwner"]', active: true },
  { id: 14, key: 'Retention.PolicyStatus', valueType: 'Text', textValue: 'TBC pending policy approval', active: true },
  { id: 15, key: 'QuarterEarlyReviewReminderDays', valueType: 'Number', numberValue: 30, active: true },
  { id: 16, key: 'QuarterPreparationReminderDays', valueType: 'Number', numberValue: 14, active: true },
  { id: 17, key: 'QuarterFinalReminderDays', valueType: 'Number', numberValue: 7, active: true },
  { id: 18, key: 'EmployeeSubmissionDaysAfterQuarter', valueType: 'Number', numberValue: 7, active: true },
  { id: 19, key: 'ManagerReviewDaysAfterSubmissionDeadline', valueType: 'Number', numberValue: 7, active: true },
  { id: 20, key: 'RAG.InvalidIsUnassessed', valueType: 'Boolean', booleanValue: true, active: true, modifiedAt: '2026-08-20T09:05:00Z', modifiedBy: 'person015@example.invalid' }
];

describe('Admin Config typed domain', () => {
  it('categorises every supported key and carries plain-English and audit metadata', () => {
    const view = buildAdminConfigView(records());
    expect(view.validation.valid).toBe(true);
    expect(view.groups.map(group => group.category)).toEqual(ADMIN_CONFIG_CATEGORY_ORDER);
    expect(view.groups.reduce((total, group) => total + group.items.length, 0)).toBe(ADMIN_CONFIG_DEFINITIONS.length);
    expect(view.groups[0].items[0]).toEqual(expect.objectContaining({
      currentValue: '2025/26',
      lastUpdatedAt: '2026-08-20T09:00:00Z',
      lastUpdatedBy: 'person015@example.invalid',
      state: 'Valid'
    }));
    expect(getAdminConfigDefinition('RAG.GreenThresholdPct')).toEqual(expect.objectContaining({
      category: 'RagThresholds', plainEnglishName: 'Green threshold', valueType: 'Number'
    }));
    expect(getAdminConfigDefinition(ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY)).toEqual(expect.objectContaining({
      category: 'RagThresholds',
      plainEnglishName: 'Invalid results are unassessed',
      valueType: 'Boolean',
      required: true
    }));
    const ragGroup = view.groups.filter(group => group.category === 'RagThresholds')[0];
    expect(ragGroup.items.filter(item => item.definition.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY)[0])
      .toEqual(expect.objectContaining({ currentValue: 'true', state: 'Valid' }));
    expect(view.unsupportedRecords).toEqual([]);
    expect(view.attention.requiresAttention).toBe(false);
  });

  it('validates the production invalid-is-unassessed key as Boolean and rejects corrupt value slots', () => {
    const source = records();
    const flagIndex = source.findIndex(record => record.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY);
    source[flagIndex] = {
      ...source[flagIndex],
      booleanValue: true,
      textValue: 'true'
    };
    const result = validateAdminConfigSet(source);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'InvalidValue',
      key: ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY,
      message: expect.stringContaining('populate only booleanValue')
    }));
  });

  it('marks reminder values as metadata and never exposes a notification action', () => {
    const view = buildAdminConfigView(records());
    const reminders = view.groups.filter(group => group.category === 'ReminderMetadata')[0];
    expect(reminders.items).toHaveLength(3);
    expect(reminders.items.every(item => item.definition.reminderMetadataOnly)).toBe(true);
    expect(view.notificationsEnabled).toBe(false);
  });

  it('rejects unsupported keys, duplicate active keys, wrong types and conflicting value slots', () => {
    const source = records();
    source.push({ id: 20, key: 'Unsupported.FreeForm', valueType: 'Text', textValue: 'unsafe', active: true });
    source.push({ ...source[0], id: 21 });
    source[10] = { ...source[10], valueType: 'Text', textValue: '90', numberValue: undefined };
    source[17] = { ...source[17], textValue: 'seven' };
    const result = validateAdminConfigSet(source);
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'UnsupportedKey', 'DuplicateActiveKey', 'TypeMismatch', 'InvalidValue'
    ]));
  });

  it('validates threshold bounds/order without fixing scoring values and enforces 100% workplan defaults', () => {
    const source = records();
    source[10] = { ...source[10], numberValue: 85 };
    source[11] = { ...source[11], numberValue: 45 };
    source[7] = { ...source[7], numberValue: 75 };
    const result = validateAdminConfigSet(source);
    expect(result.issues).toContainEqual(expect.objectContaining({
      key: 'Workplan.Weight', message: expect.stringContaining('total exactly 100%')
    }));
    expect(result.issues).not.toContainEqual(expect.objectContaining({ key: 'RAG.GreenThresholdPct' }));
    expect(result.issues).not.toContainEqual(expect.objectContaining({ key: 'RAG.AmberThresholdPct' }));

    source[11] = { ...source[11], numberValue: 85 };
    expect(validateAdminConfigSet(source).issues).toContainEqual(expect.objectContaining({
      key: 'RAG.AmberThresholdPct', message: expect.stringContaining('lower than Green')
    }));
  });

  it('validates Performance Year, distinct quarters and ordered positive deadline/reminder values', () => {
    const source = records();
    source[0] = { ...source[0], textValue: '2024/25' };
    source[2] = { ...source[2], dateValue: '2025-01-01T00:00:00Z' };
    source[4] = { ...source[4], textValue: 'Nov-Jan' };
    source[14] = { ...source[14], numberValue: 5 };
    source[15] = { ...source[15], numberValue: 14 };
    source[16] = { ...source[16], numberValue: 0 };
    const messages = validateAdminConfigSet(source).issues.map(issue => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('start must be before'),
      expect.stringContaining('Quarter labels must be distinct'),
      expect.stringContaining('positive whole number'),
      expect.stringContaining('early, preparation and final order')
    ]));
  });

  it('renders live ISO Config dates as date-input values and rejects ambiguous or impossible dates', () => {
    const view = buildAdminConfigView(records());
    const performanceYear = view.groups.filter(group => group.category === 'PerformanceYear')[0];
    expect(performanceYear.items.filter(item => item.definition.key === 'PerformanceYear.Start')[0].currentValue)
      .toBe('2025-11-01');
    expect(performanceYear.items.filter(item => item.definition.key === 'PerformanceYear.End')[0].currentValue)
      .toBe('2026-10-31');

    const ambiguous = records();
    ambiguous[1] = { ...ambiguous[1], dateValue: '01/11/2025' };
    const ambiguousView = buildAdminConfigView(ambiguous);
    expect(ambiguousView.validation.issues).toContainEqual(expect.objectContaining({
      code: 'InvalidValue', key: 'PerformanceYear.Start', message: expect.stringContaining('unambiguous ISO')
    }));
    expect(ambiguousView.groups.filter(group => group.category === 'PerformanceYear')[0].items
      .filter(item => item.definition.key === 'PerformanceYear.Start')[0].currentValue).toBe('');

    const impossible = records();
    impossible[1] = { ...impossible[1], dateValue: '2025-02-30T00:00:00Z' };
    expect(validateAdminConfigSet(impossible).issues).toContainEqual(expect.objectContaining({
      code: 'InvalidValue', key: 'PerformanceYear.Start'
    }));
  });

  it('builds actionable missing/invalid/unsupported attention without hiding unsupported records', () => {
    const source = records().filter(record => record.key !== 'Period.Q4');
    source.push({ id: 99, key: 'Legacy.Unknown', valueType: 'Text', textValue: 'retained', active: true });
    const view = buildAdminConfigView(source);
    expect(view.attention).toEqual(expect.objectContaining({ requiresAttention: true }));
    expect(view.attention.missingRequiredKeys).toContain('Period.Q4');
    expect(view.attention.unsupportedKeys).toContain('Legacy.Unknown');
    expect(view.unsupportedRecords[0].textValue).toBe('retained');
    expect(view.groups.filter(group => group.category === 'QuarterDeadlines')[0].items
      .filter(item => item.definition.key === 'Period.Q4')[0].state).toBe('Missing');
  });

  it('returns an immutable validated candidate and blocks unsupported replacement keys', () => {
    const source = records();
    const replacement = { ...source[17], id: 118, numberValue: 10 };
    const accepted = validateAdminConfigReplacement(source, replacement);
    expect(accepted.result.valid).toBe(true);
    expect(accepted.candidate).not.toBe(source);
    expect(source[17].numberValue).toBe(7);
    expect(accepted.candidate.filter(record => record.key === replacement.key && record.active)).toHaveLength(1);
    expect(accepted.candidate.filter(record => record.key === replacement.key && record.active)[0].numberValue).toBe(10);
    expect(accepted.candidate.filter(record => record.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY && record.active))
      .toEqual([expect.objectContaining({ valueType: 'Boolean', booleanValue: true })]);
    expect(accepted.result.issues).not.toContainEqual(expect.objectContaining({
      code: 'UnsupportedKey', key: ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY
    }));

    const blocked = validateAdminConfigReplacement(source, {
      id: 200, key: 'Notification.SendNow', valueType: 'Boolean', booleanValue: true, active: true
    });
    expect(blocked.result).toEqual(expect.objectContaining({ valid: false }));
    expect(blocked.result.issues[0].code).toBe('UnsupportedKey');
    expect(blocked.candidate).toEqual(source);
  });

  it('allows a valid one-key repair while preserving unrelated pre-existing issues for later attention', () => {
    const source = records()
      .filter(record => record.key !== 'Period.Q4')
      .map(record => record.key === 'RAG.GreenThresholdPct' ? { ...record, numberValue: 40 } : record);
    const green = source.filter(record => record.key === 'RAG.GreenThresholdPct')[0];
    const repaired = validateAdminConfigReplacement(source, { ...green, numberValue: 85 });
    expect(repaired.result).toEqual({ valid: true, issues: [] });
    const remaining = validateAdminConfigSet(repaired.candidate);
    expect(remaining.valid).toBe(false);
    expect(remaining.issues).toContainEqual(expect.objectContaining({
      code: 'MissingRequiredKey', key: 'Period.Q4'
    }));
    expect(remaining.issues).not.toContainEqual(expect.objectContaining({ key: 'RAG.GreenThresholdPct' }));
  });

  it('stages Performance Year label and dates as one valid atomic group change', () => {
    const source = records();
    const oneKeyOnly = validateAdminConfigReplacement(source, {
      ...source.filter(record => record.key === 'PerformanceYear.Current')[0],
      textValue: '2026/27'
    });
    expect(oneKeyOnly.result.valid).toBe(false);
    expect(oneKeyOnly.result.issues).toContainEqual(expect.objectContaining({
      code: 'CrossFieldGuardrail', key: 'PerformanceYear.Current'
    }));

    const changed = validateAdminConfigGroupReplacements(source, 'PerformanceYear', [
      { ...source.filter(record => record.key === 'PerformanceYear.Current')[0], textValue: '2026/27' },
      { ...source.filter(record => record.key === 'PerformanceYear.Start')[0], dateValue: '2026-11-01' },
      { ...source.filter(record => record.key === 'PerformanceYear.End')[0], dateValue: '2027-10-31T00:00:00Z' }
    ]);
    expect(changed.result).toEqual({ valid: true, issues: [] });
    expect(changed.fullResult.valid).toBe(true);
    expect(changed.candidate.filter(record => record.key === 'PerformanceYear.Current' && record.active)[0].textValue)
      .toBe('2026/27');
  });

  it('stages category-weight defaults atomically and rejects the same transient single-key imbalance', () => {
    const source = records();
    const core = source.filter(record => record.key === 'Workplan.Weight.Core')[0];
    const personal = source.filter(record => record.key === 'Workplan.Weight.LocalPersonal')[0];
    const behaviours = source.filter(record => record.key === 'Workplan.Weight.Behaviours')[0];
    expect(validateAdminConfigReplacement(source, { ...core, numberValue: 80 }).result)
      .toEqual(expect.objectContaining({ valid: false }));

    const changed = validateAdminConfigGroupReplacements(source, 'WorkplanDefaultsGuardrails', [
      { ...core, numberValue: 80 },
      { ...personal, numberValue: 10 },
      { ...behaviours, numberValue: 10 }
    ]);
    expect(changed.result).toEqual({ valid: true, issues: [] });
    expect(changed.fullResult.valid).toBe(true);
    expect(changed.candidate.filter(record => record.key.indexOf('Workplan.Weight.') === 0 && record.active)
      .reduce((total, record) => total + (record.numberValue || 0), 0)).toBe(100);
  });

  it('rejects duplicate, unsupported and cross-category staged group replacements without mutating source', () => {
    const source = records();
    const green = source.filter(record => record.key === 'RAG.GreenThresholdPct')[0];
    const amber = source.filter(record => record.key === 'RAG.AmberThresholdPct')[0];
    const invalid = validateAdminConfigGroupReplacements(source, 'RagThresholds', [
      green,
      { ...green, id: 999 },
      amber,
      source.filter(record => record.key === 'Period.Q1')[0],
      { id: 1000, key: 'Unsupported.FreeForm', valueType: 'Text', textValue: 'unsafe', active: true }
    ]);
    expect(invalid.result.valid).toBe(false);
    expect(invalid.result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'DuplicateActiveKey', 'InvalidValue', 'UnsupportedKey'
    ]));
    expect(invalid.candidate).toEqual(source);
    expect(invalid.candidate).not.toBe(source);
  });
});
