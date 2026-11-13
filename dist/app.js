const invoke = (command, args = {}) => {
  if (!window.__TAURI__ || !window.__TAURI__.core) {
    return Promise.reject(new Error('Tauri API yüklenemedi'));
  }

  return window.__TAURI__.core.invoke(command, args);
};

const listen = (event, handler) => {
  if (!window.__TAURI__ || !window.__TAURI__.event) {
    return Promise.reject(new Error('Tauri event API yüklenemedi'));
  }

  return window.__TAURI__.event.listen(event, handler);
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  session: {
    known: false,
    authenticated: false,
    user: null,
    unreadNotifications: 0,
  },
  settings: {
    pttKey: 'AltLeft',
    pttEnabled: true,
    closeToTray: true,
    notificationsEnabled: true,
  },
  topicsLoaded: false,
  topicsLoading: false,
  capturing: false,
  update: null,
  sessionTimeout: null,
};

const pttKeyList = [
  ['AltLeft', 'Alt'],
  ['AltRight', 'Sağ Alt'],
  ['ShiftLeft', 'Shift'],
  ['ShiftRight', 'Sağ Shift'],
  ['ControlLeft', 'Ctrl'],
  ['ControlRight', 'Sağ Ctrl'],
  ['MetaLeft', 'Win'],
  ['MetaRight', 'Sağ Win'],
  ['CapsLock', 'Caps Lock'],
  ['Space', 'Space'],
  ['Tab', 'Tab'],
  ['Enter', 'Enter'],
  ['NumpadEnter', 'Num Enter'],
  ['Backspace', 'Backspace'],
  ['Escape', 'Esc'],
  ['PrintScreen', 'PrtSc'],
  ['ScrollLock', 'Scroll Lock'],
  ['Pause', 'Pause'],
  ['NumLock', 'Num Lock'],
  ['ContextMenu', 'Menü'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['PageUp', 'Page Up'],
  ['PageDown', 'Page Down'],
  ['Insert', 'Insert'],
  ['Delete', 'Delete'],
  ['KeyA', 'A'],
  ['KeyB', 'B'],
  ['KeyC', 'C'],
  ['KeyD', 'D'],
  ['KeyE', 'E'],
  ['KeyF', 'F'],
  ['KeyG', 'G'],
  ['KeyH', 'H'],
  ['KeyI', 'I'],
  ['KeyJ', 'J'],
  ['KeyK', 'K'],
  ['KeyL', 'L'],
  ['KeyM', 'M'],
  ['KeyN', 'N'],
  ['KeyO', 'O'],
  ['KeyP', 'P'],
  ['KeyQ', 'Q'],
  ['KeyR', 'R'],
  ['KeyS', 'S'],
  ['KeyT', 'T'],
  ['KeyU', 'U'],
  ['KeyV', 'V'],
  ['KeyW', 'W'],
  ['KeyX', 'X'],
  ['KeyY', 'Y'],
  ['KeyZ', 'Z'],
  ['Digit0', '0'],
  ['Digit1', '1'],
  ['Digit2', '2'],
  ['Digit3', '3'],
  ['Digit4', '4'],
  ['Digit5', '5'],
  ['Digit6', '6'],
  ['Digit7', '7'],
  ['Digit8', '8'],
  ['Digit9', '9'],
  ['Numpad0', 'Num 0'],
  ['Numpad1', 'Num 1'],
  ['Numpad2', 'Num 2'],
  ['Numpad3', 'Num 3'],
  ['Numpad4', 'Num 4'],
  ['Numpad5', 'Num 5'],
  ['Numpad6', 'Num 6'],
  ['Numpad7', 'Num 7'],
  ['Numpad8', 'Num 8'],
  ['Numpad9', 'Num 9'],
  ['NumpadAdd', 'Num +'],
  ['NumpadSubtract', 'Num -'],
  ['NumpadMultiply', 'Num *'],
  ['NumpadDivide', 'Num /'],
  ['NumpadDecimal', 'Num .'],
  ['F1', 'F1'],
  ['F2', 'F2'],
  ['F3', 'F3'],
  ['F4', 'F4'],
  ['F5', 'F5'],
  ['F6', 'F6'],
  ['F7', 'F7'],
  ['F8', 'F8'],
  ['F9', 'F9'],
  ['F10', 'F10'],
  ['F11', 'F11'],
  ['F12', 'F12'],
  ['F13', 'F13'],
  ['F14', 'F14'],
  ['F15', 'F15'],
  ['F16', 'F16'],
  ['F17', 'F17'],
  ['F18', 'F18'],
  ['F19', 'F19'],
  ['F20', 'F20'],
  ['F21', 'F21'],
  ['F22', 'F22'],
  ['F23', 'F23'],
  ['F24', 'F24'],
  ['Semicolon', ';'],
  ['Equal', '='],
  ['Comma', ','],
  ['Minus', '-'],
  ['Period', '.'],
  ['Slash', '/'],
  ['Backquote', '`'],
  ['BracketLeft', '['],
  ['Backslash', '\\'],
  ['BracketRight', ']'],
  ['Quote', "'"],
  ['MediaPlayPause', 'Medya Oynat'],
  ['MediaTrackNext', 'Sonraki Parça'],
  ['MediaTrackPrevious', 'Önceki Parça'],
  ['MediaStop', 'Medya Durdur'],
  ['AudioVolumeUp', 'Ses +'],
  ['AudioVolumeDown', 'Ses -'],
  ['AudioVolumeMute', 'Sessiz'],
];

const pttLabels = Object.fromEntries(pttKeyList);

const pttAliases = {
  alt: 'AltLeft',
  shift: 'ShiftLeft',
  ctrl: 'ControlLeft',
  capslock: 'CapsLock',
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Escape',
  backspace: 'Backspace',
  v: 'KeyV',
  f: 'KeyF',
  c: 'KeyC',
  x: 'KeyX',
  z: 'KeyZ',
  t: 'KeyT',
  g: 'KeyG',
  b: 'KeyB',
  q: 'KeyQ',
  e: 'KeyE',
  r: 'KeyR',
  0: 'Digit0',
  1: 'Digit1',
  2: 'Digit2',
  3: 'Digit3',
  4: 'Digit4',
  5: 'Digit5',
  6: 'Digit6',
  7: 'Digit7',
  8: 'Digit8',
  9: 'Digit9',
};

const normalizePttKey = (key) => pttAliases[key] || key;
const pttLabel = (key) => pttLabels[normalizePttKey(key)] || normalizePttKey(key) || 'Alt';

let toastTimer = null;

const showToast = (message, type = 'success') => {
  const toast = $('#toast');
  if (!toast) return;

  toast.textContent = message;
  toast.dataset.type = type;
  toast.hidden = false;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3400);
};

