'use strict';

const path = require('node:path');
const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const { log } = require('./log');

let pickerWindow = null;
let pendingCallback = null;
let sourcesById = new Map();
let currentItems = [];
let ipcRegistered = false;

function pickerHtml() {
  return path.join(__dirname, '..', 'screen-picker', 'index.html');
}

function pickerPreload() {
  return path.join(__dirname, '..', 'screen-picker', 'preload.js');
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  const fromPicker = (event) =>
    Boolean(
      pickerWindow &&
        !pickerWindow.isDestroyed() &&
        event.sender === pickerWindow.webContents
    );

  ipcMain.on('screen-picker:ready', (event) => {
    if (!fromPicker(event)) return;
    sendSources();
  });

  ipcMain.on('screen-picker:select', (event, id) => {
    if (!fromPicker(event)) return;

    const source = sourcesById.get(String(id || ''));
    if (!source) return;

    finish(source);
  });

  ipcMain.on('screen-picker:cancel', (event) => {
    if (!fromPicker(event)) return;
    finish(null);
  });

  ipcMain.on('screen-picker:refresh', async (event) => {
    if (!fromPicker(event)) return;

    try {
      currentItems = await readSources();
      sendSources();
    } catch (error) {
      log('screen-picker:refresh-error', error);
    }
  });
}

async function readSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 360, height: 200 },
    fetchWindowIcons: true,
  });

  const excluded = new Set();

  if (pickerWindow && !pickerWindow.isDestroyed()) {
    try {
      const pickerId = pickerWindow.getMediaSourceId?.();
      if (pickerId) excluded.add(pickerId);
    } catch {
      // Ignore.
    }
  }

  const visibleSources = sources.filter((source) => !excluded.has(source.id));
  sourcesById = new Map(visibleSources.map((source) => [source.id, source]));

  return visibleSources
    .map((source) => ({
      id: source.id,
      name: source.name || source.id,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      displayId: source.display_id || null,
      thumbnail:
        source.thumbnail && !source.thumbnail.isEmpty()
          ? source.thumbnail.toDataURL()
          : null,
      appIcon:
        source.appIcon && !source.appIcon.isEmpty()
          ? source.appIcon.toDataURL()
          : null,
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'screen' ? -1 : 1;
      return left.name.localeCompare(right.name, 'tr');
    });
}

function sendSources() {
  if (!pickerWindow || pickerWindow.isDestroyed()) return;
  pickerWindow.webContents.send('screen-picker:sources', currentItems);
}

function finish(source) {
  const callback = pendingCallback;
  pendingCallback = null;
  const window = pickerWindow;
  pickerWindow = null;
  sourcesById = new Map();
  currentItems = [];

  try {
    if (callback) {
      callback(source ? { video: source } : {});
    }
  } catch (error) {
    log('screen-picker:callback-error', error);
  }

  if (window && !window.isDestroyed()) {
    window.close();
  }
}

function createWindow(parent) {
  pickerWindow = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: true,
    show: false,
    width: 980,
    height: 660,
    minWidth: 760,
    minHeight: 520,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b1114',
    title: 'Ekran Paylaşımı',
    webPreferences: {
      preload: pickerPreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  pickerWindow.setMenuBarVisibility(false);

  pickerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  pickerWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  pickerWindow.webContents.on('did-finish-load', () => {
    sendSources();
  });

  pickerWindow.once('ready-to-show', () => {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.show();
      pickerWindow.focus();
    }
  });

  pickerWindow.on('closed', () => {
    pickerWindow = null;

    if (pendingCallback) {
      const callback = pendingCallback;
      pendingCallback = null;
      sourcesById = new Map();
      currentItems = [];

      try {
        callback({});
      } catch (error) {
        log('screen-picker:cancel-error', error);
      }
    }
  });

  pickerWindow.loadFile(pickerHtml()).catch((error) => {
    log('screen-picker:load-error', error);
    finish(null);
  });
}

async function show({ parent, callback }) {
  if (typeof callback !== 'function') return;

  registerIpc();

  if (pendingCallback) {
    finish(null);
  }

  try {
    currentItems = await readSources();
  } catch (error) {
    log('screen-picker:sources-error', error);
    callback({});
    return;
  }

  if (currentItems.length === 0) {
    callback({});
    return;
  }

  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close();
  }

  pendingCallback = callback;
  createWindow(parent);
}

module.exports = { show };
