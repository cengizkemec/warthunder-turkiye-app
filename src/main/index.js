'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  shell,
} = require('electron');

const { log } = require('./log');
const settingsStore = require('./settings');
const ptt = require('./ptt');
const {
  createMainWindow,
  getMainWindow,
  openSection,
  reload,
  sendDockCommand,
  showWindow,
  toggleWindow,
  navigate,
  windowIsVisible,
} = require('./site');
const {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  launchInstaller,
  openRelease,
} = require('./updates');
const { createTray, updateTray, destroyTray } = require('./tray');
const overlay = require('./overlay');
const { tryBindingFor } = require('../shared/keymap');

const APP_ID = 'tr.warthunder.desktop';
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const IS_DEV = process.argv.includes('--dev');

let currentSession = {
  authenticated: false,
  user: null,
  unreadNotifications: 0,
  path: '/',
  url: '',
  title: '',
};
let quitting = false;
let pttPaused = false;
let notificationsInitialized = false;
let smokeTimer = null;
let lastUpdateInfo = null;
let pendingUpdate = null;
let updateDownloadController = null;
let updateDownloadPromise = null;
let updateNotificationShown = false;
let lastUpdateProgress = null;
let lastSyncedVoice = null;

app.setName('wttr-app');
app.setAppUserModelId(APP_ID);

if (process.env.WTTR_USER_DATA_DIR) {
  const userDataDir = path.resolve(process.env.WTTR_USER_DATA_DIR);
  fs.mkdirSync(userDataDir, { recursive: true });
  app.setPath('userData', userDataDir);
}

if (!IS_DEV) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

process.on('uncaughtException', (error) => {
  log('uncaught-exception', error);
});

process.on('unhandledRejection', (reason) => {
  log('unhandled-rejection', reason);
});

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

function publicSession() {
  return {
    authenticated: Boolean(currentSession.authenticated),
    user: currentSession.user || null,
    unreadNotifications: Math.max(0, Number(currentSession.unreadNotifications) || 0),
    path: currentSession.path || '/',
    url: currentSession.url || '',
    title: currentSession.title || '',
  };
}

function sendToDock(channel, payload) {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function handleOverlayAction(action) {
  const window = getMainWindow();
  const state = overlay.getVoiceState();

  if (!window || window.isDestroyed()) return;

  if (action === 'toggle-mic' || action === 'toggle-deafen' || action === 'leave') {
    window.webContents
      .executeJavaScript(
        `window.__wttrDesktopVoiceAction ? window.__wttrDesktopVoiceAction(${JSON.stringify(
          action
        )}) : false`,
        true
      )
      .catch((error) => log('overlay:voice-action-error', action, error));
    return;
  }

  if (action === 'show-main') {
    showWindow();
    return;
  }

  if (action === 'open-room') {
    showWindow();

    if (state?.room?.url) {
      try {
        navigate(new URL(state.room.url, 'https://warthunder.tr').toString());
      } catch (error) {
        log('overlay:open-room-error', error);
      }
    }

    return;
  }

  if (action === 'open-settings') {
    showWindow();
    sendDockCommand('open-settings');
    return;
  }

  if (action === 'hide-overlay') {
    overlay.setEnabled(false);
    const publicValue = settingsStore.publicSettings();
    sendToDock('settings:changed', publicValue);
    updateTray(publicValue, publicSession());
  }
}

function toggleOverlay() {
  const settings = settingsStore.get();
  overlay.setEnabled(!settings.overlayEnabled);

  const publicValue = settingsStore.publicSettings();
  sendToDock('settings:changed', publicValue);
  updateTray(publicValue, publicSession());
}

function syncVoiceSettings() {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) return;

  const settings = settingsStore.publicSettings();
  const signature = `${settings.pttKey}:true`;

  if (lastSyncedVoice === signature) return;

  // The desktop toggle controls the global helper. The site's own PTT
  // preference stays enabled so the in-app voice panel button keeps working.
  const payload = JSON.stringify({
    pttKey: settings.pttKey,
    pushToTalk: true,
  });

  window.webContents
    .executeJavaScript(
      `window.__wttrDesktopSyncVoiceSettings ? window.__wttrDesktopSyncVoiceSettings(${payload}) : null`,
      true
    )
    .then((result) => {
      if (result && result.ok) {
        lastSyncedVoice = signature;
        log('voice-sync:ok', settings.pttKey);
      } else {
        log('voice-sync:not-ready', JSON.stringify(result || null));
      }
    })
    .catch((error) => log('voice-sync:error', error));
}

