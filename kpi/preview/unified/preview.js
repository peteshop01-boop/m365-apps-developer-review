(() => {
  const navigation = document.getElementById('section-navigation');
  const root = document.getElementById('integrated-root');
  const unavailable = document.getElementById('unavailable');
  const reason = document.getElementById('unavailable-reason');
  const status = document.getElementById('section-status');
  const buttons = [...navigation.querySelectorAll('button')];
  const guardedLabels = new Set(['Start My Workplan', 'Save Draft', 'Submit Workplan']);
  function guardedButton(target) {
    const button = target instanceof Element ? target.closest('button') : null;
    return button && root.contains(button) && guardedLabels.has(button.textContent.trim()) ? button : null;
  }
  function disablePreviewWrites() {
    for (const button of root.querySelectorAll('button')) {
      if (!guardedLabels.has(button.textContent.trim())) continue;
      if (!button.disabled) button.disabled = true;
      if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
      if (button.title !== 'Unavailable in this local preview. Session changes are not written.') button.title = 'Unavailable in this local preview. Session changes are not written.';
    }
  }
  new MutationObserver(disablePreviewWrites).observe(root, { childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'], subtree: true });
  disablePreviewWrites();
  for (const type of ['click', 'pointerdown', 'keydown']) {
    document.addEventListener(type, event => {
      if (!guardedButton(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
  }
  function nativeButton(label, within) {
    return [...(within || root).querySelectorAll('button')].find(item => item.textContent.trim() === label);
  }
  async function open(button) {
    if (button === buttons[0]) navigation.scrollLeft = 0;
    buttons.forEach(item => item.removeAttribute('aria-current'));
    button.setAttribute('aria-current', 'page');
    if (button.dataset.unavailable) {
      reason.textContent = button.dataset.unavailable;
      unavailable.hidden = false; root.hidden = true;
      status.textContent = `${button.textContent.trim()}: NOT YET INTEGRATED`;
      return;
    }
    root.hidden = false; unavailable.hidden = true;
    const parent = button.dataset.parent;
    for (let tries = 0; tries < 80 && !nativeButton(parent || button.dataset.native); tries++) await new Promise(resolve => setTimeout(resolve, 100));
    if (parent) nativeButton(parent)?.click();
    const target = parent ? [...root.querySelectorAll('nav[aria-label="Build My Workplan steps"] button')].find(item => item.textContent.trim() === button.dataset.native) :
      [...root.querySelectorAll('aside[aria-label="Performance Hub navigation"] button')].find(item => item.textContent.trim() === button.dataset.native);
    if (!target) { status.textContent = `${button.textContent.trim()}: integrated control could not be found.`; return; }
    target.click();
    status.textContent = `${button.textContent.trim()}: integrated local surface. Read-only synthetic session; Start, Save and Submit are disabled. Nothing is written.`;
  }
  navigation.addEventListener('click', event => { const button = event.target.closest('button'); if (button) open(button); });
  document.getElementById('back-home').addEventListener('click', () => open(buttons[0]));
  open(new URLSearchParams(location.search).get('role') === 'board'
    ? buttons.find(button => button.dataset.native === 'Performance reporting views') : buttons[0]);
})();