const setBusy = (button, busy, busyLabel = 'Açılıyor…') => {
  if (!button) return;

  button.dataset.label = button.dataset.label || button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label;
};

const showError = (element, message) => {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
};

const hideError = (element) => {
  if (!element) return;
  element.textContent = '';
  element.hidden = true;
};

const setAvatar = (imageId, initialId, user, displayName) => {
  const image = document.getElementById(imageId);
  const initial = document.getElementById(initialId);

  if (!image || !initial) return;

  initial.textContent = (displayName || 'W').trim().charAt(0).toUpperCase() || 'W';

  if (user && user.avatarUrl) {
    image.onerror = () => {
      image.hidden = true;
      initial.hidden = false;
    };
    image.src = user.avatarUrl;
    image.hidden = false;
    initial.hidden = true;
  } else {
    image.hidden = true;
    image.removeAttribute('src');
    initial.hidden = false;
  }
};

const renderSession = () => {
  const { known, authenticated, user, unreadNotifications } = state.session;
  const displayName = (user && (user.displayName || user.username)) || 'Asker';
  const username = user && user.username ? `@${user.username}` : '@warthunder';
  const unread = Math.max(0, Number(unreadNotifications) || 0);

  document.body.dataset.session = !known
    ? 'checking'
    : authenticated
      ? 'authenticated'
      : 'guest';

  const accountName = $('#account-name');
  const accountUsername = $('#account-username');
  const accountUnread = $('#account-unread');
  const welcomeName = $('#welcome-name');
  const welcomeUnread = $('#welcome-unread');

  if (accountName) accountName.textContent = displayName;
  if (accountUsername) accountUsername.textContent = username;
  if (welcomeName) welcomeName.textContent = displayName;

  if (accountUnread) {
    accountUnread.textContent = unread > 99 ? '99+' : String(unread);
    accountUnread.hidden = unread === 0;
  }

  if (welcomeUnread) {
    welcomeUnread.textContent = unread
      ? `${unread} okunmamış bildirim`
      : 'Yeni bildirim yok';
  }

  setAvatar('account-avatar-img', 'account-initial', user, displayName);
  setAvatar('welcome-avatar-img', 'welcome-initial', user, displayName);
};

