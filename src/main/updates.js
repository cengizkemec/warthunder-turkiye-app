'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, shell } = require('electron');
const { log } = require('./log');

const GITHUB_REPO = 'cengizkemec/warthunder-turkiye-app';
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const SITE_CONFIG_URL = 'https://warthunder.tr/api/desktop/config';

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0];
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.json();
}

function pickInstaller(assets) {
  if (!Array.isArray(assets)) return null;

  const binaries = assets.filter(
    (asset) => /\.exe$/i.test(asset.name || '') && !/\.sha256$/i.test(asset.name || '')
  );

  if (binaries.length === 0) return null;

  const preferred =
    binaries.find((asset) => /wttr-app.*setup|setup.*wttr-app/i.test(asset.name)) ||
    binaries.find((asset) => /setup/i.test(asset.name)) ||
    binaries.find((asset) => /warthunder/i.test(asset.name)) ||
    binaries[0];

  return {
    assetUrl: preferred.browser_download_url || null,
    sha256: String(preferred.digest || '')
      .replace(/^sha256:/i, '')
      .trim() || null,
    size: Number(preferred.size) || null,
  };
}

async function checkGithub(currentVersion) {
  const payload = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `wttr-app/${currentVersion}`,
    },
  });

  const latestVersion = normalizeVersion(payload.tag_name);

  if (!latestVersion) return null;

  const installer = pickInstaller(payload.assets) || {};

  return {
    source: 'GitHub',
    latestVersion,
    currentVersion,
    available: compareVersions(latestVersion, currentVersion) > 0,
    url: payload.html_url || RELEASES_URL,
    assetUrl: installer.assetUrl || null,
    sha256: installer.sha256 || null,
    size: installer.size || null,
    notes: typeof payload.body === 'string' ? payload.body.slice(0, 700) : '',
    publishedAt: payload.published_at || null,
  };
}

async function checkSite(currentVersion) {
  const payload = await fetchJson(SITE_CONFIG_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `wttr-app/${currentVersion}`,
    },
  });

  const desktopApp = payload && payload.data && payload.data.desktopApp;

  if (!desktopApp) return null;

  const latestVersion = normalizeVersion(desktopApp.latestVersion);

  if (!latestVersion) return null;

  const installerUrl =
    typeof desktopApp.installerUrl === 'string' && /\.exe($|\?)/i.test(desktopApp.installerUrl)
      ? desktopApp.installerUrl
      : null;

  return {
    source: 'warthunder.tr',
    latestVersion,
    currentVersion,
    available: compareVersions(latestVersion, currentVersion) > 0,
    url: desktopApp.downloadUrl || RELEASES_URL,
    assetUrl: installerUrl,
    sha256: typeof desktopApp.sha256 === 'string' ? desktopApp.sha256.trim() : null,
    size: null,
    notes: typeof desktopApp.notes === 'string' ? desktopApp.notes.slice(0, 700) : '',
    publishedAt: null,
  };
}

async function checkForUpdates(currentVersion) {
  const results = await Promise.allSettled([
    checkGithub(currentVersion),
    checkSite(currentVersion),
  ]);

  const candidates = [];
  const errors = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      candidates.push(result.value);
    } else if (result.status === 'rejected') {
      errors.push(result.reason);
      log('updates:source-error', result.reason);
    }
  }

  if (candidates.length === 0) {
    return {
      available: false,
      currentVersion,
      latestVersion: null,
      url: RELEASES_URL,
      notes: '',
      source: null,
      error: errors.map((error) => error.message).join('; '),
    };
  }

  candidates.sort((left, right) =>
    compareVersions(left.latestVersion, right.latestVersion)
  );

  const best = candidates[candidates.length - 1];

  if (!best.assetUrl) {
    const github = candidates.find((candidate) => candidate.assetUrl);
    if (github) return github;
  }

  return best;
}

function validateDownloadUrl(value) {
  const parsed = new URL(String(value || ''));
  const host = parsed.hostname.toLowerCase();

  if (
    parsed.protocol !== 'https:' ||
    !(
      host === 'github.com' ||
      host.endsWith('.githubusercontent.com') ||
      host === 'warthunder.tr'
    )
  ) {
    throw new Error('unsupported update host');
  }

  return parsed;
}

