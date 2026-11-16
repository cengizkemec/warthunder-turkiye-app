'use strict';

(() => {
  if (location.hostname !== 'warthunder.tr') return;

  let root = null;
  let panel = null;
  let toastTimer = null;
  let capturing = false;
  let settings = null;
  let session = null;
  let mounted = false;
  let dockAllowed = false;
  let pendingUpdateInfo = null;
  let downloadedUpdate = null;

  const LOGO = 'https://warthunder.tr/assets/pwa-icon-512x512-s8vyxeai.png';

  const $ = (selector) => root?.querySelector(selector) || null;

  const api = () => window.wttrDesktop || null;

  const applyVisibility = () => {
    if (!root) return;
    const hidden = !dockAllowed || location.pathname.startsWith('/admin');
    root.style.display = hidden ? 'none' : '';
  };

  const setDockVisible = (value) => {
    dockAllowed = Boolean(value);
    applyVisibility();
  };

  window.__wttrSetDockVisible = setDockVisible;

  const showToast = (message, type = 'success') => {
    const toast = $('#wttr-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.dataset.type = type;
    toast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  };

  const setLive = (active) => {
    const pill = $('#wttr-pill');
    const status = $('#wttr-ptt-status');
    const keyText = $('#wttr-pill-key-text');

    pill?.classList.toggle('is-live', active);
    status?.classList.toggle('is-live', active);

    if (keyText) {
      keyText.textContent = active ? 'CANLI' : settings?.pttKeyLabel || 'Alt';
    }

    if (status) {
      if (active) {
        status.innerHTML = '<strong>Mikrofon açık</strong> · konuşuyorsun';
      } else if (settings?.pttEnabled) {
        status.innerHTML = `Basılı tut: <strong>${settings.pttKeyLabel || 'Alt'}</strong>`;
      } else {
        status.innerHTML = 'Bas-konuş kapalı';
      }
    }
  };

  const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const setUpdateBadge = (active) => {
    $('#wttr-pill')?.classList.toggle('has-update', active);
  };

  const setProgress = (percent) => {
    const box = $('#wttr-update');
    if (!box) return;

    let wrap = $('#wttr-update-progress');
    let bar = $('#wttr-update-progress-bar');

    if (!wrap || !bar) {
      wrap = document.createElement('div');
      wrap.className = 'wttr-progress';
      wrap.id = 'wttr-update-progress';
      bar = document.createElement('span');
      bar.id = 'wttr-update-progress-bar';
      wrap.appendChild(bar);
      box.appendChild(wrap);
    }

    wrap.hidden = false;
    bar.style.width =
      percent === null || percent === undefined
        ? '35%'
        : `${Math.max(0, Math.min(100, Number(percent)))}%`;
  };

  const showUpdateAvailable = (info) => {
    pendingUpdateInfo = info;
    setUpdateBadge(true);

    const box = $('#wttr-update');
    if (!box) return;

    const version = String(info?.latestVersion || '').replace(/[^0-9A-Za-z.\-_]/g, '');
    box.hidden = false;
    box.classList.remove('is-ready');
    box.textContent = '';

    const progress = $('#wttr-update-progress');
    if (progress) progress.hidden = true;

    const title = document.createElement('strong');
    title.textContent = version ? `Yeni sürüm v${version}` : 'Yeni sürüm hazır';
    box.appendChild(title);
    box.appendChild(document.createElement('br'));

    const note = document.createElement('span');
    note.textContent = info?.assetUrl
      ? 'Güncelleme arka planda indiriliyor. Hazır olduğunda yeniden başlatabilirsin.'
      : 'Bu sürüm için otomatik indirme bağlantısı yok.';
    box.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'wttr-update-actions';

    if (info?.assetUrl) {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'wttr-button is-primary is-small';
      download.textContent = 'İndir';
      download.addEventListener('click', () => {
        setProgress(null);
        api()?.downloadUpdate(info).catch(() => {});
      });
      actions.appendChild(download);
    } else if (info?.url) {
      const page = document.createElement('button');
      page.type = 'button';
      page.className = 'wttr-button is-small';
      page.textContent = 'Sürüm sayfası';
      page.addEventListener('click', () => {
        api()?.openUpdate(info.url).catch(() => {});
      });
      actions.appendChild(page);
    }

    if (actions.childElementCount > 0) {
      box.appendChild(actions);
    }
  };

  const showUpdateProgress = (payload) => {
    const box = $('#wttr-update');
    if (!box) return;

    box.hidden = false;
    box.classList.remove('is-ready');

    let title = $('#wttr-update-title');

    if (!title) {
      box.textContent = '';
      title = document.createElement('strong');
      title.id = 'wttr-update-title';
      box.appendChild(title);

      const detail = document.createElement('span');
      detail.id = 'wttr-update-detail';
      box.appendChild(detail);

      const actions = document.createElement('div');
      actions.className = 'wttr-update-actions';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'wttr-button is-small';
      cancel.textContent = 'İptal';
      cancel.addEventListener('click', () => {
        api()?.cancelUpdate().catch(() => {});
        box.hidden = true;
      });
      actions.appendChild(cancel);
      box.appendChild(actions);

      setProgress(0);
    }

    const percent =
      typeof payload?.percent === 'number' ? Math.round(payload.percent) : null;
    const received = Number(payload?.received) || 0;
    const total = Number(payload?.total) || 0;

    title.textContent =
      percent !== null
        ? `Güncelleme indiriliyor… %${percent}`
        : 'Güncelleme indiriliyor…';

    const detail = $('#wttr-update-detail');
    if (detail) {
      detail.textContent =
        total > 0 ? ` ${formatBytes(received)} / ${formatBytes(total)}` : '';
    }

    setProgress(percent);
  };

  const showUpdateDownloaded = (payload) => {
    downloadedUpdate = payload;
    setUpdateBadge(true);

    const box = $('#wttr-update');
    if (!box) return;

    box.hidden = false;
    box.classList.add('is-ready');
    box.textContent = '';

    const title = document.createElement('strong');
    title.textContent = 'Güncelleme hazır.';
    box.appendChild(title);
    box.appendChild(document.createElement('br'));

    const note = document.createElement('span');
    note.textContent = 'Kurulum için uygulama yeniden başlatılacak.';
    box.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'wttr-update-actions';

    const install = document.createElement('button');
    install.type = 'button';
    install.className = 'wttr-button is-primary is-small';
    install.textContent = 'Yeniden başlat ve güncelle';
    install.addEventListener('click', () => {
      api()?.installUpdate(payload.filePath).catch(() => {
        showToast('Güncelleme başlatılamadı.', 'error');
      });
    });
    actions.appendChild(install);
    box.appendChild(actions);

    setProgress(100);
  };

  const showUpdateError = (payload) => {
    const box = $('#wttr-update');
    if (!box) return;

    box.hidden = false;
    box.classList.remove('is-ready');
    box.textContent = '';

    const title = document.createElement('strong');
    title.textContent = 'Güncelleme indirilemedi.';
    box.appendChild(title);
    box.appendChild(document.createElement('br'));

    const note = document.createElement('span');
    note.textContent = payload?.message || 'İnternet bağlantını kontrol et.';
    box.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'wttr-update-actions';

    if (pendingUpdateInfo?.assetUrl) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'wttr-button is-small';
      retry.textContent = 'Tekrar dene';
      retry.addEventListener('click', () => {
        api()?.downloadUpdate(pendingUpdateInfo).catch(() => {});
      });
      actions.appendChild(retry);
    }

    box.appendChild(actions);

    const progress = $('#wttr-update-progress');
    if (progress) progress.hidden = true;
  };

  const setAvatar = (user) => {
    const image = $('#wttr-avatar-img');
    const initial = $('#wttr-avatar-initial');
    if (!image || !initial) return;

    const name = user?.displayName || user?.username || 'Misafir';
    initial.textContent = name.trim().charAt(0).toUpperCase() || 'W';

    if (user?.avatarUrl) {
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
    const user = session?.user || null;
    const authenticated = Boolean(session?.authenticated && user);
    const displayName = user?.displayName || user?.username || 'Misafir';
    const username = user?.username ? `@${user.username}` : 'Giriş yapılmadı';
    const unread = Math.max(0, Number(session?.unreadNotifications) || 0);

    const name = $('#wttr-user-name');
    const meta = $('#wttr-user-meta');
    const badge = $('#wttr-unread');
    const authActions = $('#wttr-auth-actions');
    const logout = $('#wttr-logout');

    if (name) name.textContent = displayName;
    if (meta) meta.textContent = authenticated ? username : 'Giriş yapılmadı';

    if (badge) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = unread === 0;
    }

    authActions?.classList.toggle('wttr-hidden', authenticated);
    logout?.classList.toggle('wttr-hidden', !authenticated);

    setAvatar(user);
    setDockVisible(authenticated);
  };

  const renderSettings = () => {
    if (!settings) return;

    const enabled = $('#wttr-ptt-enabled');
    const notifications = $('#wttr-notifications');
    const closeToTray = $('#wttr-close-to-tray');
    const autoUpdate = $('#wttr-auto-update');
    const keyButton = $('#wttr-ptt-key');
    const version = $('#wttr-version');

    if (enabled) enabled.checked = Boolean(settings.pttEnabled);
    if (notifications) notifications.checked = settings.notificationsEnabled !== false;
    if (closeToTray) closeToTray.checked = settings.closeToTray !== false;
    if (autoUpdate) autoUpdate.checked = settings.autoUpdate !== false;
    if (keyButton && !capturing) keyButton.textContent = settings.pttKeyLabel || 'Alt';
    if (version) version.textContent = `v${settings.version || '1.0.0'}`;

    setLive(false);
  };

  const openPanel = (focusVoice = false) => {
    if (!panel) return;
    panel.hidden = false;

    if (focusVoice) {
      setTimeout(() => {
        $('#wttr-ptt-key')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 60);
    }
  };

  const closePanel = () => {
    if (!panel) return;
    panel.hidden = true;
  };

  const togglePanel = (force) => {
    if (!panel) return;

    const next = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !next;

    if (next) {
      api()?.getSession?.().then((value) => {
        session = value || session;
        renderSession();
      }).catch(() => {});
    }
  };

  const finishCapture = () => {
    if (!capturing) return;

    capturing = false;
    const keyButton = $('#wttr-ptt-key');
    keyButton?.classList.remove('is-capturing');
    if (keyButton && settings) keyButton.textContent = settings.pttKeyLabel || 'Alt';

    window.removeEventListener('keydown', onCaptureKey, true);
    api()?.captureEnd?.();
  };

  const onCaptureKey = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      finishCapture();
      return;
    }

    const code = event.code || event.key;

    if (!code || code === 'Unidentified') {
      showToast('Bu tuş desteklenmiyor. Başka bir tuş dene.', 'error');
      return;
    }

    const keyButton = $('#wttr-ptt-key');
    if (keyButton) keyButton.textContent = 'Kaydediliyor…';

    api()
      ?.saveSettings({ pttKey: code })
      .then((next) => {
        settings = next;
        renderSettings();
        showToast(`Bas-konuş tuşu ${next.pttKeyLabel} olarak kaydedildi.`);
      })
      .catch(() => {
        showToast('Bu tuş desteklenmiyor. Başka bir tuş dene.', 'error');
      })
      .finally(finishCapture);
  };

  const startCapture = () => {
    if (capturing) {
      finishCapture();
      return;
    }

    capturing = true;
    const keyButton = $('#wttr-ptt-key');
    keyButton?.classList.add('is-capturing');
    if (keyButton) keyButton.textContent = 'Bir tuşa bas…';

    api()?.captureStart?.();
    window.addEventListener('keydown', onCaptureKey, true);
  };

  const bind = () => {
    $('#wttr-pill')?.addEventListener('click', (event) => {
      if (event.target.closest('#wttr-pill-gear')) {
        openPanel(true);
        return;
      }

      togglePanel();
    });

    $('#wttr-panel-close')?.addEventListener('click', closePanel);

    $('#wttr-ptt-key')?.addEventListener('click', startCapture);

    $('#wttr-ptt-enabled')?.addEventListener('change', (event) => {
      api()
        ?.saveSettings({ pttEnabled: Boolean(event.target.checked) })
        .then((next) => {
          settings = next;
          renderSettings();
          if (!next.pttEnabled) setLive(false);
        })
        .catch(() => showToast('Ayar kaydedilemedi.', 'error'));
    });

    $('#wttr-notifications')?.addEventListener('change', (event) => {
      api()
        ?.saveSettings({ notificationsEnabled: Boolean(event.target.checked) })
        .then((next) => {
          settings = next;
          renderSettings();
        })
        .catch(() => showToast('Ayar kaydedilemedi.', 'error'));
    });

    $('#wttr-close-to-tray')?.addEventListener('change', (event) => {
      api()
        ?.saveSettings({ closeToTray: Boolean(event.target.checked) })
        .then((next) => {
          settings = next;
          renderSettings();
        })
        .catch(() => showToast('Ayar kaydedilemedi.', 'error'));
    });

    $('#wttr-auto-update')?.addEventListener('change', (event) => {
      api()
        ?.saveSettings({ autoUpdate: Boolean(event.target.checked) })
        .then((next) => {
          settings = next;
          renderSettings();
        })
        .catch(() => showToast('Ayar kaydedilemedi.', 'error'));
    });

    $('#wttr-login')?.addEventListener('click', () => {
      window.__wttrDesktopOpenAuth?.('login');
    });

    $('#wttr-register')?.addEventListener('click', () => {
      window.__wttrDesktopOpenAuth?.('register');
    });

    $('#wttr-logout')?.addEventListener('click', () => {
      api()
        ?.logout()
        .then(() => {
          closePanel();
          showToast('Çıkış yapıldı.');
        })
        .catch(() => showToast('Çıkış yapılamadı.', 'error'));
    });

    root.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.dataset.nav;
        api()?.openSection?.(section).catch(() => {
          showToast('Bölüm açılamadı.', 'error');
        });
        closePanel();
      });
    });

    $('#wttr-mic-test')?.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        showToast('Mikrofon çalışıyor.');
      } catch (error) {
        showToast(`Mikrofon açılamadı: ${error?.message || error}`, 'error');
      }
    });

    $('#wttr-mic-settings')?.addEventListener('click', () => {
      api()?.openMicSettings?.().catch(() => {
        showToast('Windows ayarları açılamadı.', 'error');
      });
    });

    $('#wttr-notify-test')?.addEventListener('click', () => {
      api()
        ?.notifyTest?.()
        .then(() => showToast('Test bildirimi gönderildi.'))
        .catch(() => showToast('Bildirim gönderilemedi.', 'error'));
    });

    $('#wttr-update-check')?.addEventListener('click', async () => {
      const button = $('#wttr-update-check');
      const box = $('#wttr-update');

      if (!button || !box) return;

      button.disabled = true;
      const original = button.innerHTML;
      button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Kontrol ediliyor…';

      try {
        const info = await api().checkUpdates();

        if (info?.error && !info.latestVersion) {
          box.hidden = false;
          box.textContent = 'Güncelleme kontrol edilemedi. İnternet bağlantını kontrol et.';
        } else if (info?.available) {
          showUpdateAvailable(info);

          if (info.assetUrl) {
            api().downloadUpdate(info).catch(() => {});
          }
        } else {
          box.hidden = false;
          box.textContent = `Güncel sürüm: v${info?.currentVersion || settings?.version || '1.0.0'}`;
        }
      } catch {
        box.hidden = false;
        box.textContent = 'Güncelleme kontrol edilemedi.';
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
    });

    document.addEventListener('click', (event) => {
      if (!root || !panel || panel.hidden) return;
      if (root.contains(event.target)) return;
      closePanel();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !capturing && panel && !panel.hidden) {
        closePanel();
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        togglePanel();
      }
    });
  };

  const mount = () => {
    if (!location.hostname || location.hostname !== 'warthunder.tr') return;
    if (mounted && root && document.documentElement.contains(root)) {
      return;
    }

    if (!document.body) {
      setTimeout(mount, 150);
      return;
    }

    if (document.getElementById('wttr-desktop-dock')) {
      root = document.getElementById('wttr-desktop-dock');
      mounted = true;
      return;
    }

    root = document.createElement('div');
    root.id = 'wttr-desktop-dock';
    root.innerHTML = `
      <button class="wttr-pill" id="wttr-pill" type="button" aria-label="wttr-app masaüstü paneli">
        <img class="wttr-pill-logo" src="${LOGO}" alt="" />
        <span class="wttr-pill-copy">
          <span class="wttr-pill-title">wttr-app</span>
          <span class="wttr-pill-key"><span class="wttr-dot"></span><span id="wttr-pill-key-text">Alt</span></span>
        </span>
        <span class="wttr-pill-gear" id="wttr-pill-gear" title="Ayarlar">⚙</span>
      </button>

      <section class="wttr-panel" id="wttr-dock-panel" hidden>
        <div class="wttr-panel-head">
          <img class="wttr-panel-logo" src="${LOGO}" alt="" />
          <div class="wttr-panel-head-copy">
            <span class="wttr-panel-kicker">MASAÜSTÜ UYGULAMASI</span>
            <h2 class="wttr-panel-title">War Thunder Türkiye</h2>
            <span class="wttr-panel-version">wttr-app <span id="wttr-version">v1.0.0</span></span>
          </div>
          <button class="wttr-icon-button" id="wttr-panel-close" type="button" title="Kapat">✕</button>
        </div>

        <div class="wttr-user">
          <span class="wttr-avatar" id="wttr-avatar">
            <span id="wttr-avatar-initial">W</span>
            <img id="wttr-avatar-img" alt="" hidden />
          </span>
          <div class="wttr-user-copy">
            <strong class="wttr-user-name" id="wttr-user-name">Misafir</strong>
            <small class="wttr-user-meta" id="wttr-user-meta">Giriş yapılmadı</small>
          </div>
          <span class="wttr-unread" id="wttr-unread" hidden>0</span>
          <div class="wttr-auth-actions" id="wttr-auth-actions">
            <button class="wttr-button is-primary is-small" id="wttr-login" type="button">Giriş</button>
            <button class="wttr-button is-small" id="wttr-register" type="button">Kayıt</button>
          </div>
          <button class="wttr-button is-danger is-small wttr-hidden" id="wttr-logout" type="button">Çıkış</button>
        </div>

        <div class="wttr-body">
          <section class="wttr-section">
            <p class="wttr-label">Hızlı Erişim</p>
            <div class="wttr-nav">
              <button class="wttr-nav-button is-primary" data-nav="social" type="button"><span class="wttr-nav-icon"><i class="fas fa-users"></i></span>Sosyal</button>
              <button class="wttr-nav-button" data-nav="rooms" type="button"><span class="wttr-nav-icon"><i class="fas fa-tower-broadcast"></i></span>Sesli Odalar</button>
              <button class="wttr-nav-button" data-nav="forum" type="button"><span class="wttr-nav-icon"><i class="fas fa-comments"></i></span>Forum</button>
              <button class="wttr-nav-button" data-nav="blog" type="button"><span class="wttr-nav-icon"><i class="fas fa-newspaper"></i></span>Blog</button>
              <button class="wttr-nav-button" data-nav="notifications" type="button"><span class="wttr-nav-icon"><i class="fas fa-bell"></i></span>Bildirimler</button>
              <button class="wttr-nav-button" data-nav="social" type="button"><span class="wttr-nav-icon"><i class="fas fa-house"></i></span>Akış</button>
            </div>
          </section>

          <section class="wttr-section">
            <p class="wttr-label">Sesli Konuşma</p>
            <div class="wttr-row">
              <div class="wttr-row-copy">
                <strong class="wttr-row-title">Bas-konuş</strong>
                <small class="wttr-row-note">Uygulama arka planda veya tepside olsa da çalışır.</small>
              </div>
              <label class="wttr-switch">
                <input type="checkbox" id="wttr-ptt-enabled" />
                <span class="wttr-switch-track"></span>
              </label>
            </div>
            <div class="wttr-row">
              <div class="wttr-row-copy">
                <strong class="wttr-row-title">Bas-konuş tuşu</strong>
                <small class="wttr-row-note">Butona tıkla, ardından istediğin tuşa bas.</small>
              </div>
              <button class="wttr-key-button" id="wttr-ptt-key" type="button">Alt</button>
            </div>
            <p class="wttr-status" id="wttr-ptt-status">Basılı tut: <strong>Alt</strong></p>
            <div class="wttr-actions">
              <button class="wttr-button" id="wttr-mic-test" type="button"><i class="fas fa-microphone"></i> Mikrofonu test et</button>
              <button class="wttr-button" id="wttr-mic-settings" type="button"><i class="fas fa-sliders"></i> Windows ayarları</button>
            </div>
          </section>

          <section class="wttr-section">
            <p class="wttr-label">Uygulama</p>
            <div class="wttr-row">
              <div class="wttr-row-copy">
                <strong class="wttr-row-title">Windows bildirimleri</strong>
                <small class="wttr-row-note">Yeni Flarum bildirimlerini masaüstünde göster.</small>
              </div>
              <label class="wttr-switch">
                <input type="checkbox" id="wttr-notifications" />
                <span class="wttr-switch-track"></span>
              </label>
            </div>
            <div class="wttr-row">
              <div class="wttr-row-copy">
                <strong class="wttr-row-title">Kapatınca tepsiye küçült</strong>
                <small class="wttr-row-note">Kapatma düğmesi uygulamayı sonlandırmaz.</small>
              </div>
              <label class="wttr-switch">
                <input type="checkbox" id="wttr-close-to-tray" />
                <span class="wttr-switch-track"></span>
              </label>
            </div>
            <div class="wttr-row">
              <div class="wttr-row-copy">
                <strong class="wttr-row-title">Otomatik güncelleme</strong>
                <small class="wttr-row-note">Açılışta GitHub üzerinden denetle ve arka planda indir.</small>
              </div>
              <label class="wttr-switch">
                <input type="checkbox" id="wttr-auto-update" />
                <span class="wttr-switch-track"></span>
              </label>
            </div>
            <div class="wttr-actions">
              <button class="wttr-button" id="wttr-update-check" type="button"><i class="fas fa-rotate"></i> Güncellemeyi kontrol et</button>
              <button class="wttr-button" id="wttr-notify-test" type="button"><i class="fas fa-bell"></i> Bildirim testi</button>
            </div>
            <div class="wttr-update" id="wttr-update" hidden></div>
          </section>
        </div>

        <div class="wttr-footer">
          <span>wttr-app · warthunder.tr</span>
          <a href="https://warthunder.tr" data-external="https://warthunder.tr">Siteyi aç</a>
        </div>

        <div class="wttr-toast" id="wttr-toast" hidden></div>
      </section>
    `;

    document.body.appendChild(root);
    panel = $('#wttr-dock-panel');
    mounted = true;
    applyVisibility();

    bind();

    root.querySelectorAll('[data-external]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        api()?.openExternal?.(link.dataset.external).catch(() => {});
      });
    });

    const client = api();
    if (!client) return;

    Promise.all([
      client.getSettings(),
      client.getSession(),
      client.getUpdateState?.() || Promise.resolve(null),
    ])
      .then(([nextSettings, nextSession, updateState]) => {
        settings = nextSettings || settings;
        session = nextSession || session;
        renderSettings();
        renderSession();

        if (updateState?.pending) {
          showUpdateDownloaded(updateState.pending);
        } else if (updateState?.info?.available) {
          showUpdateAvailable(updateState.info);
          if (updateState.progress) showUpdateProgress(updateState.progress);
        }
      })
      .catch(() => {
        showToast('Uygulama ayarları yüklenemedi.', 'error');
      });

    client.onSettings?.((next) => {
      settings = next;
      renderSettings();
    });

    client.onSession?.((next) => {
      session = next;
      renderSession();
    });

    client.onPtt?.((payload) => {
      setLive(Boolean(payload?.active));
    });

    client.onDockCommand?.((command) => {
      if (command === 'open-settings') openPanel(true);
      else if (command === 'toggle') togglePanel();
    });

    client.onUpdate?.((info) => {
      if (!info?.available) return;
      showUpdateAvailable(info);
    });

    client.onUpdateProgress?.((payload) => {
      showUpdateProgress(payload);
    });

    client.onUpdateDownloaded?.((payload) => {
      showUpdateDownloaded(payload);
    });

    client.onUpdateError?.((payload) => {
      showUpdateError(payload);
    });

    applyVisibility();
    setInterval(applyVisibility, 1200);
  };

  window.__wttrDockMount = mount;
  window.__wttrDockToggle = () => togglePanel();
  window.__wttrDockOpenSettings = () => openPanel(true);

  const waitForApi = (attempt = 0) => {
    const client = api();
    if (client) {
      mount();
      return;
    }

    if (attempt > 100) return;
    setTimeout(() => waitForApi(attempt + 1), 150);
  };

  waitForApi();
})();
