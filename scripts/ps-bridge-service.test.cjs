'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const vm = require('vm');
const { createPSBridgeService, RECEIPT, pathsFor } = require('../electron/ps-bridge-service.cjs');
const { readJson, download, extractArchive, mirrorUrl } = require('../electron/ps-bridge-download.cjs');

const A = 'a'.repeat(40), B = 'b'.repeat(40);
const required = {
  '__init__.py': '# fixture\n',
  'pyproject.toml': '[project]\nname = "aigctv-ps-bridge-nodes"\nversion = "0.3.2"\n',
  'requirements.txt': 'rfc8785==0.1.4\njsonschema>=4.20,<5\n',
  'ps_bridge/nodes.py': '# six nodes\n',
  'ps_bridge/protocol.py': '# protocol\n',
  'ps_bridge/routes.py': '# routes\n',
  'js/bridge.js': '// frontend\n',
};

// Small stored-ZIP fixture writer; archive validation uses the real ZIP reader.
function zipEntries(entries) {
  let offset = 0;
  const bodies = [], central = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'), data = Buffer.from(entry.data || '', 'utf8');
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    bodies.push(local, name, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(0x0314, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x800, 8);
    header.writeUInt32LE(crc, 16); header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(((entry.mode || 0x81a4) << 16) >>> 0, 38); header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, directory, end]);
}

function archive(sha, extra = {}) {
  return zipEntries(Object.entries({ ...required, ...extra }).map(([name, data]) => ({ name: `comfyui-ps-bridge-nodes-${sha}/${name}`, data })));
}

async function fixture(t, overrides = {}) {
  const root = path.resolve('.cache', 'ps-bridge-tests', `${Date.now()}-${crypto.randomUUID()}`, '便携包 space [1]');
  await fs.mkdir(path.join(root, 'ComfyUI', 'custom_nodes'), { recursive: true });
  await fs.mkdir(path.join(root, 'ComfyUI', 'comfy_api', 'latest'), { recursive: true });
  await fs.writeFile(path.join(root, 'ComfyUI', 'main.py'), '# fixture\n', 'utf8');
  await fs.writeFile(path.join(root, 'ComfyUI', 'comfy_api', 'latest', '__init__.py'), '# fixture\n', 'utf8');
  await fs.mkdir(path.join(root, 'python_embeded'));
  await fs.writeFile(path.join(root, 'python_embeded', 'python.exe'), '', 'utf8');
  const state = { sha: A, archives: { [A]: archive(A), [B]: archive(B, { 'js/bridge.js': '// changed\n' }) }, requests: [], calls: [], running: false, stages: [], settings: {} };
  const server = http.createServer((req, res) => {
    state.requests.push(req.url);
    if (req.url === '/metadata') { res.end(JSON.stringify({ sha: state.sha })); return; }
    if (req.url === '/redirect') { res.writeHead(302, { Location: `/zip/${state.sha}` }); res.end(); return; }
    if (req.url === '/limited') { res.writeHead(403, { 'x-ratelimit-remaining': '0' }); res.end('{}'); return; }
    if (req.url === '/timeout') return;
    if (req.url === '/interrupted') { res.writeHead(200, { 'Content-Length': 2000 }); res.write('PK'); setTimeout(() => res.destroy(), 10); return; }
    if (req.url.startsWith('/zip/')) { const buffer = state.archives[req.url.slice(5)]; res.writeHead(200, { 'Content-Length': buffer.length }); res.end(buffer); return; }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = {
    getRoot: () => root, getSettings: () => state.settings, isComfyRunning: () => state.running,
    externalComfyRunning: async () => false,
    onProgress: progress => state.stages.push(progress.stage),
    runProcess: async (exe, args, config) => { state.calls.push({ exe, args, config }); return '{}'; },
    network: {
      readJson: () => readJson(`${base}/metadata`, { allowHttp: true }),
      download: (url, destination, callback) => { state.lastDownloadUrl = url; return download(`${base}/zip/${state.sha}`, destination, callback, { allowHttp: true }); },
    }, ...overrides,
  };
  const service = createPSBridgeService(options);
  return { root, state, options, service, base, target: path.join(root, 'ComfyUI', 'custom_nodes', 'comfyui-ps-bridge-nodes') };
}

test('fresh install uses fixed SHA, records inventory, and repeated install does not run pip', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.getStatus()).state, 'notInstalled');
  const first = await f.service.update();
  assert.equal(first.code, 'INSTALLED', first.message);
  assert.equal(first.restartRequired, true);
  assert.equal(f.state.lastDownloadUrl, `https://github.com/AIGCTV/comfyui-ps-bridge-nodes/archive/${A}.zip`);
  const receipt = JSON.parse(await fs.readFile(path.join(f.target, RECEIPT), 'utf8'));
  assert.equal(receipt.commit, A);
  assert.equal(receipt.files.length, Object.keys(required).length);
  const second = await f.service.update();
  assert.equal(second.code, 'UP_TO_DATE');
  assert.equal(second.restartRequired, false);
  assert.equal(f.state.calls.filter(call => call.args.includes('pip')).length, 1);
  assert.equal((await f.service.getStatus()).version, '0.3.2');
});

