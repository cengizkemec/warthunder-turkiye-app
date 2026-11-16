'use strict';

const path = require('node:path');
const { Menu, Tray, app, nativeImage } = require('electron');
const {
  openSection,
  reload,
  sendDockCommand,
  showWindow,
  toggleWindow,
} = require('./site');
const { log } = require('./log');

let tray = null;
let lastMenuSignature = '';
let currentSettings = null;
let currentSession = null;

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, '..', '..', 'assets', 'tray.png');
}

function pttLabel(settings) {
  if (!settings) return 'Bas-konuş: Alt';
  return settings.pttEnabled
    ? `Bas-konuş: ${settings.pttKeyLabel || 'Alt'}`
    : 'Bas-konuş: Kapalı';
}

function sessionLabel(session) {
  if (!session?.authenticated) return 'Giriş yapılmadı';
  return session.user?.displayName || session.user?.username || 'Hesap açık';
}

function buildMenu() {
  const unread = Math.max(0, Number(currentSession?.unreadNotifications) || 0);
  const template = [
    {
      label: 'War Thunder Türkiye',
      enabled: false,
    },
    {
      label: sessionLabel(currentSession),
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Sosyal', click: () => openSection('social') },
    { label: 'Sesli Odalar', click: () => openSection('rooms') },
    { label: 'Forum', click: () => openSection('forum') },
    { label: 'Blog', click: () => openSection('blog') },
    { type: 'separator' },
    {
      label: `Bildirimler${unread > 0 ? ` (${unread > 99 ? '99+' : unread})` : ''}`,
      click: () => openSection('notifications'),
    },
    { label: 'Ayarlar', click: () => sendDockCommand('open-settings') },
    { label: 'Yenile', click: () => reload() },
    { type: 'separator' },
    { label: pttLabel(currentSettings), enabled: false },
    { type: 'separator' },
    { label: 'Çıkış', click: () => app.quit() },
  ];

  return Menu.buildFromTemplate(template);
}

function updateTray(settings, session) {
  if (settings !== undefined) currentSettings = settings;
  if (session !== undefined) currentSession = session;

  if (!tray || tray.isDestroyed()) return;

  const unread = Math.max(0, Number(currentSession?.unreadNotifications) || 0);
  const user = currentSession?.user?.displayName || currentSession?.user?.username;
  const tooltip = [
    'wttr-app',
    user || null,
    unread > 0 ? `${unread} bildirim` : null,
    pttLabel(currentSettings),
  ]
    .filter(Boolean)
    .join(' · ');

  tray.setToolTip(tooltip);

  const signature = JSON.stringify({
    authenticated: Boolean(currentSession?.authenticated),
    user: user || null,
    unread,
    ptt: pttLabel(currentSettings),
  });

  if (signature === lastMenuSignature) return;

  lastMenuSignature = signature;
  tray.setContextMenu(buildMenu());
}

function createTray({ settings, session } = {}) {
  try {
    const image = nativeImage.createFromPath(iconPath());

    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip('wttr-app · War Thunder Türkiye');
    tray.on('click', () => toggleWindow());
    tray.on('double-click', () => showWindow());

    updateTray(settings, session);
    log('tray:created');
  } catch (error) {
    log('tray:create-error', error);
  }

  return tray;
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }

  tray = null;
}

module.exports = { createTray, updateTray, destroyTray };
