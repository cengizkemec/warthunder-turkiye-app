'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { normalizeKey, tryBindingFor } = require('../shared/keymap');
const { log } = require('./log');

const DEFAULTS = Object.freeze({
  pttKey: 'AltLeft',
  pttEnabled: true,
  closeToTray: true,
  notificationsEnabled: true,
  autoUpdate: true,
  overlayEnabled: true,
  overlayCollapsed: false,
  overlayPosition: null,
  seenNotificationIds: [],
});

let current = null;
let filePath = null;

function getSettingsPath() {
  if (!filePath) {
    filePath = path.join(app.getPath('userData'), 'settings.json');
  }

  return filePath;
}

function sanitize(input, base = DEFAULTS) {
  const source = input && typeof input === 'object' ? input : {};
  const pttKey = normalizeKey(source.pttKey ?? base.pttKey);
  const seen = Array.isArray(source.seenNotificationIds)
    ? source.seenNotificationIds
    : base.seenNotificationIds;
  const rawPosition = Object.prototype.hasOwnProperty.call(source, 'overlayPosition')
    ? source.overlayPosition
    : base.overlayPosition;
  const overlayPosition =
    rawPosition &&
    Number.isFinite(Number(rawPosition.x)) &&
    Number.isFinite(Number(rawPosition.y))
      ? {
          x: Math.round(Number(rawPosition.x)),
          y: Math.round(Number(rawPosition.y)),
        }
      : null;

  return {
    pttKey,
    pttEnabled:
      typeof source.pttEnabled === 'boolean' ? source.pttEnabled : base.pttEnabled,
    closeToTray:
      typeof source.closeToTray === 'boolean' ? source.closeToTray : base.closeToTray,
    notificationsEnabled:
      typeof source.notificationsEnabled === 'boolean'
        ? source.notificationsEnabled
        : base.notificationsEnabled,
    autoUpdate:
      typeof source.autoUpdate === 'boolean' ? source.autoUpdate : base.autoUpdate,
    overlayEnabled:
      typeof source.overlayEnabled === 'boolean'
        ? source.overlayEnabled
        : base.overlayEnabled,
    overlayCollapsed:
      typeof source.overlayCollapsed === 'boolean'
        ? source.overlayCollapsed
        : base.overlayCollapsed,
    overlayPosition,
    seenNotificationIds: seen
      .filter((value) => typeof value === 'string' && value.length > 0)
      .slice(-120),
  };
}

function load() {
  if (current) return current;

  try {
    const contents = fs.readFileSync(getSettingsPath(), 'utf8');
    current = sanitize(JSON.parse(contents));
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      log('settings:load-error', error);
    }

    current = sanitize(DEFAULTS);
  }

  if (!tryBindingFor(current.pttKey)) {
    current.pttKey = DEFAULTS.pttKey;
  }

  return current;
}

function persist() {
  const target = getSettingsPath();
  const temporary = `${target}.tmp`;

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(current, null, 2), 'utf8');
    fs.renameSync(temporary, target);
  } catch (error) {
    log('settings:persist-error', error);

    try {
      fs.writeFileSync(target, JSON.stringify(current, null, 2), 'utf8');
    } catch (fallbackError) {
      log('settings:persist-fallback-error', fallbackError);
    }
  }
}

function save(patch) {
  const base = load();
  const next = sanitize({ ...base, ...(patch || {}) }, base);

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'pttKey')) {
    const requested = patch.pttKey;
    if (typeof requested !== 'string' || !tryBindingFor(requested)) {
      throw new Error('unsupported PTT key');
    }

    next.pttKey = normalizeKey(requested);
  }

  current = next;
  persist();
  log(
    'settings:saved',
    `pttKey=${current.pttKey}`,
    `pttEnabled=${current.pttEnabled}`,
    `closeToTray=${current.closeToTray}`,
    `notificationsEnabled=${current.notificationsEnabled}`,
    `autoUpdate=${current.autoUpdate}`
  );

  return current;
}

function get() {
  return load();
}

function markNotificationsSeen(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;

  const base = load();
  const merged = [...base.seenNotificationIds];

  for (const id of ids) {
    if (typeof id === 'string' && id && !merged.includes(id)) {
      merged.push(id);
    }
  }

  base.seenNotificationIds = merged.slice(-120);
  persist();
}

function publicSettings() {
  const settings = load();
  const binding = tryBindingFor(settings.pttKey) || tryBindingFor('AltLeft');

  return {
    pttKey: settings.pttKey,
    pttKeyLabel: binding.label,
    pttEnabled: settings.pttEnabled,
    closeToTray: settings.closeToTray,
    notificationsEnabled: settings.notificationsEnabled,
    autoUpdate: settings.autoUpdate,
    overlayEnabled: settings.overlayEnabled,
    overlayCollapsed: settings.overlayCollapsed,
    version: app.getVersion(),
  };
}

module.exports = {
  DEFAULTS,
  get,
  save,
  load,
  markNotificationsSeen,
  publicSettings,
  getSettingsPath,
};
