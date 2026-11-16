'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};

  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);

  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('wttrOverlay', {
  ready: () => ipcRenderer.send('overlay:ready'),
  resize: (size) => ipcRenderer.send('overlay:resize', size),
  action: (action) => ipcRenderer.send('overlay:action', action),
  setCollapsed: (collapsed) => ipcRenderer.send('overlay:set-collapsed', collapsed),
  onState: (callback) => subscribe('overlay:state', callback),
  onSettings: (callback) => subscribe('overlay:settings', callback),
  onPtt: (callback) => subscribe('overlay:ptt', callback),
});
