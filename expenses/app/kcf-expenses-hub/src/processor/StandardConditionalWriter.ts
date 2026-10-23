import type { IStandardRestPlan } from './SharePointStandardPlans';
import { conditionalUpdate } from './SharePointStandardPlans';
import { etag, positiveId } from '../services/persistence/PersistenceValidation';

/** Executor boundary for a qualified Standard SharePoint action. No fetch,
 * browser service account, credentials or Premium HTTP action is supplied here.
 * Responses are fresh connector readbacks, never a submitted client record. */
export interface IStandardResponse { readonly status: number; readonly body?: unknown; readonly etag?: string; }
export interface IStandardActionExecutor { execute(plan: IStandardRestPlan): Promise<IStandardResponse>; }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export class StandardConditionalWriter {
  public constructor(private readonly actions: IStandardActionExecutor) {}
  /** Zero/multiple matches are distinguished. A 401/403/404/throttle is NEVER
   * converted into "Absent" and never grants a create. $top=2 detects ambiguity. */
  public async findUnique(plan: IStandardRestPlan, keyField: string, key: string): Promise<Record<string, unknown> | undefined> {
    if (plan.method !== 'GET' || !plan.url.endsWith('$top=2')) throw new Error('UNBOUNDED_LOOKUP');
    const response = await this.actions.execute(plan);
    if (response.status !== 200 || !object(response.body) || !Array.isArray(response.body.value) || response.body.value.length > 1) throw new Error('LOOKUP_UNAVAILABLE');
    const row: unknown = response.body.value[0];
    if (row === undefined) return undefined;
    if (!object(row) || !positiveId(row.Id) || row[keyField] !== key || !etag(row['@odata.etag'])) throw new Error('INVALID_LOOKUP_ROW');
    return row;
  }
  /** Unique-index collision is reconciled using a GET; network/5xx uncertainty
   * is propagated to Pending. There is no catch-and-create or POST retry. */
  public async createUnique(lookup: IStandardRestPlan, create: IStandardRestPlan, keyField: string, key: string): Promise<Record<string, unknown>> {
    if (create.method !== 'POST' || create.retry !== 'none') throw new Error('INVALID_CREATE');
    const found = await this.findUnique(lookup, keyField, key);
    if (found) return found;
    const response = await this.actions.execute(create);
    if (![200, 201, 409].includes(response.status)) throw new Error('CREATE_UNCONFIRMED');
    const stored = await this.findUnique(lookup, keyField, key);
    if (!stored) throw new Error('CREATE_UNCONFIRMED');
    // Caller validates every immutable field against the protected request; a
    // unique key lookup is not itself payload equivalence or actor authorisation.
    return stored;
  }
  public async compareAndSwap(listId: string, id: number, expectedEtag: string, fields: Readonly<Record<string, unknown>>): Promise<'Changed' | 'Conflict'> {
    const result = await this.actions.execute(conditionalUpdate(listId, id, expectedEtag, fields));
    if (result.status === 412) return 'Conflict';
    if (result.status !== 204) throw new Error('CONDITIONAL_WRITE_UNCONFIRMED');
    return 'Changed';
  }
}
