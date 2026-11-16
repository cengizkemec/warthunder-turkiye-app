'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

let logPath = null;

function getLogPath() {
  if (logPath) return logPath;

  try {
    logPath = path.join(app.getPath('userData'), 'wttr-app.log');
  } catch {
    logPath = path.join(process.cwd(), 'wttr-app.log');
  }

  return logPath;
}

function ensureLogDir() {
  const target = getLogPath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (fs.existsSync(target) && fs.statSync(target).size > 2 * 1024 * 1024) {
      fs.renameSync(target, `${target}.old`);
    }
  } catch {
    // Logging must never break the app.
  }
}

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts
    .map((part) => (part instanceof Error ? part.stack || part.message : String(part)))
    .join(' ')}\n`;

  if (!app.isPackaged) {
    process.stdout.write(line);
  }

  try {
    ensureLogDir();
    fs.appendFileSync(getLogPath(), line, 'utf8');
  } catch {
    // Ignore logging failures.
  }
}

module.exports = { log, getLogPath };
