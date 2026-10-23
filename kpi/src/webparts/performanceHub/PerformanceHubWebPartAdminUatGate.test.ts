/** @jest-environment jsdom */

jest.mock('@microsoft/sp-webpart-base', () => ({
  BaseClientSideWebPart: class {
    public context: unknown;
  }
}));
jest.mock('@microsoft/sp-core-library', () => ({
  Version: { parse: (value: string): string => value }
}));
jest.mock('@microsoft/sp-http', () => ({
  SPHttpClient: { configurations: { v1: {} } }
}));
jest.mock('@microsoft/sp-property-pane', () => ({
  PropertyPaneTextField: (): object => ({})
}));
jest.mock('PerformanceHubWebPartStrings', () => ({
  PropertyPaneDescription: 'test', BasicGroupName: 'test', DescriptionFieldLabel: 'test'
}), { virtual: true });
jest.mock('./services/SharePointProductionDataService', () => ({
  __esModule: true,
  default: class {}
}));

import PerformanceHubWebPart from './PerformanceHubWebPart';

interface IAdminGateTestable {
  isAdminUatMode(): boolean;
  isAdminReportingUatMode(): boolean;
  isStrategicCoreCoverageUatMode(): boolean;
  isStrategicCoreCoverageBusinessUatMode(): boolean;
}

const KCF_AUTOMATION = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const Sponsor = 'person003@example.invalid';
const MANIFEST_4321 = 'https://localhost:4321/temp/build/manifests.js';
const MANIFEST_4323 = 'https://localhost:4323/temp/build/manifests.js';
const MANIFEST_4326 = 'https://localhost:4326/temp/build/manifests.js';
const MANIFEST_025 = 'https://localhost:4321/temp/build/manifests.js?kcf-kpi-025=1';
const MANIFEST_025_R1 = 'https://localhost:4329/temp/build/manifests.js';
const MARKER_025_R1 = 'KCF-KPI-025-R1-BOUNDED-QA-4329';
const MARKER_025_R2 = 'KCF-KPI-025-R2-Sponsor-BUSINESS-UAT-4329';

const query = (manifest: string = MANIFEST_4323, flag: string = 'true', debug: string = 'true'): string => {
  const parameters = new URLSearchParams({
    kcfKpi020AdminUat: flag,
    debug,
    debugManifestsFile: manifest
  });
  return `/?${parameters.toString()}`;
};

const evaluate = (
  path: string,
  site: string = KCF_AUTOMATION,
  email: string = Sponsor
): boolean => {
  window.history.replaceState({}, '', path);
  const webPart = new PerformanceHubWebPart();
  Object.defineProperty(webPart, 'context', {
    configurable: true,
    value: { pageContext: { web: { absoluteUrl: site }, user: { email } } }
  });
  return (webPart as unknown as IAdminGateTestable).isAdminUatMode();
};

const evaluate020b = (
  path: string,
  site: string = KCF_AUTOMATION,
  email: string = Sponsor
): boolean => {
  window.history.replaceState({}, '', path);
  const webPart = new PerformanceHubWebPart();
  Object.defineProperty(webPart, 'context', {
    configurable: true,
    value: { pageContext: { web: { absoluteUrl: site }, user: { email } } }
  });
  return (webPart as unknown as IAdminGateTestable).isAdminReportingUatMode();
};

const evaluate025 = (
  path: string,
  site: string = KCF_AUTOMATION,
  email: string = Sponsor
): boolean => {
  window.history.replaceState({}, '', path);
  const webPart = new PerformanceHubWebPart();
  Object.defineProperty(webPart, 'context', {
    configurable: true,
    value: { pageContext: { web: { absoluteUrl: site }, user: { email } } }
  });
  return (webPart as unknown as IAdminGateTestable).isStrategicCoreCoverageUatMode();
};

const evaluate025Business = (
  path: string,
  site: string = KCF_AUTOMATION,
  email: string = Sponsor
): boolean => {
  window.history.replaceState({}, '', path);
  const webPart = new PerformanceHubWebPart();
  Object.defineProperty(webPart, 'context', {
    configurable: true,
    value: { pageContext: { web: { absoluteUrl: site }, user: { email } } }
  });
  return (webPart as unknown as IAdminGateTestable).isStrategicCoreCoverageBusinessUatMode();
};

