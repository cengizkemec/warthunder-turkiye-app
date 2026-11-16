'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  desktopCapturer,
  screen,
  session,
  shell,
} = require('electron');
const { log } = require('./log');

const SITE_ORIGIN = 'https://warthunder.tr';
const HOME_URL = `${SITE_ORIGIN}/social`;
const PARTITION = 'persist:warthunder';
const ALLOWED_HOSTS = new Set(['warthunder.tr', 'www.warthunder.tr']);
const AUTH_HOSTS = new Set([
  'accounts.google.com',
  'discord.com',
  'discordapp.com',
  'steamcommunity.com',
  'steampowered.com',
  'github.com',
  'appleid.apple.com',
  'challenges.cloudflare.com',
  'login.live.com',
  'www.facebook.com',
  'x.com',
  'twitter.com',
]);

const SECTIONS = Object.freeze({
  social: '/social',
  rooms: '/social/rooms',
  forum: '/all',
  blog: '/',
  notifications: '/notifications',
});

let mainWindow = null;
let dockCss = null;
let dockScript = null;
let authBackground = null;

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'renderer', name), 'utf8');
}

function readAuthBackground() {
  if (authBackground) return authBackground;

  try {
    const target = app.isPackaged
      ? path.join(process.resourcesPath, 'auth-bg.webp')
      : path.join(__dirname, '..', '..', 'assets', 'auth-bg.webp');

    const bytes = fs.readFileSync(target);
    authBackground = `data:image/webp;base64,${bytes.toString('base64')}`;
  } catch (error) {
    log('auth-background:read-error', error);
    authBackground = '';
  }

  return authBackground;
}

function getDockAssets() {
  if (!dockCss || !app.isPackaged) dockCss = readAsset('dock.css');

  if (!dockScript || !app.isPackaged) {
    dockScript = `${readAsset('site.js')}\n${readAsset('dock.js')}`;
  }

  return { css: dockCss, script: dockScript, authBackground: readAuthBackground() };
}

function isSiteHost(host) {
  return ALLOWED_HOSTS.has(String(host || '').toLowerCase());
}

function isAuthHost(host) {
  return AUTH_HOSTS.has(String(host || '').toLowerCase());
}

function isSiteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isSiteHost(url.hostname);
  } catch {
    return false;
  }
}

function configureSession(ses) {
  const sitePermissions = new Set([
    'media',
    'notifications',
    'clipboard-read',
    'clipboard-sanitized-write',
    'fullscreen',
    'display-capture',
    'pointerLock',
    'storage-access',
    'top-level-storage-access',
  ]);

  // Turnstile runs in a challenges.cloudflare.com iframe. It needs storage
  // access for a reliable challenge; denying every permission there makes the
  // widget fail with "verifying you are human" errors.
  const challengePermissions = new Set([
    'storage-access',
    'top-level-storage-access',
    'clipboard-sanitized-write',
  ]);
  const challengeOrigin = 'https://challenges.cloudflare.com';

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    try {
      const origin = new URL(details.requestingUrl || '').origin;
      const permitted =
        (origin === SITE_ORIGIN && sitePermissions.has(permission)) ||
        (origin === challengeOrigin && challengePermissions.has(permission));

      if (!permitted) {
        log('permission:denied', permission, origin);
      }

      callback(permitted);
    } catch {
      callback(false);
    }
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const origin = String(requestingOrigin || '');

    return (
      (origin === SITE_ORIGIN && sitePermissions.has(permission)) ||
      (origin === challengeOrigin && challengePermissions.has(permission))
    );
  });

  try {
    ses.setSpellCheckerLanguages(['tr-TR', 'en-US']);
  } catch {
    // The language pack may not be installed.
  }

  try {
    ses.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 0, height: 0 },
          });

          const primary = screen.getPrimaryDisplay();
          const source =
            sources.find((item) => item.display_id === String(primary.id)) ||
            sources.find((item) => item.id.startsWith('screen:')) ||
            sources[0];

          if (!source) {
            callback({});
            return;
          }

          callback({ video: source, audio: 'loopback' });
        } catch (error) {
          log('display-capture:error', error);
          callback({});
        }
      },
      { useSystemPicker: true }
    );
  } catch (error) {
    log('display-capture:setup-error', error);
  }
}

function buildContextMenu(window, params) {
  const template = [
    {
      label: 'Geri',
      enabled: window.webContents.canGoBack(),
      click: () => window.webContents.goBack(),
    },
    {
      label: 'İleri',
      enabled: window.webContents.canGoForward(),
      click: () => window.webContents.goForward(),
    },
    { type: 'separator' },
    { label: 'Yenile', click: () => window.reload() },
    { type: 'separator' },
    {
      label: 'Kopyala',
      role: 'copy',
      enabled: params.editFlags.canCopy,
    },
    {
      label: 'Yapıştır',
      role: 'paste',
      enabled: params.editFlags.canPaste,
    },
    {
      label: 'Tümünü seç',
      role: 'selectAll',
      enabled: params.editFlags.canSelectAll,
    },
  ];

  if (params.linkURL) {
    template.push(
      { type: 'separator' },
      {
        label: 'Bağlantıyı tarayıcıda aç',
        click: () => shell.openExternal(params.linkURL).catch(() => {}),
      }
    );
  }

  if (!appIsPackaged()) {
    template.push(
      { type: 'separator' },
      {
        label: 'Geliştirici araçları',
        click: () => window.webContents.toggleDevTools(),
      }
    );
  }

  Menu.buildFromTemplate(template).popup({ window });
}

