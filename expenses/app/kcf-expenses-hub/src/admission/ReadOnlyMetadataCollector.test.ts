import { ReadOnlyMetadataCollector } from './ReadOnlyMetadataCollector';
import type { IReadOnlyMetadataTransport } from './ReadOnlyMetadataCollector';

function fixture(): { transport: IReadOnlyMetadataTransport; get: jest.Mock; responses: Record<string, unknown> } {
  const responses: Record<string, unknown> = {
    site: { Title: 'Synthetic TEST site' },
    list: { Title: 'KCFEXP_TEST102_ExpenseLines', HasUniqueRoleAssignments: false, ReadSecurity: 1, WriteSecurity: 1, EnableVersioning: true },
    fields: { value: [{ InternalName: 'ExpenseCategory', TypeAsString: 'Text', Required: true, ReadOnlyField: false, EnforceUniqueValues: false }] },
    actor: { IsSiteAdmin: true, Email: 'synthetic-private@example.invalid', LoginName: 'SYNTHETIC-PRIVATE-LOGIN' },
    roles: { value: [{ Member: { PrincipalType: 8, Id: 999, Title: 'SYNTHETIC-PRIVATE-PRINCIPAL', Email: 'synthetic-private@example.invalid' },
      RoleDefinitionBindings: [{ Name: 'Edit' }, { Name: 'SYNTHETIC-PRIVATE-ROLE' }] }] }
  };
  const get = jest.fn(async (url: string) => {
    if (url.includes('/currentuser?')) return responses.actor;
    if (url.includes('/RoleAssignments?')) return responses.roles;
    if (url.includes('/fields?')) return responses.fields;
    if (url.includes('/lists/')) return responses.list;
    return responses.site;
  });
  return { transport: { getJson: get }, get, responses };
}
describe('Read-only metadata collector (synthetic transport; no tenant calls)', () => {
  it('requests only the fixed TEST metadata routes, never list items or mutating methods', async () => {
    const data = fixture(); const snapshot = await new ReadOnlyMetadataCollector(data.transport).collect();
    expect(data.get).toHaveBeenCalledTimes(5);
    for (const call of data.get.mock.calls) {
      expect(call[0]).toMatch(/^https:\/\/samplefoundation\.sharepoint\.com\/sites\/REVIEW-TEST-SITE\/_api\/web/);
      expect(call[0]).not.toMatch(/\/items|GetItems|Delete|AddItem|ensureuser/i);
    }
    expect(snapshot.tenantWritesAuthorised).toBe(false); expect(snapshot.actorContext).toBe('UNVERIFIED');
    expect(snapshot.expenseList.uniqueAcl).toBe(false); expect(snapshot.expenseFields[0].required).toBe(true);
  });
  it('drops private principal/user details, IDs and custom role names', async () => {
    const data = fixture(); const snapshot = await new ReadOnlyMetadataCollector(data.transport).collect();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('SYNTHETIC-PRIVATE'); expect(json).not.toContain('example.invalid'); expect(json).not.toContain('999');
    expect(snapshot.roleGrants[0].levels).toEqual(['Edit', 'CUSTOM_ROLE_REVIEW_REQUIRED']);
    expect(snapshot.isSiteAdmin).toBe(true); expect(snapshot.actorContext).toBe('UNVERIFIED');
  });
  it.each([
    'https://example.invalid/sites/REVIEW-PROD-SITE',
    'https://unapproved.example.invalid/sites/REVIEW-TEST-SITE',
    'http://example.invalid/sites/REVIEW-TEST-SITE',
    'https://example.invalid/sites/REVIEW-TEST-SITE?token=SYNTHETIC',
    'https://user:synthetic.user@example.invalid/sites/REVIEW-TEST-SITE',
    'https://example.invalid/sites/REVIEW-TEST-SITE/_api/web'
  ])('rejects unexpected target before transport invocation: %s', target => {
    const data = fixture(); expect(() => new ReadOnlyMetadataCollector(data.transport, target)).toThrow();
    expect(data.get).not.toHaveBeenCalled();
  });
  it('does not coerce missing/string flags to verified booleans', async () => {
    const data = fixture(); data.responses.list = { Title: 'KCFEXP_TEST102_ExpenseLines', HasUniqueRoleAssignments: 'false' };
    data.responses.actor = { IsSiteAdmin: 'false' };
    const snapshot = await new ReadOnlyMetadataCollector(data.transport).collect();
    expect(snapshot.expenseList.uniqueAcl).toBeUndefined(); expect(snapshot.expenseList.versioning).toBeUndefined();
    expect(snapshot.isSiteAdmin).toBeUndefined(); expect(snapshot.tenantWritesAuthorised).toBe(false);
  });
  it('refuses truncated pages rather than following an unverified next-link', async () => {
    const data = fixture(); data.responses.fields = { value: [], '@odata.nextLink': 'https://unapproved.example.invalid/items' };
    await expect(new ReadOnlyMetadataCollector(data.transport).collect()).rejects.toThrow('Incomplete metadata page');
    expect(data.get).toHaveBeenCalledTimes(5);
  });
  it('refuses a full bounded field page even when no next-link is returned', async () => {
    const data = fixture();
    data.responses.fields = { value: Array.from({ length: 200 }, (_, index) => ({
      InternalName: `SyntheticField${index}`, TypeAsString: 'Text', Required: false,
      ReadOnlyField: false, EnforceUniqueValues: false
    })) };
    await expect(new ReadOnlyMetadataCollector(data.transport).collect()).rejects.toThrow('bounded page limit');
    expect(data.get).toHaveBeenCalledTimes(5);
  });
  it('rejects wrong list identity, malformed responses and duplicate fields', async () => {
    const wrong = fixture(); wrong.responses.list = { Title: 'KCFEXP_ExpenseLines' };
    await expect(new ReadOnlyMetadataCollector(wrong.transport).collect()).rejects.toThrow('identity mismatch');
    const malformed = fixture(); malformed.responses.fields = { unexpected: [] };
    await expect(new ReadOnlyMetadataCollector(malformed.transport).collect()).rejects.toThrow('metadata collection');
    const duplicate = fixture(); const field = { InternalName: 'NominalCode', TypeAsString: 'Text' };
    duplicate.responses.fields = { value: [field, field] };
    await expect(new ReadOnlyMetadataCollector(duplicate.transport).collect()).rejects.toThrow('Duplicate');
  });
  it('supports legacy metadata JSON while retaining unknown flags', async () => {
    const data = fixture(); data.responses.fields = { d: { results: [{ InternalName: 'NominalCode', TypeAsString: 'Text' }] } };
    data.responses.roles = { d: { results: [] } };
    const snapshot = await new ReadOnlyMetadataCollector(data.transport).collect();
    expect(snapshot.expenseFields[0].required).toBeUndefined(); expect(snapshot.expenseFields[0].type).toBe('Text');
    expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(snapshot.expenseFields)).toBe(true);
  });
});
