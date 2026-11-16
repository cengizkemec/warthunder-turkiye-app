'use strict';

const path = require('node:path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const settingsStore = require('./settings');
const { log } = require('./log');

const EXPANDED_WIDTH = 344;
const COLLAPSED_WIDTH = 264;
const MIN_HEIGHT = 44;
const MAX_HEIGHT = 520;

let overlayWindow = null;
let currentSettings = null;
let onAction = () => {};
let moveTimer = null;
let ipcRegistered = false;
let voiceState = {
  connected: false,
  connecting: false,
  connectionState: 'disconnected',
  microphone: false,
  deafened: false,
  pttActive: false,
  screenSharing: false,
  latencyMs: null,
  room: null,
  participants: [],
};
let pttState = { active: false, label: 'Alt', code: 'AltLeft' };

function overlayHtml() {
  return path.join(__dirname, '..', 'overlay', 'index.html');
}

function overlayPreload() {
  return path.join(__dirname, '..', 'overlay', 'preload.js');
}

function settings() {
  return currentSettings || settingsStore.publicSettings();
}

function enabled() {
  return settingsStore.get().overlayEnabled !== false;
}

function shouldShow() {
  return enabled() && (voiceState.connected || voiceState.connecting);
}

function overlayWidth(collapsed) {
  return collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
}

function defaultPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;

  return {
    x: area.x + area.width - width - 18,
    y: area.y + area.height - height - 18,
  };
}

function clampBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const width = Math.max(COLLAPSED_WIDTH, Math.min(440, Math.round(bounds.width)));
  const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(bounds.height)));

  return {
    x: Math.min(
      Math.max(Math.round(bounds.x), area.x + 8),
      area.x + area.width - width - 8
    ),
    y: Math.min(
      Math.max(Math.round(bounds.y), area.y + 8),
      area.y + area.height - height - 8
    ),
    width,
    height,
  };
}

function send(channel, payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.webContents.isDestroyed()) return;

  overlayWindow.webContents.send(channel, payload);
}

function sendSnapshot() {
  send('overlay:state', voiceState);
  send('overlay:settings', settings());
  send('overlay:ptt', pttState);
}

function applyVisibility() {
  if (shouldShow()) {
    const window = ensureWindow();
    if (!window) return;

    if (!window.isVisible()) {
      window.showInactive();
    }

    try {
      window.setAlwaysOnTop(true, 'screen-saver');
    } catch {
      window.setAlwaysOnTop(true);
    }
  } else if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
}

function applySize(width, height) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const bounds = overlayWindow.getBounds();
  const next = clampBounds({ ...bounds, width, height });
  overlayWindow.setBounds(next, false);
}

function schedulePositionSave() {
  if (moveTimer) clearTimeout(moveTimer);

  moveTimer = setTimeout(() => {
    moveTimer = null;

    if (!overlayWindow || overlayWindow.isDestroyed()) return;

    const bounds = overlayWindow.getBounds();

    try {
      settingsStore.save({
        overlayPosition: { x: bounds.x, y: bounds.y },
      });
    } catch (error) {
      log('overlay:position-save-error', error);
    }
  }, 500);
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  const fromOverlay = (event) =>
    Boolean(
      overlayWindow &&
        !overlayWindow.isDestroyed() &&
        event.sender === overlayWindow.webContents
    );

  ipcMain.on('overlay:ready', (event) => {
    if (!fromOverlay(event)) return;
    sendSnapshot();
    applyVisibility();
  });

  ipcMain.on('overlay:resize', (event, size) => {
    if (!fromOverlay(event) || !size || typeof size !== 'object') return;

    const width = Number(size.width);
    const height = Number(size.height);

    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    applySize(width, height);
  });

  ipcMain.on('overlay:action', (event, action) => {
    if (!fromOverlay(event)) return;
    if (typeof action !== 'string' || !action) return;

    onAction(action);
  });

  ipcMain.on('overlay:set-collapsed', (event, collapsed) => {
    if (!fromOverlay(event)) return;

    const value = Boolean(collapsed);

    try {
      settingsStore.save({ overlayCollapsed: value });
    } catch (error) {
      log('overlay:collapsed-save-error', error);
      return;
    }

    currentSettings = settingsStore.publicSettings();
    send('overlay:settings', currentSettings);
    applySize(overlayWidth(value), overlayWindow.getBounds().height);
  });
}

