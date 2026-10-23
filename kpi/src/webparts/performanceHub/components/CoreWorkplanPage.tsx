import * as React from 'react';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import {
  buildCoreCatalogueView,
  clearCoreCatalogueFilters,
  coreWorkstreamKey,
  emptyCoreCatalogueFilters,
  getApprovedCurrentCoreCatalogue,
  getCorePillarOptions,
  getCoreWorkstreamOptions,
  hasCoreCatalogueFilters,
  readCoreCataloguePreference,
  reconcileCoreWorkstreams,
  writeCoreCataloguePreference
} from '../services/CoreCatalogueFiltering';
import { canSelectAnotherCoreKpi, coreNaturalKey, formatCoreSelectionCount, groupCoreCatalogue, validateCoreWeights } from '../services/CoreWorkplanValidation';
import { isEmployeeWorkplanEditable } from '../services/EmployeeWorkplanStatus';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';
import CoreKpiCatalogueRow from './CoreKpiCatalogueRow';
import { CoreWorkplanReadinessPanel } from './ReadinessPanel';
import { PerformanceConceptGuide } from './PerformancePresentation';

export interface ICoreWorkplanPageProps {
  catalogue: ICoreKpiCatalogueItem[];
  workplan: IAnnualWorkplan;
  items: ICoreWorkplanItem[];
  quarterItems?: IQuarterReviewItem[];
  saving: boolean;
  message?: string;
  onSave(items: ICoreWorkplanItem[]): Promise<void>;
}

const browserPreferenceStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

