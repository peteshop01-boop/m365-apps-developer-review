(function () {
  'use strict';

  const NOTICE = 'LOCAL PREVIEW — SESSION ONLY — NOT CONNECTED TO SHAREPOINT — NO REAL DATA SAVED';
  const main = document.getElementById('preview-main');
  const PERIODS = [['annual', 'Annual'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4']];
  const BEHAVIOURS = [
    { id: 'BHV-01', title: 'Work as One Team', value: 'We unite as one Club', suggestions: ['Contribute to cross-team delivery', 'Give reliable handovers', 'Share useful knowledge', 'Support a colleague commitment', 'Resolve a shared blocker'] },
    { id: 'BHV-02', title: 'Improve and Move Forward', value: 'We build the next chapter', suggestions: ['Implement a practical improvement', 'Use feedback to improve delivery', 'Learn and apply a useful skill', 'Reduce avoidable rework', 'Test a better way of working'] },
    { id: 'BHV-03', title: 'Show Respect and Listen', value: 'We respect the game and each other', suggestions: ['Make meetings inclusive', 'Listen and respond to feedback', 'Communicate clearly and on time', 'Make information accessible', 'Handle disagreement constructively'] },
    { id: 'BHV-04', title: 'Bring Energy and Commitment', value: 'We work & play with energy', suggestions: ['Deliver agreed commitments reliably', 'Keep momentum visible', 'Act early on delivery risks', 'Support an agreed peak period', 'Take initiative on a useful task'] },
    { id: 'BHV-05', title: 'Own It and Put It Right', value: 'We take responsibility', suggestions: ['Close owned corrective actions', 'Raise issues early with a proposed action', 'Own and correct an error', 'Maintain accurate records', 'Clarify ownership and decisions'] }
  ].map(item => ({ ...item, suggestions: item.suggestions.map((title, index) => ({ key: `${item.id}-OBJ-0${index + 1}`, title })) }));
  const state = {
    screen: 'employee', step: 'core', catalogue: [], core: new Map(), editingCore: null, search: '', pillars: [], workstreams: [], message: '',
    personal: [], editingPersonal: null, nextPersonal: 1,
    behaviours: BEHAVIOURS.map(item => ({ ...item, selectedSuggestionKeys: [], customObjective: '', q1: '', q2: '', q3: '', q4: '', targetRating: 3, weight: 20 })),
    category: { core: 70, personal: 20, behaviours: 10 }, zeroPersonalReason: ''
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const coreRows = () => Array.from(state.core.values());
  const currentLabel = screen => screen === 'employee' ? 'Employee' : screen === 'build' ? 'Build My Workplan' : 'My Workplan';
  const roleLabel = role => role === 'Owner' ? 'I own this KPI' : role === 'Delivery' ? 'I deliver this KPI' : role === 'Support' ? 'I support / oversee this KPI' : 'Role not chosen';
  const navMarkup = () => `<nav class="journey-nav" aria-label="Employee Workplan journey">${['employee', 'build', 'workplan'].map(screen => `<button type="button" data-nav="${screen}" ${state.screen === screen ? 'aria-current="page"' : ''}>${currentLabel(screen)}</button>`).join('')}</nav>`;
  const hero = (eyebrow, title, copy) => `<header class="hero"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></header>`;
  const footer = () => `<p class="footer-note">${NOTICE}. Refreshing the page clears this preview session.</p>`;
  const selectedSuggestionTitles = item => item.selectedSuggestionKeys.map(key => item.suggestions.find(suggestion => suggestion.key === key)?.title).filter(Boolean);
  const objectiveFor = item => [...selectedSuggestionTitles(item), item.customObjective.trim()].filter(Boolean).join('; ');
  const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);
  const completePeriods = item => PERIODS.every(([key]) => String(item[key] || '').trim());
  const personalComplete = item => ['title', 'measure', 'unit', 'success'].every(key => String(item[key] || '').trim()) && completePeriods(item);
  const behaviourComplete = item => objectiveFor(item).trim() && ['q1', 'q2', 'q3', 'q4'].every(key => item[key].trim()) && [1, 2, 3, 4].includes(Number(item.targetRating));

  function rebalance(items) {
    if (!items.length) return;
    const each = Math.floor(100 / items.length);
    items.forEach((item, index) => { item.weight = index === items.length - 1 ? 100 - (each * (items.length - 1)) : each; });
  }

  function readinessBlockers() {
    const blockers = [];
    const core = coreRows();
    if (!core.length) blockers.push('Add at least one Core KPI.');
    if (core.some(item => !item.role || !completePeriods(item))) blockers.push('Complete the role and Annual/Q1–Q4 contribution for every Core KPI.');
    if (state.personal.length > 5) blockers.push('Personal KPIs cannot exceed five.');
    if (state.personal.some(item => !personalComplete(item))) blockers.push('Complete the title, measure, unit, success wording and Annual/Q1–Q4 values for every Personal KPI.');
    if (state.personal.length && sum(state.personal.map(item => item.weight)) !== 100) blockers.push('Personal item weighting must total exactly 100%.');
    if (state.behaviours.filter(behaviourComplete).length !== 5) blockers.push('Configure an objective and Q1–Q4 commitments for all five KCF Behaviours.');
    if (state.behaviours.some(item => Number(item.weight) !== 20) || sum(state.behaviours.map(item => item.weight)) !== 100) blockers.push('Each Behaviour must be 20%, totalling exactly 100%.');
    if (sum(Object.values(state.category)) !== 100) blockers.push('Core, Personal and Behaviour category weights must total exactly 100%.');
    if (!state.personal.length && state.category.personal !== 0) blockers.push('Set Personal to 0% when the Workplan has no Personal KPI.');
    if (!state.personal.length && state.category.personal === 0 && !state.zeroPersonalReason.trim()) blockers.push('Record why the governed no-Personal proposal is appropriate.');
    if (state.personal.length && state.category.personal === 0) blockers.push('Personal category weight cannot be 0% while Personal KPIs are present.');
    return blockers;
  }

  function syncNavigation() {
    document.querySelectorAll('[data-nav]').forEach(button => {
      if (button.dataset.nav === state.screen) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function renderEmployee() {
    const ready = readinessBlockers().length === 0;
    main.innerHTML = `${navMarkup()}${hero('Employee', 'Welcome to your Workplan preview', 'Build a complete session-only Workplan across Core KPIs, Personal KPIs, Behaviours and Review & Weight, then read it back in My Workplan.')}
      <div class="metric-grid">
        <article class="metric-card"><strong>${ready ? 'Ready to review' : coreRows().length || state.personal.length ? 'In progress' : 'Not started'}</strong><span>My Workplan</span></article>
        <article class="metric-card"><strong>${state.catalogue.length}</strong><span>Controlled Core KPIs</span></article>
        <article class="metric-card"><strong>${state.personal.length} / 5</strong><span>Personal KPIs</span></article>
        <article class="metric-card"><strong>${state.behaviours.filter(behaviourComplete).length} / 5</strong><span>Behaviours configured</span></article>
      </div>
      <div class="quick-actions"><button class="primary" type="button" data-nav="build">Build My Workplan</button><button class="secondary" type="button" data-nav="workplan">Open My Workplan</button></div>
      <section class="truth-card"><strong>This is a safe local preview.</strong><span>There is no signed-in employee, approval, submission or SharePoint save behind these screens.</span></section>${footer()}`;
  }

  const workplanSteps = () => `<nav class="workplan-steps" aria-label="Build My Workplan steps">
    <button type="button" data-workplan-step="core" aria-pressed="${state.step === 'core'}"><span>1</span>Core KPIs</button>
    <button type="button" data-workplan-step="personal" aria-pressed="${state.step === 'personal'}"><span>2</span>Personal KPIs</button>
    <button type="button" data-workplan-step="behaviours" aria-pressed="${state.step === 'behaviours'}"><span>3</span>Behaviours</button>
    <button type="button" data-workplan-step="review" aria-pressed="${state.step === 'review'}"><span>4</span>Review &amp; Weight</button>
  </nav>`;

  const targetMarkup = row => `<div class="target-grid"><div><span>Annual target</span><strong>${escapeHtml(row.annualTarget)} ${escapeHtml(row.unit)}</strong></div>${row.quarters.map((value, index) => `<div><span>Q${index + 1}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>`;
  const periodInputs = (item, attribute, id) => `<div class="contribution-grid">${PERIODS.map(([key, label]) => `<label class="field"><span>${label}</span><input type="text" inputmode="decimal" ${attribute}="${key}" data-item-id="${escapeHtml(id)}" value="${escapeHtml(item[key])}" aria-label="${label}"></label>`).join('')}</div>`;
  const readbackGrid = (item, suffix) => `<div class="readback-grid">${PERIODS.map(([key, label]) => `<div><span>${label}${suffix}</span><strong>${escapeHtml(item[key] || '—')}</strong></div>`).join('')}</div>`;

  function catalogueCard(row) {
    return `<article class="kpi-card" data-kpi-id="${escapeHtml(row.id)}"><header><span class="kpi-id">${escapeHtml(row.id)}</span><button class="add-button" type="button" data-add="${escapeHtml(row.id)}">Add</button></header><h3>${escapeHtml(row.wording)}</h3><p class="meta">${escapeHtml(row.pillar)}<br>${escapeHtml(row.workstream)}</p>${targetMarkup(row)}</article>`;
  }

  const pillarCode = pillar => String(pillar).replace(/^SO(\d+)\b.*$/, (_match, number) => `S0${number}`);
  const pillarName = pillar => String(pillar).replace(/^SO\d+\s*[–-]\s*/, '');
  const workstreamKey = row => `${row.pillar}|${row.workstream}`;

  function selectedCoreCard(item) {
    const editing = state.editingCore === item.id;
    return `<article class="selected-card" data-selected-kpi="${escapeHtml(item.id)}"><header><div><span class="kpi-id">${escapeHtml(item.id)}</span><h3>${escapeHtml(item.wording)}</h3></div><button class="secondary" type="button" data-edit="${escapeHtml(item.id)}">${editing ? 'Close editor' : 'Edit'}</button></header><p class="relationship">${roleLabel(item.role)}</p>
      ${editing ? `<div class="editor"><fieldset><legend>My role / delivery relationship</legend><div class="role-options">${['Owner', 'Delivery', 'Support'].map(role => `<button type="button" data-role="${role}" data-kpi="${escapeHtml(item.id)}" aria-pressed="${item.role === role}">${role === 'Owner' ? 'I OWN THIS' : role === 'Delivery' ? 'I DELIVER THIS' : 'I SUPPORT / OVERSEE THIS'}</button>`).join('')}</div></fieldset>${periodInputs(item, 'data-contribution', item.id)}<div class="editor-actions"><button class="primary" type="button" data-save-session="${escapeHtml(item.id)}">Save changes for this session</button><button class="danger" type="button" data-remove="${escapeHtml(item.id)}">Remove from Workplan</button></div></div>` : readbackGrid(item, '')}</article>`;
  }

  function renderCoreStep() {
    const selectedIds = new Set(state.core.keys());
    const term = state.search.trim().toLowerCase();
    const pillarValues = Array.from(new Set(state.catalogue.map(row => row.pillar))).sort();
    const workstreamOptions = state.catalogue.filter(row => !state.pillars.length || state.pillars.includes(row.pillar))
      .map(row => ({ key: workstreamKey(row), pillar: row.pillar, workstream: row.workstream }))
      .filter((option, index, rows) => rows.findIndex(candidate => candidate.key === option.key) === index)
      .sort((left, right) => left.key.localeCompare(right.key));
    state.workstreams = state.workstreams.filter(key => workstreamOptions.some(option => option.key === key));
    const available = state.catalogue.filter(row => !selectedIds.has(row.id)
      && (!state.pillars.length || state.pillars.includes(row.pillar))
      && (!state.workstreams.length || state.workstreams.includes(workstreamKey(row)))
      && (!term || [row.id, row.wording, row.pillar, row.workstream].some(value => value.toLowerCase().includes(term))));
    return `<div class="build-grid" data-preview-section="core">
      <section class="panel" aria-labelledby="catalogue-heading"><header class="panel-header"><div><span class="eyebrow">Controlled catalogue</span><h2 id="catalogue-heading">Choose Core KPIs</h2></div><span class="count-pill" data-count="available">${state.catalogue.length - selectedIds.size} available</span></header>
        <fieldset class="filter-group"><legend>Pillars</legend><div class="pillar-grid">${pillarValues.map(pillar => `<button type="button" data-pillar-filter="${escapeHtml(pillar)}" aria-pressed="${state.pillars.includes(pillar)}"><strong>${escapeHtml(pillarCode(pillar))}</strong><span>${escapeHtml(pillarName(pillar))}</span></button>`).join('')}</div></fieldset>
        <fieldset class="filter-group"><legend>Workstreams</legend><div class="workstream-grid">${workstreamOptions.map(option => `<label><input type="checkbox" data-workstream-filter="${escapeHtml(option.key)}" ${state.workstreams.includes(option.key) ? 'checked' : ''}><span>${escapeHtml(option.workstream)}<small>${escapeHtml(pillarCode(option.pillar))}</small></span></label>`).join('')}</div></fieldset>
        <label class="search-label"><span>Search by KPI ID, wording, pillar or workstream</span><input type="search" id="catalogue-search" value="${escapeHtml(state.search)}" placeholder="Try SO1-001 or schools"></label>
        <div class="filter-actions"><span><strong>${available.length}</strong> matching KPI${available.length === 1 ? '' : 's'}</span><button class="secondary" type="button" data-clear-filters>Clear filters</button><button class="secondary" type="button" data-show-all>Show all</button></div>
        <div class="catalogue-grid" aria-label="Available Core KPI catalogue">${available.map(catalogueCard).join('') || '<div class="empty-card">No available Core KPIs match this search.</div>'}</div>
      </section>
      <aside class="panel selected-panel" aria-labelledby="selected-heading"><header class="panel-header"><div><span class="eyebrow">My Workplan</span><h2 id="selected-heading">Selected Core</h2></div><span class="count-pill" data-count="selected">${selectedIds.size} selected</span></header>
        ${state.message ? `<p class="status-line" role="status">${escapeHtml(state.message)}</p>` : ''}<div class="selected-stack">${coreRows().map(selectedCoreCard).join('') || '<div class="empty-card">No Core KPIs selected. Use Add in the catalogue.</div>'}</div>
      </aside>
    </div>`;
  }

  const personalField = (item, key, label, textarea) => `<label class="field"><span>${label}</span>${textarea ? `<textarea rows="2" data-personal-field="${key}" data-personal-id="${item.id}">${escapeHtml(item[key])}</textarea>` : `<input type="text" data-personal-field="${key}" data-personal-id="${item.id}" value="${escapeHtml(item[key])}">`}</label>`;

  function personalCard(item) {
    const editing = state.editingPersonal === item.id;
    return `<article class="selected-card" data-personal-card="${item.id}"><header><div><span class="kpi-id">${item.id}</span><h3>${escapeHtml(item.title || 'New Personal KPI')}</h3></div><button class="secondary" type="button" data-personal-edit="${item.id}">${editing ? 'Close editor' : 'Edit'}</button></header>
      ${editing ? `<div class="editor"><div class="form-grid">${personalField(item, 'title', 'Personal KPI title', false)}${personalField(item, 'measure', 'Measure', false)}${personalField(item, 'unit', 'Unit', false)}${personalField(item, 'success', 'Success wording', true)}</div>${periodInputs(item, 'data-personal-period', item.id)}<label class="field weight-field"><span>Personal item weight %</span><input type="number" min="0" max="100" data-personal-field="weight" data-personal-id="${item.id}" value="${item.weight}"></label><div class="editor-actions"><button class="primary" type="button" data-personal-save="${item.id}">Save changes for this session</button><button class="danger" type="button" data-personal-remove="${item.id}">Remove Personal KPI</button></div></div>` : `<p class="meta"><strong>Measure:</strong> ${escapeHtml(item.measure || '—')} · <strong>Unit:</strong> ${escapeHtml(item.unit || '—')} · <strong>Weight:</strong> ${item.weight}%</p><p>${escapeHtml(item.success || 'Success wording not entered.')}</p>${readbackGrid(item, '')}`}</article>`;
  }

  function renderPersonalStep() {
    const atLimit = state.personal.length >= 5;
    return `<section class="panel" data-preview-section="personal"><header class="panel-header"><div><span class="eyebrow">Your role-specific contribution</span><h2>Personal KPIs</h2><p>Create up to five personal commitments with measurable Annual and Q1–Q4 values.</p></div><span class="count-pill">${state.personal.length} / 5</span></header>
      <div class="quick-actions"><button class="primary" type="button" data-add-personal ${atLimit ? 'disabled' : ''}>Add Personal KPI</button></div>${atLimit ? '<p class="status-line" role="status">Maximum five Personal KPIs reached. Remove one before adding another.</p>' : ''}${state.message ? `<p class="status-line" role="status">${escapeHtml(state.message)}</p>` : ''}
      <div class="selected-stack section-stack">${state.personal.map(personalCard).join('') || '<div class="empty-card">No Personal KPI has been added. Review & Weight includes a governed no-Personal route.</div>'}</div>
    </section>`;
  }

  function behaviourCard(item) {
    const objective = objectiveFor(item);
    return `<article class="behaviour-card" data-behaviour-id="${item.id}"><header><div><span class="kpi-id">${item.id} · 20%</span><h3>${escapeHtml(item.title)}</h3><p class="meta">${escapeHtml(item.value)}</p></div><span class="readiness-chip" data-ready="${Boolean(behaviourComplete(item))}">${behaviourComplete(item) ? 'Configured' : 'Needs input'}</span></header>
      <fieldset><legend>Controlled suggestions — choose one or more</legend><div class="suggestion-grid">${item.suggestions.map(suggestion => `<label class="suggestion-card"><input type="checkbox" data-behaviour-suggestion="${suggestion.key}" data-behaviour-id="${item.id}" ${item.selectedSuggestionKeys.includes(suggestion.key) ? 'checked' : ''}><span><strong>${suggestion.key.replace(`${item.id}-`, '')}</strong>${escapeHtml(suggestion.title)}</span></label>`).join('')}</div></fieldset>
      <div class="custom-heading"><strong>Custom wording can be used alongside the library</strong><button class="secondary" type="button" data-behaviour-mode="custom" data-behaviour-id="${item.id}">Add custom wording</button></div><label class="field"><span>My additional or alternative wording</span><textarea rows="2" data-behaviour-field="customObjective" data-behaviour-id="${item.id}" placeholder="Required only when no controlled suggestion is selected">${escapeHtml(item.customObjective)}</textarea></label>
      <p class="objective-readback"><strong>Selected outcome:</strong> ${escapeHtml(objective || 'Choose at least one suggestion or enter custom wording')}</p><div class="quarter-grid">${['q1', 'q2', 'q3', 'q4'].map(key => `<label class="field"><span>${key.toUpperCase()} commitment</span><textarea rows="2" data-behaviour-field="${key}" data-behaviour-id="${item.id}">${escapeHtml(item[key])}</textarea></label>`).join('')}</div>
      <div class="behaviour-controls"><label class="field"><span>Target rating (1–4)</span><select data-behaviour-field="targetRating" data-behaviour-id="${item.id}"><option value="1" ${item.targetRating === 1 ? 'selected' : ''}>1 — Not demonstrated / insufficient evidence</option><option value="2" ${item.targetRating === 2 ? 'selected' : ''}>2 — Developing</option><option value="3" ${item.targetRating === 3 ? 'selected' : ''}>3 — Meets expectations</option><option value="4" ${item.targetRating === 4 ? 'selected' : ''}>4 — Exceeds expectations</option></select></label><label class="field weight-field"><span>Behaviour weight %</span><input type="number" min="20" max="20" data-behaviour-field="weight" data-behaviour-id="${item.id}" value="${item.weight}"></label></div><div class="editor-actions"><button class="secondary" type="button" data-behaviour-save="${item.id}">Save changes for this session</button></div>
    </article>`;
  }

  function renderBehaviourStep() {
    return `<section class="panel" data-preview-section="behaviours"><header class="panel-header"><div><span class="eyebrow">The five fixed KCF Behaviours</span><h2>Behaviours</h2><p>Select one or more of the five controlled suggestions under each heading. Custom wording can be added alongside them. Complete Q1–Q4, a 1–4 target rating and the fixed 20% weight.</p></div><span class="count-pill">${state.behaviours.filter(behaviourComplete).length} / 5</span></header>
      <div class="quick-actions"><button class="primary" type="button" data-use-behaviour-examples>Use preview examples for all five</button></div>${state.message ? `<p class="status-line" role="status">${escapeHtml(state.message)}</p>` : ''}<div class="behaviour-stack section-stack">${state.behaviours.map(behaviourCard).join('')}</div>
    </section>`;
  }

  const summaryList = (items, label) => `<section class="review-group"><h3>${label}</h3>${items.length ? `<ul>${items.map(item => `<li><strong>${escapeHtml(item.id || item.title)}</strong> ${escapeHtml(item.wording || (item.suggestions ? objectiveFor(item) : item.title))}${item.weight !== undefined ? ` · ${item.weight}%` : ''}</li>`).join('')}</ul>` : '<p>None in this session.</p>'}</section>`;

  function renderReviewStep() {
    const blockers = readinessBlockers();
    const categoryTotal = sum(Object.values(state.category));
    return `<section class="panel" data-preview-section="review"><header class="panel-header"><div><span class="eyebrow">Whole Workplan check</span><h2>Review &amp; Weight</h2><p>Review all three categories, agree exact category weights and resolve every visible readiness blocker.</p></div><span class="count-pill" data-category-total="${categoryTotal}">${categoryTotal}% total</span></header>
      <section class="weight-card"><header><h3>Category weighting</h3><div class="quick-actions"><button class="secondary" type="button" data-default-weights>Use 70 / 20 / 10</button><button class="secondary" type="button" data-zero-personal>Use governed no-Personal proposal</button></div></header><div class="category-grid">${[['core', 'Core'], ['personal', 'Personal'], ['behaviours', 'Behaviours']].map(([key, label]) => `<label class="field"><span>${label} %</span><input type="number" min="0" max="100" data-category="${key}" value="${state.category[key]}"></label>`).join('')}</div>${!state.personal.length ? `<label class="field"><span>Reason for no Personal KPIs</span><textarea rows="2" data-zero-personal-reason placeholder="Explain why 0% Personal is appropriate">${escapeHtml(state.zeroPersonalReason)}</textarea></label>` : ''}</section>
      <section class="readiness-panel" data-preview-ready="${blockers.length === 0}"><header><h3>${blockers.length ? 'Not ready yet' : 'Ready for preview review'}</h3><button class="secondary" type="button" data-check-readiness>Recheck readiness</button></header>${blockers.length ? `<ul>${blockers.map(blocker => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul>` : '<p>Every session-only Workplan requirement is complete. This is not approval or submission.</p>'}</section>
      <div class="review-grid">${summaryList(coreRows(), 'Core KPIs')}${summaryList(state.personal, 'Personal KPIs')}${summaryList(state.behaviours, 'Behaviours')}</div><div class="quick-actions"><button class="secondary" type="button" data-nav="employee">Back to Employee</button><button class="primary" type="button" data-nav="workplan">Open My Workplan readback</button></div>
    </section>`;
  }

  function renderBuild() {
    const stepContent = state.step === 'core' ? renderCoreStep() : state.step === 'personal' ? renderPersonalStep() : state.step === 'behaviours' ? renderBehaviourStep() : renderReviewStep();
    main.innerHTML = `${navMarkup()}${hero('Employee · My Workplan', 'Build My Workplan', 'Move through all four Workplan steps. Changes remain in this local browser session and are never sent to SharePoint.')}<section class="truth-card"><strong>Session changes only.</strong><span>Nothing on this screen is saved to SharePoint, approved or submitted.</span></section>${workplanSteps()}${stepContent}<div class="step-escape"><button class="secondary" type="button" data-nav="employee">Back to Employee</button><button class="primary" type="button" data-nav="workplan">View My Workplan</button></div>${footer()}`;
  }

  function coreWorkplanCard(item) {
    return `<article class="workplan-card" data-workplan-kpi="${escapeHtml(item.id)}"><header><span class="kpi-id">${escapeHtml(item.id)}</span><button class="secondary" type="button" data-edit="${escapeHtml(item.id)}">Reopen and edit</button></header><h3>${escapeHtml(item.wording)}</h3><p class="relationship">${roleLabel(item.role)}</p>${readbackGrid(item, ' contribution')}<div class="card-actions"><button class="danger" type="button" data-remove="${escapeHtml(item.id)}">Remove from Workplan</button></div></article>`;
  }

  function personalWorkplanCard(item) {
    return `<article class="workplan-card" data-workplan-personal="${item.id}"><header><span class="kpi-id">${item.id} · ${item.weight}%</span><button class="secondary" type="button" data-personal-edit="${item.id}">Reopen and edit</button></header><h3>${escapeHtml(item.title || 'Untitled Personal KPI')}</h3><p class="meta"><strong>Measure:</strong> ${escapeHtml(item.measure || '—')} · <strong>Unit:</strong> ${escapeHtml(item.unit || '—')}</p><p>${escapeHtml(item.success || '—')}</p>${readbackGrid(item, '')}<div class="card-actions"><button class="danger" type="button" data-personal-remove="${item.id}">Remove Personal KPI</button></div></article>`;
  }

  function renderWorkplan() {
    const blockers = readinessBlockers();
    main.innerHTML = `${navMarkup()}${hero('Employee · My Workplan', 'My Workplan', 'Read back the complete Core, Personal, Behaviour and category-weight state held in this local preview session.')}<section class="truth-card"><strong>Preview readback — not persisted or approved.</strong><span>This screen reads only from the isolated session adapter. The production application continues to show persisted or approved Workplan state.</span></section>${workplanSteps()}
      <section class="panel"><header class="panel-header"><div><span class="eyebrow">Complete session readback</span><h2>${blockers.length ? 'Workplan in progress' : 'Workplan ready for preview review'}</h2></div><span class="count-pill">${state.category.core} / ${state.category.personal} / ${state.category.behaviours}</span></header><section class="readiness-panel" data-preview-ready="${blockers.length === 0}">${blockers.length ? `<h3>${blockers.length} readiness blocker${blockers.length === 1 ? '' : 's'}</h3><ul>${blockers.map(blocker => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul>` : '<h3>Session-only readiness check complete</h3><p>No approval or submission has taken place.</p>'}</section>
        <h2>Core KPIs</h2><div class="workplan-stack">${coreRows().map(coreWorkplanCard).join('') || '<div class="empty-card">No Core KPI in this session.</div>'}</div><h2>Personal KPIs</h2><div class="workplan-stack">${state.personal.map(personalWorkplanCard).join('') || '<div class="empty-card">No Personal KPI in this session.</div>'}</div>
        <h2>Behaviours</h2><div class="behaviour-readback-grid">${state.behaviours.map(item => `<article class="workplan-card"><header><span class="kpi-id">${item.id} · ${item.weight}%</span><button class="secondary" type="button" data-workplan-step="behaviours">Reopen Behaviours</button></header><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(objectiveFor(item) || 'Objective not configured')}</p><p class="meta"><strong>Controlled keys:</strong> ${escapeHtml(item.selectedSuggestionKeys.join(', ') || 'None')} · <strong>Target rating:</strong> ${item.targetRating}/4</p><div class="readback-grid">${['q1', 'q2', 'q3', 'q4'].map(key => `<div><span>${key.toUpperCase()}</span><strong>${escapeHtml(item[key] || '—')}</strong></div>`).join('')}</div></article>`).join('')}</div>
        <h2>Category weights</h2><div class="category-readback"><strong>${state.category.core}% Core</strong><strong>${state.category.personal}% Personal</strong><strong>${state.category.behaviours}% Behaviours</strong><strong>${sum(Object.values(state.category))}% total</strong></div><div class="quick-actions"><button class="secondary" type="button" data-nav="employee">Back to Employee</button><button class="primary" type="button" data-workplan-step="review">Reopen Review &amp; Weight</button></div>
      </section>${footer()}`;
  }

  function render(focusMain) {
    if (state.screen === 'employee') renderEmployee(); else if (state.screen === 'build') renderBuild(); else renderWorkplan();
    syncNavigation();
    if (focusMain) main.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.nav) { state.screen = button.dataset.nav; state.message = ''; render(true); return; }
    if (button.dataset.workplanStep) { state.screen = 'build'; state.step = button.dataset.workplanStep; state.message = ''; render(true); return; }
    if (button.dataset.pillarFilter) { state.pillars = state.pillars.includes(button.dataset.pillarFilter) ? state.pillars.filter(item => item !== button.dataset.pillarFilter) : [...state.pillars, button.dataset.pillarFilter]; render(false); return; }
    if (button.hasAttribute('data-clear-filters') || button.hasAttribute('data-show-all')) { state.search = ''; state.pillars = []; state.workstreams = []; render(false); return; }
    if (button.dataset.add) { const row = state.catalogue.find(item => item.id === button.dataset.add); if (!row || state.core.has(row.id)) return; state.core.set(row.id, { ...row, role: '', annual: '', q1: '', q2: '', q3: '', q4: '' }); state.editingCore = row.id; state.message = `${row.id} added. Choose your role and contribution.`; render(false); return; }
    if (button.dataset.edit) { state.screen = 'build'; state.step = 'core'; state.editingCore = state.editingCore === button.dataset.edit ? null : button.dataset.edit; state.message = ''; render(true); return; }
    if (button.dataset.role) { const item = state.core.get(button.dataset.kpi); if (item) { item.role = button.dataset.role; render(false); } return; }
    if (button.dataset.saveSession) { state.editingCore = null; state.message = `${button.dataset.saveSession} updated for this session.`; render(false); return; }
    if (button.dataset.remove) { const id = button.dataset.remove; state.core.delete(id); if (state.editingCore === id) state.editingCore = null; state.message = `${id} removed. It is available in the catalogue again.`; render(false); return; }
    if (button.hasAttribute('data-add-personal')) { if (state.personal.length >= 5) { state.message = 'Maximum five Personal KPIs reached.'; render(false); return; } const id = `PERS-${String(state.nextPersonal++).padStart(2, '0')}`; state.personal.push({ id, title: '', measure: '', unit: '', success: '', annual: '', q1: '', q2: '', q3: '', q4: '', weight: 0 }); rebalance(state.personal); state.editingPersonal = id; state.message = `${id} created for this session.`; render(false); return; }
    if (button.dataset.personalEdit) { state.screen = 'build'; state.step = 'personal'; state.editingPersonal = state.editingPersonal === button.dataset.personalEdit ? null : button.dataset.personalEdit; state.message = ''; render(true); return; }
    if (button.dataset.personalSave) { state.editingPersonal = null; state.message = `${button.dataset.personalSave} updated for this session.`; render(false); return; }
    if (button.dataset.personalRemove) { state.personal = state.personal.filter(item => item.id !== button.dataset.personalRemove); rebalance(state.personal); state.editingPersonal = null; state.message = `${button.dataset.personalRemove} removed from this session.`; render(false); return; }
    if (button.dataset.behaviourMode === 'custom') { document.querySelector(`[data-behaviour-field="customObjective"][data-behaviour-id="${button.dataset.behaviourId}"]`)?.focus(); return; }
    if (button.hasAttribute('data-use-behaviour-examples')) { state.behaviours.forEach((item, index) => { item.selectedSuggestionKeys = [item.suggestions[0].key]; item.customObjective = ''; item.q1 = `Q1 preview commitment ${index + 1}`; item.q2 = `Q2 preview commitment ${index + 1}`; item.q3 = `Q3 preview commitment ${index + 1}`; item.q4 = `Q4 preview commitment ${index + 1}`; item.targetRating = 3; item.weight = 20; }); state.message = 'The first controlled suggestion was selected for each Behaviour.'; render(false); return; }
    if (button.dataset.behaviourSave) { state.message = `${button.dataset.behaviourSave} updated for this session.`; render(false); return; }
    if (button.hasAttribute('data-default-weights')) { state.category = { core: 70, personal: 20, behaviours: 10 }; state.message = 'Default 70 / 20 / 10 category weights applied.'; render(false); return; }
    if (button.hasAttribute('data-zero-personal')) { state.category = { core: 90, personal: 0, behaviours: 10 }; state.message = 'Governed no-Personal proposal applied. Add the required reason.'; render(false); return; }
    if (button.hasAttribute('data-check-readiness')) render(false);
  });

  document.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'catalogue-search') { state.search = input.value; render(false); const search = document.getElementById('catalogue-search'); search.focus(); search.setSelectionRange(search.value.length, search.value.length); return; }
    if (input.dataset.contribution) { const item = state.core.get(input.dataset.itemId); if (item) item[input.dataset.contribution] = input.value; return; }
    if (input.dataset.personalField) { const item = state.personal.find(row => row.id === input.dataset.personalId); if (item) item[input.dataset.personalField] = input.dataset.personalField === 'weight' ? Number(input.value) : input.value; return; }
    if (input.dataset.personalPeriod) { const item = state.personal.find(row => row.id === input.dataset.itemId); if (item) item[input.dataset.personalPeriod] = input.value; return; }
    if (input.dataset.behaviourField) { const item = state.behaviours.find(row => row.id === input.dataset.behaviourId); if (item) item[input.dataset.behaviourField] = input.dataset.behaviourField === 'weight' || input.dataset.behaviourField === 'targetRating' ? Number(input.value) : input.value; return; }
    if (input.dataset.category) { state.category[input.dataset.category] = Number(input.value); return; }
    if (input.hasAttribute('data-zero-personal-reason')) state.zeroPersonalReason = input.value;
  });

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.dataset.workstreamFilter) { state.workstreams = input.checked ? [...state.workstreams, input.dataset.workstreamFilter] : state.workstreams.filter(key => key !== input.dataset.workstreamFilter); render(false); return; }
    if (input.dataset.behaviourSuggestion) { const item = state.behaviours.find(row => row.id === input.dataset.behaviourId); if (item) { item.selectedSuggestionKeys = input.checked ? [...item.selectedSuggestionKeys, input.dataset.behaviourSuggestion] : item.selectedSuggestionKeys.filter(key => key !== input.dataset.behaviourSuggestion); render(false); } }
  });

  window.KcfKpiWorkplanPreview = { state, readinessBlockers, render: () => render(false), notice: NOTICE, behaviours: BEHAVIOURS };
  fetch('/catalogue.json', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Catalogue unavailable');
    return response.json();
  }).then(catalogue => {
    if (!Array.isArray(catalogue) || catalogue.length !== 109) throw new Error('Controlled catalogue identity mismatch');
    state.catalogue = catalogue; render(false);
  }).catch(() => { main.innerHTML = '<section class="empty-card" role="alert"><strong>The controlled Core KPI catalogue could not be loaded.</strong><p>Stop the preview and launch it again from the authorised worktree.</p></section>'; });
}());