const applySession = (payload) => {
  if (!payload) return;

  const previous = state.session;
  const next = {
    known: Boolean(payload.known),
    authenticated: Boolean(payload.authenticated),
    user: payload.user || null,
    unreadNotifications: Math.max(0, Number(payload.unreadNotifications) || 0),
  };

  state.session = next;

  if (previous.authenticated && !next.authenticated) {
    state.topicsLoaded = false;
  }

  renderSession();

  if (next.known) {
    clearTimeout(state.sessionTimeout);
  }

  if (next.authenticated && !previous.authenticated) {
    state.topicsLoaded = false;
    loadDiscussions();
  }
};

const openSiteUrl = (url) => {
  if (!state.session.authenticated) {
    showToast('Önce giriş yapmalısın.', 'error');
    return;
  }

  invoke('open_url', { url }).catch(() => {
    showToast('Bağlantı açılamadı.', 'error');
  });
};

const openSection = (section) => {
  if (!state.session.authenticated) {
    showToast('Önce giriş yapmalısın.', 'error');
    return;
  }

  invoke('open_section', { section }).catch(() => {
    showToast('Bölüm açılamadı.', 'error');
  });
};

$$('[data-section]').forEach((button) => {
  button.addEventListener('click', () => openSection(button.dataset.section));
});

$$('[data-url]').forEach((button) => {
  button.addEventListener('click', () => {
    const details = button.closest('details');
    if (details) details.removeAttribute('open');
    openSiteUrl(button.dataset.url);
  });
});

$$('[data-authtab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.authtab;

    $$('[data-authtab]').forEach((item) => {
      item.classList.toggle('is-active', item === tab);
    });

    $('#login-form')?.classList.toggle('is-hidden', target !== 'login');
    $('#register-form')?.classList.toggle('is-hidden', target !== 'register');
    hideError($('#login-error'));
    hideError($('#register-error'));
  });
});

const loginForm = $('#login-form');

if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const identification = $('#login-identification')?.value?.trim() || '';
    const password = $('#login-password')?.value || '';
    const remember = Boolean($('#login-remember')?.checked);

    if (!identification || !password) return;

    const button = loginForm.querySelector('button[type="submit"]');
    hideError($('#login-error'));
    setBusy(button, true, 'Giriş penceresi açılıyor…');

    invoke('open_auth', {
      mode: 'login',
      identification,
      password,
      username: null,
      email: null,
      remember,
    })
      .catch(() => {
        showError($('#login-error'), 'Giriş penceresi açılamadı. Tekrar dene.');
      })
      .finally(() => setBusy(button, false));
  });
}

$('#login-other')?.addEventListener('click', () => {
  hideError($('#login-error'));

  invoke('open_auth', {
    mode: 'login',
    identification: null,
    password: null,
    username: null,
    email: null,
    remember: true,
  }).catch(() => {
    showError($('#login-error'), 'Giriş penceresi açılamadı. Tekrar dene.');
  });
});

const registerForm = $('#register-form');

if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const username = $('#register-username')?.value?.trim() || '';
    const email = $('#register-email')?.value?.trim() || '';
    const password = $('#register-password')?.value || '';

    if (!username || !email || !password) return;

    const button = registerForm.querySelector('button[type="submit"]');
    hideError($('#register-error'));
    setBusy(button, true, 'Kayıt penceresi açılıyor…');

    invoke('open_auth', {
      mode: 'register',
      identification: null,
      password,
      username,
      email,
      remember: true,
    })
      .catch(() => {
        showError($('#register-error'), 'Kayıt penceresi açılamadı. Tekrar dene.');
      })
      .finally(() => setBusy(button, false));
  });
}

