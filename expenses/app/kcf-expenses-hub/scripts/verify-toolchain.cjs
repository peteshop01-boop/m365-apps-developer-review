'use strict';
const { engines } = require('../package.json');
if (process.versions.node !== engines.node) {
  console.error(`BLOCKED: native SPFx requires pinned Node ${engines.node}; found ${process.versions.node}. Use scripts/npm22.cmd. System Node is unchanged.`);
  process.exit(1);
}
const agent = process.env.npm_config_user_agent;
if (agent && !agent.startsWith(`npm/${engines.npm} `)) {
  console.error(`BLOCKED: use pinned npm ${engines.npm} bundled with project-local Node ${engines.node}.`);
  process.exit(1);
}
console.log(`Native toolchain: Node ${process.versions.node}, npm ${engines.npm} required, SPFx 1.23.2, React 17.0.1.`);
