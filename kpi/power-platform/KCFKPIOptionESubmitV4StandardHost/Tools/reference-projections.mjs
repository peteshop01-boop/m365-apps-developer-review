/** Build-time WDL projections; A009 governs held producer/reader ports. No production JS host. */
export const roleToLevel={IC_OFFICER:'L1',PEOPLE_MANAGER:'L2',SENIOR_LEADER:'L3'};
export const levelToRole={L1:'IC_OFFICER',L2:'PEOPLE_MANAGER',L3:'SENIOR_LEADER'};
export const valueOrder=['BHV-01','BHV-02','BHV-03','BHV-04','BHV-05'];
const mapping=(map,read)=>Object.entries(map).reduceRight((tail,[k,v])=>`if(equals(${read},'${k}'),'${v}',${tail})`,"''");
export const tierLevelExpression=read=>mapping(roleToLevel,read);
export const levelTierExpression=read=>mapping(levelToRole,read);
export const valueOrderExpression=read=>valueOrder.reduceRight((tail,k,i)=>`if(equals(${read},'${k}'),${i+1},${tail})`,'0');
export function projectionValues(kind,native,assignment) {
  const field=k=>`${native}?['${k}']`,a=k=>`${assignment}?['${k}']`;
  switch(kind) {
    case 'Kpi':return {kpiId:field('KPIID'),kpiVersionKey:field('KPIVersionKey'),active:`and(equals(${field('DefinitionStatus')},'Active'),equals(${field('IsCurrent')},true))`};
    case 'Framework':return {frameworkVersion:field('FrameworkVersion'),published:field('Published'),immutable:field('Immutable')};
    case 'Assignment':return {personKey:field('PersonKey'),frameworkVersion:field('FrameworkVersion'),roleTier:field('RoleTier'),roleLevelCode:tierLevelExpression(field('RoleTier')),active:field('Active')};
    case 'Value':return {frameworkValueKey:field('FrameworkValueKey'),frameworkVersion:field('FrameworkVersion'),valueId:field('ValueID'),governedOrder:valueOrderExpression(field('ValueID')),roleTier:a('RoleTier'),descriptorKey:`concat(${field('FrameworkVersion')},'|',${a('RoleTier')},'|',${field('ValueID')})`};
    case 'Prompt':return {promptKey:field('BehaviourObjectiveKey'),behaviourKey:field('BehaviourKey'),roleTier:levelTierExpression(field('RoleLevelCode')),active:field('Active')};
    case 'Target':return Object.fromEntries(['targetVersionKey','kpiId','performanceYear','status','role','annual','q1','q2','q3','q4'].map(k=>[k,`variables('ProtectedTargetBody')?['${k}']`]));
    case 'Catalogue':return {catalogueId:"variables('SelectedCatalogue')?['catalogueKey']",catalogueVersion:"variables('SelectedCatalogue')?['catalogueVersion']",catalogueRevision:"variables('SelectedCatalogue')?['revision']",catalogueEtag:"variables('CatalogueProvenance')?['catalogueEtag']",catalogueContentSha256:"variables('SelectedVersion')?['contentSha256']",approvalReference:`${field('ApprovalReference')}`,published:"equals(variables('SelectedCatalogue')?['status'],'Published')",immutable:'true',asOfDate:"variables('CatalogueProvenance')?['asOfDate']",effectiveFrom:"variables('SelectedCatalogue')?['effectiveFrom']",effectiveTo:"variables('SelectedCatalogue')?['effectiveTo']"};
    case 'Headline':return {behaviourKey:"variables('LogicalCatalogueRow')?['behaviourKey']",headlineTitle:"variables('LogicalCatalogueRow')?['title']",governedOrder:"variables('LogicalCatalogueRow')?['sortOrder']"};
    case 'Focus':return {behaviourKey:"variables('LogicalCatalogueRow')?['behaviourKey']",focusKey:"variables('LogicalCatalogueRow')?['focusKey']",focusTitle:"variables('LogicalCatalogueRow')?['focusArea']",roleLevelCode:"variables('LogicalCatalogueRow')?['roleLevelCode']",status:"variables('LogicalCatalogueRow')?['status']",effectiveFrom:"variables('LogicalCatalogueRow')?['effectiveFrom']",effectiveTo:"variables('LogicalCatalogueRow')?['effectiveTo']"};
    case 'BehaviourTarget':return {...projectionValues('Focus',native,assignment),targetKey:"variables('LogicalCatalogueRow')?['targetKey']",selectedWording:"variables('LogicalCatalogueRow')?['suggestedTarget']"};
    default:throw Error('Unknown protected reference kind');
  }
}

