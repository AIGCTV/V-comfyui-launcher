'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { BridgeError, fail, REPOSITORY, REPO_URL, mirrorUrl, readJson, download, extractArchive, safeRelative } = require('./ps-bridge-download.cjs');

const NODE_DIRECTORY = 'comfyui-ps-bridge-nodes';
const RECEIPT = '.vlauncher-install.json';
const REQUIRED = ['__init__.py', 'pyproject.toml', 'requirements.txt', 'ps_bridge/nodes.py', 'ps_bridge/protocol.py', 'ps_bridge/routes.py', 'js/bridge.js'];
const utf8 = buffer => new TextDecoder('utf-8', { fatal: true }).decode(buffer);
const hash = async file => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');
const exists = async file => { try { await fsp.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

async function checkedPath(root, candidate) {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    fail('PATH_INVALID', `Path is outside the installation area: ${target}`);
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await fsp.lstat(current)).isSymbolicLink()) fail('PATH_INVALID', `Symbolic links/junctions are not supported: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

async function pathsFor(rootValue) {
  const root = await fsp.realpath(rootValue);
  const comfy = await checkedPath(root, path.join(root, 'ComfyUI'));
  if (!(await exists(path.join(comfy, 'main.py'))) || !(await exists(path.join(comfy, 'comfy_api', 'latest', '__init__.py')))) {
    fail('ENVIRONMENT_INVALID', `ComfyUI with V3 API was not found in ${comfy}. Check the portable directory layout.`);
  }
  const customNodes = await checkedPath(root, path.join(comfy, 'custom_nodes'));
  if (!(await fsp.stat(customNodes)).isDirectory()) fail('PATH_INVALID', 'custom_nodes is not a directory.');
  const target = await checkedPath(root, path.join(customNodes, NODE_DIRECTORY));
  const workspace = await checkedPath(root, path.join(root, '.vlauncher-ps-bridge'));
  return { root, comfy, customNodes, target, workspace, pending: path.join(workspace, 'pending.json'), lock: path.join(workspace, 'install.lock') };
}

async function scanTree(directory) {
  const files = new Map();
  const directories = [];
  async function visit(current, prefix = '') {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (!safeRelative(relative)) fail('PATH_INVALID', `Unsupported filename: ${relative}`);
      const full = path.join(current, entry.name);
      const stat = await fsp.lstat(full);
      if (stat.isSymbolicLink()) fail('PATH_INVALID', `Symbolic links/junctions are not supported: ${full}`);
      if (stat.isDirectory()) { directories.push(relative); await visit(full, `${relative}/`); }
      else if (stat.isFile()) files.set(relative, full);
      else fail('PATH_INVALID', `Unsupported filesystem entry: ${full}`);
    }
  }
  await visit(directory);
  return { files, directories };
}

async function installedReceipt(target) {
  try {
    await checkedPath(target, path.join(target, RECEIPT));
    const record = JSON.parse(utf8(await fsp.readFile(path.join(target, RECEIPT))));
    if (record.format !== 1 || record.repository !== REPOSITORY || record.branch !== 'main' ||
        !/^[a-f0-9]{40}$/.test(record.commit) || typeof record.version !== 'string' ||
        !Array.isArray(record.files) || !record.files.length || record.files.length > 10000) throw new Error('Invalid installation receipt');
    const seen = new Set();
    for (const file of record.files) {
      if (typeof file.path !== 'string' || !safeRelative(file.path) || file.path === RECEIPT ||
          !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.path.toLowerCase())) throw new Error('Invalid managed-file inventory');
      seen.add(file.path.toLowerCase());
    }
    if (REQUIRED.some(file => !seen.has(file))) throw new Error('Incomplete managed-file inventory');
    return record;
  } catch (error) {
    throw new BridgeError('UNMANAGED_INSTALL', `The existing directory has no valid VLauncher installation receipt. Handle it manually: ${target}`);
  }
}

async function verifyInstalled(target, receipt) {
  const tree = await scanTree(target);
  for (const file of receipt.files) {
    if (!tree.files.has(file.path) || await hash(tree.files.get(file.path)) !== file.sha256) {
      fail('LOCAL_CHANGES', `A managed file was changed or removed. Preserve your changes before updating: ${path.join(target, file.path)}`);
    }
  }
  return tree;
}

function runProcess(executable, args, { cwd, env, timeoutMs = 120000, onLog = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...env }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8');
      stream.on('data', data => { const text = decoder.write(data); output = (output + text).slice(-65536); onLog(text.trim()); });
      stream.on('end', () => { output += decoder.end(); });
    }
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve(output);
      else reject(new Error(`${timedOut ? 'Process timed out' : `Process exited with code ${code}`}\n${output}`));
    });
  });
}

async function externalComfyRunning(paths, python, runner = runProcess) {
  if (process.platform !== 'win32') return false;
  const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='python.exe' OR Name='pythonw.exe'\" | Select-Object CommandLine,ExecutablePath) | ConvertTo-Json -Compress";
  try {
    const output = await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 15000 });
    const parsed = JSON.parse(output.trim() || '[]');
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.some(item => {
      const command = (item.CommandLine || '').replace(/\\/g, '/').toLowerCase();
      const executable = (item.ExecutablePath || '').toLowerCase();
      const main = path.join(paths.comfy, 'main.py').replace(/\\/g, '/').toLowerCase();
      return command.includes(main) || (/\bmain\.py\b/.test(command) && executable === python.toLowerCase());
    });
  } catch (error) { throw new BridgeError('PROCESS_CHECK_FAILED', `Unable to check running ComfyUI processes: ${error.message}`); }
}

function createPSBridgeService(options) {
  let busy = false;
  let progress = null;
  let lastResult = null;
  const log = options.log || (() => {});
  const emit = (stage, extra = {}) => {
    progress = { stage, ...extra };
    options.onProgress?.(progress);
    if (extra.percent === undefined) log(`[PS Bridge] ${stage}`);
  };
  const runner = options.runProcess || runProcess;
  const network = options.network || {};
  const filesystemRename = options.rename || ((from, to) => fsp.rename(from, to));

  async function environment() {
    const paths = await pathsFor(options.getRoot());
    const settings = options.getSettings();
    const python = settings.pythonPath || path.join(paths.root, 'python_embeded', 'python.exe');
    if (!path.isAbsolute(python) || !(await exists(python))) fail('PYTHON_MISSING', `ComfyUI Python was not found: ${python}`);
    return { ...paths, settings, python };
  }

  async function inspect(paths) {
    if (await exists(paths.pending)) fail('RECOVERY_REQUIRED', `An interrupted directory switch needs review. See ${paths.pending}; backups are retained in ${paths.workspace}.`);
    const installed = await exists(paths.target);
    const receipt = installed ? await installedReceipt(paths.target) : null;
    if (receipt) await verifyInstalled(paths.target, receipt);
    return receipt;
  }

  async function assertStopped(paths) {
    if (options.isComfyRunning() || await (options.externalComfyRunning || externalComfyRunning)(paths, paths.python, runner)) {
      fail('COMFY_RUNNING', 'Stop ComfyUI before installing or updating nodes.');
    }
  }

  async function lockOwner(paths) {
    if (!(await exists(paths.lock))) return null;
    await checkedPath(paths.root, paths.lock);
    let owner;
    try { owner = JSON.parse(utf8(await fsp.readFile(paths.lock))); } catch { fail('RECOVERY_REQUIRED', `Inspect the incomplete installer lock manually: ${paths.lock}`); }
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) fail('RECOVERY_REQUIRED', `Invalid installer lock: ${paths.lock}`);
    try { process.kill(owner.pid, 0); return owner; }
    catch (error) { if (error.code === 'ESRCH') return { ...owner, stale: true }; return owner; }
  }

  async function getStatus() {
    let paths;
    try {
      paths = await environment();
      const owner = await lockOwner(paths);
      if (busy || (owner && !owner.stale)) return { state: 'busy', code: 'BUSY', installPath: paths.target, canUpdate: false, progress, lastResult, repositoryUrl: REPO_URL };
      const receipt = await inspect(paths);
      await assertStopped(paths);
      return { state: receipt ? 'installed' : 'notInstalled', code: 'READY', canUpdate: true, installPath: paths.target, version: receipt?.version, commit: receipt?.commit, repositoryUrl: REPO_URL, lastResult };
    } catch (error) {
      return { state: 'blocked', code: error.code || 'ENVIRONMENT_INVALID', message: error.message, installPath: paths?.target || '', canUpdate: false, repositoryUrl: REPO_URL, lastResult };
    }
  }

  async function move(paths, from, to) {
    await checkedPath(paths.root, from);
    await checkedPath(paths.root, to);
    if (await exists(to)) fail('PATH_INVALID', `Move destination already exists: ${to}`);
    await filesystemRename(from, to);
  }

  async function update() {
    if (busy) return { success: false, code: 'BUSY', message: 'An installation is already in progress.' };
    busy = true;
    lastResult = null;
    let paths, job, lock, backupPath;
    try {
      emit('checking');
      paths = await environment();
      await fsp.mkdir(paths.workspace, { recursive: true });
      const owner = await lockOwner(paths);
      if (owner && !owner.stale) fail('BUSY', 'Another launcher is installing nodes.');
      // Only this one exact stale lock file is removed; directories are never deleted.
      if (owner?.stale) await fsp.unlink(await checkedPath(paths.root, paths.lock));
      lock = await fsp.open(paths.lock, 'wx');
      await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
      const receipt = await inspect(paths);
      await assertStopped(paths);
      // Python is an external process and cannot read Electron's virtual ASAR filesystem.
      const probe = path.join(__dirname, 'ps-bridge-probe.py').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
      try { await runner(paths.python, ['-s', '-B', probe, 'environment', paths.comfy], { cwd: paths.root, onLog: log }); }
      catch (error) { throw new BridgeError('ENVIRONMENT_INVALID', error.message); }
      emit('resolving');
      let metadata;
      try { metadata = await (network.readJson || readJson)(`https://api.github.com/repos/${REPOSITORY}/commits/main`); }
      catch (error) { throw error instanceof BridgeError ? error : new BridgeError('DOWNLOAD_FAILED', error.message); }
      const commit = metadata.sha;
      if (!/^[a-f0-9]{40}$/.test(commit)) fail('DOWNLOAD_FAILED', 'GitHub did not return a valid main commit.');
      if (receipt?.commit === commit) {
        emit('validating');
        try { await runner(paths.python, ['-s', '-B', probe, 'nodes', paths.comfy, paths.target], { cwd: paths.root, onLog: log }); }
        catch (error) { throw new BridgeError('VALIDATION_FAILED', error.message); }
        lastResult = { success: true, code: 'UP_TO_DATE', version: receipt.version, commit, restartRequired: false };
        emit('complete');
        return lastResult;
      }
      job = path.join(paths.workspace, `${Date.now()}-${crypto.randomUUID()}`);
      await checkedPath(paths.root, job);
      await fsp.mkdir(job);
      const zip = path.join(job, 'source.zip');
      emit('downloading');
      try { await (network.download || download)(mirrorUrl(`${REPO_URL}/archive/${commit}.zip`, paths.settings), zip, detail => emit('downloading', detail)); }
      catch (error) { throw error instanceof BridgeError ? error : new BridgeError('DOWNLOAD_FAILED', error.message); }
      emit('extracting');
      const staged = await extractArchive(zip, path.join(job, 'extracted'), commit);
      const tree = await scanTree(staged);
      if (tree.files.has(RECEIPT) || REQUIRED.some(file => !tree.files.has(file))) fail('ARCHIVE_INVALID', 'The archive does not contain a complete PS Bridge node package.');
      const project = utf8(await fsp.readFile(path.join(staged, 'pyproject.toml')));
      if (!/^name\s*=\s*["']aigctv-ps-bridge-nodes["']/m.test(project)) fail('ARCHIVE_INVALID', 'Unexpected node project identity.');
      const version = project.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1];
      if (!version) fail('ARCHIVE_INVALID', 'Node package version is missing.');
      const files = [];
      for (const [relative, file] of tree.files) files.push({ path: relative, sha256: await hash(file) });
      const record = { format: 1, repository: REPOSITORY, branch: 'main', commit, version, installedAt: new Date().toISOString(), files };
      // Check the entire merge for conflicts before copying any user data or running pip.
      async function preserveData(copy) {
        if (!receipt) return;
        const oldTree = await verifyInstalled(paths.target, receipt);
        const managed = new Set(receipt.files.map(file => file.path));
        const newFiles = new Set([...tree.files.keys()].map(name => name.toLowerCase()));
        const newDirectories = new Set(tree.directories.map(name => name.toLowerCase()));
        for (const directory of oldTree.directories) {
          if (newFiles.has(directory.toLowerCase())) fail('DATA_CONFLICT', `A new file would replace an existing directory: ${directory}`);
        }
        for (const [relative, source] of oldTree.files) {
          if (relative === RECEIPT || managed.has(relative)) continue;
          if (newFiles.has(relative.toLowerCase()) || newDirectories.has(relative.toLowerCase())) fail('DATA_CONFLICT', `A new package path conflicts with a user file: ${relative}`);
          const parts = relative.toLowerCase().split('/');
          for (let i = 1; i < parts.length; i++) if (newFiles.has(parts.slice(0, i).join('/'))) fail('DATA_CONFLICT', `A new file conflicts with user data: ${relative}`);
          if (copy) {
            const destination = await checkedPath(paths.root, path.join(staged, relative));
            await fsp.mkdir(path.dirname(destination), { recursive: true });
            await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
          }
        }
        if (copy) for (const directory of oldTree.directories) await fsp.mkdir(await checkedPath(paths.root, path.join(staged, directory)), { recursive: true });
      }
      await preserveData(false);
      emit('dependencies');
      const pipArgs = ['-s', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', path.join(staged, 'requirements.txt')];
      if (paths.settings.usePypiMirror) pipArgs.push('--index-url', paths.settings.pypiMirrorUrl || 'https://pypi.tuna.tsinghua.edu.cn/simple');
      log(`[PS Bridge] ${JSON.stringify({ executable: paths.python, args: pipArgs })}`);
      try { await runner(paths.python, pipArgs, { cwd: paths.root, timeoutMs: 600000, onLog: log }); }
      catch (error) { throw new BridgeError('DEPENDENCY_FAILED', error.message); }
      emit('validating');
      try { await runner(paths.python, ['-s', '-B', probe, 'nodes', paths.comfy, staged], { cwd: paths.root, onLog: log }); }
      catch (error) { throw new BridgeError('VALIDATION_FAILED', error.message); }
      // Recheck immediately before switching; installation does not stop external processes.
      await assertStopped(paths);
      await inspect(paths);
      await preserveData(true);
      await fsp.writeFile(path.join(staged, RECEIPT), JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      emit('installing');
      backupPath = receipt ? path.join(job, 'backup') : undefined;
      await fsp.writeFile(paths.pending, JSON.stringify({ target: paths.target, staged, backupPath, commit }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      let backedUp = false;
      let installed = false;
      try {
        if (backupPath) { await move(paths, paths.target, backupPath); backedUp = true; }
        await move(paths, staged, paths.target);
        installed = true;
        await verifyInstalled(paths.target, record);
        await fsp.unlink(await checkedPath(paths.root, paths.pending));
      } catch (error) {
        try {
          if (installed) await move(paths, paths.target, path.join(job, 'failed-install'));
          if (backedUp) await move(paths, backupPath, paths.target);
          await fsp.unlink(await checkedPath(paths.root, paths.pending));
        } catch (recoveryError) {
          throw new BridgeError('RECOVERY_REQUIRED', `Directory recovery needs manual attention. ${paths.pending}\n${recoveryError.message}`, { backupPath });
        }
        throw new BridgeError('INSTALL_FAILED', `Directory switch failed; the previous installation was preserved. ${error.message}`);
      }
      lastResult = { success: true, code: 'INSTALLED', version, commit, restartRequired: true, backupPath, retainedPath: job };
      emit('complete');
      log(`[PS Bridge] Installed ${version} (${commit}). Retained files: ${job}`);
      return lastResult;
    } catch (error) {
      const code = error.code === 'EEXIST' ? 'BUSY' : error.code;
      const known = /^[A-Z_]+$/.test(code || '') && !['ENOENT', 'EACCES', 'EPERM', 'EBUSY'].includes(code);
      lastResult = { success: false, code: known ? code : 'INSTALL_FAILED', message: error.message, retainedPath: job, backupPath: error.backupPath };
      emit('failed');
      log(`[PS Bridge] ${lastResult.code}: ${error.message}`);
      return lastResult;
    } finally {
      if (lock) {
        await lock.close().catch(error => log(error.message));
        await fsp.unlink(await checkedPath(paths.root, paths.lock)).catch(error => log(`[PS Bridge] Lock retained: ${error.message}`));
      }
      busy = false;
    }
  }

  async function directoryToOpen() {
    const paths = await pathsFor(options.getRoot());
    return await exists(paths.target) ? paths.target : paths.customNodes;
  }

  async function isInstalling() {
    if (busy) return true;
    // This check also serves old ComfyUI versions: do not require the V3 API to launch them.
    const root = await fsp.realpath(options.getRoot());
    const lock = await checkedPath(root, path.join(root, '.vlauncher-ps-bridge', 'install.lock'));
    const owner = await lockOwner({ root, lock });
    return Boolean(owner && !owner.stale);
  }

  return { getStatus, update, directoryToOpen, isInstalling, isBusy: () => busy };
}

module.exports = { createPSBridgeService, pathsFor, scanTree, installedReceipt, verifyInstalled, runProcess, externalComfyRunning, RECEIPT };
