// Local final-definition graph regression. No network, dependencies or workflow execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, 'power-platform/KCFKPIEmployeeTESTProcessor/Workflows/KCFKPIEmployeeTESTCommandProcessor-fce11d54-525e-4281-afd5-f4023317d09b.json');
const referenceFunctions = new Set(['body', 'outputs', 'actions', 'result', 'items', 'repeatItems']);

// Skip WDL string literals (including doubled quotes), so diagnostic text is not an edge.
function expressionReferences(expression) {
  if (!expression.startsWith('@')) return [];
  const refs = [];
  const literal = start => {
    let value = '', i = start + 1;
    while (i < expression.length) {
      if (expression[i] === "'") {
        if (expression[i + 1] === "'") { value += "'"; i += 2; }
        else return { value, end: i + 1 };
      } else value += expression[i++];
    }
    throw new Error('Unterminated WDL string: ' + expression);
  };
  for (let i = 0; i < expression.length;) {
    if (expression[i] === "'") { i = literal(i).end; continue; }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(i));
    if (!identifier) { i++; continue; }
    const name = identifier[0]; i += name.length;
    if (!referenceFunctions.has(name)) continue;
    const call = /^\s*\(\s*/.exec(expression.slice(i));
    if (!call) continue;
    const start = i + call[0].length;
    if (expression[start] !== "'") throw new Error('Nonliteral action reference: ' + expression);
    refs.push({ kind: name, target: literal(start).value });
  }
  return refs;
}

function analyse(definition) {
  const actions = [], references = [], errors = [];
  function strings(value, location, owner) {
    if (typeof value === 'string') {
      for (const ref of expressionReferences(value)) references.push({ ...ref, path: location, expression: value, owner });
    } else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${location}/${i}`, owner));
    else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) strings(v, `${location}/${key}`, owner);
  }
  function container(map, location, ancestors = []) {
    assert(map && typeof map === 'object' && !Array.isArray(map), location);
    const frame = { map, location };
    for (const [name, action] of Object.entries(map)) {
      const owner = { name, path: `${location}/${name}`, frames: [frame, ...ancestors] };
      actions.push({ name, path: owner.path, type: action.type });
      for (const target of Object.keys(action.runAfter || {})) {
        references.push({ kind: 'runAfter', target, path: `${owner.path}/runAfter/${target}`, owner });
        if (!Object.hasOwn(map, target)) errors.push({ kind: 'runAfter', target, path: owner.path, reason: 'Missing sibling action' });
      }
      // Recurse each actual control-flow action container; scan only the remaining properties here.
      for (const [key, value] of Object.entries(action)) {
        if (key === 'runAfter') continue;
        if (key === 'actions') container(value, `${owner.path}/actions`, owner.frames);
        else if ((key === 'else' || key === 'default') && value?.actions) {
          container(value.actions, `${owner.path}/${key}/actions`, owner.frames);
          for (const [k, v] of Object.entries(value)) if (k !== 'actions') strings(v, `${owner.path}/${key}/${k}`, owner);
        } else if (key === 'cases') {
          for (const [caseName, branch] of Object.entries(value)) {
            if (branch.actions) container(branch.actions, `${owner.path}/cases/${caseName}/actions`, owner.frames);
            for (const [k, v] of Object.entries(branch)) if (k !== 'actions') strings(v, `${owner.path}/cases/${caseName}/${k}`, owner);
          }
        } else strings(value, `${owner.path}/${key}`, owner);
      }
    }
  }
  container(definition.actions, 'definition/actions');
  for (const ref of references.filter(r => r.kind !== 'runAfter')) {
    const frame = ref.owner.frames.find(f => Object.hasOwn(f.map, ref.target));
    if (!frame) errors.push({ kind: ref.kind, target: ref.target, path: ref.path, expression: ref.expression, reason: 'No action in current or ancestor container' });
    else ref.resolvedPath = `${frame.location}/${ref.target}`;
  }
  return { actionCount: actions.length, referenceCount: references.length, actions,
    references: references.map(({ owner, ...ref }) => ({ ...ref, owner: owner.path })), errors };
}

const bytes = fs.readFileSync(workflowPath);
const workflow = JSON.parse(bytes);
const definition = workflow.properties.definition;
const graph = analyse(definition);

// A real-workflow mutation must be caught, including references below multiple branches/scopes.
const missingFixture = structuredClone(definition);
function removeAction(map, target) {
  let removed = 0;
  for (const [name, action] of Object.entries(map)) {
    if (name === target) { delete map[name]; removed++; continue; }
    if (action.actions) removed += removeAction(action.actions, target);
    for (const branch of [action.else, action.default, ...Object.values(action.cases || {})]) {
      if (branch?.actions) removed += removeAction(branch.actions, target);
    }
  }
  return removed;
}
assert.equal(removeAction(missingFixture.actions, 'Parse_JSON_Payload'), 1);
const missingResult = analyse(missingFixture);
assert(missingResult.errors.some(e => e.target === 'Parse_JSON_Payload' && e.kind === 'body'));
assert(missingResult.errors.some(e => e.target === 'Parse_JSON_Payload' && e.kind === 'runAfter'));

// Exercise branch enumeration, loop scopes and sibling runAfter resolution beyond this candidate.
const fixture = { actions: { Parent: { type: 'Compose', inputs: 1 }, Scope: { type: 'Scope', runAfter: { Parent: ['Succeeded'] }, actions: {
  Choice: { type: 'If', expression: true, actions: { Yes: { type: 'Compose', inputs: "@body('Parent')" } }, else: { actions: { No: { type: 'Compose', inputs: "@outputs('Parent')" } } } },
  Switch: { type: 'Switch', cases: { One: { case: 1, actions: { Case: { type: 'Compose', inputs: "@actions('Parent')" } } } }, default: { actions: { Default: { type: 'Compose', inputs: "@result('Scope')" } } } },
  Loop: { type: 'Foreach', foreach: '@array(1)', actions: { InLoop: { type: 'Compose', inputs: "@items('Loop')" } } },
  Until: { type: 'Until', expression: true, actions: { InUntil: { type: 'Compose', inputs: "@repeatItems('Until')" } } }
} } } };
assert.equal(analyse(fixture).errors.length, 0);
const badSibling = structuredClone(fixture);
badSibling.actions.Scope.actions.Choice.actions.Yes.runAfter = { Parent: ['Succeeded'] };
assert(analyse(badSibling).errors.some(e => e.kind === 'runAfter' && e.target === 'Parent'));
assert.deepEqual(expressionReferences("@concat('body(''Not_An_Action'')', body('Parent'))"), [{ kind: 'body', target: 'Parent' }]);

const result = { timestamp: new Date().toISOString(), node: process.version, workflowPath,
  workflowSha256: createHash('sha256').update(bytes).digest('hex'), verdict: graph.errors.length ? 'FAIL' : 'PASS',
  method: 'Actual final JSON graph; lexical action-reference extraction; nested actions/else/cases/default/loop scopes; runAfter must resolve within sibling container.',
  ...graph, controls: { deletedRealParseActionDetected: true, missingParseErrors: missingResult.errors.filter(e => e.target === 'Parse_JSON_Payload').length,
    nestedBranchAndLoopEnumeration: true, invalidNonSiblingRunAfterDetected: true, quotedDiagnosticTextIgnored: true },
  limitation: 'Static reference closure only; no semantic execution, Power Automate import, tenant validation or independent acceptance.' };
console.log(JSON.stringify(result, null, 2));
if (graph.errors.length) process.exitCode = 1;
