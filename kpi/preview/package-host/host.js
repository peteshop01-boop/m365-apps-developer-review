(async () => {
  'use strict';
  const config = await (await fetch('/package-host/config.json')).json();
  const params = new URLSearchParams(location.search);
  const role = params.get('role') || 'board';
  const fixture = params.get('fixture') || 'valid';
  if (!['valid', 'malformed', 'none'].includes(fixture)) throw new Error('Unknown synthetic fixture');
  const roles = { board: ['BoardReadOnly'], admin: ['Employee', 'Manager', 'SeniorManagerAdmin'], employee: ['Employee'],
    invalid: ['UnexpectedRole'], duplicate: ['BoardReadOnly', 'BoardReadOnly'], inactive: ['BoardReadOnly'] };
  if (!Object.hasOwn(roles, role)) throw new Error('Unknown synthetic actor');
  const actor = { id: -50, personKey: 'synthetic-package-actor', displayName: `Synthetic ${role} Actor`,
    email: 'actor@example.invalid', active: role !== 'inactive', appRoles: roles[role] };
  document.getElementById('lab-banner').textContent += ` · ${actor.displayName} · ${actor.appRoles.join(', ')}`;
  const fail = () => { throw new Error('SYNTHETIC PACKAGE HOST: no operational feed or write'); };
  const reads = { getPersonByEmail: async email => email === actor.email ? actor : undefined,
    getProductionConfig: fail, getReferenceCounts: fail, getWorkplanStatus: async () => 'NotStarted',
    getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [], getEmployeeWorkplanV2: async () => undefined,
    getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [], getAdminPeople: async () => [actor],
    getAdminTeams: async () => [], getAdminConfigRecords: async () => [], getManagerReviewContexts: async () => [],
    getManagerQuarterReviewContexts: async () => [], getQuarterTimingConfig: fail };
  const dataService = new Proxy(reads, { get(target, name) { return Object.hasOwn(target, name) ? target[name] : fail; } });
  const reportingDataset = fixture === 'none' ? undefined : await (await fetch(`/package-host/${fixture}-fixture.json`)).json();
  window.__KCF_PACKAGE_HOST_LAB__ = { syntheticReadOnly: true, dataService, reportingDataset,
    adminReportingDataService: { getAdminReportingControlSnapshot: fail } };
  const spHttpClient = new Proxy({}, { get: () => async () => { throw new Error('SPHttpClient is disabled in package host'); } });
  function BaseClientSideWebPart() { this.domElement = document.getElementById('package-root');
    this.context = { spHttpClient, pageContext: { web: { absoluteUrl: location.origin }, user: { email: actor.email, displayName: actor.displayName } } }; }
  define('@microsoft/sp-core-library', [], () => ({ Version: { parse: value => value } }));
  define('@microsoft/sp-property-pane', [], () => ({ PropertyPaneTextField: () => ({}) }));
  define('@microsoft/sp-webpart-base', [], () => ({ BaseClientSideWebPart }));
  define('@microsoft/sp-http', [], () => ({ SPHttpClient: { configurations: { v1: {} } } }));
  requirejs.config({ paths: { react: '/vendor/react', 'react-dom': '/vendor/react-dom',
    PerformanceHubWebPartStrings: config.strings.url.slice(0, -3), [config.moduleId]: config.entry.url.slice(0, -3) } });
  const module = await new Promise((resolve, reject) => requirejs([config.moduleId], resolve, reject));
  const WebPart = module.default || module;
  const part = new WebPart();
  await part.onInit();
  part.render();
  window.__KCF_PACKAGE_HOST_RESULT__ = { moduleId: config.moduleId, entryUrl: new URL(config.entry.url, location.href).href,
    packageSha256: config.packageSha256, rendered: Boolean(document.querySelector('[data-candidate]')) };
})().catch(error => { document.getElementById('host-error').textContent = String(error.stack || error); throw error; });