async function downloadUpdate(info, { onProgress, signal } = {}) {
  if (!info?.latestVersion) {
    throw new Error('missing update version');
  }

  const source = info.assetUrl || info.url;
  const parsed = validateDownloadUrl(source);
  const filename = `wttr-app-update-${normalizeVersion(info.latestVersion)}.exe`;
  const target = path.join(app.getPath('temp'), filename);

  try {
    fs.rmSync(target, { force: true });
  } catch {
    // Ignore stale files.
  }

  const response = await fetch(parsed.toString(), {
    redirect: 'follow',
    signal,
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': `wttr-app/${app.getVersion()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`update HTTP ${response.status}`);
  }

  const total =
    Number(response.headers.get('content-length')) || Number(info.size) || 0;

  const file = fs.openSync(target, 'w');
  const hash = crypto.createHash('sha256');
  let received = 0;

  try {
    if (response.body) {
      for await (const chunk of response.body) {
        fs.writeSync(file, chunk);
        hash.update(chunk);
        received += chunk.length;

        if (typeof onProgress === 'function') {
          onProgress({
            received,
            total,
            percent: total > 0 ? Math.min(100, (received / total) * 100) : null,
          });
        }
      }
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeSync(file, buffer);
      hash.update(buffer);
      received = buffer.length;

      if (typeof onProgress === 'function') {
        onProgress({
          received,
          total: received,
          percent: 100,
        });
      }
    }
  } finally {
    fs.closeSync(file);
  }

  const actualHash = hash.digest('hex');
  const expectedHash = String(info.sha256 || '').toLowerCase();

  if (expectedHash && actualHash !== expectedHash) {
    fs.rmSync(target, { force: true });
    throw new Error('update hash mismatch');
  }

  if (!expectedHash) {
    log('updates:hash-missing', info.latestVersion);
  }

  const stat = fs.statSync(target);

  if (stat.size < 1024) {
    fs.rmSync(target, { force: true });
    throw new Error('update file is too small');
  }

  const header = Buffer.alloc(2);
  const fd = fs.openSync(target, 'r');
  fs.readSync(fd, header, 0, 2, 0);
  fs.closeSync(fd);

  if (header.toString('ascii') !== 'MZ') {
    fs.rmSync(target, { force: true });
    throw new Error('update file is not a Windows executable');
  }

  log(
    'updates:downloaded',
    info.latestVersion,
    `${stat.size} bytes`,
    expectedHash ? 'hash-ok' : 'hash-missing'
  );

  return {
    filePath: target,
    sha256: actualHash,
    size: stat.size,
  };
}

let installerStarted = false;

function launchInstaller(filePath) {
  const target = path.resolve(String(filePath || ''));

  if (installerStarted) return false;

  if (!target.toLowerCase().endsWith('.exe')) {
    throw new Error('invalid update file');
  }

  if (!fs.existsSync(target)) {
    throw new Error('update file not found');
  }

  const stat = fs.statSync(target);

  if (stat.size < 1024) {
    throw new Error('update file is too small');
  }

  // NSIS uses /S, Inno Setup uses /VERYSILENT. Passing both keeps automatic
  // updates silent for either installer format.
  let child;

  try {
    child = spawn(
      target,
      ['/S', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
  } catch (error) {
    installerStarted = false;
    throw error;
  }

  installerStarted = true;
  child.unref();
  log('updates:install', target, `${stat.size} bytes`);
  return true;
}

async function installUpdate(filePath) {
  if (!launchInstaller(filePath)) return;

  setTimeout(() => {
    app.quit();
  }, 1200);
}

async function openRelease(url) {
  let target = RELEASES_URL;

  try {
    const parsed = new URL(url || RELEASES_URL);
    const host = parsed.hostname.toLowerCase();

    if (
      parsed.protocol === 'https:' &&
      (host === 'github.com' ||
        host.endsWith('.githubusercontent.com') ||
        host === 'warthunder.tr')
    ) {
      target = parsed.toString();
    }
  } catch {
    // Fall back to the stable releases page.
  }

  await shell.openExternal(target);
}

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  launchInstaller,
  openRelease,
  compareVersions,
};
