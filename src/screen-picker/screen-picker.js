'use strict';

(() => {
  const api = window.wttrScreenPicker || {
    ready: () => {},
    refresh: () => {},
    select: () => {},
    cancel: () => {},
    onSources: () => {},
  };

  const loading = document.getElementById('loading');
  const screensSection = document.getElementById('screens-section');
  const windowsSection = document.getElementById('windows-section');
  const screensRoot = document.getElementById('screens');
  const windowsRoot = document.getElementById('windows');
  const empty = document.getElementById('empty');
  const refreshButton = document.getElementById('refresh');
  const cancelButton = document.getElementById('cancel');

  const renderCard = (item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'source-card';
    card.title = item.name || '';
    card.setAttribute('aria-label', item.name || 'Kaynak');

    const thumb = document.createElement('span');
    thumb.className = 'source-thumb';

    const badge = document.createElement('span');
    badge.className = 'source-badge';
    badge.textContent = item.kind === 'screen' ? 'Ekran' : 'Pencere';
    thumb.appendChild(badge);

    if (item.thumbnail) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = item.thumbnail;
      image.onerror = () => image.remove();
      thumb.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'source-placeholder';
      placeholder.textContent = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
      thumb.appendChild(placeholder);
    }

    const meta = document.createElement('span');
    meta.className = 'source-meta';

    if (item.appIcon) {
      const icon = document.createElement('img');
      icon.className = 'source-appicon';
      icon.alt = '';
      icon.src = item.appIcon;
      icon.onerror = () => icon.remove();
      meta.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = item.name || 'Adsız kaynak';
    meta.appendChild(name);

    card.appendChild(thumb);
    card.appendChild(meta);

    card.addEventListener('click', () => api.select(item.id));

    return card;
  };

  const render = (items) => {
    const sources = Array.isArray(items) ? items : [];
    const screens = sources.filter((item) => item.kind === 'screen');
    const windows = sources.filter((item) => item.kind !== 'screen');

    screensRoot.textContent = '';
    windowsRoot.textContent = '';
    screensSection.hidden = screens.length === 0;
    windowsSection.hidden = windows.length === 0;

    for (const item of screens) screensRoot.appendChild(renderCard(item));
    for (const item of windows) windowsRoot.appendChild(renderCard(item));

    loading.hidden = true;
    empty.hidden = sources.length > 0;

    if (refreshButton) refreshButton.disabled = false;
  };

  refreshButton?.addEventListener('click', () => {
    refreshButton.disabled = true;
    loading.hidden = false;
    screensSection.hidden = true;
    windowsSection.hidden = true;
    empty.hidden = true;
    api.refresh();
  });

  cancelButton?.addEventListener('click', () => api.cancel());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      api.cancel();
    }
  });

  api.onSources((items) => {
    render(items);
  });

  render([]);
  api.ready();
})();