const settingsModal = $('#settings-modal');
const pttStatus = $('#ptt-status');
const welcomePtt = $('#welcome-ptt');
const pttCapture = $('#ptt-capture');
const pttCancel = $('#ptt-cancel');

let captureCooldown = false;

const updatePttStatus = () => {
  const label = pttLabel(state.settings.pttKey);
  const enabled = Boolean(state.settings.pttEnabled);

  if (pttStatus) pttStatus.textContent = enabled ? label : 'Kapalı';
  if (welcomePtt) welcomePtt.textContent = enabled ? label : 'Kapalı';
  if (pttCapture) pttCapture.textContent = label;
};

const fillSettingsForm = () => {
  const enabled = $('#setting-ptt-enabled');
  const tray = $('#setting-close-to-tray');
  const notifications = $('#setting-notifications');

  if (enabled) enabled.checked = Boolean(state.settings.pttEnabled);
  if (tray) tray.checked = Boolean(state.settings.closeToTray);
  if (notifications) notifications.checked = state.settings.notificationsEnabled !== false;

  updatePttStatus();
};

const openSettings = () => {
  if (!settingsModal) return;

  hideError($('#settings-error'));
  settingsModal.classList.remove('is-hidden');
  settingsModal.setAttribute('aria-hidden', 'false');
};

const closeSettings = () => {
  if (!settingsModal) return;

  stopKeyCapture();
  settingsModal.classList.add('is-hidden');
  settingsModal.setAttribute('aria-hidden', 'true');
};

const stopKeyCapture = () => {
  if (!state.capturing) return;

  state.capturing = false;
  pttCapture?.classList.remove('is-capturing');
  pttCancel?.classList.add('is-hidden');
  window.removeEventListener('keydown', onKeyCapture, true);
  updatePttStatus();

  captureCooldown = true;
  setTimeout(() => {
    captureCooldown = false;
  }, 350);
};

const onKeyCapture = (event) => {
  event.preventDefault();
  event.stopPropagation();

  let code = event.code;

  if (!code || code === 'Unidentified' || !pttLabels[code]) {
    if (event.key && pttLabels[event.key]) code = event.key;
  }

  if (!pttLabels[code]) {
    if (pttCapture) pttCapture.textContent = 'Desteklenmeyen tuş';
    return;
  }

  state.settings.pttKey = code;
  stopKeyCapture();
};

const startKeyCapture = () => {
  if (state.capturing || captureCooldown) return;

  state.capturing = true;
  pttCapture?.classList.add('is-capturing');
  pttCancel?.classList.remove('is-hidden');
  if (pttCapture) pttCapture.textContent = 'Bir tuşa bas…';
  window.addEventListener('keydown', onKeyCapture, true);
};

pttCapture?.addEventListener('click', () => {
  if (state.capturing) {
    stopKeyCapture();
    return;
  }

  startKeyCapture();
});

pttCancel?.addEventListener('click', stopKeyCapture);

$('#setting-ptt-enabled')?.addEventListener('change', (event) => {
  state.settings.pttEnabled = Boolean(event.target.checked);
  updatePttStatus();
});

$$('[data-open-settings]').forEach((button) => {
  button.addEventListener('click', openSettings);
});

$('#settings-open')?.addEventListener('click', openSettings);
$('#settings-close')?.addEventListener('click', closeSettings);

settingsModal?.addEventListener('click', (event) => {
  if (event.target === settingsModal) closeSettings();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !state.capturing) closeSettings();
});

$('#setting-mic-test')?.addEventListener('click', () => {
  invoke('request_microphone')
    .then(() => {
      showToast('Mikrofon izni istendi. İzin verip Windows ayarlarını aç.');
    })
    .catch(() => {
      showToast('Mikrofon testi başlatılamadı.', 'error');
    });
});

$('#setting-mic')?.addEventListener('click', () => {
  invoke('open_microphone_settings').catch(() => {
    showToast('Mikrofon ayarları açılamadı.', 'error');
  });
});

