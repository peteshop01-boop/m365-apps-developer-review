import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import ContextualHelp from './ContextualHelp';
import { BehaviourBuilder } from './IntegratedPerformanceHub';
import { EMPLOYEE_V2_APPROVED_BEHAVIOURS } from '../services/EmployeeWorkplanV2ApprovedBehaviours';

describe('PM44 Sponsor guidance and Behaviour summary', () => {
  it('gives all five governed V1 Behaviours a concise cue for each full prompt', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<BehaviourBuilder choices={[]} objectives={[]}
      behaviourV2={false} onChange={() => undefined} />);
    expect((html.match(/aria-label="[^"]+ focus cues"/g) || [])).toHaveLength(5);
    for (const behaviour of EMPLOYEE_V2_APPROVED_BEHAVIOURS) {
      expect(html).toContain(behaviour.title);
      expect(behaviour.prompts).toHaveLength(5);
    }
    expect(html).toContain('Behaviour Guide');
    expect(html).toContain('Share openly');
    expect(html).toContain('Learn from results');
  });

  it('uses one information icon and clear Guide heading', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<ContextualHelp heading="Core Guide"
      purpose="Purpose" actions={['Action']} fields={['Field']} next="Next" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ⓘ');
    expect(html).toContain('Core Guide');
  });
});