const CoreWorkplanPage: React.FC<ICoreWorkplanPageProps> = ({ catalogue, workplan, items, quarterItems = [], saving, message, onSave }) => {
  const [filters, setFilters] = React.useState(emptyCoreCatalogueFilters);
  const [draftItems, setDraftItems] = React.useState<ICoreWorkplanItem[]>(items);
  const [collapsedPillars, setCollapsedPillars] = React.useState<Set<string>>(new Set());
  const [collapsedWorkstreams, setCollapsedWorkstreams] = React.useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = React.useState(true);
  const [selectedSummaryExpanded, setSelectedSummaryExpanded] = React.useState(true);
  const [preferenceLoaded, setPreferenceLoaded] = React.useState(false);

  React.useEffect(() => setDraftItems(items), [items]);

  React.useEffect(() => {
    if (preferenceLoaded || catalogue.length === 0) return;
    setFilters(readCoreCataloguePreference(browserPreferenceStorage(), getApprovedCurrentCoreCatalogue(catalogue)));
    setPreferenceLoaded(true);
  }, [catalogue, preferenceLoaded]);

  React.useEffect(() => {
    if (!preferenceLoaded) return;
    writeCoreCataloguePreference(browserPreferenceStorage(), {
      search: '',
      pillars: filters.pillars,
      workstreams: filters.workstreams
    });
  }, [filters.pillars, filters.workstreams, preferenceLoaded]);

  const activeItems = draftItems.filter(item => item.activeInWorkplan);
  const approvedCurrentCatalogue = getApprovedCurrentCoreCatalogue(catalogue);
  const selectionLabel = formatCoreSelectionCount(activeItems.length);
  const selectedByKpi = new Map(activeItems.map(item => [item.kpiId, item]));
  const catalogueByKpi = new Map(approvedCurrentCatalogue.map(item => [item.kpiId, item]));
  const selectedCatalogue = activeItems.map(item => catalogueByKpi.get(item.kpiId) || ({
    kpiId: item.kpiId,
    kpiVersionKey: item.kpiVersionKey,
    targetVersionKey: item.targetVersionKey,
    wording: 'Selected KPI catalogue details are not currently available.',
    pillar: 'Selected KPI',
    workstream: 'Catalogue details unavailable',
    scoringDirection: 'TBC',
    unitLabel: 'TBC'
  } as ICoreKpiCatalogueItem));
  const catalogueView = buildCoreCatalogueView(approvedCurrentCatalogue, activeItems.map(item => item.kpiId), filters);
  const groups = groupCoreCatalogue(catalogueView.results);
  const pillarOptions = getCorePillarOptions(approvedCurrentCatalogue);
  const workstreamOptions = getCoreWorkstreamOptions(approvedCurrentCatalogue, filters.pillars);
  const weights = validateCoreWeights(draftItems);
  const editable = isEmployeeWorkplanEditable(workplan);
  const filtersActive = hasCoreCatalogueFilters(filters);

  const toggleSet = (current: Set<string>, key: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>): void => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const addKpi = (kpi: ICoreKpiCatalogueItem): void => {
    if (!editable || selectedByKpi.has(kpi.kpiId) || !canSelectAnotherCoreKpi(draftItems)) return;
    const existing = draftItems.find(item => item.kpiId === kpi.kpiId);
    if (existing) {
      setDraftItems(draftItems.map(item => item.kpiId === kpi.kpiId ? { ...item, activeInWorkplan: true } : item));
      return;
    }
    setDraftItems([...draftItems, {
      id: 0,
      etag: '',
      workplanItemKey: '',
      naturalKey: coreNaturalKey(workplan.workplanKey, kpi.kpiId),
      workplanKey: workplan.workplanKey,
      personKey: workplan.personKey,
      performanceYear: workplan.performanceYear,
      kpiId: kpi.kpiId,
      kpiVersionKey: kpi.kpiVersionKey,
      targetVersionKey: kpi.targetVersionKey,
      displayOrder: activeItems.length + 1,
      activeInWorkplan: true
    }]);
  };

  const updateItem = (kpiId: string, patch: Partial<ICoreWorkplanItem>): void =>
    setDraftItems(draftItems.map(item => item.kpiId === kpiId ? { ...item, ...patch } : item));

  const togglePillar = (pillar: string): void => setFilters(current => {
    const pillars = current.pillars.indexOf(pillar) >= 0
      ? current.pillars.filter(value => value !== pillar)
      : [...current.pillars, pillar];
    return {
      ...current,
      pillars,
      workstreams: reconcileCoreWorkstreams(approvedCurrentCatalogue, pillars, current.workstreams)
    };
  });

  const toggleWorkstream = (key: string): void => setFilters(current => ({
    ...current,
    workstreams: current.workstreams.indexOf(key) >= 0
      ? current.workstreams.filter(value => value !== key)
      : [...current.workstreams, key]
  }));

  const showAll = (): void => {
    setFilters(clearCoreCatalogueFilters());
    setCollapsedPillars(new Set());
    setCollapsedWorkstreams(new Set());
  };

  const save = (): void => {
    onSave(draftItems).catch(() => undefined);
  };

  const renderKpi = (kpi: ICoreKpiCatalogueItem): React.ReactElement => {
    const selected = selectedByKpi.get(kpi.kpiId);
    const currentResult = selected ? quarterItems.find(item => item.workplanItemKey === selected.workplanItemKey && item.itemType === 'CoreGold') : undefined;
    return <CoreKpiCatalogueRow
      key={kpi.kpiId}
      kpi={kpi}
      selected={selected}
      currentResult={currentResult}
      editable={editable}
      saving={saving}
      canAdd={canSelectAnotherCoreKpi(draftItems)}
      onAdd={() => addKpi(kpi)}
      onUpdate={patch => updateItem(kpi.kpiId, patch)}
    />;
  };

  return (
    <section className={styles.corePage} aria-labelledby="core-heading">
      <div className={styles.coreHeader}>
        <div><span className={styles.sectionLabel}>Annual Workplan · {workplan.state}</span><h2 id="core-heading">Core Strategy KPIs</h2><p>{editable ? <>Select any relevant KPI from the 109-item approved current Strategic Core catalogue, then set your annual Core Workplan weight and relationship role.</> : <>Review your selected Core KPIs and current-quarter results. Selection, weight, role and removal controls are locked.</>}</p></div>
        <button type="button" className={styles.saveButton} disabled={!editable || saving || weights.state === 'invalid'} onClick={save}>{saving ? 'Saving…' : editable ? 'Save Draft' : 'Read only'}</button>
      </div>

      {!editable && <div className={styles.readOnlyNotice}>{workplan.state} Workplan · this section is read-only while your manager reviews it. If changes are needed, your manager must use Request Changes; you can then amend and resubmit.</div>}

      <CoreWorkplanReadinessPanel workplan={workplan} selectedCount={activeItems.length} selectionLabel={selectionLabel} weightValidation={weights} />

      <ContextualHelp
        purpose="Core Strategy KPIs are organisation strategy measures that are relevant to your annual Workplan."
        actions={["Browse by Pillar and Workstream or use search.", "While editable, add or remove any relevant approved current Core KPI.", "Use the selected summary to review annual and applicable quarter targets, then reopen it to re-edit without losing values."]}
        fields={["KPI role describes how you contribute to delivery.", "Core Workplan Weight is your allocation within this section.", "Organisational GOLD weighting is separate, controlled centrally and is not edited here."]}
        next={editable ? 'Save the Draft, complete the other Workplan sections and submit when all checks pass.' : 'Your manager reviews the submitted selection. Request Changes is the controlled route back to employee editing.'}
        scoringNote="Core and Impact planning weights are not scores. Overall Delivery is calculated separately, and Behaviour ratings remain standalone assessments."
      />
      <PerformanceConceptGuide />

      {message && <div className={message.toLowerCase().includes('could not') ? styles.errorMessage : styles.successMessage} role="status">{message}</div>}

      <div className={styles.coreToolbar}>
        <label><span>Search KPI catalogue</span><input type="search" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Search KPI ID, wording, Pillar or Workstream" /></label>
        <div className={styles.coreCounters}>
          <span><strong>{selectionLabel}</strong><small>Strategic Core KPIs</small></span>
          <span className={styles[`${weights.state}Weight`]}><strong>{weights.total}</strong> / 100%<small>Total Core Weight</small></span>
        </div>
      </div>

      <section className={styles.coreFilters} aria-labelledby="core-filter-heading">
        <button type="button" className={styles.coreFilterToggle} aria-expanded={filtersExpanded} aria-controls="core-filter-options" onClick={() => setFiltersExpanded(!filtersExpanded)}>
          <span><strong id="core-filter-heading">Filter catalogue</strong><small>View preference only · your selected KPIs stay in the Workplan</small></span>
          <span>{filters.pillars.length + filters.workstreams.length} selected {filtersExpanded ? '−' : '＋'}</span>
        </button>
        {filtersExpanded && <div id="core-filter-options" className={styles.coreFilterBody}>
          <fieldset className={styles.coreFilterGroup}>
            <legend>Pillar <span>{filters.pillars.length} selected</span></legend>
            <div className={styles.coreFilterOptions}>
              {pillarOptions.map(pillar => <label className={styles.coreFilterOption} key={pillar}>
                <input type="checkbox" checked={filters.pillars.indexOf(pillar) >= 0} onChange={() => togglePillar(pillar)} />
                <span>{pillar}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className={styles.coreFilterGroup}>
            <legend>Workstream <span>{filters.workstreams.length} selected · {filters.pillars.length ? 'matching selected Pillars' : 'all Pillars'}</span></legend>
            <div className={styles.coreFilterOptions}>
              {workstreamOptions.map(option => <label className={styles.coreFilterOption} key={option.key}>
                <input type="checkbox" checked={filters.workstreams.indexOf(option.key) >= 0} onChange={() => toggleWorkstream(option.key)} />
                <span><strong>{option.name}</strong><small>{option.pillar}</small></span>
              </label>)}
            </div>
          </fieldset>
          <div className={styles.coreFilterActions}>
            <span aria-live="polite"><strong>{catalogueView.results.length}</strong> matching KPI{catalogueView.results.length === 1 ? '' : 's'} available to add</span>
            <button type="button" disabled={!filtersActive} onClick={showAll}>Clear filters</button>
          </div>
        </div>}
      </section>

      <p className={styles.weightMessage} data-state={weights.state}>{weights.message}</p>

      <section className={styles.selectedKpisPanel} aria-labelledby="selected-core-heading">
        <header><div><h3 id="selected-core-heading">Selected Core summary</h3><p>KPI, measure, annual target and applicable quarter targets are preserved when this summary is collapsed.</p></div><div className={styles.selectedKpisHeaderActions}><span aria-live="polite">{selectionLabel}</span><button type="button" aria-expanded={selectedSummaryExpanded} aria-controls="selected-core-content" onClick={() => setSelectedSummaryExpanded(!selectedSummaryExpanded)}>{selectedSummaryExpanded ? 'Collapse selected summary' : 'Reopen selected summary'}</button></div></header>
        {selectedSummaryExpanded && <div id="selected-core-content">
          {selectedCatalogue.length === 0
            ? <div className={styles.emptyState}>No Core KPIs selected yet. Use the filtered catalogue below to add one.</div>
            : <div className={styles.kpiRows}>{selectedCatalogue.map(renderKpi)}</div>}
        </div>}
      </section>

      <section className={styles.coreCataloguePanel} aria-labelledby="core-catalogue-heading">
        <header>
          <div><h3 id="core-catalogue-heading">Available KPI catalogue</h3><p>{catalogueView.results.length} of {Math.max(0, approvedCurrentCatalogue.length - catalogueView.selected.length)} approved current unselected KPIs shown</p></div>
          <button type="button" onClick={showAll} disabled={!filtersActive}>Show all</button>
        </header>
        {groups.length === 0 ? <div className={styles.emptyState}>{filtersActive ? 'No available Core KPIs match the selected filters. Your selected KPIs remain above.' : 'All available Core KPIs are already selected.'}</div> : groups.map(pillar => {
          const pillarCollapsed = collapsedPillars.has(pillar.name);
          return <section className={styles.pillarGroup} key={pillar.name}>
            <button type="button" className={styles.groupToggle} aria-expanded={!pillarCollapsed} onClick={() => toggleSet(collapsedPillars, pillar.name, setCollapsedPillars)}><span>{pillarCollapsed ? '＋' : '−'}</span><strong>{pillar.name}</strong><small>{pillar.workstreams.reduce((sum, workstream) => sum + workstream.items.length, 0)} KPI(s)</small></button>
            {!pillarCollapsed && pillar.workstreams.map(workstream => {
              const workstreamKey = coreWorkstreamKey(pillar.name, workstream.name);
              const workstreamCollapsed = collapsedWorkstreams.has(workstreamKey);
              return <div className={styles.workstreamGroup} key={workstreamKey}>
                <button type="button" className={styles.workstreamToggle} aria-expanded={!workstreamCollapsed} onClick={() => toggleSet(collapsedWorkstreams, workstreamKey, setCollapsedWorkstreams)}><span>{workstreamCollapsed ? '＋' : '−'}</span><strong>{workstream.name}</strong><small>{workstream.items.length}</small></button>
                {!workstreamCollapsed && <div className={styles.kpiRows}>{workstream.items.map(renderKpi)}</div>}
              </div>;
            })}
          </section>;
        })}
      </section>
    </section>
  );
};

export default CoreWorkplanPage;