test('same-version new commit preserves user data, removes retired source via snapshot, and retains backup outside custom_nodes', async t => {
  const f = await fixture(t);
  f.state.archives[A] = archive(A, { 'retired.py': '# old source' });
  assert.equal((await f.service.update()).success, true);
  await fs.mkdir(path.join(f.target, 'data', 'bridge-v3'), { recursive: true });
  await fs.writeFile(path.join(f.target, 'data', 'bridge-v3', '用户.json'), '{"prompt":"你好"}', 'utf8');
  await fs.mkdir(path.join(f.target, 'empty-user-folder'));
  f.state.sha = B;
  const result = await f.service.update();
  assert.equal(result.code, 'INSTALLED', result.message);
  assert.equal(result.version, '0.3.2');
  assert.equal(await fs.readFile(path.join(f.target, 'data', 'bridge-v3', '用户.json'), 'utf8'), '{"prompt":"你好"}');
  assert.equal((await fs.stat(path.join(f.target, 'empty-user-folder'))).isDirectory(), true);
  await assert.rejects(fs.stat(path.join(f.target, 'retired.py')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(result.backupPath, 'retired.py'), 'utf8'), '# old source');
  assert.ok(!result.backupPath.includes(`${path.sep}custom_nodes${path.sep}`));
});

test('dirty managed source is not overwritten or downloaded over', async t => {
  const f = await fixture(t);
  await f.service.update();
  await fs.writeFile(path.join(f.target, '__init__.py'), '# my change', 'utf8');
  const requestCount = f.state.requests.length;
  assert.equal((await f.service.update()).code, 'LOCAL_CHANGES');
  assert.equal(f.state.requests.length, requestCount);
  assert.equal(await fs.readFile(path.join(f.target, '__init__.py'), 'utf8'), '# my change');
});

test('old PS folders coexist without blocking or modifying them', async t => {
  for (const name of ['comfyui-photoshop', 'ComfyUI-Photoshop', 'renamed-old-node']) {
    const f = await fixture(t);
    const folder = path.join(f.root, 'ComfyUI', 'custom_nodes', name);
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'pyproject.toml'), '[project]\nname = "comfyui-photoshop"\n', 'utf8');
    const status = await f.service.getStatus();
    assert.equal(status.state, 'notInstalled');
    assert.equal(status.canUpdate, true);
    assert.equal(status.legacyPaths, undefined);
    assert.equal((await f.service.update()).success, true);
    assert.equal(await fs.readFile(path.join(folder, 'pyproject.toml'), 'utf8'), '[project]\nname = "comfyui-photoshop"\n');
  }
});

test('external installation and running ComfyUI block without writes to node directory', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.target);
  assert.equal((await f.service.update()).code, 'UNMANAGED_INSTALL');
  const g = await fixture(t);
  g.state.running = true;
  assert.equal((await g.service.update()).code, 'COMFY_RUNNING');
  assert.equal(g.state.requests.length, 0);
  const external = await fixture(t, { externalComfyRunning: async () => true });
  assert.equal((await external.service.update()).code, 'COMFY_RUNNING');
});

test('new source that conflicts with user files is rejected before pip and leaves old installation intact', async t => {
  const f = await fixture(t);
  await f.service.update();
  await fs.writeFile(path.join(f.target, 'user.txt'), 'keep me', 'utf8');
  f.state.sha = B;
  f.state.archives[B] = archive(B, { 'user.txt': 'new source' });
  const count = f.state.calls.filter(call => call.args.includes('pip')).length;
  assert.equal((await f.service.update()).code, 'DATA_CONFLICT');
  assert.equal(f.state.calls.filter(call => call.args.includes('pip')).length, count);
  assert.equal(await fs.readFile(path.join(f.target, 'user.txt'), 'utf8'), 'keep me');
});