function startUpdateDownload(info) {
  if (!info || typeof info !== 'object' || !info.latestVersion) {
    return Promise.reject(new Error('missing update info'));
  }

  if (updateDownloadPromise) {
    return updateDownloadPromise;
  }

  if (!info.assetUrl) {
    const error = new Error('İndirme adresi bulunamadı.');

    sendToDock('update:error', { message: error.message, info });
    return Promise.reject(error);
  }

  lastUpdateInfo = info;
  updateDownloadController = new AbortController();

  updateDownloadPromise = (async () => {
    try {
      lastUpdateProgress = {
        phase: 'start',
        percent: 0,
        received: 0,
        total: Number(info.size) || 0,
        info,
      };
      sendToDock('update:progress', lastUpdateProgress);

      const result = await downloadUpdate(info, {
        signal: updateDownloadController.signal,
        onProgress: (progress) => {
          lastUpdateProgress = {
            phase: 'downloading',
            ...progress,
            info,
          };
          sendToDock('update:progress', lastUpdateProgress);
        },
      });

      pendingUpdate = {
        info,
        filePath: result.filePath,
        sha256: result.sha256,
        size: result.size,
      };
      lastUpdateProgress = null;

      sendToDock('update:downloaded', {
        info,
        filePath: result.filePath,
        sha256: result.sha256,
        size: result.size,
      });

      if (!updateNotificationShown && Notification.isSupported()) {
        updateNotificationShown = true;

        const notification = new Notification({
          title: 'Güncelleme hazır',
          body: `wttr-app v${info.latestVersion} indirildi. Uygulamadan çıkınca kurulacak.`,
          icon: nativeImage.createFromPath(appIconPath()),
          silent: false,
        });

        notification.on('click', () => {
          showWindow();
          sendDockCommand('open-settings');
        });

        notification.show();
      }

      return { ok: true, ...result };
    } catch (error) {
      log('update:download-error', error);
      lastUpdateProgress = null;
      sendToDock('update:error', {
        message: String(error?.message || error),
        info,
      });
      return { ok: false, error: String(error?.message || error) };
    } finally {
      updateDownloadController = null;
      updateDownloadPromise = null;
    }
  })();

  return updateDownloadPromise;
}

function sendPtt(active, binding) {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) return;

  const settings = settingsStore.publicSettings();
  const resolved =
    binding ||
    tryBindingFor(settings.pttKey) ||
    tryBindingFor('AltLeft');

  const payload = {
    active: Boolean(active),
    code: resolved.code,
    key: resolved.key,
    label: resolved.label,
  };

  sendToDock('ptt:state', payload);
  overlay.updatePtt(payload);

  window.webContents
    .executeJavaScript(
      `window.__wttrDesktopPtt ? window.__wttrDesktopPtt(${JSON.stringify(payload)}) : false`,
      true
    )
    .catch((error) => log('ptt:dispatch-error', error));
}

function handleSessionReport(payload) {
  if (!payload || typeof payload !== 'object') return;

  const previous = currentSession;
  const authenticated = Boolean(payload.authenticated);
  const user =
    authenticated && payload.user && typeof payload.user === 'object'
      ? {
          id: payload.user.id ?? null,
          username: payload.user.username || null,
          displayName: payload.user.displayName || payload.user.username || null,
          avatarUrl: payload.user.avatarUrl || null,
          isAdmin: Boolean(payload.user.isAdmin),
        }
      : null;

  currentSession = {
    authenticated,
    user,
    unreadNotifications: Math.max(0, Number(payload.unreadNotifications) || 0),
    path: typeof payload.path === 'string' ? payload.path : '/',
    url: typeof payload.url === 'string' ? payload.url : '',
    title: typeof payload.title === 'string' ? payload.title : '',
  };

  const publicValue = publicSession();
  sendToDock('session:changed', publicValue);

  if (!authenticated) {
    overlay.updateVoiceState({
      connected: false,
      connecting: false,
      connectionState: 'disconnected',
      participants: [],
    });
  }

  updateTray(settingsStore.publicSettings(), publicValue);

  if (authenticated && !previous.authenticated) {
    log('session:authenticated', user?.username || 'unknown');

    if (IS_SMOKE_TEST) {
      // The smoke test only needs the page itself.
    }

    if (currentSession.path === '/' || currentSession.path === '/login') {
      setTimeout(() => navigate('https://warthunder.tr/social'), 700);
    }

    lastSyncedVoice = null;
    setTimeout(syncVoiceSettings, 1200);
  }

  if (authenticated) {
    const settings = settingsStore.publicSettings();

    if (lastSyncedVoice !== `${settings.pttKey}:true`) {
      setTimeout(syncVoiceSettings, 300);
    }
  }

  if (!authenticated && previous.authenticated) {
    lastSyncedVoice = null;
    log('session:guest');
  }
}

