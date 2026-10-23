import * as React from 'react';
import type { AdminMasterReadResult, IAdminMasterFilters } from '../models/AdminMasterSourceCompositionModels';
import { filterAdminMasterSource, projectAdminMasterSource } from '../services/AdminMasterSourceComposition';
import type { IStrategicCoreCoverageFilter } from '../services/StrategicCoreCoverageFeed';
import StrategicCoreCoveragePage from './StrategicCoreCoveragePage';

export const AdminMasterSourceCompositionView: React.FC<{ tab: string; result: AdminMasterReadResult }> = ({ tab, result }) => {
  const [filters, setFilters] = React.useState<IAdminMasterFilters>({});
  const [coverageFilter, setCoverageFilter] = React.useState<IStrategicCoreCoverageFilter>({});
  if (result.status !== 'READY_SOURCE') return <section data-admin-source={result.status} role="status"><h3>Admin source unavailable</h3><p>{result.status}: {result.reason}</p></section>;
  const capture = result.capture;
  const projection = projectAdminMasterSource(capture, coverageFilter);
  const rows = filterAdminMasterSource(capture, filters);
  const provenance = <p>Source only · {capture.sourceReference} · source {capture.sourceVersion} · master {capture.masterVersion} · mapping {capture.mappingVersion} · assignments {capture.assignmentVersion} · coverage {capture.coverageVersion} · as of {capture.asOfDate} · period {capture.activePeriod}. Native admission NOT_ADMITTED; approval and operational reporting eligibility are unestablished.</p>;
  const held = <aside><p>Correction HOLD: governed mutation port unavailable.</p><button type="button" disabled>Correct source record</button><p>Digest HOLD: data-quality event producer and recipient authority unavailable in the committed notification contract.</p><button type="button" disabled>Dispatch data-quality digest</button></aside>;
  if (tab === 'Strategic Core Coverage') return <section data-admin-source="READY_SOURCE">{provenance}<StrategicCoreCoveragePage
    productionIdentity="Captured Admin source only" feed={projection.coverage} filter={coverageFilter} onFilterChange={setCoverageFilter}
    filterOptions={{ performanceYears: [capture.coverage.performanceYear], pillars: Array.from(new Set(capture.coverage.kpis.map(row => row.pillar))),
      workstreams: Array.from(new Set(capture.coverage.kpis.map(row => row.workstream))), teams: [], managers: [],
      kpis: capture.coverage.kpis.map(row => ({ key: row.kpiId, label: row.kpiId })), memberships: [] }} localUat={false}
    message="Captured source coverage only; annual Target and Official Actual remain separate." />{held}</section>;
  if (tab === 'Data Quality') return <section data-admin-source="READY_SOURCE">{provenance}<h3>Captured exceptions</h3>
    {(['Duplicate', 'Unmapped', 'InactiveAssigned'] as const).map(family => <section key={family} aria-label={family}><h4>{family}</h4>
      {projection.exceptions.filter(row => row.family === family).map((row, index) => <p key={index}>{row.detail} · Correction route: {row.correctionRoute}</p>)}
      {!projection.exceptions.some(row => row.family === family) && <p>No exception in this captured source.</p>}</section>)}
    {projection.dataQuality.map(issue => <article key={issue.issueKey}><h4>{issue.title}</h4><p>{issue.detail}</p><p>Correction route: {issue.recommendedResolution} · {issue.sourceReference}</p></article>)}{held}</section>;
  return <section data-admin-source="READY_SOURCE">{provenance}<fieldset><legend>Search and filter captured KPI Master</legend>
    {(['search', 'owner', 'role', 'strategy', 'outcome', 'activePeriod'] as const).map(key => <label key={key}>{({ search: 'KPI ID or wording', owner: 'Owner', role: 'Role', strategy: 'Strategy', outcome: 'Outcome', activePeriod: 'Active period' })[key]}
      <input aria-label={key} value={filters[key] || ''} onChange={event => setFilters({ ...filters, [key]: event.currentTarget.value })} /></label>)}
    <label>Status<select aria-label="status" value={filters.status || 'All'} onChange={event => setFilters({ ...filters, status: event.currentTarget.value as IAdminMasterFilters['status'] })}><option>All</option><option>Active</option><option>Inactive</option></select></label></fieldset>
    <div role="region" aria-label="Captured KPI Master" tabIndex={0} style={{ overflowX: 'auto' }}><table><thead><tr><th>KPI / version</th><th>Wording</th><th>Status / owner</th><th>Strategy / outcome / period</th><th>Current assignments</th></tr></thead><tbody>
      {rows.map((row, index) => <tr key={`${row.id}|${index}`}><td>{row.kpiId} / {row.kpiVersionKey}</td><td>{row.wording}</td><td>{row.active ? 'Active' : 'Inactive'} / {row.owner || 'Unavailable'}</td>
        <td>{capture.mappings.filter(mapping => mapping.kpiId === row.kpiId && mapping.kpiVersionKey === row.kpiVersionKey).map((mapping, i) => <p key={i}>{mapping.strategyId} / {mapping.strategyVersion} · {mapping.outcome === 'Unmapped' ? 'Unmapped' : `${mapping.outcome.outcomeId} / v${mapping.outcome.outcomeVersion}`} · {mapping.activePeriod} · {mapping.sourceReference}</p>)}</td>
        <td>{capture.assignments.filter(assignment => assignment.current && assignment.kpiId === row.kpiId && assignment.kpiVersionKey === row.kpiVersionKey).map((assignment, i) => <p key={i}>{assignment.person} · {assignment.role} · {assignment.activePeriod} · {assignment.sourceReference}</p>)}
          {!capture.assignments.some(assignment => assignment.current && assignment.kpiId === row.kpiId && assignment.kpiVersionKey === row.kpiVersionKey) && 'No current assignment in captured source'}</td></tr>)}
    </tbody></table></div>{!rows.length && <p role="status">No captured KPI matches these filters.</p>}{held}</section>;
};
