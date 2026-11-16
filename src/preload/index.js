'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};

  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);

  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getSession: () => ipcRenderer.invoke('session:get'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  reportSession: (payload) => ipcRenderer.send('session:report', payload),
  reportNotifications: (payload) => ipcRenderer.send('notifications:report', payload),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openMicSettings: () => ipcRenderer.invoke('app:open-mic-settings'),
  notifyTest: () => ipcRenderer.invoke('app:notify-test'),
  logout: () => ipcRenderer.invoke('app:logout'),
  reload: () => ipcRenderer.invoke('app:reload'),
  openSection: (section) => ipcRenderer.invoke('app:open-section', section),
  checkUpdates: () => ipcRenderer.invoke('app:update-check'),
  getUpdateState: () => ipcRenderer.invoke('app:update-state'),
  downloadUpdate: (info) => ipcRenderer.invoke('app:update-download', info),
  installUpdate: (filePath) => ipcRenderer.invoke('app:update-install', filePath),
  cancelUpdate: () => ipcRenderer.invoke('app:update-cancel'),
  openUpdate: (url) => ipcRenderer.invoke('app:update-open', url),
  quit: () => ipcRenderer.invoke('app:quit'),
  captureStart: () => ipcRenderer.send('ptt:capture', true),
  captureEnd: () => ipcRenderer.send('ptt:capture', false),
  onSettings: (callback) => subscribe('settings:changed', callback),
  onSession: (callback) => subscribe('session:changed', callback),
  onPtt: (callback) => subscribe('ptt:state', callback),
  onDockCommand: (callback) => subscribe('dock:command', callback),
  onUpdate: (callback) => subscribe('update:available', callback),
  onUpdateProgress: (callback) => subscribe('update:progress', callback),
  onUpdateDownloaded: (callback) => subscribe('update:downloaded', callback),
  onUpdateError: (callback) => subscribe('update:error', callback),
};

contextBridge.exposeInMainWorld('wttrDesktop', api);