describe('KCF-KPI-020A exact safe Admin UAT gate', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it.each([MANIFEST_4321, MANIFEST_4323])(
    'accepts the explicit flag only on REVIEW-TEST-SITE for Sponsor with debug and trusted manifest %s',
    manifest => {
      expect(evaluate(query(manifest))).toBe(true);
      expect(evaluate(
        query(manifest.toUpperCase()),
        KCF_AUTOMATION.toUpperCase(),
        `  ${Sponsor.toUpperCase()}  `
      )).toBe(true);
    }
  );

  it.each([
    ['missing flag', `/?debug=true&debugManifestsFile=${encodeURIComponent(MANIFEST_4323)}`, KCF_AUTOMATION, Sponsor],
    ['false flag', query(MANIFEST_4323, 'false'), KCF_AUTOMATION, Sponsor],
    ['debug disabled', query(MANIFEST_4323, 'true', 'false'), KCF_AUTOMATION, Sponsor],
    ['wrong site', query(), 'https://example.invalid/sites/another-site', Sponsor],
    ['wrong user', query(), KCF_AUTOMATION, 'person008@example.invalid'],
    ['non-local manifest', query('https://example.invalid/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['localhost wrong port', query('https://localhost:4444/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['localhost insecure protocol', query('http://localhost:4323/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['localhost wrong path', query('https://localhost:4323/temp/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['lookalike localhost host', query('https://localhost.example.invalid:4323/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor]
  ])('rejects %s', (_name, path, site, email) => {
    expect(evaluate(path, site, email)).toBe(false);
  });
});

describe('KCF-KPI-020B exact safe Admin Reporting UAT gate', () => {
  const reportingQuery = (
    manifest: string = MANIFEST_4321,
    flag: string = 'true',
    debug: string = 'true'
  ): string => {
    const parameters = new URLSearchParams({
      kcfKpi020bAdminUat: flag,
      debug,
      debugManifestsFile: manifest
    });
    return `/?${parameters.toString()}`;
  };

  afterEach(() => window.history.replaceState({}, '', '/'));

  it.each([MANIFEST_4321, MANIFEST_4326])(
    'accepts only the exact REVIEW-TEST-SITE/Sponsor/debug trusted 020B manifest %s',
    manifest => {
      expect(evaluate020b(reportingQuery(manifest))).toBe(true);
      expect(evaluate020b(
        reportingQuery(manifest.toUpperCase()),
        KCF_AUTOMATION.toUpperCase(),
        ` ${Sponsor.toUpperCase()} `
      )).toBe(true);
    }
  );

  it.each([
    ['missing flag', `/?debug=true&debugManifestsFile=${encodeURIComponent(MANIFEST_4321)}`, KCF_AUTOMATION, Sponsor],
    ['false flag', reportingQuery(MANIFEST_4321, 'false'), KCF_AUTOMATION, Sponsor],
    ['debug disabled', reportingQuery(MANIFEST_4321, 'true', 'false'), KCF_AUTOMATION, Sponsor],
    ['wrong site', reportingQuery(), 'https://example.invalid/sites/another-site', Sponsor],
    ['wrong user', reportingQuery(), KCF_AUTOMATION, 'person008@example.invalid'],
    ['020A temporary port', reportingQuery(MANIFEST_4323), KCF_AUTOMATION, Sponsor],
    ['wrong local port', reportingQuery('https://localhost:4327/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['wrong host', reportingQuery('https://example.invalid/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['insecure protocol', reportingQuery('http://localhost:4321/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['wrong path', reportingQuery('https://localhost:4321/temp/manifests.js'), KCF_AUTOMATION, Sponsor]
  ])('rejects %s', (_name, path, site, email) => {
    expect(evaluate020b(path, site, email)).toBe(false);
  });
});

describe('KCF-KPI-025 exact safe Strategic Core coverage UAT gate', () => {
  const coverageQuery = (
    manifest: string = MANIFEST_025,
    flag: string = 'true',
    debug: string = 'true',
    r1Marker?: string
  ): string => {
    const parameters = new URLSearchParams({
      kcfKpi025CoverageUat: flag,
      debug,
      debugManifestsFile: manifest
    });
    if (r1Marker !== undefined) {
      parameters.set('kcfKpi025R1', r1Marker);
    }
    return `/?${parameters.toString()}`;
  };

  afterEach(() => window.history.replaceState({}, '', '/'));

  it.each([
    [MANIFEST_025, undefined],
    [MANIFEST_025_R1, MARKER_025_R1]
  ])(
    'accepts only the exact REVIEW-TEST-SITE/Sponsor/debug trusted 025 manifest %s',
    (manifest, marker) => {
      expect(evaluate025(coverageQuery(manifest, 'true', 'true', marker))).toBe(true);
      expect(evaluate025(
        coverageQuery(manifest.toUpperCase(), 'true', 'true', marker),
        KCF_AUTOMATION.toUpperCase(),
        ` ${Sponsor.toUpperCase()} `
      )).toBe(true);
    }
  );

  it.each([
    ['missing flag', `/?debug=true&debugManifestsFile=${encodeURIComponent(MANIFEST_025)}`, KCF_AUTOMATION, Sponsor],
    ['false flag', coverageQuery(MANIFEST_025, 'false'), KCF_AUTOMATION, Sponsor],
    ['debug disabled', coverageQuery(MANIFEST_025, 'true', 'false'), KCF_AUTOMATION, Sponsor],
    ['wrong site', coverageQuery(), 'https://example.invalid/sites/another-site', Sponsor],
    ['wrong user', coverageQuery(), KCF_AUTOMATION, 'person008@example.invalid'],
    ['020B port', coverageQuery(MANIFEST_4326), KCF_AUTOMATION, Sponsor],
    ['wrong host', coverageQuery('https://example.invalid/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['insecure protocol', coverageQuery('http://localhost:4321/temp/build/manifests.js?kcf-kpi-025=1'), KCF_AUTOMATION, Sponsor],
    ['024 port', coverageQuery('https://localhost:4327/temp/build/manifests.js?kcf-kpi-025=1'), KCF_AUTOMATION, Sponsor],
    ['missing exact cache key', coverageQuery('https://localhost:4321/temp/build/manifests.js'), KCF_AUTOMATION, Sponsor],
    ['R1 missing exact marker', coverageQuery(MANIFEST_025_R1), KCF_AUTOMATION, Sponsor],
    ['R1 wrong marker', coverageQuery(MANIFEST_025_R1, 'true', 'true', 'wrong'), KCF_AUTOMATION, Sponsor],
    ['wrong path', coverageQuery('https://localhost:4321/temp/manifests.js?kcf-kpi-025=1'), KCF_AUTOMATION, Sponsor]
  ])('rejects %s', (_name, path, site, email) => {
    expect(evaluate025(path, site, email)).toBe(false);
  });
});

describe('KCF-KPI-025-R2 exact Sponsor business-UAT gate', () => {
  const businessQuery = (
    manifest: string = MANIFEST_025_R1,
    flag: string = 'true',
    marker: string = MARKER_025_R2,
    debug: string = 'true'
  ): string => `/?${new URLSearchParams({
    kcfKpi025BusinessUat: flag,
    kcfKpi025R2: marker,
    debug,
    debugManifestsFile: manifest
  }).toString()}`;

  afterEach(() => window.history.replaceState({}, '', '/'));

  it('accepts only Sponsor on REVIEW-TEST-SITE with the exact 4329 manifest and R2 marker', () => {
    expect(evaluate025Business(businessQuery())).toBe(true);
    expect(evaluate025Business(businessQuery(MANIFEST_025_R1.toUpperCase()),
      KCF_AUTOMATION.toUpperCase(), ` ${Sponsor.toUpperCase()} `)).toBe(true);
  });

  it.each([
    ['missing flag', businessQuery(MANIFEST_025_R1, 'false'), KCF_AUTOMATION, Sponsor],
    ['wrong marker', businessQuery(MANIFEST_025_R1, 'true', MARKER_025_R1), KCF_AUTOMATION, Sponsor],
    ['debug disabled', businessQuery(MANIFEST_025_R1, 'true', MARKER_025_R2, 'false'), KCF_AUTOMATION, Sponsor],
    ['wrong manifest', businessQuery(MANIFEST_025), KCF_AUTOMATION, Sponsor],
    ['wrong site', businessQuery(), 'https://example.invalid/sites/other', Sponsor],
    ['wrong user', businessQuery(), KCF_AUTOMATION, 'person009@example.invalid']
  ])('rejects %s', (_name, path, site, email) => {
    expect(evaluate025Business(path, site, email)).toBe(false);
  });
});
