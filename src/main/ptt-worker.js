'use strict';

const { parentPort } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

let child = null;
let reader = null;
let currentVk = null;
let startingVk = null;
const intentionalStops = new WeakSet();

function post(message) {
  try {
    parentPort.postMessage(message);
  } catch {
    // The main thread may be shutting down.
  }
}

function stopChild() {
  if (reader) {
    reader.close();
    reader = null;
  }

  if (child) {
    const target = child;
    child = null;
    currentVk = null;
    intentionalStops.add(target);

    try {
      target.kill();
    } catch {
      // Ignore.
    }
  }
}

function start(vk, helperPath) {
  if (currentVk === vk && (child || startingVk === vk)) {
    return;
  }

  startingVk = vk;
  stopChild();

  let next;

  try {
    next = spawn(helperPath, [String(vk)], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    startingVk = null;
    post({ type: 'error', message: String(error?.message || error) });
    return;
  }

  child = next;
  currentVk = vk;
  startingVk = null;

  if (next.pid) {
    post({ type: 'pid', pid: next.pid });
  }

  next.on('error', (error) => {
    if (intentionalStops.has(next)) return;
    post({ type: 'error', message: String(error?.message || error) });
  });

  next.on('exit', (code, signal) => {
    if (intentionalStops.has(next)) {
      return;
    }

    post({ type: 'exit', code, signal });

    if (child === next) {
      child = null;
      currentVk = null;
    }
  });

  if (next.stderr) {
    next.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) post({ type: 'stderr', message: text });
    });
  }

  if (next.stdout) {
    reader = readline.createInterface({ input: next.stdout });
    reader.on('line', (line) => {
      const value = line.trim();
      if (value === 'down' || value === 'up') {
        post({ type: 'state', value });
      }
    });
  }

  post({ type: 'started', vk });
}

parentPort.on('message', (message) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'start') {
    start(message.vk, message.helperPath);
  } else if (message.type === 'stop') {
    stopChild();
  }
});

process.on('uncaughtException', (error) => {
  post({ type: 'error', message: String(error?.stack || error) });
});

process.on('unhandledRejection', (error) => {
  post({ type: 'error', message: String(error?.stack || error) });
});
