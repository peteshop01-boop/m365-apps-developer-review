/** Source-only WDL library. No host wiring, physical binding, hash computation or native execution. */
import {emitTrustedDocumentRead, nativeCoordinateSchema} from '../../KCFKPIOptionESubmitV4StandardHost/Tools/CatalogueExactBodyReaderV4.mjs';
import {compileCanonical, exactText, nativeSchema} from '../../KCFKPIOptionESubmitV4StandardHost/Tools/canonical-wdl.mjs';

export const DELIVERY_PUBLICATION_EXACT_BODY_READER_V1 = 'kcf.option-e.delivery-publication-exact-body-reader/v1';
const obj = (properties, required = Object.keys(properties)) => ({type:'object', additionalProperties:false, properties, required});
const fixed = value => ({type:typeof value, enum:[value]});
const text = {type:'string', minLength:1, pattern:'\\S'};
const plain = {type:'string'};
const integer = {type:'integer', minimum:1, maximum:Number.MAX_SAFE_INTEGER};
const year = {type:'integer', minimum:2000, maximum:2100};
const utc = {...text, format:'date-time', pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};
const etag = {...text, pattern:'^"[^"*\\r\\n]+"$'};
const guid = {...text, pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const coordinate = {...nativeCoordinateSchema, properties:{...nativeCoordinateSchema.properties,
  siteId:guid, webId:guid, listId:guid, version:{...text, pattern:'^[^*]+$'}, etag}};
const weights = obj({core:{type:'number', minimum:0, maximum:100}, impact:{type:'number', minimum:0, maximum:100}});
const authority = obj({configurationId:text, version:text, etag, approvalReference:fixed('KCF-KPI-Sponsor-PD-01'),
  contentSha256:{...text, pattern:'^[a-fA-F0-9]{64}$'}, effectiveFrom:{...text, pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
  publishedAt:utc, publishedBy:text, changeReference:text});
const payload = obj({schema:fixed('KCF.DeliveryWeightConfiguration'), immutable:fixed(true), published:fixed(true),
  authority, defaultWeights:obj({core:fixed(70), impact:fixed(30)}), activeWeights:weights});
const configRow = key => obj({identity:obj({itemId:integer, key:fixed(key), environment:text, etag, state:fixed('Active')}),
  provenance:obj({modifiedAt:utc, modifiedBy:text, changeReference:text})});
const config = obj({schema:fixed('KCF.OverallDelivery.Configuration'), schemaVersion:fixed(1), sourceList:fixed('KCFKPI_Config'),
  environment:text, performanceYear:year, versionToken:text,
  weights:obj({core:{type:'integer', minimum:0, maximum:100}, impact:{type:'integer', minimum:0, maximum:100}, total:fixed(100)}),
  includedCategories:{type:'array', items:text, enum:[['Core','Impact']]},
  excludedCategories:{type:'array', items:text, enum:[['Behaviours']]}, behavioursExcludedFromDeliveryArithmetic:fixed(true),
  poorCoreMaskingGuard:fixed('RequiredDownstreamGovernedRule'), poorCoreThresholdConfiguredHere:fixed(false),
  authority:obj({core:configRow('OverallDelivery.Weight.Core'), impact:configRow('OverallDelivery.Weight.Impact')}), tenantMutationExecuted:fixed(false)});
const globalScope = obj({kind:fixed('GlobalDefault'), year});
const managerScope = obj({kind:fixed('WorkplanOverride'), workplan:text, person:text, year});
const root = (scope, provenance) => obj({contract:fixed('kcf.option-e.delivery-publication/v1'),
  purposeApproval:fixed('KCF-KPI-PM83-D001'), scope, payload, provenance});
export const globalDeliveryPublicationSchema = root(globalScope, obj({configSource:config}));
const wpRequired = ['id','etag','workplanKey','personKey','employeeDisplayName','employeeEmail','performanceYear','state',
  'accessState','transitionStatus','coreCategoryWeight','personalCategoryWeight','behaviourCategoryWeight','rowVersionToken'];
const wpStrings = ['managerPersonKey','managerDisplayName','managerEmail','transitionCorrelationKey','categoryWeightReason',
  'submittedAt','submittedByEmail','managerDecisionComment','approvedAt','approvedByEmail','lockedAt','lockedByEmail'];
const workplan = obj({id:integer, etag, workplanKey:text, personKey:text, employeeDisplayName:text, employeeEmail:text,
  performanceYear:year, state:{type:'string', enum:['Draft','ChangesRequested']}, accessState:text, transitionStatus:fixed('Ready'),
  coreCategoryWeight:{type:'number'}, personalCategoryWeight:{type:'number'}, behaviourCategoryWeight:{type:'number'}, rowVersionToken:integer,
  ...Object.fromEntries(wpStrings.map(key => [key,plain])),
  overallDeliveryWeightConfiguration:obj({configurationKey:text, configurationVersion:text, coreWeight:weights.properties.core,
    impactWeight:weights.properties.impact, sourceReference:fixed('KCF-KPI-Sponsor-PD-01')})}, wpRequired);
const observed = value => obj({native:coordinate, value});
const actor = obj({personKey:text, email:text, appRoles:{type:'array', items:{type:'string',
  enum:['Employee','Manager','SeniorManagerAdmin','SystemAdmin','BoardReadOnly']}}, active:fixed(true)});
const subject = obj({personKey:text, managerPersonKey:text, managerEmail:text});
const audit = obj({auditKey:text, eventType:fixed('DeliveryWeightOverrideApproved'), actorEmail:text, actorRole:fixed('Manager'),
  eventAt:utc, reason:text, sourceVersion:integer, resultingState:{type:'string', enum:['Draft','ChangesRequested']}, before:weights, after:weights});
export const managerDeliveryPublicationSchema = root(managerScope, obj({baseline:globalDeliveryPublicationSchema,
  workplanSource:observed(workplan), actorSource:observed(actor), subjectSource:observed(subject),
  approval:obj({actorPersonKey:text, subjectPersonKey:text, assignedManagerPersonKey:text, audit})}));
export const deliveryPublicationSchema = {anyOf:[globalDeliveryPublicationSchema,managerDeliveryPublicationSchema]};
export const deliveryPublicationReaderBindingSchema = obj({admitted:fixed(true), admissionReference:text,
  immutable:fixed(true), siteId:guid, webId:guid, listId:guid, itemId:integer, version:text, etag,
  producerPrincipal:integer, expectedAuthority:authority, expectedScope:{anyOf:[globalScope,managerScope]},
  workplanListId:guid, peopleListId:guid});

const p = (value,key) => `${value}?['${key}']`;
const equal = (a,b) => `equals(${a},${b})`;
const all = (...terms) => `and(${terms.flat().join(',')})`;
const fieldsEqual = (a,b,keys) => keys.map(key => exactText(p(a,key),p(b,key)));
const canonicalUtc = v => equal(`formatDateTime(${v},'yyyy-MM-ddTHH:mm:ss.fffZ')`,v);
const roundedHundredths = v => `add(sub(mul(${v},100),mod(mul(${v},100),1)),if(greater(mod(mul(${v},100),1),0.5),1,0))`;
const validPercent = v => all(`greaterOrEquals(${v},0)`,`lessOrEquals(${v},100)`,
  `or(less(mod(mul(${v},100),1),0.00000001),less(sub(1,mod(mul(${v},100),1)),0.00000001))`);
const validWeights = v => all(validPercent(p(v,'core')),validPercent(p(v,'impact')),
  equal(`add(${roundedHundredths(p(v,'core'))},${roundedHundredths(p(v,'impact'))})`,'10000'));
const sameWeights = (a,b) => all(equal(p(a,'core'),p(b,'core')),equal(p(a,'impact'),p(b,'impact')));
function payloadChecks(chain,tag,value) {
  const a=p(value,'authority');
  chain.guard(tag,all(validWeights(p(value,'activeWeights')),canonicalUtc(p(a,'publishedAt')),
    equal(`formatDateTime(concat(${p(a,'effectiveFrom')},'T00:00:00Z'),'yyyy-MM-dd')`,p(a,'effectiveFrom')),
    `greaterOrEquals(ticks(${p(a,'publishedAt')}),ticks(concat(${p(a,'effectiveFrom')},'T00:00:00Z')))`),'DeliveryPayloadInvalid');
}
function globalChecks(chain,tag,value) {
  payloadChecks(chain,tag+'Payload',p(value,'payload'));
  const c=p(p(value,'provenance'),'configSource'), a=p(c,'authority'), core=p(a,'core'), impact=p(a,'impact');
  chain.guard(tag+'Config',all(equal(p(p(value,'scope'),'year'),p(c,'performanceYear')),
    sameWeights(p(c,'weights'),p(p(value,'payload'),'activeWeights')),
    equal(`add(${p(p(c,'weights'),'core')},${p(p(c,'weights'),'impact')})`,'100'),
    exactText(p(c,'versionToken'),`concat(string(${p(p(core,'identity'),'itemId')}),'@',${p(p(core,'identity'),'etag')},'|',string(${p(p(impact,'identity'),'itemId')}),'@',${p(p(impact,'identity'),'etag')})`),
    `not(${equal(p(p(core,'identity'),'itemId'),p(p(impact,'identity'),'itemId'))})`,
    [core,impact].map(row=>all(exactText(p(p(row,'identity'),'environment'),p(c,'environment')),
      canonicalUtc(p(p(row,'provenance'),'modifiedAt')),
      `lessOrEquals(ticks(${p(p(row,'provenance'),'modifiedAt')}),ticks(${p(p(p(value,'payload'),'authority'),'publishedAt')}))`))),
  'DeliveryConfigSourceDisagreement');
}
function managerChecks(chain,value,binding) {
  const pr=p(value,'provenance'), baseline=p(pr,'baseline'), wpSource=p(pr,'workplanSource'), actorSource=p(pr,'actorSource'), subjectSource=p(pr,'subjectSource');
  const wp=p(wpSource,'value'), actor=p(actorSource,'value'), subject=p(subjectSource,'value'), approval=p(pr,'approval'), audit=p(approval,'audit');
  const scope=p(value,'scope'), wpNative=p(wpSource,'native'), actorNative=p(actorSource,'native'), subjectNative=p(subjectSource,'native');
  globalChecks(chain,'Baseline',baseline); payloadChecks(chain,'ManagerPayload',p(value,'payload'));
  chain.guard('ManagerScope',all(exactText(p(scope,'workplan'),p(wp,'workplanKey')),exactText(p(scope,'person'),p(wp,'personKey')),
    equal(p(scope,'year'),p(wp,'performanceYear')),equal(p(scope,'year'),p(p(baseline,'scope'),'year')),
    equal(p(wpNative,'itemId'),p(wp,'id')),exactText(p(wpNative,'etag'),p(wp,'etag')),
    [wpNative,actorNative,subjectNative].map(n=>all(exactText(p(n,'siteId'),p(binding,'siteId')),exactText(p(n,'webId'),p(binding,'webId')))),
    exactText(p(wpNative,'listId'),p(binding,'workplanListId')),exactText(p(actorNative,'listId'),p(binding,'peopleListId')),
    exactText(p(subjectNative,'listId'),p(binding,'peopleListId')),`not(${equal(p(actorNative,'itemId'),p(subjectNative,'itemId'))})`),
  'DeliveryWorkplanNativeScopeDisagreement');
  const mail = v => `toLower(trim(${v}))`;
  chain.guard('ManagerAuthority',all(exactText(p(wp,'personKey'),p(subject,'personKey')),
    exactText(p(actor,'personKey'),p(subject,'managerPersonKey')),exactText(p(wp,'managerPersonKey'),p(subject,'managerPersonKey')),
    exactText(mail(p(actor,'email')),mail(p(subject,'managerEmail'))),exactText(mail(p(wp,'managerEmail')),mail(p(subject,'managerEmail'))),
    `not(${equal(p(actor,'personKey'),p(subject,'personKey'))})`,`not(${equal(mail(p(actor,'email')),mail(p(wp,'employeeEmail')))})`,
    `contains(${p(actor,'appRoles')},'Manager')`,`not(contains(${p(actor,'appRoles')},'SystemAdmin'))`,
    equal(`length(union(${p(actor,'appRoles')},${p(actor,'appRoles')}))`,`length(${p(actor,'appRoles')})`),
    exactText(p(approval,'actorPersonKey'),p(actor,'personKey')),exactText(p(approval,'subjectPersonKey'),p(subject,'personKey')),
    exactText(p(approval,'assignedManagerPersonKey'),p(subject,'managerPersonKey')),exactText(mail(p(audit,'actorEmail')),mail(p(actor,'email')))),
  'DeliveryAssignedManagerDisagreement');
  const existing=p(wp,'overallDeliveryWeightConfiguration');
  chain.guard('ManagerAudit',all(validWeights(p(audit,'before')),validWeights(p(audit,'after')),
    `not(${sameWeights(p(audit,'before'),p(audit,'after'))})`,
    ['auditKey','reason'].map(key=>exactText(p(audit,key),`trim(${p(audit,key)})`)),
    exactText(p(audit,'actorEmail'),mail(p(actor,'email'))),
    sameWeights(p(audit,'after'),p(p(value,'payload'),'activeWeights')),equal(p(audit,'sourceVersion'),p(wp,'rowVersionToken')),
    exactText(p(audit,'resultingState'),p(wp,'state')),canonicalUtc(p(audit,'eventAt')),
    `greaterOrEquals(ticks(${p(audit,'eventAt')}),ticks(${p(p(p(baseline,'payload'),'authority'),'publishedAt')}))`,
    `lessOrEquals(ticks(${p(audit,'eventAt')}),ticks(${p(p(p(value,'payload'),'authority'),'publishedAt')}))`,
    `if(contains(${wp},'overallDeliveryWeightConfiguration'),${all(equal(p(p(audit,'before'),'core'),p(existing,'coreWeight')),
      equal(p(p(audit,'before'),'impact'),p(existing,'impactWeight')))},${sameWeights(p(audit,'before'),p(p(baseline,'payload'),'activeWeights'))})`),
  'DeliveryApprovalAuditDisagreement');
}

/** Caller must initialise returned variables at the host's permitted initialisation level.
 * Binding/expected PD-01 authority is backend-owned. No trigger/browser projection is consulted.
 * Hashes remain protected data; exact complete canonical body and native readback prove equality.
 */
export function emitDeliveryPublicationReader(chain) {
  const binding = "parameters('binding')?['deliveryPublication']";
  chain.add('DeliveryBinding',{type:'ParseJson',inputs:{content:'@'+binding,schema:nativeSchema(deliveryPublicationReaderBindingSchema)}});
  chain.guard('DeliveryRoute',all(exactText(p(binding,'siteId'),"parameters('binding')?['siteId']"),
    exactText(p(binding,'webId'),"parameters('binding')?['webId']")),'DeliveryBindingRouteNotAdmitted');
  const read=emitTrustedDocumentRead(chain,'Delivery','deliveryPublication',deliveryPublicationSchema);
  const value=read.body, a=p(p(value,'payload'),'authority');
  chain.guard('DeliveryIdentity',all(fieldsEqual(a,p(binding,'expectedAuthority'),Object.keys(authority.properties)),
    exactText(p(a,'version'),p(binding,'version')),exactText(p(a,'etag'),p(binding,'etag')),
    exactText(p(read.native,'OData__UIVersionString'),p(binding,'version')),exactText(p(read.native,'@odata.etag'),p(binding,'etag')),
    exactText(p(read.native,'Created'),p(a,'publishedAt')),equal(p(value,'scope'),p(binding,'expectedScope'))),
  'DeliveryExpectedAuthorityOrNativeIdentityMismatch');
  const Global=chain.constructor, global=new Global(chain.prefix+'DeliveryGlobal_'), manager=new Global(chain.prefix+'DeliveryManager_');
  globalChecks(global,'Global',value); managerChecks(manager,value,binding);
  const variables=[];
  for(const [branch,schema] of [[global,globalDeliveryPublicationSchema],[manager,managerDeliveryPublicationSchema]]) {
    const compiled=compileCanonical(schema,value,branch.prefix+'Canonical'); variables.push(...compiled.variables);
    branch.add('Reconstruct',{type:'Scope',actions:compiled.actions});
    branch.guard('ExactBody',exactText(read.raw,compiled.value),'DeliveryNoncanonicalOrIncompleteBody');
  }
  chain.add('DeliveryScope',{type:'If',expression:`@equals(${p(p(value,'scope'),'kind')},'GlobalDefault')`,actions:global.actions,else:{actions:manager.actions}});
  const result=chain.add('DeliveryRetained',{type:'Compose',inputs:{contract:DELIVERY_PUBLICATION_EXACT_BODY_READER_V1,
    native:{siteId:'@'+p(binding,'siteId'),webId:'@'+p(binding,'webId'),listId:'@'+p(binding,'listId'),
      itemId:'@'+p(read.native,'Id'),version:'@'+p(read.native,'OData__UIVersionString'),etag:'@'+p(read.native,'@odata.etag')},
    nativeMetadata:'@'+read.native,rawBody:'@'+read.raw,publication:'@'+value}});
  return {variables, result:`outputs('${result}')`, rawBody:read.raw, publication:value};
}
