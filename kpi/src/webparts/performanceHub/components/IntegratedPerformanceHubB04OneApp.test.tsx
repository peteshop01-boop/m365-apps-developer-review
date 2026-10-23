import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { ReportingView } from './IntegratedPerformanceHub';
import { buildDecisionReportingDataset } from '../test/ReportingDecisionFixtures';

const data = {
  kpis: [], people: [], directReports: [], teams: [], configs: [], objectives: [],
  annualReviews: [], quarterReviews: [], quarterLifecycles: [], warnings: []
} as React.ComponentProps<typeof ReportingView>['data'];

describe('PM45 B04 one-app Reporting mount', () => {
  it('shows the complete B04 tabs with a prominent synthetic local label', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<ReportingView tab="Performance reporting views"
      data={data} localSyntheticReportingDataset={buildDecisionReportingDataset()} />);
    expect(html).toContain('SYNTHETIC LOCAL DEMONSTRATION');
    expect(html).toContain('No operational reporting result or approved source is connected');
    for (const view of ['Executive', 'Pillar', 'Portfolio', 'KPI detail', 'Impact', 'Behaviours']) {
      expect(html).toContain(view);
    }
    expect(html).toContain('Overall Delivery summary');
  });

  it('fails closed when the operational issuer is absent', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<ReportingView tab="Performance reporting views" data={data} />);
    expect(html).toContain('Reporting data is not connected');
    expect(html).not.toContain('SYNTHETIC LOCAL DEMONSTRATION');
    expect(html).not.toContain('Overall Delivery summary');
  });

  it('fails closed when a supplied local dataset is malformed', () => {
    const malformed = buildDecisionReportingDataset();
    malformed.core.executive.rows[0].submissionState = 'Hostile' as never;
    const html = ReactDOMServer.renderToStaticMarkup(<ReportingView tab="Performance reporting views"
      data={data} localSyntheticReportingDataset={malformed} />);
    expect(html).toContain('Reporting data is not connected');
    expect(html).not.toContain('SYNTHETIC LOCAL DEMONSTRATION');
  });

  it('shows the unavailable state instead of throwing when Core feeds are absent', () => {
    const malformed = buildDecisionReportingDataset();
    (malformed as unknown as { core?: unknown }).core = undefined;
    const html = ReactDOMServer.renderToStaticMarkup(<ReportingView tab="Performance reporting views"
      data={data} localSyntheticReportingDataset={malformed} />);
    expect(html).toContain('Reporting data is not connected');
    expect(html).not.toContain('SYNTHETIC LOCAL DEMONSTRATION');
    expect(html).not.toContain('Overall Delivery summary');
  });
  it.each(['missing distributions', 'null member', 'bad headline reference', 'bad catalogue member', 'absent catalogue', 'null catalogue', 'array catalogue', 'scalar catalogue'])('keeps the loopback unavailable for Behaviour %s', caseName => {
    const malformed = buildDecisionReportingDataset();
    if (caseName === 'missing distributions') delete (malformed.behaviour.headlines[0] as unknown as Record<string, unknown>).distributions;
    if (caseName === 'null member') malformed.behaviour.headlines[0].distributions[0] = null as never;
    if (caseName === 'bad headline reference') malformed.behaviour.headlines[0].headlineReference = null as never;
    if (caseName === 'bad catalogue member') malformed.governance!.behaviourCatalogue.headlineReferences[0] = null as never;
    if (caseName === 'absent catalogue') delete (malformed.governance as unknown as Record<string, unknown>).behaviourCatalogue;
    if (caseName === 'null catalogue') (malformed.governance as unknown as Record<string, unknown>).behaviourCatalogue = null;
    if (caseName === 'array catalogue') (malformed.governance as unknown as Record<string, unknown>).behaviourCatalogue = [];
    if (caseName === 'scalar catalogue') (malformed.governance as unknown as Record<string, unknown>).behaviourCatalogue = 'invalid';
    const html = ReactDOMServer.renderToStaticMarkup(<ReportingView tab="Performance reporting views"
      data={data} localSyntheticReportingDataset={malformed} />);
    expect(html).toContain('Reporting data is not connected');
    expect(html).not.toContain('SYNTHETIC LOCAL DEMONSTRATION');
    expect(html).not.toContain('Overall Delivery summary');
  });
});
