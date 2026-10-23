'use strict';
// LOCAL ONLY. Reads bounded JSON captures and emits JSON to stdout. There is no
// network client or tenant execution command, and no file overwrite operation.
const fs = require('node:fs');
const fixture = require('./private-fixture.cjs');
const { fixtureSolutionFiles } = require('./build-solution.cjs');
const { nativeMonthsStagingPlan, nativeMonthsMetadataReadback } = require('./native-staging.cjs');
function read(file, maximum) {
  const fd = fs.openSync(file, 'r');
  try {
    if (!fs.fstatSync(fd).isFile()) throw Error('INPUT_FILE');
    const data = Buffer.alloc(maximum + 1); let total = 0, count;
    do { count = fs.readSync(fd, data, total, data.length - total, null); total += count; } while (count > 0 && total < data.length);
    if (total > maximum) throw Error('INPUT_BOUND');
    return data.subarray(0, total).toString('utf8');
  } finally { fs.closeSync(fd); }
}
function main(args) {
  if (args[0] === 'inspect-months') {
    if (args.length !== 5) throw Error('USAGE');
    return nativeMonthsMetadataReadback(read(args[1], 128 * 1024), read(args[2], 2 * 1024 * 1024), read(args[3], 2 * 1024 * 1024), read(args[4], 2 * 1024 * 1024));
  }
  const modes = { create: fixture.createPlan, schema: fixture.schemaPlan, seed: fixture.seedPlan, parent: fixture.parentSeedPlan, inspect: fixture.inspectFixture, rollback: fixture.rollbackPlan, package: fixtureSolutionFiles, 'staging-months': nativeMonthsStagingPlan };
  const [mode, specFile, beforeFile, snapshotFile] = args;
  if (!Object.hasOwn(modes, mode) || args.length !== (mode === 'create' ? 3 : 4)) throw Error('USAGE');
  return modes[mode](read(specFile, 128 * 1024), read(beforeFile, 2 * 1024 * 1024), mode === 'create' ? undefined : read(snapshotFile, 2 * 1024 * 1024));
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) { process.stderr.write(/^FIXTURE_[A-Z0-9_]+$/.test(error?.message) ? error.message + '\n' : 'FIXTURE_INPUT_OR_USAGE\n'); process.exitCode = 1; }
}
module.exports = { main };