function setupIpc() {
  ipcMain.handle('settings:get', () => settingsStore.publicSettings());

  ipcMain.handle('settings:save', (_event, patch) => {
    const previous = settingsStore.get();
    const next = settingsStore.save(patch || {});
    const publicValue = settingsStore.publicSettings();

    if (previous.pttKey !== next.pttKey) {
      lastSyncedVoice = null;
      ptt.restart(next.pttKey);
    }

    if (!next.pttEnabled) {
      ptt.setPaused(true);
      pttPaused = true;
      sendPtt(false);
    } else if (pttPaused && previous.pttEnabled !== next.pttEnabled) {
      pttPaused = false;
      ptt.setPaused(false);
    }

    sendToDock('settings:changed', publicValue);
    overlay.updateSettings(publicValue);
    updateTray(publicValue, publicSession());
    syncVoiceSettings();

    if (
      next.autoUpdate &&
      lastUpdateInfo?.available &&
      !pendingUpdate &&
      !updateDownloadPromise
    ) {
      startUpdateDownload(lastUpdateInfo).catch(() => {});
    }

    return publicValue;
  });

  ipcMain.handle('session:get', () => publicSession());

  ipcMain.on('session:report', (_event, payload) => {
    handleSessionReport(payload);
  });

  ipcMain.on('voice:report', (_event, payload) => {
    overlay.updateVoiceState(payload);
  });

  ipcMain.on('notifications:report', (_event, payload) => {
    handleNotifications(payload);
  });

  ipcMain.on('ptt:capture', (_event, active) => {
    pttPaused = Boolean(active);
    ptt.setPaused(pttPaused);

    if (pttPaused) {
      sendPtt(false);
    }
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:open-external', async (_event, url) => {
    const target = new URL(String(url || ''));

    if (target.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }

    const host = target.hostname.toLowerCase();
    const allowed =
      host === 'warthunder.tr' ||
      host === 'github.com' ||
      host.endsWith('.githubusercontent.com') ||
      host === 'discord.com' ||
      host === 'discord.gg' ||
      host === 'twitch.tv' ||
      host.endsWith('.twitch.tv') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be';

    if (!allowed) {
      throw new Error('unsupported host');
    }

    await shell.openExternal(target.toString());
  });

  ipcMain.handle('app:open-mic-settings', async () => {
    if (process.platform !== 'win32') {
      throw new Error('Windows only');
    }

    await shell.openExternal('ms-settings:privacy-microphone');
  });

  ipcMain.handle('app:notify-test', () => {
    showTestNotification();
  });

  ipcMain.handle('app:logout', async () => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;

    await window.webContents
      .executeJavaScript(
        `(() => {
          try {
            if (window.WTTRDesktop && typeof window.WTTRDesktop.logout === 'function') {
              return window.WTTRDesktop.logout();
            }
            if (window.app && window.app.session && typeof window.app.session.logout === 'function') {
              window.app.session.logout();
              return true;
            }
          } catch (error) {}
          return false;
        })();`,
        true
      )
      .catch((error) => log('logout:error', error));
  });

  ipcMain.handle('app:reload', () => {
    reload();
  });

  ipcMain.handle('app:open-section', async (_event, section) => {
    await openSection(section);
  });

  ipcMain.handle('app:update-check', async () => {
    const info = await checkForUpdates(app.getVersion());
    lastUpdateInfo = info;

    if (info?.available) {
      sendToDock('update:available', info);

      if (
        settingsStore.get().autoUpdate &&
        info.assetUrl &&
        app.isPackaged &&
        !pendingUpdate &&
        !updateDownloadPromise
      ) {
        startUpdateDownload(info).catch(() => {});
      }
    }

    return info;
  });

  ipcMain.handle('app:update-state', () => ({
    info: lastUpdateInfo,
    pending: pendingUpdate,
    progress: lastUpdateProgress,
    downloading: Boolean(updateDownloadPromise),
  }));

  ipcMain.handle('app:update-download', async (_event, info) => {
    const target = info && typeof info === 'object' ? info : lastUpdateInfo;
    return startUpdateDownload(target);
  });

  ipcMain.handle('app:update-install', async (_event, filePath) => {
    const target = filePath || pendingUpdate?.filePath;

    if (!target) {
      throw new Error('Güncelleme henüz indirilmedi.');
    }

    await installUpdate(target);
    return { ok: true };
  });

  ipcMain.handle('app:update-cancel', () => {
    if (updateDownloadController) {
      updateDownloadController.abort();
      updateDownloadController = null;
    }

    sendToDock('update:error', { message: 'Güncelleme indirmesi iptal edildi.' });
    return { ok: true };
  });

  ipcMain.handle('app:update-open', async (_event, url) => {
    await openRelease(url);
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });
}

