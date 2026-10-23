import * as React from 'react';
import type { V5HistoryReadResult } from '../services/OptionEWorkplanSubmittedHistoryV5ReadProjection';
import type { QuarterKey } from '../models/QuarterlyModels';

export interface IV5HistoryViewProps {
  result: V5HistoryReadResult;
  journey: 'annual' | 'quarter' | 'reporting';
  quarter?: QuarterKey;
}
const shown = (value: unknown): string => value === undefined || value === null || value === '' ? 'Not captured' : String(value);
const wrapped: React.CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' };

/** Historical reference only; existing progress and governed Reporting remain independent. */
export const OptionEWorkplanSubmittedHistoryV5View: React.FC<IV5HistoryViewProps> = ({ result, journey, quarter }) => {
  if (result.status === 'HOLD') return <section aria-label="Captured Workplan history" data-history-journey={journey}>
    <h2>Captured Workplan history</h2><p role="status">HOLD · Historical reference unavailable ({result.reason}).</p>
    <p>Restore the governed history read before historical reference data can be shown.</p>
  </section>;
  const { history, deliveryWeights, classifications } = result.projection;
  const draft = journey === 'annual' ? result.projection.annual
    : journey === 'quarter' ? result.projection.quarterly : result.projection.reporting;
  const period = quarter === 'Q1' ? 'q1' : quarter === 'Q2' ? 'q2' : quarter === 'Q3' ? 'q3' : quarter === 'Q4' ? 'q4' : undefined;
  const extension = draft.behaviours.governedExtension;
  return <section aria-label="Captured Workplan history" data-history-journey={journey}>
    <h2>Captured Workplan history · {journey === 'quarter' ? quarter || 'Quarter reference' : journey === 'annual' ? 'Annual reference' : 'Reporting reference'}</h2>
    <p role="status">Historical source reference only. Approval and operational reporting eligibility have not been established.</p>
    <p>DECODED_SOURCE_ONLY · Captured quarter Targets are annual commitments. Approved quarter Actuals, evidence, manager commentary and final year-end outcome are unavailable from this capture.</p>
    <p>{history.coordinates.workplan} · {history.coordinates.person} · {history.coordinates.year}</p>
    <p>Captured {history.capture.kind} · {history.snapshot.admission.eventAt} · Draft version {history.snapshot.admission.authority.draft.version}</p>
    <p>Captured Delivery weights: Core {deliveryWeights.coreWeight}% · IMPACT {deliveryWeights.impactWeight}% · {deliveryWeights.configurationVersion}</p>
    <p>Annual commitments and Targets remain fixed. Current / Actual values are shown separately in the existing quarterly review. Behaviours remain outside Delivery arithmetic.</p>
    <section aria-label="Captured Core definitions" style={wrapped}><h3>Core</h3>
      <p>Captured weighting mode: {shown(draft.core.weightingMode)}</p>
      {draft.core.entries.map(row => <p key={row.coreId}>{row.kpiId} · KPI version {shown(row.kpiVersionKey)} · Target version {shown(row.targetVersionKey)} · Role {shown(row.role)} · Contribution method {shown(row.contributionMethod)} · Weight {shown(row.weightPercent)}%</p>)}
    </section>
    <section aria-label="Captured Impact definitions" style={wrapped}><h3>Impact</h3>
      {draft.impact.map(row => <p key={row.impactId}>{row.wording} · Measure {shown(row.measure)} · Unit {shown(row.unit)} · Success {shown(row.success)}</p>)}
    </section>
    <div role="region" aria-label="Captured annual commitments" style={{ overflowX: 'auto', overflowWrap: 'anywhere' }} tabIndex={0}>
      <table><thead><tr><th scope="col">Commitment</th><th scope="col">Annual Target</th><th scope="col">Captured quarter Target</th><th scope="col">Captured classification</th></tr></thead>
        <tbody>{draft.core.entries.map(row => <tr key={`core-${row.coreId}`}><th scope="row">{row.kpiId} · {row.kpiVersionKey}</th>
          <td>{shown(row.annual.value)} · {shown(row.annual.success)}</td><td>{period ? shown(row[period].value) : 'Select a quarter'} · {period ? shown(row[period].success) : 'Select a quarter'}</td><td>Core · {row.role}</td></tr>)}
        {draft.impact.map(row => { const classification = classifications.find(item => item.impactId === row.impactId)?.classification;
          return <tr key={`impact-${row.impactId}`}><th scope="row">{row.wording}</th><td>{shown(row.annual)} {row.unit} · {row.success}</td>
            <td>{period ? shown(row[period]) : 'Select a quarter'}</td><td>{shown(classification?.businessContributionArea?.label)} · {shown(classification?.strategicPillar?.label)}</td></tr>;
        })}</tbody></table>
    </div>
    <section aria-label="Captured Behaviour definitions" style={wrapped}><h3>Behaviour</h3>
      <p>Framework {shown(draft.behaviours.frameworkVersion)} · Role tier {shown(draft.behaviours.roleTier)} · Outside Delivery arithmetic</p>
      {draft.behaviours.entries.map(row => <section key={row.valueId} aria-label={`Captured Behaviour ${row.valueId}`}>
        <h4>{row.valueId} · {shown(row.descriptorKey)}</h4>
        <p>Guidance prompt keys: {shown(row.guidancePromptKeys.join(', '))} · Selected prompt keys: {shown(row.selectedPromptKeys.join(', '))}</p>
        <p>Annual commitment: {shown(row.commitment)}</p><p>Selected period commitment ({quarter || 'no quarter selected'}): {quarter ? shown(row.periodCommitments[quarter]) : 'Select a quarter'}</p>
      </section>)}
      <h4>Captured governed Behaviour extension</h4>
      {extension ? <>
        <p>Catalogue {extension.authority.catalogueId} · Version {extension.authority.catalogueVersion} · Revision {extension.authority.catalogueRevision} · ETag {extension.authority.catalogueEtag} · Content SHA256 {extension.authority.catalogueContentSha256} · Captured approval reference {extension.authority.approvalReference} · Role level {extension.roleLevelCode}</p>
        {extension.headlines.map(headline => <section key={headline.behaviourKey} aria-label={`Captured headline ${headline.behaviourKey}`}>
          <h4>{headline.behaviourKey} · {shown(headline.headlineTitle)}</h4>
          {headline.selections.map(selection => <div key={selection.selectionKey}>
            <p>{shown(selection.headlineTitle)} · {shown(selection.focusTitle)} · {shown(selection.selectedWording)} · Role level {shown(selection.roleLevelCode)}</p>
            <p>Commitment: {shown(selection.myCommitment)} · How will we know: {shown(selection.howWillWeKnow)}</p>
            <p>Captured selection {selection.selectionKey} · {selection.source} · Catalogue {selection.catalogueId} · {selection.catalogueVersion} · Revision {selection.catalogueRevision} · ETag {selection.catalogueEtag} · Content SHA256 {selection.catalogueContentSha256}</p>
          </div>)}
        </section>)}
      </> : <p>Not captured</p>}
    </section>
    <details aria-label="Captured provenance and full raw history"><summary>Captured provenance and full raw history</summary><p>Source reference: {deliveryWeights.sourceReference}</p>
      <p>Capture encoding: {shown('encoding' in history.capture ? history.capture.encoding : undefined)} · Kind: {history.capture.kind} · Draft version: {history.snapshot.admission.authority.draft.version}</p>
      {Object.entries(history.raw).map(([label, body]) => <section key={label} aria-label={`Raw captured ${label}`}><h4>{label}</h4>
        <pre style={wrapped}>{body}</pre></section>)}
    </details>
  </section>;
};
