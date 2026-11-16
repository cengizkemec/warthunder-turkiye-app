'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};

  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);

  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('wttrScreenPicker', {
  ready: () => ipcRenderer.send('screen-picker:ready'),
  refresh: () => ipcRenderer.send('screen-picker:refresh'),
  select: (id) => ipcRenderer.send('screen-picker:select', id),
  cancel: () => ipcRenderer.send('screen-picker:cancel'),
  onSources: (callback) => subscribe('screen-picker:sources', callback),
});
