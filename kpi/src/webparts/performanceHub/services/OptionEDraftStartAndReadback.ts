import type { IOptionEDraftCreateInput, IOptionEDraftCreateVerified } from './OptionEDraftCreateContract';
import { readOptionEDraftCreateAdmission, type IOptionEDraftCreateIntegration } from './OptionEDraftCreateIntegration';
import type { IOptionEDraftCanonicalRecord, IOptionEDraftGateway } from './OptionEDraftSharePointGateway';

/** Compare a trusted Start receipt to the separately reloaded protected Draft. */
export function assertStartMatchesSavedDraft(
  created: IOptionEDraftCreateVerified,
  stored: IOptionEDraftCanonicalRecord
): void {
  const control = stored.binding;
  if (control.workplanKey !== created.fields.workplanKey ||
      control.personKey !== created.fields.personKey ||
      control.performanceYear !== created.fields.performanceYear ||
      control.draftSchemaVersion !== created.fields.draftSchemaVersion ||
      control.workplanItemId !== created.itemId ||
      control.workplanEtag !== created.etag ||
      control.rowVersionToken !== created.rowVersionToken ||
      control.draftItemId !== stored.itemId ||
      control.state !== 'Draft' || control.transitionStatus !== 'Ready') {
    throw new Error('Started Workplan does not match the reopened private Draft.');
  }
}

/** Only a trusted Start receipt plus a fresh protected SharePoint Draft may
 * unlock the editor. This never treats an optimistic Create response as saved. */
export async function startAndOpenVerifiedDraft(
  create: IOptionEDraftCreateIntegration,
  gateway: IOptionEDraftGateway,
  input: Readonly<IOptionEDraftCreateInput>
): Promise<IOptionEDraftCanonicalRecord> {
  if (!readOptionEDraftCreateAdmission(create).admitted) {
    throw new Error('Start My Workplan is unavailable: the protected SharePoint creator is not connected.');
  }
  const created = await create.create(input);
  const reopened = await gateway.read({ performanceYear: input.performanceYear });
  assertStartMatchesSavedDraft(created, reopened);
  return reopened;
}
