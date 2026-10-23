import {
  QUARTERLY_AUDIT_EVENT_TYPES,
  validateQuarterlyLifecycleSchema
} from './QuarterlyLifecycleSchema';

describe('QuarterlyLifecycleSchema', () => {
  it('requires optional Note StatusUpdate and the exact approved Quarterly audit events', () => {
    expect(validateQuarterlyLifecycleSchema(
      { type: 'Note', required: false },
      { type: 'Choice', required: true, choices: QUARTERLY_AUDIT_EVENT_TYPES }
    )).toEqual({ missingAuditEventTypes: [], mismatches: [] });
  });

  it('reports storage-required StatusUpdate and only the missing approved audit choices', () => {
    const result = validateQuarterlyLifecycleSchema(
      { type: 'Note', required: true },
      { type: 'Choice', required: true, choices: ['QuarterReviewCreated', 'RAGOverridden'] }
    );
    expect(result.mismatches).toContain('StatusUpdate must be optional at SharePoint storage level.');
    expect(result.missingAuditEventTypes).toEqual(QUARTERLY_AUDIT_EVENT_TYPES.filter(choice => choice !== 'QuarterReviewCreated' && choice !== 'RAGOverridden'));
  });

  it('does not accept logical type changes as an indexing or validation workaround', () => {
    const result = validateQuarterlyLifecycleSchema(
      { type: 'Text', required: false },
      { type: 'Text', required: true, choices: [] }
    );
    expect(result.mismatches).toEqual(expect.arrayContaining([
      expect.stringContaining('StatusUpdate type'),
      expect.stringContaining('Audit EventType type')
    ]));
  });
});