/** Offline developer projection oracle. It never grants native host admission. */
export function projectJoinedReference(kind,native,assignment) {
  if(!assignment||!roleToLevel[assignment.RoleTier]||assignment.Active!==true) throw Error('ProtectedAssignmentMissing');
  switch(kind) {
    case 'Kpi':return {kpiId:native.KPIID,kpiVersionKey:native.KPIVersionKey,active:native.DefinitionStatus==='Active'&&native.IsCurrent===true};
    case 'Framework':return {frameworkVersion:native.FrameworkVersion,published:native.Published,immutable:native.Immutable};
    case 'Assignment':if(native.PersonKey!==assignment.PersonKey||native.FrameworkVersion!==assignment.FrameworkVersion||native.RoleTier!==assignment.RoleTier||native.Active!==true)throw Error('AssignmentJoin');return {personKey:native.PersonKey,frameworkVersion:native.FrameworkVersion,roleTier:native.RoleTier,roleLevelCode:roleToLevel[native.RoleTier],active:native.Active};
    case 'Value': {
      const i=valueOrder.indexOf(native.ValueID),descriptor={IC_OFFICER:'ICOfficerDescriptor',PEOPLE_MANAGER:'PeopleManagerDescriptor',SENIOR_LEADER:'SeniorLeaderDescriptor'}[assignment.RoleTier];
      if(i<0||native.FrameworkVersion!==assignment.FrameworkVersion||native.FrameworkValueKey!==`${native.FrameworkVersion}|${native.ValueID}`||typeof native[descriptor]!=='string'||!native[descriptor].trim())throw Error('ValueJoin');
      return {frameworkValueKey:native.FrameworkValueKey,frameworkVersion:native.FrameworkVersion,valueId:native.ValueID,governedOrder:i+1,roleTier:assignment.RoleTier,descriptorKey:`${native.FrameworkVersion}|${assignment.RoleTier}|${native.ValueID}`};
    }
    case 'Prompt':if(levelToRole[native.RoleLevelCode]!==assignment.RoleTier)throw Error('PromptRoleJoin');return {promptKey:native.BehaviourObjectiveKey,behaviourKey:native.BehaviourKey,roleTier:levelToRole[native.RoleLevelCode],active:native.Active};
    case 'Target':throw Error('CompleteProtectedTargetProducerBindingMissing');
    default:throw Error('CompleteStandardADMCodecAndProvenanceMissing');
  }
}

export const sourceDependencies=[
  {id:'TARGET-PRODUCER-V4',state:'EXISTING_PRIVATE_DRAFT_LIST_ROW_SOURCE_EMITTED_NOT_NATIVE_ADMITTED',missing:'Existing private Draft list-row exact native tenant/site/web/list route, effective rights/schema/version/Author/Created/genuine hash readback and corresponding supplemental schema/rights/version/readback binding admission remain',clearing:'The dedicated existing-list-row reader retains full raw before/after rows and canonical payload alongside genuine hash/native tuple; separate independent gates and native admissions remain. Preserve private Save/complete Draft/organisational/rule origins and closed wire. No new Target publisher or original capture producer.'},
  {id:'ADM-STANDARD-CODEC',state:'BOUNDED_SOURCE_GUARDS_IMPLEMENTED_NOT_NATIVE_ADMITTED',missing:'Native genuine publisher/hash/count/body/readback/immutability mapping and hosted UTF8/status/version/codec parity remain',clearing:'Continue the distinct exact-body reader; genuine old SHA golden envelope/history path is developer PASS. Preserve unchanged old digest-validating API, genuine callbacks/Required SHA/StateChunk01..16. No fake digest callback or claimed SHA recomputation by this reader.'},
  {id:'ADM-PROVENANCE-V4',state:'BOUNDED_SOURCE_GUARDS_IMPLEMENTED_NOT_NATIVE_ADMITTED',missing:'Native original saved-Draft/version readback, governed historical date, existing admitted producer and immutable tuple-resolution mapping remain',clearing:'Source validates complete original saved-Draft canonical bodies, full original publisher/readback receipt and unchanged annual selection snapshots; guarded capture producer mapping is proposed only. Unknown native origin facts hold. No current ETag/utcNow/Draft Modified/createdAt substitution or business-clock policy.'}
];
