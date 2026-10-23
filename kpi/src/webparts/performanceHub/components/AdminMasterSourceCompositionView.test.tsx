import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminMasterSourceCompositionView } from './AdminMasterSourceCompositionView';
describe('Admin source unavailable view', () => {
  it.each(['KPI Master', 'Strategic Core Coverage', 'Data Quality'])('shows explicit HOLD in %s', tab => {
    const html = renderToStaticMarkup(<AdminMasterSourceCompositionView tab={tab} result={{ status: 'HOLD', nativeAdmission: 'NOT_ADMITTED', reason: 'Historical mapping unavailable' }} />);
    expect(html).toContain('HOLD'); expect(html).toContain('Historical mapping unavailable'); expect(html).not.toContain('<table');
  });
});
