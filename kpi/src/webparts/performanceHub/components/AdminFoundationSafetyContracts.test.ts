export {};

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

const source = (name: string): string => readFileSync(
  resolve('.', 'src', 'webparts', 'performanceHub', 'components', name),
  'utf8'
);

describe('KCF-KPI-020A Admin UI safety and responsive contracts', () => {
  it('keeps the UAT harness synthetic, browser-memory only and disconnected from SharePoint/network services', () => {
    const harness = source('AdminFoundationUatHarness.tsx');
    expect(harness).toContain("createAdminPeopleUatState(buildAdminUatPeople())");
    expect(harness).toContain('createAdminTeamsUatState([])');
    expect(harness).toContain('Synthetic Admin data only');
    expect(harness).toContain('Production lists, permissions, flows and notifications are untouched');
    expect(harness).not.toMatch(/SharePointProductionDataService|SPHttpClient|fetch\s*\(|postJson|mergeJson|deleteJson/);
  });

  it('guards the production load effect before any data-service call in Admin UAT', () => {
    const hub = source('PerformanceHub.tsx');
    const guard = hub.indexOf('if (adminUatMode)');
    const firstProductionLoad = hub.indexOf('loadProductionOverview(dataService');
    expect(guard).toBeGreaterThan(-1);
    expect(firstProductionLoad).toBeGreaterThan(guard);
  });

  it('uses a compact card/detail layout and collapses all wide Admin grids at phone width', () => {
    const scss = source('AdminFoundationPage.module.scss');
    expect(scss).toMatch(/max-width:\s*1440px/);
    expect(scss).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(scss).toMatch(/\.twoColumn\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(scss).toMatch(/\.attentionGrid,\s*\.formGrid,\s*\.filterGrid,\s*\.configGroups article,\s*\.issueList dl\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
    expect(scss).toMatch(/min-height:\s*44px/);
    expect(scss).toMatch(/overflow-x:\s*auto/);
    expect(scss).toMatch(/\.identityBar > span,\s*\.identityBar strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(scss).toMatch(/\.identityBar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('contains no hard-coded KCF employee or Team names in the Admin hierarchy/UI implementation', () => {
    const combined = [
      source('AdminFoundationPage.tsx'),
      source('AdminFoundationUatHarness.tsx')
    ].join('\n');
    expect(combined).not.toMatch(/Synthetic Person 01|Synthetic Person 25|Synthetic Person 02|Kent Cricket (?:Team|Department)/i);
    expect(combined).toContain('Derived from People.ManagerPersonKey');
    expect(combined).toContain('No KCF names or Teams are inferred');
  });

  it('routes weighting and Reporting Map work to the separately controlled area without a fake inline link', () => {
    const page = source('AdminFoundationPage.tsx');
    expect(page).toContain('Separate controlled area:');
    expect(page).toContain('use Reporting Control for organisational weighting');
    expect(page).not.toMatch(/href=["'][^"']*(?:weight|reporting)/i);
  });
});
