'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const yauzl = require('yauzl');
const extract = require('extract-zip');

class BridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}

const fail = (code, message) => { throw new BridgeError(code, message); };
const REPOSITORY = 'AIGCTV/comfyui-ps-bridge-nodes';
const REPO_URL = `https://github.com/${REPOSITORY}`;

function mirrorUrl(url, settings = {}) {
  if (!settings.useGithubMirror && !settings.useGitHubProxy) return url;
  const prefix = new URL(settings.githubMirrorUrl || 'https://ghproxy.net/');
  if (prefix.protocol !== 'https:' || prefix.username || prefix.password || prefix.search || prefix.hash) {
    fail('MIRROR_INVALID', 'GitHub mirror must be an HTTPS URL without credentials, query or fragment.');
  }
  return `${prefix.href.replace(/\/$/, '')}/${url}`;
}

// HTTP is allowed only when explicitly injected by the local fixture tests.
function responseFor(url, { allowHttp = false, timeoutMs = 30000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
      if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:'))) {
        fail('DOWNLOAD_FAILED', 'Only HTTPS downloads are supported.');
      }
    } catch (error) { reject(error); return; }
    const request = (parsed.protocol === 'https:' ? https : http).get(parsed, {
      headers: { 'User-Agent': 'VLauncher-PS-Bridge', Accept: 'application/vnd.github+json' },
    });
    const timer = setTimeout(() => request.destroy(new BridgeError('DOWNLOAD_TIMEOUT', 'Download timed out.')), timeoutMs);
    request.on('error', error => { clearTimeout(timer); reject(error); });
    request.on('response', response => {
      response.on('close', () => clearTimeout(timer));
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        clearTimeout(timer);
        response.resume();
        if (!response.headers.location || redirects <= 0) {
          reject(new BridgeError('DOWNLOAD_FAILED', 'Invalid or excessive download redirects.'));
          return;
        }
        responseFor(new URL(response.headers.location, parsed).href, { allowHttp, timeoutMs, redirects: redirects - 1 }).then(resolve, reject);
      } else if (response.statusCode !== 200) {
        response.resume();
        const limited = response.statusCode === 429 || (response.statusCode === 403 && response.headers['x-ratelimit-remaining'] === '0');
        reject(new BridgeError(limited ? 'RATE_LIMITED' : 'DOWNLOAD_FAILED', `HTTP ${response.statusCode}${limited ? ': GitHub rate limit reached; retry later.' : ''}`));
      } else {
        resolve(response);
      }
    });
  });
}

async function readJson(url, options) {
  const response = await responseFor(url, options);
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) { response.destroy(); fail('DOWNLOAD_FAILED', 'Metadata exceeds size limit.'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { fail('DOWNLOAD_FAILED', 'GitHub returned invalid UTF-8 JSON metadata.'); }
}

async function download(url, destination, onProgress = () => {}, options) {
  const response = await responseFor(url, options);
  const total = Number(response.headers['content-length']) || undefined;
  const limit = 64 * 1024 * 1024;
  if (total > limit) { response.destroy(); fail('ARCHIVE_INVALID', 'Archive exceeds 64 MiB.'); }
  let received = 0;
  let lastPercent = -1;
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    if (received > limit) { callback(new BridgeError('ARCHIVE_INVALID', 'Archive exceeds 64 MiB.')); return; }
    const percent = total ? Math.min(100, Math.floor(received * 100 / total)) : undefined;
    if (percent !== lastPercent) { lastPercent = percent; onProgress({ received, total, percent }); }
    callback(null, chunk);
  } });
  await pipeline(response, meter, fs.createWriteStream(destination, { flags: 'wx' }));
  if (total && received !== total) fail('DOWNLOAD_FAILED', 'Incomplete download.');
}

function safeRelative(name) {
  if (typeof name !== 'string') return false;
  const segments = name.replace(/\/$/, '').split('/');
  return typeof name === 'string' && name.length > 0 && !name.includes('\\') && !path.isAbsolute(name) &&
    segments.every(segment => segment && segment !== '.' && segment !== '..' &&
      !/[<>:"|?*\x00-\x1f]/.test(segment) && !/[. ]$/.test(segment) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}

// Preflight the entire central directory BEFORE extract-zip creates any paths.
async function validateZip(zipPath, sha) {
  const root = `comfyui-ps-bridge-nodes-${sha}`;
  await new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) { reject(new BridgeError('ARCHIVE_INVALID', error.message)); return; }
      let expanded = 0;
      let count = 0;
      const seen = new Set();
      const files = new Set();
      const directories = new Set();
      const abort = message => { zip.close(); reject(new BridgeError('ARCHIVE_INVALID', message)); };
      zip.on('error', error => abort(error.message));
      zip.on('entry', entry => {
        const name = entry.fileName;
        const key = name.replace(/\/$/, '').toLowerCase();
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        const isDirectory = name.endsWith('/');
        if (!safeRelative(name) || (name !== `${root}/` && !name.startsWith(`${root}/`)) ||
            mode === 0xa000 || (mode && mode !== 0x8000 && mode !== 0x4000) ||
            (mode === 0x4000 && !isDirectory) || (entry.generalPurposeBitFlag & 1) || seen.has(key)) {
          abort(`Unsafe or duplicate ZIP entry: ${name}`); return;
        }
        const parts = key.split('/');
        for (let i = 1; i < parts.length; i++) {
          const parent = parts.slice(0, i).join('/');
          if (files.has(parent)) { abort(`File/directory conflict: ${name}`); return; }
          directories.add(parent);
        }
        if (!isDirectory && directories.has(key)) { abort(`File/directory conflict: ${name}`); return; }
        if (isDirectory) directories.add(key); else files.add(key);
        seen.add(key);
        expanded += entry.uncompressedSize;
        if (++count > 10000 || expanded > 256 * 1024 * 1024) { abort('Expanded archive exceeds limits.'); return; }
        zip.readEntry();
      });
      zip.on('end', () => count ? resolve() : abort('Empty archive.'));
      zip.readEntry();
    });
  });
  return root;
}

async function extractArchive(zipPath, directory, sha) {
  const root = await validateZip(zipPath, sha);
  await extract(zipPath, { dir: directory });
  return path.join(directory, root);
}

module.exports = { BridgeError, fail, REPOSITORY, REPO_URL, mirrorUrl, readJson, download, extractArchive, safeRelative };