$('#notification-test')?.addEventListener('click', () => {
  invoke('test_notification')
    .then(() => showToast('Test bildirimi gönderildi.'))
    .catch(() => showToast('Bildirim gönderilemedi. Windows bildirim iznini kontrol et.', 'error'));
});

$('#settings-save')?.addEventListener('click', () => {
  const settings = {
    pttKey: state.settings.pttKey,
    pttEnabled: Boolean($('#setting-ptt-enabled')?.checked),
    closeToTray: Boolean($('#setting-close-to-tray')?.checked),
    notificationsEnabled: Boolean($('#setting-notifications')?.checked),
  };

  const button = $('#settings-save');
  hideError($('#settings-error'));
  setBusy(button, true, 'Kaydediliyor…');

  invoke('save_settings', { settings })
    .then(() => {
      state.settings = settings;
      updatePttStatus();
      closeSettings();
      showToast('Ayarlar kaydedildi.');
    })
    .catch(() => {
      showError($('#settings-error'), 'Ayarlar kaydedilemedi. Tekrar dene.');
    })
    .finally(() => setBusy(button, false));
});

$('#logout-button')?.addEventListener('click', () => {
  const button = $('#logout-button');
  setBusy(button, true, 'Çıkılıyor…');

  invoke('logout')
    .catch(() => {
      showToast('Çıkış yapılamadı. Tekrar dene.', 'error');
      setBusy(button, false);
    });
});

const discussionList = $('#latest-discussions');

const formatDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const renderTopicsMessage = (message, retry = false) => {
  if (!discussionList) return;

  discussionList.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'discussion-empty';

  const text = document.createElement('span');
  text.textContent = message;
  wrapper.appendChild(text);

  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-link';
    button.textContent = 'Tekrar dene';
    button.addEventListener('click', () => {
      state.topicsLoaded = false;
      state.topicsLoading = false;
      loadDiscussions();
    });
    wrapper.appendChild(button);
  }

  discussionList.appendChild(wrapper);
};

const renderDiscussions = (items) => {
  if (!discussionList) return;

  discussionList.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    renderTopicsMessage('Henüz görüntülenecek konu yok.');
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
    meta.textContent = [replies ? `${replies} yanıt` : 'Yeni konu', date]
      .filter(Boolean)
      .join(' · ');

    copy.appendChild(title);
    copy.appendChild(meta);

    const arrow = document.createElement('span');
    arrow.className = 'discussion-arrow';
    arrow.textContent = '→';

    button.appendChild(number);
    button.appendChild(copy);
    button.appendChild(arrow);

    button.addEventListener('click', () => openSiteUrl(item.url));

    discussionList.appendChild(button);
  });
};

function loadDiscussions() {
  if (!state.session.authenticated || state.topicsLoaded || state.topicsLoading) return;

  state.topicsLoading = true;
  renderTopicsMessage('Konular yükleniyor…');

  invoke('get_latest_discussions')
    .then((items) => {
      state.topicsLoaded = true;
      renderDiscussions(items);
    })
    .catch(() => {
      renderTopicsMessage('Konular yüklenemedi.', true);
    })
    .finally(() => {
      state.topicsLoading = false;
    });
}

const updateBanner = $('#update-banner');
const updateStatus = $('#update-status');
const updateCheckButton = $('#update-check');
const updateInstallButton = $('#update-install');

const renderUpdate = (info) => {
  state.update = info;

  const version = info.currentVersion || '0.2.0';

  const appVersion = $('#app-version');
  const settingsVersion = $('#settings-version');

  if (appVersion) appVersion.textContent = `v${version}`;
  if (settingsVersion) settingsVersion.textContent = `v${version}`;

  if (info.available) {
    if (updateBanner) updateBanner.hidden = false;
    if ($('#update-title')) {
      $('#update-title').textContent = `Yeni sürüm v${info.latestVersion} hazır`;
    }
    if ($('#update-note')) {
      $('#update-note').textContent = info.assetUrl
        ? 'İndirip kurmak için tıkla. Uygulama güncelleme için yeniden başlar.'
        : 'İndirme sayfasını açmak için tıkla.';
    }
    if (updateInstallButton) {
      updateInstallButton.textContent = info.assetUrl ? 'Güncelle' : 'İndir';
    }
  } else if (updateBanner) {
    updateBanner.hidden = true;
  }
};

