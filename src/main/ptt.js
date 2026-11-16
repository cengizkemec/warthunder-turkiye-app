'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { app } = require('electron');
const { tryBindingFor } = require('../shared/keymap');
const { log } = require('./log');

let worker = null;
let currentKey = null;
let paused = false;
let restartTimer = null;
let stopped = false;
let helperPid = null;
let helperRunning = false;
let helperStarting = false;
let onState = () => {};
let onAvailability = () => {};

function helperPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ptt-helper.exe');
  }

  return path.join(
    __dirname,
    '..',
    '..',
    'ptt-helper',
    'target',
    'release',
    'wttr-ptt-helper.exe'
  );
}

function workerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ptt-worker.js');
  }

  return path.join(__dirname, 'ptt-worker.js');
}

function clearRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function scheduleRestart() {
  if (stopped || restartTimer) return;
  if (helperRunning || helperStarting) return;

  restartTimer = setTimeout(() => {
    restartTimer = null;

    if (!stopped) {
      start(currentKey);
    }
  }, 1800);
}

function handleMessage(message) {
  if (!message || typeof message !== 'object') return;

  switch (message.type) {
    case 'started':
      helperRunning = true;
      helperStarting = false;
      log('ptt:started', currentKey, `pid=${helperPid || '?'}`);
      onAvailability(true);
      break;
    case 'pid':
      helperPid = Number(message.pid) || null;
      break;
    case 'state':
      if (paused) return;
      if (message.value !== 'down' && message.value !== 'up') return;
      onState(
        message.value === 'down',
        tryBindingFor(currentKey) || tryBindingFor('AltLeft')
      );
      break;
    case 'stderr':
      log('ptt:stderr', message.message);
      break;
    case 'error':
      helperRunning = false;
      helperStarting = false;
      log('ptt:error', message.message);
      onAvailability(false, message.message);
      scheduleRestart();
      break;
    case 'exit':
      helperRunning = false;
      helperStarting = false;
      log('ptt:exit', `code=${message.code}`, `signal=${message.signal}`);
      helperPid = null;
      onAvailability(false, 'helper stopped');
      scheduleRestart();
      break;
    default:
      break;
  }
}

function ensureWorker() {
  if (worker) return worker;

  try {
    worker = new Worker(workerPath());
  } catch (error) {
    log('ptt:worker-spawn-error', error);
    onAvailability(false, error.message);
    scheduleRestart();
    return null;
  }

  // The worker is a background service; it must not keep Electron alive
  // after the last window closes.
  worker.unref();

  worker.on('message', handleMessage);

  worker.on('error', (error) => {
    helperRunning = false;
    helperStarting = false;
    log('ptt:worker-error', error);
    onAvailability(false, error.message);
    scheduleRestart();
  });

  worker.on('exit', (code) => {
    helperRunning = false;
    helperStarting = false;
    log('ptt:worker-exit', code);
    worker = null;

    if (!stopped) {
      onAvailability(false, 'worker stopped');
      scheduleRestart();
    }
  });

  return worker;
}

function start(key) {
  const binding = tryBindingFor(key);

  if (!binding) {
    log('ptt:invalid-key', key);
    onAvailability(false, 'unsupported key');
    return;
  }

  if (
    currentKey === binding.code &&
    worker &&
    (helperRunning || helperStarting)
  ) {
    return;
  }

  clearRestart();
  currentKey = binding.code;
  helperStarting = true;
  helperRunning = false;

  const target = ensureWorker();
  if (!target) {
    helperStarting = false;
    return;
  }

  helperPid = null;
  target.postMessage({
    type: 'start',
    vk: binding.vk,
    helperPath: helperPath(),
  });
}

function configure({ stateHandler, availabilityHandler }) {
  onState = typeof stateHandler === 'function' ? stateHandler : () => {};
  onAvailability =
    typeof availabilityHandler === 'function' ? availabilityHandler : () => {};
}

function setPaused(value) {
  paused = Boolean(value);

  if (paused) {
    onState(false, tryBindingFor(currentKey) || tryBindingFor('AltLeft'));
  }
}

function restart(key) {
  stopped = false;
  start(key);
}

function stop() {
  stopped = true;
  helperRunning = false;
  helperStarting = false;
  clearRestart();

  if (worker) {
    const target = worker;
    worker = null;

    try {
      target.postMessage({ type: 'stop' });
    } catch {
      // Ignore.
    }

    // Force the worker down. A worker blocked inside CreateProcess while an
    // antivirus scans the helper must not keep the application alive.
    try {
      target.terminate().catch(() => {});
    } catch {
      // Ignore.
    }
  }

  if (helperPid) {
    try {
      process.kill(helperPid);
    } catch {
      // The helper may have already exited.
    }

    helperPid = null;
  }
}

module.exports = {
  configure,
  start,
  restart,
  stop,
  setPaused,
  helperPath,
};