function appIsPackaged() {
  return app.isPackaged;
}

function windowIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

async function injectDock(window) {
  if (!window || window.isDestroyed()) return;
  if (!isSiteUrl(window.webContents.getURL())) return;

  const { css, script, authBackground: background } = getDockAssets();

  try {
    await window.webContents.insertCSS(css);
  } catch (error) {
    log('inject:css-error', error);
  }

  try {
    await window.webContents.executeJavaScript(
      `(function () {\nwindow.__wttrAuthBackground = ${JSON.stringify(
        background
      )};\n${script}\n})();`,
      true
    );
  } catch (error) {
    log('inject:script-error', error);
  }
}

function showOffline(window) {
  if (!window || window.isDestroyed()) return;

  const offline = path.join(__dirname, '..', 'renderer', 'offline.html');
  window.loadFile(offline).catch((error) => log('offline:load-error', error));
}

function createMainWindow() {
  const partition = session.fromPartition(PARTITION);
  configureSession(partition);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    center: true,
    backgroundColor: '#0b1114',
    title: 'War Thunder Türkiye',
    icon: windowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle('War Thunder Türkiye');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);

      if (parsed.protocol === 'https:' && isSiteHost(parsed.hostname)) {
        mainWindow.loadURL(parsed.toString()).catch((error) => log('window-open:error', error));
        return { action: 'deny' };
      }

      if (parsed.protocol === 'https:' && isAuthHost(parsed.hostname)) {
        // Keep OAuth and Turnstile inside a popup that shares the same
        // persistent session. Replacing the login page in the main window
        // breaks providers that rely on window.opener/postMessage.
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: mainWindow,
            modal: false,
            width: parsed.hostname === 'challenges.cloudflare.com' ? 500 : 520,
            height: parsed.hostname === 'challenges.cloudflare.com' ? 650 : 720,
            minWidth: 400,
            minHeight: 500,
            autoHideMenuBar: true,
            title:
              parsed.hostname === 'challenges.cloudflare.com'
                ? 'Doğrulama'
                : 'Giriş',
            webPreferences: {
              partition: PARTITION,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }

      if (['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
        shell.openExternal(parsed.toString()).catch(() => {});
      }
    } catch {
      // Ignore malformed URLs.
    }

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);

      if (parsed.protocol === 'https:' && (isSiteHost(parsed.hostname) || isAuthHost(parsed.hostname))) {
        return;
      }

      event.preventDefault();

      if (['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
        shell.openExternal(parsed.toString()).catch(() => {});
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    try {
      const parsed = new URL(url);

      if (parsed.protocol === 'https:' && (isSiteHost(parsed.hostname) || isAuthHost(parsed.hostname))) {
        return;
      }

      event.preventDefault();

      if (['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
        shell.openExternal(parsed.toString()).catch(() => {});
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    buildContextMenu(mainWindow, params);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();

    if (input.type !== 'keyDown') return;

    if (key === 'f5' || (input.control && key === 'r')) {
      event.preventDefault();
      reload();
      return;
    }

    if (input.control && input.shift && key === 'd') {
      event.preventDefault();
      sendDockCommand('toggle');
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    log('page:start-loading');
  });

  mainWindow.webContents.on('dom-ready', () => {
    log('page:dom-ready', mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    log('page:stop-loading', mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('page:did-finish-load', mainWindow.webContents.getURL());
    injectDock(mainWindow).catch((error) => log('did-finish-load:inject-error', error));
  });

  mainWindow.webContents.on('did-navigate-in-page', () => {
    injectDock(mainWindow).catch((error) => log('did-navigate-in-page:inject-error', error));
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;

    log('page:did-fail-load', errorCode, errorDescription, validatedURL);

    if (errorCode === -3) return;

    try {
      const parsed = new URL(validatedURL);
      if (!isSiteHost(parsed.hostname)) return;
    } catch {
      return;
    }

    showOffline(mainWindow);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(HOME_URL).catch((error) => log('load-url:error', error));

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function navigate(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(url).catch((error) => log('navigate:error', url, error));
}

function openSection(section) {
  const target = SECTIONS[String(section || '').toLowerCase()];

  if (!target) {
    return Promise.reject(new Error('unknown section'));
  }

  showWindow();
  navigate(`${SITE_ORIGIN}${target}`);
  return Promise.resolve();
}

function reload() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const current = mainWindow.webContents.getURL();

  if (!isSiteUrl(current)) {
    navigate(HOME_URL);
    return;
  }

  mainWindow.reload();
}

function sendDockCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  showWindow();

  const script =
    command === 'open-settings'
      ? 'window.__wttrDockOpenSettings ? window.__wttrDockOpenSettings() : null'
      : 'window.__wttrDockToggle ? window.__wttrDockToggle() : null';

  mainWindow.webContents.executeJavaScript(script, true).catch((error) => {
    log('dock-command:error', command, error);
  });
}

function windowIsVisible() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
}

module.exports = {
  SITE_ORIGIN,
  HOME_URL,
  SECTIONS,
  createMainWindow,
  getMainWindow,
  showWindow,
  toggleWindow,
  navigate,
  openSection,
  reload,
  sendDockCommand,
  windowIsVisible,
  isSiteUrl,
  isSiteHost,
};