const checkUpdates = async (manual = false) => {
  if (manual) {
    if (updateCheckButton) {
      updateCheckButton.disabled = true;
      updateCheckButton.textContent = 'Kontrol ediliyor…';
    }
    if (updateStatus) updateStatus.textContent = 'Sürüm kontrol ediliyor…';
  }

  try {
    const info = await invoke('check_for_updates');
    renderUpdate(info);

    if (manual) {
      if (updateStatus) {
        updateStatus.textContent = info.available
          ? `Yeni sürüm v${info.latestVersion} hazır.`
          : `Güncel sürüm: v${info.currentVersion}`;
      }
      showToast(info.available ? 'Yeni sürüm bulundu.' : 'Uygulama güncel.');
    }
  } catch (error) {
    if (manual) {
      if (updateStatus) updateStatus.textContent = 'Sürüm kontrol edilemedi.';
      showToast('Güncelleme kontrolü başarısız.', 'error');
    }
  } finally {
    if (manual && updateCheckButton) {
      updateCheckButton.disabled = false;
      updateCheckButton.textContent = 'Kontrol et';
    }
  }
};

updateCheckButton?.addEventListener('click', () => checkUpdates(true));

updateInstallButton?.addEventListener('click', () => {
  const info = state.update;
  if (!info) return;

  if (info.assetUrl) {
    updateInstallButton.disabled = true;
    updateInstallButton.textContent = 'İndiriliyor…';

    invoke('install_update', { url: info.assetUrl }).catch(() => {
      updateInstallButton.disabled = false;
      updateInstallButton.textContent = 'Güncelle';
      showToast('Güncelleme indirilemedi.', 'error');
    });

    return;
  }

  if (info.url) {
    invoke('open_external', { url: info.url }).catch(() => {
      showToast('İndirme sayfası açılamadı.', 'error');
    });
  }
});

$('#update-dismiss')?.addEventListener('click', () => {
  if (updateBanner) updateBanner.hidden = true;
});

document.addEventListener('click', (event) => {
  $$('details.site-nav-group[open]').forEach((details) => {
    if (!details.contains(event.target)) details.removeAttribute('open');
  });
});

$('#session-retry')?.addEventListener('click', () => {
  const retry = $('#session-retry');
  const status = $('#session-status');

  if (retry) retry.classList.add('is-hidden');
  if (status) status.textContent = 'Bağlantı yeniden kuruluyor…';

  invoke('refresh_session').catch(() => {
    if (status) status.textContent = 'Bağlantı kurulamadı. Tekrar dene.';
    if (retry) retry.classList.remove('is-hidden');
  });
});

const initialize = async () => {
  listen('session-changed', (event) => applySession(event.payload)).catch(() => {});

  try {
    const settings = await invoke('get_settings');
    state.settings = {
      ...state.settings,
      ...settings,
    };
  } catch (error) {
    // Keep the defaults.
  }

  fillSettingsForm();

  try {
    const session = await invoke('get_session');
    applySession(session);
  } catch (error) {
    showToast('Oturum bilgisi alınamadı.', 'error');
  }

  state.sessionTimeout = setTimeout(() => {
    if (state.session.known) return;

    const status = $('#session-status');
    const retry = $('#session-retry');

    if (status) status.textContent = 'Siteye ulaşılamadı. Yeniden deneniyor…';

    invoke('refresh_session').catch(() => {});

    setTimeout(() => {
      if (state.session.known) return;

      if (status) {
        status.textContent =
          'Siteye ulaşılamadı. Bağlantını ve güvenlik yazılımı izinlerini kontrol et.';
      }
      if (retry) retry.classList.remove('is-hidden');
    }, 7000);
  }, 9000);

  setInterval(() => {
    if (!state.session.known || document.visibilityState === 'visible') {
      invoke('get_session')
        .then(applySession)
        .catch(() => {});
    }
  }, 5000);

  setTimeout(() => checkUpdates(false), 1600);
};

initialize();