function showTestNotification() {
  if (!Notification.isSupported()) {
    throw new Error('notifications are not supported');
  }

  const notification = new Notification({
    title: 'War Thunder Türkiye',
    body: 'Bildirimler çalışıyor. Yeni Flarum bildirimleri burada görünecek.',
    icon: nativeImage.createFromPath(appIconPath()),
    silent: false,
  });

  notification.show();
}

function handleNotifications(payload) {
  if (!payload || !Array.isArray(payload.items)) return;

  const settings = settingsStore.get();
  const items = payload.items
    .map((item) => ({
      id: item?.id ? String(item.id) : '',
      label: typeof item?.label === 'string' ? item.label : 'Yeni bildirim',
      isRead: Boolean(item?.isRead),
      createdAt: item?.createdAt || null,
      fromUser: item?.fromUser || null,
      url: typeof item?.url === 'string' ? item.url : '/notifications',
    }))
    .filter((item) => item.id);

  if (items.length === 0) return;

  if (payload.initial || !notificationsInitialized) {
    notificationsInitialized = true;
    settingsStore.markNotificationsSeen(items.map((item) => item.id));
    return;
  }

  const seen = new Set(settings.seenNotificationIds || []);
  const fresh = items.filter((item) => !item.isRead && !seen.has(item.id));

  if (fresh.length === 0) return;

  if (settings.notificationsEnabled && Notification.isSupported()) {
    for (const item of fresh.slice(0, 3)) {
      const from =
        item.fromUser?.displayName || item.fromUser?.username || '';
      const body = [item.label, from].filter(Boolean).join(' · ');

      const notification = new Notification({
        title: 'War Thunder Türkiye',
        body,
        icon: nativeImage.createFromPath(appIconPath()),
        silent: false,
      });

      notification.on('click', () => {
        showWindow();

        if (item.url && item.url.startsWith('/')) {
          navigate(`https://warthunder.tr${item.url}`);
        } else if (item.url && item.url.startsWith('https://warthunder.tr')) {
          navigate(item.url);
        }
      });

      notification.show();
    }
  }

  settingsStore.markNotificationsSeen(fresh.map((item) => item.id));
}

