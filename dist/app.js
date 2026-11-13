const invoke = (cmd, args = {}) => {
  if (!window.__TAURI__ || !window.__TAURI__.core) {
    return Promise.reject(new Error('Tauri API yüklenemedi'));
  }
  return window.__TAURI__.core.invoke(cmd, args);
};

const setBusy = (button, busy) => {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = busy ? 'Açılıyor…' : button.dataset.originalText;
};

document.querySelectorAll('[data-section]').forEach((button) => {
  button.addEventListener('click', () => {
    setBusy(button, true);
    invoke('open_section', { section: button.dataset.section })
      .catch((error) => console.error(error))
      .finally(() => setBusy(button, false));
  });
});

document.querySelectorAll('[data-authtab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.authtab;

    document.querySelectorAll('[data-authtab]').forEach((item) => {
      item.classList.toggle('is-active', item === tab);
    });

    document.querySelector('#login-form')?.classList.toggle('is-hidden', target !== 'login');
    document.querySelector('#register-form')?.classList.toggle('is-hidden', target !== 'register');
  });
});

const loginForm = document.querySelector('#login-form');

if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const identification = document.querySelector('#login-identification')?.value?.trim() || '';
    const password = document.querySelector('#login-password')?.value || '';

    if (!identification || !password) return;

    const button = loginForm.querySelector('button[type="submit"]');
    setBusy(button, true);

    invoke('open_auth', {
      mode: 'login',
      identification,
      password,
      username: null,
      email: null,
    })
      .catch((error) => console.error(error))
      .finally(() => setBusy(button, false));
  });
}

const registerForm = document.querySelector('#register-form');

if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const username = document.querySelector('#register-username')?.value?.trim() || '';
    const email = document.querySelector('#register-email')?.value?.trim() || '';
    const password = document.querySelector('#register-password')?.value || '';

    if (!username || !email || !password) return;

    const button = registerForm.querySelector('button[type="submit"]');
    setBusy(button, true);

    invoke('open_auth', {
      mode: 'register',
      identification: null,
      password,
      username,
      email,
    })
      .catch((error) => console.error(error))
      .finally(() => setBusy(button, false));
  });
}

const settingsModal = document.querySelector('#settings-modal');
const pttStatus = document.querySelector('#ptt-status');

const pttLabels = { alt: 'Alt', v: 'V', f: 'F' };

const updatePttStatus = (settings) => {
  if (!pttStatus) return;
  pttStatus.textContent = settings.pttEnabled ? pttLabels[settings.pttKey] || 'Alt' : 'Kapalı';
};

const fillSettingsForm = (settings) => {
  const enabled = document.querySelector('#setting-ptt-enabled');
  const key = document.querySelector('#setting-ptt-key');
  const monitor = document.querySelector('#setting-second-monitor');
  const tray = document.querySelector('#setting-close-to-tray');

  if (enabled) enabled.checked = Boolean(settings.pttEnabled);
  if (key) key.value = settings.pttKey || 'alt';
  if (monitor) monitor.checked = Boolean(settings.startOnSecondMonitor);
  if (tray) tray.checked = Boolean(settings.closeToTray);

  updatePttStatus(settings);
};

const openSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.remove('is-hidden');
  settingsModal.setAttribute('aria-hidden', 'false');
};

const closeSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.add('is-hidden');
  settingsModal.setAttribute('aria-hidden', 'true');
};

document.querySelectorAll('[data-open-settings]').forEach((button) => {
  button.addEventListener('click', openSettings);
});

document.querySelector('#settings-open')?.addEventListener('click', openSettings);
document.querySelector('#settings-close')?.addEventListener('click', closeSettings);

settingsModal?.addEventListener('click', (event) => {
  if (event.target === settingsModal) closeSettings();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSettings();
});

document.querySelector('#setting-mic')?.addEventListener('click', () => {
  invoke('open_microphone_settings').catch((error) => console.error(error));
});

document.querySelector('#settings-save')?.addEventListener('click', () => {
  const settings = {
    pttKey: document.querySelector('#setting-ptt-key')?.value || 'alt',
    pttEnabled: Boolean(document.querySelector('#setting-ptt-enabled')?.checked),
    startOnSecondMonitor: Boolean(document.querySelector('#setting-second-monitor')?.checked),
    closeToTray: Boolean(document.querySelector('#setting-close-to-tray')?.checked),
  };

  invoke('save_settings', { settings })
    .then(() => {
      updatePttStatus(settings);
      closeSettings();
    })
    .catch((error) => console.error(error));
});

invoke('get_settings')
  .then(fillSettingsForm)
  .catch(() => updatePttStatus({ pttEnabled: true, pttKey: 'alt' }));

const discussionList = document.querySelector('#latest-discussions');

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const renderDiscussions = (items) => {
  if (!discussionList) return;
  discussionList.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'discussion-empty';
    empty.textContent = 'Henüz görüntülenecek konu yok.';
    discussionList.appendChild(empty);
    return;
  }

  items.slice(0, 10).forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'discussion-item';
    button.title = item.title || '';

    const number = document.createElement('span');
    number.className = 'discussion-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'discussion-copy';

    const title = document.createElement('strong');
    title.textContent = item.title || 'Başlıksız konu';

    const meta = document.createElement('small');
    const replies = Math.max(0, Number(item.replies) || 0);
    const date = formatDate(item.lastPostedAt);
    meta.textContent = [replies ? `${replies} yanıt` : 'Yeni konu', date].filter(Boolean).join(' · ');

    copy.appendChild(title);
    copy.appendChild(meta);

    const arrow = document.createElement('span');
    arrow.className = 'discussion-arrow';
    arrow.textContent = '→';

    button.appendChild(number);
    button.appendChild(copy);
    button.appendChild(arrow);

    button.addEventListener('click', () => {
      invoke('open_url', { url: item.url }).catch((error) => console.error(error));
    });

    discussionList.appendChild(button);
  });
};

if (discussionList) {
  invoke('get_latest_discussions')
    .then(renderDiscussions)
    .catch(() => renderDiscussions([]));
}