function create({ actionHandler } = {}) {
  if (typeof actionHandler === 'function') onAction = actionHandler;
  currentSettings = settingsStore.publicSettings();
  registerIpc();
  log('overlay:initialized');
}

function ensureWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const collapsed = settingsStore.get().overlayCollapsed === true;
  const width = overlayWidth(collapsed);
  const saved = settingsStore.get().overlayPosition;
  const position = saved
    ? clampBounds({ ...saved, width, height: 220 })
    : clampBounds({ ...defaultPosition(width, 220), width, height: 220 });

  overlayWindow = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    type: 'toolbar',
    title: 'wttr-app Voice Overlay',
    webPreferences: {
      preload: overlayPreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  try {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // Windows may ignore this.
  }

  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  overlayWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    sendSnapshot();
    applyVisibility();
  });

  overlayWindow.on('moved', schedulePositionSave);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow.loadFile(overlayHtml()).catch((error) => {
    log('overlay:load-error', error);
  });

  log('overlay:created');
  return overlayWindow;
}

function updateVoiceState(next) {
  const state = next && typeof next === 'object' ? next : {};
  const room =
    state.room && typeof state.room === 'object'
      ? {
          id: state.room.id ?? null,
          name: String(state.room.name || 'Sesli Oda'),
          slug: state.room.slug || null,
          url: state.room.url || null,
        }
      : null;

  const participants = Array.isArray(state.participants)
    ? state.participants.slice(0, 16).map((participant) => ({
        identity: String(participant?.identity || ''),
        name: String(participant?.name || participant?.username || 'Kullanıcı'),
        username: participant?.username ? String(participant.username) : null,
        avatarUrl: participant?.avatarUrl || null,
        local: Boolean(participant?.local),
        speaking: Boolean(participant?.speaking),
        muted: Boolean(participant?.muted),
        connectionQuality: participant?.connectionQuality || null,
      }))
    : [];

  voiceState = {
    connected: Boolean(state.connected),
    connecting: Boolean(state.connecting),
    connectionState: String(state.connectionState || 'disconnected'),
    microphone: Boolean(state.microphone),
    deafened: Boolean(state.deafened),
    pttActive: Boolean(state.pttActive),
    screenSharing: Boolean(state.screenSharing),
    latencyMs: Number.isFinite(Number(state.latencyMs)) ? Number(state.latencyMs) : null,
    room,
    participants,
  };

  if (shouldShow()) ensureWindow();

  send('overlay:state', voiceState);
  applyVisibility();
}

function updatePtt(next) {
  const state = next && typeof next === 'object' ? next : {};

  pttState = {
    active: Boolean(state.active),
    label: String(state.label || 'Alt'),
    code: String(state.code || 'AltLeft'),
  };

  send('overlay:ptt', pttState);
}

function updateSettings(next) {
  currentSettings = next || settingsStore.publicSettings();

  if (shouldShow()) ensureWindow();

  send('overlay:settings', currentSettings);
  applyVisibility();
}

function setEnabled(value) {
  try {
    settingsStore.save({ overlayEnabled: Boolean(value) });
  } catch (error) {
    log('overlay:enabled-save-error', error);
    return;
  }

  updateSettings(settingsStore.publicSettings());
}

function getVoiceState() {
  return voiceState;
}

function destroy() {
  if (moveTimer) {
    clearTimeout(moveTimer);
    moveTimer = null;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }

  overlayWindow = null;
}

module.exports = {
  create,
  updateVoiceState,
  updatePtt,
  updateSettings,
  setEnabled,
  getVoiceState,
  destroy,
};