test('pip or node probe failure does not activate staged node files', async t => {
  for (const [step, expected] of [['pip', 'DEPENDENCY_FAILED'], ['nodes', 'VALIDATION_FAILED']]) {
    const f = await fixture(t, { runProcess: async (_exe, args) => { if (args.includes(step)) throw new Error('fixture failure'); return '{}'; } });
    const result = await f.service.update();
    assert.equal(result.code, expected);
    await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
    assert.ok(result.retainedPath);
  }
});

test('failed directory switch restores original installation with runtime data', async t => {
  const f = await fixture(t);
  await f.service.update();
  await fs.writeFile(path.join(f.target, 'user.txt'), 'keep me', 'utf8');
  f.state.sha = B;
  const service = createPSBridgeService({ ...f.options, rename: async (from, to) => {
    if (from.includes(`${path.sep}extracted${path.sep}`)) throw new Error('simulated occupied directory');
    await fs.rename(from, to);
  } });
  const result = await service.update();
  assert.equal(result.code, 'INSTALL_FAILED');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.target, RECEIPT), 'utf8')).commit, A);
  assert.equal(await fs.readFile(path.join(f.target, 'user.txt'), 'utf8'), 'keep me');
  assert.equal((await service.getStatus()).state, 'installed');
});

test('double clicks and another service instance cannot install concurrently', async t => {
  const f = await fixture(t);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const service = createPSBridgeService({ ...f.options, runProcess: async () => { entered(); await gate; return '{}'; } });
  const installation = service.update();
  await started;
  assert.equal(service.isBusy(), true);
  assert.equal(await f.service.isInstalling(), true);
  assert.equal((await service.update()).code, 'BUSY');
  assert.equal((await f.service.update()).code, 'BUSY');
  release();
  assert.equal((await installation).success, true);
});

test('mirror and PyPI settings are respected, custom Python is passed without shell quoting', async t => {
  const f = await fixture(t);
  f.state.settings = { useGithubMirror: true, githubMirrorUrl: 'https://mirror.example/proxy/', usePypiMirror: true, pypiMirrorUrl: 'https://pypi.example/simple', pythonPath: path.join(f.root, 'python_embeded', 'python.exe') };
  assert.equal((await f.service.update()).success, true);
  assert.ok(f.state.lastDownloadUrl.startsWith('https://mirror.example/proxy/https://github.com/'));
  const pip = f.state.calls.find(call => call.args.includes('pip'));
  assert.equal(pip.exe, f.state.settings.pythonPath);
  assert.deepEqual(pip.args.slice(-2), ['--index-url', 'https://pypi.example/simple']);
  assert.ok(pip.args[pip.args.indexOf('-r') + 1].includes('便携包 space [1]'));
  assert.throws(() => mirrorUrl('https://github.com/test', { useGithubMirror: true, githubMirrorUrl: 'http://bad' }), { code: 'MIRROR_INVALID' });
});

test('download handles relative redirect, rate limit, timeout, and interrupted body', async t => {
  const f = await fixture(t);
  await download(`${f.base}/redirect`, path.join(f.root, 'redirect.zip'), () => {}, { allowHttp: true });
  await assert.rejects(readJson(`${f.base}/limited`, { allowHttp: true }), { code: 'RATE_LIMITED' });
  await assert.rejects(readJson(`${f.base}/timeout`, { allowHttp: true, timeoutMs: 50 }), { code: 'DOWNLOAD_TIMEOUT' });
  await assert.rejects(download(`${f.base}/interrupted`, path.join(f.root, 'partial.zip'), () => {}, { allowHttp: true }));
});

test('unsafe archives are rejected before extraction creates directories', async t => {
  const f = await fixture(t);
  const prefix = `comfyui-ps-bridge-nodes-${A}/`;
  const cases = [
    [{ name: `${prefix}../escape.txt` }],
    [{ name: `${prefix}C:/escape.txt` }],
    [{ name: `${prefix}link`, data: '../outside', mode: 0xa1ff }],
    [{ name: `${prefix}FILE.py` }, { name: `${prefix}file.py` }],
    [{ name: `${prefix}a` }, { name: `${prefix}a/b` }],
    [{ name: `${prefix}a/b` }, { name: `${prefix}a` }],
    [{ name: `${prefix}aux.txt` }],
    [{ name: `${prefix}bad. ` }],
  ];
  for (let i = 0; i < cases.length; i++) {
    const file = path.join(f.root, `invalid-${i}.zip`), target = path.join(f.root, `extract-${i}`);
    await fs.writeFile(file, zipEntries(cases[i]));
    await assert.rejects(extractArchive(file, target, A), { code: 'ARCHIVE_INVALID' });
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  }
  f.state.archives[A] = Buffer.from('<html>mirror error</html>', 'utf8');
  assert.equal((await f.service.update()).code, 'ARCHIVE_INVALID');
});