function attachWindowEvents() {
  const window = getMainWindow();
  if (!window) return;

  window.on('close', (event) => {
    if (quitting) return;

    const settings = settingsStore.get();

    if (settings.closeToTray) {
      event.preventDefault();
      window.hide();
      return;
    }

    quitting = true;
    app.quit();
  });

  if (IS_DEV) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  if (IS_SMOKE_TEST) {
    const attemptSmoke = async (attempt) => {
      try {
        const result = await window.webContents.executeJavaScript(
          `({
            url: location.href,
            title: document.title,
            hasApp: Boolean(window.app),
            hasDock: Boolean(document.getElementById('wttr-desktop-dock')),
            dockVisible: (() => {
              const node = document.getElementById('wttr-desktop-dock');
              return node ? getComputedStyle(node).display !== 'none' : false;
            })(),
            hasAuthShell: Boolean(document.getElementById('wttr-auth-shell')),
            hasDesktopBridge: Boolean(window.wttrDesktop),
            hasSiteBridge: Boolean(window.WTTRDesktop),
            hasLoginModal: Boolean(document.querySelector('.Modal-content')),
            bodySession: document.body ? document.body.dataset.session || null : null
          })`,
          true
        );

        if (!result.hasApp && attempt < 6) {
          setTimeout(() => attemptSmoke(attempt + 1), 3000);
          return;
        }

        log('smoke:result', JSON.stringify(result));
        console.log('SMOKE_RESULT ' + JSON.stringify(result));
        app.quit();
      } catch (error) {
        if (attempt < 6) {
          setTimeout(() => attemptSmoke(attempt + 1), 3000);
          return;
        }

        log('smoke:error', error);
        console.log('SMOKE_ERROR ' + String(error));
        app.quit();
      }
    };

    clearTimeout(smokeTimer);
    smokeTimer = setTimeout(() => attemptSmoke(0), 5000);

    window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      log('smoke:did-fail-load', code, description, url);
      console.log('SMOKE_FAIL ' + JSON.stringify({ code, description, url }));
    });

    setTimeout(() => {
      log('smoke:hard-timeout');
      console.log('SMOKE_TIMEOUT');
      app.quit();
    }, 45000);
  }
}

function setupPtt() {
  const settings = settingsStore.get();

  ptt.configure({
    stateHandler: (active, binding) => {
      if (pttPaused) return;

      const current = settingsStore.get();

      if (!current.pttEnabled) {
        if (!active) sendPtt(false, binding);
        return;
      }

      sendPtt(active, binding);
    },
    availabilityHandler: (available, error) => {
      log('ptt:availability', available, error || '');
    },
  });

  ptt.start(settings.pttKey);
}

async function bootstrap() {
  log('bootstrap:start');
  settingsStore.load();
  setupIpc();
  log('bootstrap:ipc-ready');

  Menu.setApplicationMenu(null);

  createMainWindow();
  log('bootstrap:window-created');
  attachWindowEvents();
  log('bootstrap:window-events');

  overlay.create({ actionHandler: handleOverlayAction });
  log('bootstrap:overlay-created');

  const settings = settingsStore.publicSettings();

  if (process.env.WTTR_NO_PTT === '1') {
    log('bootstrap:ptt-disabled');
  } else {
    setupPtt();
    log('bootstrap:ptt-started');
  }

  createTray({
    settings,
    session: publicSession(),
    onToggleOverlay: toggleOverlay,
  });
  log('bootstrap:tray-created');

  if (!IS_SMOKE_TEST) {
    setTimeout(() => {
      checkForUpdates(app.getVersion())
        .then((info) => {
          lastUpdateInfo = info;

          if (info?.available) {
            sendToDock('update:available', info);

            if (
              settingsStore.get().autoUpdate &&
              info.assetUrl &&
              app.isPackaged &&
              !pendingUpdate &&
              !updateDownloadPromise
            ) {
              startUpdateDownload(info).catch((error) =>
                log('startup-update-download:error', error)
              );
            }
          }
        })
        .catch((error) => log('startup-update-check:error', error));
    }, 3000);
  }

  log('app:ready', `version=${app.getVersion()}`, `packaged=${app.isPackaged}`);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(bootstrap).catch((error) => {
    log('bootstrap:error', error);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      attachWindowEvents();
    } else {
      showWindow();
    }
  });

  app.on('window-all-closed', () => {
    // wttr-app is a tray application; keep running until the user quits.
  });

  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(smokeTimer);

    if (updateDownloadController) {
      updateDownloadController.abort();
      updateDownloadController = null;
    }

    if (pendingUpdate?.filePath && settingsStore.get().autoUpdate) {
      try {
        const started = launchInstaller(pendingUpdate.filePath);

        if (started) {
          log('auto-update:install-on-quit', pendingUpdate.filePath);
        }
      } catch (error) {
        log('auto-update:install-on-quit-error', error);
      }
    }

    ptt.stop();
    overlay.destroy();
    destroyTray();
    log('app:quit');

    // A blocked PTT worker (for example while Windows Defender scans the
    // helper) must not prevent the process from exiting.
    setTimeout(() => {
      app.exit(0);
    }, 1500).unref();
  });
}
