import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const templatePath = path.join(root, 'data', 'KCFKPI_PEOPLE_MANAGER_TEMPLATE.csv');
const expectedHeaders = [
  '_RowType', 'DisplayName', 'Email', 'ManagerEmail', 'Team', 'JobRole',
  'AppRoles', 'Active', 'EmployeeNumber', 'SourceReference', 'ManagerEffectiveFrom'
];
const allowedRoles = new Set([
  'Employee', 'Manager', 'SeniorManagerAdmin', 'SystemAdmin', 'BoardReadOnly'
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  if (quoted) throw new Error('Unclosed quoted CSV value.');
  return rows;
}

const rows = parseCsv(fs.readFileSync(templatePath, 'utf8'));
const errors = [];
if (JSON.stringify(rows[0]) !== JSON.stringify(expectedHeaders)) {
  errors.push(`Headers must be exactly: ${expectedHeaders.join(',')}`);
}

const dataRows = rows.slice(1).filter((row) => row[0] === 'DATA');
const seenEmails = new Set();
for (const [offset, row] of dataRows.entries()) {
  const line = offset + 3;
  if (row.length !== expectedHeaders.length) errors.push(`Line ${line}: expected ${expectedHeaders.length} columns.`);
  const record = Object.fromEntries(expectedHeaders.map((header, index) => [header, (row[index] ?? '').trim()]));
  const email = record.Email.toLowerCase();
  const managerEmail = record.ManagerEmail.toLowerCase();
  if (!record.DisplayName) errors.push(`Line ${line}: DisplayName is required.`);
  if (!emailPattern.test(email)) errors.push(`Line ${line}: Email is invalid.`);
  if (seenEmails.has(email)) errors.push(`Line ${line}: duplicate normalised Email ${email}.`);
  seenEmails.add(email);
  if (managerEmail && !emailPattern.test(managerEmail)) errors.push(`Line ${line}: ManagerEmail is invalid.`);
  if (managerEmail && managerEmail === email) errors.push(`Line ${line}: manager cannot equal employee.`);
  const roles = record.AppRoles.split(';').map((role) => role.trim()).filter(Boolean);
  if (!roles.length || roles.some((role) => !allowedRoles.has(role))) errors.push(`Line ${line}: AppRoles contains a blank or unsupported value.`);
  if (!['true', 'false'].includes(record.Active.toLowerCase())) errors.push(`Line ${line}: Active must be true or false.`);
  if (!record.SourceReference) errors.push(`Line ${line}: SourceReference is required.`);
  if (record.ManagerEffectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(record.ManagerEffectiveFrom)) errors.push(`Line ${line}: ManagerEffectiveFrom must be YYYY-MM-DD.`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: template headers valid; ${dataRows.length} DATA row(s) validated; no duplicate emails.`);
}