test('invalid portable root, directory junction and interrupted transaction are blocked', async t => {
  const f = await fixture(t);
  await assert.rejects(pathsFor(path.join(f.root, 'ComfyUI')), { code: 'ENVIRONMENT_INVALID' });
  const workspace = path.join(f.root, '.vlauncher-ps-bridge');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'pending.json'), '{}', 'utf8');
  assert.equal((await f.service.update()).code, 'RECOVERY_REQUIRED');
  const g = await fixture(t);
  const outside = path.join(g.root, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, g.target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await g.service.update()).code, 'PATH_INVALID');
});

test('environment probe failure happens before any download or pip invocation', async t => {
  const f = await fixture(t, { runProcess: async () => { throw new Error('V3 Schema missing has_intermediate_output'); } });
  const result = await f.service.update();
  assert.equal(result.code, 'ENVIRONMENT_INVALID');
  assert.equal(f.state.requests.length, 0);
  assert.equal(result.retainedPath, undefined);
});

test('Windows case-insensitive user filename conflicts are caught before installing dependencies', async t => {
  const f = await fixture(t);
  await f.service.update();
  await fs.writeFile(path.join(f.target, 'User.txt'), 'preserve', 'utf8');
  f.state.sha = B;
  f.state.archives[B] = archive(B, { 'user.txt': 'source' });
  const calls = f.state.calls.filter(call => call.args.includes('pip')).length;
  assert.equal((await f.service.update()).code, 'DATA_CONFLICT');
  assert.equal(f.state.calls.filter(call => call.args.includes('pip')).length, calls);
});

test('ComfyUI started externally during preparation prevents the directory switch', async t => {
  const f = await fixture(t);
  const service = createPSBridgeService({ ...f.options, runProcess: async (_exe, args) => { if (args.includes('nodes')) f.state.running = true; return '{}'; } });
  assert.equal((await service.update()).code, 'COMFY_RUNNING');
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
});

test('failed rollback retains transaction record and backup for manual recovery', async t => {
  const f = await fixture(t);
  await f.service.update();
  f.state.sha = B;
  const service = createPSBridgeService({ ...f.options, rename: async (from, to) => {
    if (from.includes(`${path.sep}extracted${path.sep}`) || path.basename(from) === 'backup') throw new Error('simulated file lock');
    return fs.rename(from, to);
  } });
  const result = await service.update();
  assert.equal(result.code, 'RECOVERY_REQUIRED');
  assert.ok((await fs.stat(result.backupPath)).isDirectory());
  assert.equal((await service.getStatus()).code, 'RECOVERY_REQUIRED');
});

test('development, portable EXE and unpacked EXE resolve the same portable node directory', async t => {
  const f = await fixture(t);
  const mainSource = await fs.readFile(path.resolve('electron/main.cjs'), 'utf8');
  const cases = [
    { packaged: false, directory: path.join(f.root, 'launcher', 'electron') },
    { packaged: true, portable: f.root },
    { packaged: true, portable: path.join(f.root, 'launcher') },
    { packaged: true, exe: path.join(f.root, 'VLauncher.exe') },
    { packaged: true, exe: path.join(f.root, 'launcher', 'VLauncher.exe') },
  ];
  for (const config of cases) {
    const electron = { app: { isPackaged: config.packaged, getPath: () => config.exe, on() {}, whenReady: () => ({ then() {} }) }, ipcMain: { handle() {} } };
    const context = {
      module: { exports: {} },
      __dirname: config.directory || path.join(f.root, 'launcher', 'resources', 'app.asar', 'electron'),
      process: { platform: process.platform, env: { PORTABLE_EXECUTABLE_DIR: config.portable } },
      console: { log() {}, warn() {}, error() {} },
      require: name => {
        if (name === 'electron') return electron;
        if (name === './license-service.cjs' || name === './update-service.cjs') return {};
        if (name.startsWith('./')) return require(path.resolve('electron', name));
        return require(name);
      },
    };
    vm.runInNewContext(mainSource + '\nmodule.exports = { getComfyDir, psBridgeService };', context);
    assert.equal(context.module.exports.getComfyDir(), f.root);
    assert.equal(await context.module.exports.psBridgeService.directoryToOpen(), path.join(f.root, 'ComfyUI', 'custom_nodes'));
  }
});

module.exports = { zipEntries, archive };
