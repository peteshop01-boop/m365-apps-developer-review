import { readFile } from 'node:fs/promises';

const source = new URL('../data/KCFKPI_PEOPLE_AUTHORISED_011B.csv', import.meta.url);
const text = (await readFile(source, 'utf8')).trim();
const [headerLine, ...lines] = text.split(/\r?\n/);
const headers = headerLine.split(',');
const rows = lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));

const expectedHeaders = [
  'DisplayName', 'PersonKey', 'Email', 'ManagerPersonKey', 'ManagerEmail', 'Team',
  'JobRole', 'AppRoles', 'Active', 'DefaultLanding', 'SourceReference'
];
const errors = [];
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

if (headers.join('|') !== expectedHeaders.join('|')) errors.push('CSV headers do not match the controlled contract.');
if (rows.length !== 24) errors.push(`Expected 24 records; found ${rows.length}.`);

const byEmail = new Map();
const keys = new Set();
for (const row of rows) {
  if (!row.DisplayName) errors.push('A display name is blank.');
  if (row.Email !== row.Email.toLowerCase()) errors.push(`${row.Email}: email is not lowercase.`);
  if (byEmail.has(row.Email.toLowerCase())) errors.push(`${row.Email}: duplicate email.`);
  byEmail.set(row.Email.toLowerCase(), row);
  if (!guid.test(row.PersonKey)) errors.push(`${row.Email}: PersonKey is not a version-4 GUID.`);
  if (keys.has(row.PersonKey)) errors.push(`${row.Email}: duplicate PersonKey.`);
  keys.add(row.PersonKey);
  if (row.Team || row.JobRole) errors.push(`${row.Email}: Team or JobRole was populated without authority.`);
  if (row.AppRoles !== 'Employee' || row.Active !== 'true' || row.DefaultLanding !== 'Overview') {
    errors.push(`${row.Email}: required application defaults differ from Employee/true/Overview.`);
  }
  if (row.SourceReference !== 'KCF-KPI-011B') errors.push(`${row.Email}: incorrect SourceReference.`);
}

for (const row of rows) {
  if (!row.ManagerEmail) {
    if (row.Email !== 'person002@example.invalid' || row.ManagerPersonKey) {
      errors.push(`${row.Email}: unexpected blank or inconsistent top-level manager relationship.`);
    }
    continue;
  }
  const manager = byEmail.get(row.ManagerEmail.toLowerCase());
  if (!manager) errors.push(`${row.Email}: manager email does not resolve.`);
  else if (manager.PersonKey !== row.ManagerPersonKey) errors.push(`${row.Email}: manager key does not match manager email.`);
}

const result = {
  status: errors.length ? 'FAIL' : 'PASS',
  records: rows.length,
  uniqueEmails: byEmail.size,
  uniquePersonKeys: keys.size,
  resolvedManagerLinks: rows.filter((row) => row.ManagerEmail).length,
  topLevelRecords: rows.filter((row) => !row.ManagerEmail).length,
  errors
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
