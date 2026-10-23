'use strict';
// LOCAL packaging source only. Never authenticates, imports, enables or writes
// SharePoint. The draft remains unbound; qualification is a separate release.
const fs=require('node:fs');
const path=require('node:path');
const {buildFlow,buildActorAdmissionFlow}=require('./build-flow.cjs');
const {validateGraph}=require('./wdl-harness.cjs');
const workflowId='faaa734e-4706-467c-a7e6-b188b9b3fbae';
const filename=`D01ExpenseProcessor-${workflowId.toUpperCase()}.json`;
const xmlHeader='<?xml version="1.0" encoding="utf-8"?>\n';
function solutionFiles(){
  const flow=buildFlow();validateGraph(flow);
  return filesForFlow(flow);
}
// Same imported workflow/solution identity, Off/unbound. This build-time path
// emits ONLY the read-only multiuser admission increment, never the legacy
// fixed-claimant writer. It is not a functional Save/release package.
function actorAdmissionSolutionFiles(){
  const flow=buildActorAdmissionFlow();validateGraph(flow);
  return filesForFlow(flow,'0.1.0.9');
}
// Existing workflow identity, new source candidate version. The reviewed
// multiuser financial machine remains OFF and unbound: assembly is not
// permission to import, connect or execute it against any tenant.
function actorWriterSolutionFiles(){
  const {flow}=require('./actor-writer-machine.cjs').buildActorWriterMachine();
  validateGraph(flow);
  if(Object.keys(flow.properties.definition.parameters.Bindings.defaultValue).length)
    throw Error('ACTOR_WRITER_MUST_REMAIN_UNBOUND');
  return filesForFlow(flow,'0.1.0.10');
}
// Local assembly only: matching captured metadata never enables the workflow or
// proves effective rights. Historical R10 0.1.0.5 artifacts remain untouched;
// changed candidate source gets a new identity, never an in-place R10 label.
function fixtureSolutionFiles(specJson, inventoryJson, snapshotJson){
  const admission=require('./private-fixture.cjs').inspectFixture(specJson,inventoryJson,snapshotJson);
  const flow=buildFlow();
  flow.properties.definition.parameters.Bindings.defaultValue=admission.bindings;
  validateGraph(flow);
  return {files:filesForFlow(flow,'0.1.0.8'),admission};
}
function filesForFlow(flow,version='0.1.0.7'){
  return {
    'Other/Solution.xml':xmlHeader+`<ImportExportXml version="9.2.26073.152" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><SolutionManifest>
<UniqueName>KCFExpensesD01Processor</UniqueName><LocalizedNames><LocalizedName description="KCF Expenses D01 processor - HELD candidate" languagecode="1033" /></LocalizedNames><Descriptions /><Version>${version}</Version><Managed>0</Managed>
<Publisher><UniqueName>KCFExpensesWeb</UniqueName><LocalizedNames><LocalizedName description="KCF Expenses Web - proposed publisher" languagecode="1033" /></LocalizedNames><Descriptions /><CustomizationPrefix>kcf</CustomizationPrefix><CustomizationOptionValuePrefix>78100</CustomizationOptionValuePrefix><Addresses /></Publisher>
<RootComponents><RootComponent type="29" id="{${workflowId}}" behavior="0" /></RootComponents><MissingDependencies /></SolutionManifest></ImportExportXml>\n`,
    'Other/Customizations.xml':xmlHeader+`<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Entities /><Roles /><Workflows /><FieldSecurityProfiles /><Templates /><EntityMaps /><EntityRelationships /><OrganizationSettings /><optionsets /><CustomControls /><EntityDataProviders /><connectionreferences><connectionreference connectionreferencelogicalname="kcf_D01SharePoint"><connectionreferencedisplayname>KCF D01 Standard SharePoint - unbound</connectionreferencedisplayname><connectorid>/providers/Microsoft.PowerApps/apis/shared_sharepointonline</connectorid><iscustomizable>1</iscustomizable><promptingbehavior>0</promptingbehavior><statecode>0</statecode><statuscode>1</statuscode></connectionreference></connectionreferences><Languages><Language>1033</Language></Languages></ImportExportXml>\n`,
    ['Workflows/'+filename]:JSON.stringify(flow,null,2)+'\n',
    ['Workflows/'+filename+'.data.xml']:xmlHeader+`<Workflow WorkflowId="{${workflowId}}" Name="KCF Expenses D01 Standard processor - HELD" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<JsonFileName>/Workflows/${filename}</JsonFileName><Type>1</Type><Subprocess>0</Subprocess><Category>5</Category><Mode>0</Mode><Scope>4</Scope><OnDemand>0</OnDemand><TriggerOnCreate>0</TriggerOnCreate><TriggerOnDelete>0</TriggerOnDelete><AsyncAutodelete>0</AsyncAutodelete><SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure><StateCode>0</StateCode><StatusCode>1</StatusCode><RunAs>1</RunAs><IsTransacted>1</IsTransacted><IntroducedVersion>${version}</IntroducedVersion><IsCustomizable>1</IsCustomizable><BusinessProcessType>0</BusinessProcessType><IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers><ModernFlowType>0</ModernFlowType><PrimaryEntity>none</PrimaryEntity><LocalizedNames><LocalizedName languagecode="1033" description="KCF Expenses D01 Standard processor - HELD" /></LocalizedNames></Workflow>\n`
  };
}
if(require.main===module){
  const args=process.argv.slice(2),actor=args.length===1&&args[0]==='--actor-admission',writer=args.length===1&&args[0]==='--actor-writer';
  if(args.length&&!actor&&!writer)throw Error('UNKNOWN_SOURCE_ASSEMBLY_MODE');
  const files=writer?actorWriterSolutionFiles():actor?actorAdmissionSolutionFiles():solutionFiles();
  const root=path.join(__dirname,writer?'solution-actor-writer':actor?'solution-actor-admission':'solution');
  // Never replace a previously frozen writer assembly. A host-owned release
  // process must preserve and inspect that candidate before another assembly.
  if(writer)fs.mkdirSync(root);
  for(const [name,data]of Object.entries(files)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,writer?{flag:'wx'}:undefined);}
  console.log(writer?'Multiuser writer OFF/unbound source assembled; NOT TEST ready. No tenant action.':actor?'Admission-only Off/unbound source generated; financial writer HELD, not TEST ready. No tenant action.':'Draft/off unbound solution source generated. No tenant action.');
}
module.exports={solutionFiles,fixtureSolutionFiles,actorAdmissionSolutionFiles,actorWriterSolutionFiles,workflowId,filename};
