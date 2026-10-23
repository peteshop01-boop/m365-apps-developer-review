'use strict';
// Local interpreter adapter only. The trace sidecar maps generated action names
// back to source names for the existing fault hooks; no cloud/runtime adapter.
const {WriterTenant}=require('./actor-writer-fixture.cjs');
const {Harness}=require('./wdl-harness.cjs');
const {buildActorWriterMachine}=require('./actor-writer-machine.cjs');
class MachineTenant extends WriterTenant {
  async runWriter(requestId=501){
    const previous=this.writerTail;let release;this.writerTail=new Promise(r=>release=r);await previous;
    try{
      const compiled=buildActorWriterMachine();let h;
      const transport=(input,name)=>{
        const local=/^D01T\d+_LOCAL_(\d+)$/.exec(name),pc=h.ctx.variables.d01MachinePC;
        const alias=local?compiled.traceNames[pc]?.[Number(local[1])]:name;
        if(local&&!alias)throw Error('MACHINE_TRACE_MISSING');
        return this.writerTransport(input,alias);
      };
      h=new Harness(compiled.flow,structuredClone(this.admissionBindings),transport,{foreachLimits:{D01Retire:5000}});
      const result=await h.run({ID:requestId}),saved=h.ctx.variables.d01MachineState||{};
      return {...result,outputs:{...result.outputs,...saved},errors:h.errors,visited:h.visited,
        machinePC:h.ctx.variables.d01MachinePC,stateBytes:Buffer.byteLength(JSON.stringify(saved)),executedActions:h.visited.length};
    }finally{release();}
  }
}
module.exports={MachineTenant};
