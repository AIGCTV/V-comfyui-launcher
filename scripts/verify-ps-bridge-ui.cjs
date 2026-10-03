'use strict';

// Run with Electron, against a production Vite build. Uses the actual preload API.
// Installation results are fixtures: this captures UI states without touching user nodes.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const asar = require('@electron/asar');
const { createPSBridgeService } = require('../electron/ps-bridge-service.cjs');
const buildDirectory = path.resolve(process.argv[2] || '.cache/ps-bridge-ui-build');
const output = path.resolve('.cache', 'ps-bridge-ui-check', `${Date.now()}-${crypto.randomUUID()}`);
app.setPath('userData', path.join(output, 'electron-user-data'));
app.disableHardwareAcceleration();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  await fs.mkdir(output, { recursive: true });
  await app.whenReady();
  const settings = { pythonPath: '', gitPath: '', customArgs: '', useGithubMirror: false, githubMirrorUrl: 'https://ghproxy.net/', useGitHubProxy: false, usePypiMirror: false, pypiMirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', useHfMirror: false, hfMirrorUrl: 'https://hf-mirror.com' };
  let state = { state: 'notInstalled', code: 'READY', canUpdate: true, installPath: 'C:\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\comfyui-ps-bridge-nodes', repositoryUrl: 'https://github.com/AIGCTV/comfyui-ps-bridge-nodes' };
  let scenario = 'success';
  let window;
  let opened = 0, updateCalls = 0;
  for (const [channel, handler] of Object.entries({
    'load-settings': () => settings,
    'save-settings': () => true,
    'get-launcher-version': () => ({ version: require('../package.json').version, buildDate: 'UI verification' }),
    'git-command': () => '3c5879d',
    'open-url': () => {},
    'get-ps-bridge-status': () => state,
    'open-ps-bridge-directory': () => { opened++; return { success: true }; },
    'update-ps-bridge': async () => {
      updateCalls++;
      state = { ...state, state: 'busy', canUpdate: false, progress: { stage: 'downloading', percent: 35 }, lastResult: null };
      window.webContents.send('ps-bridge-progress', state.progress);
      await delay(2400);
      const result = scenario === 'success'
        ? { success: true, code: 'INSTALLED', version: '0.3.2', commit: '9acc82de6b6fd5a9f128e066156227f709f28a42', restartRequired: true }
        : { success: false, code: 'DEPENDENCY_FAILED', message: 'Fixture: dependency download timed out. The installed node directory was preserved.' };
      state = { ...state, state: 'installed', canUpdate: true, version: '0.3.2', commit: '9acc82de6b6fd5a9f128e066156227f709f28a42', lastResult: result };
      return result;
    },
  })) ipcMain.handle(channel, handler);

  const errors = [];
  window = new BrowserWindow({ width: 1200, height: 900, show: false, backgroundColor: '#0a0e1a', webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true, preload: path.resolve('electron/preload.cjs') } });
  window.webContents.on('console-message', (_event, level, message) => { if (level === 3 && !/ERR_|Failed to load resource|fetch|content security/i.test(message)) errors.push(message); });
  // Keep this UI test offline; only bundled application assets may load.
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, callback) => callback({ cancel: true }));
  await window.loadFile(path.join(buildDirectory, 'index.html'));
  const evaluate = expression => window.webContents.executeJavaScript(expression);
  const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing: ' + ${JSON.stringify(label)}); button.click(); })()`);
  const text = () => evaluate(`document.querySelector('[data-testid="ps-bridge-settings"]')?.innerText || ''`);
  const waitFor = async expected => { for (let i = 0; i < 80; i++) { if ((await text()).includes(expected)) return; await delay(100); } throw new Error(`UI text not found: ${expected}`); };
  const screenshot = async (name, selector = '[data-testid="ps-bridge-settings"]') => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await delay(200);
    await fs.writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'PS插件')`), false);
  assert.equal(await evaluate(`Object.keys(window.electronAPI).some(name => /RH/.test(name))`), false);
  for (const label of ['启动', '控制台', '版本', '设置', '教程']) {
    assert.ok(await evaluate(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === ${JSON.stringify(label)})`));
  }
  await click('设置');
  await waitFor('安装节点');
  assert.equal(await evaluate(`document.querySelector('#ps-bridge-path').readOnly`), true);
  await screenshot('01-not-installed.png');
  await evaluate(`document.querySelector('button[aria-label="打开节点目录"]').click()`);
  await delay(100);
  assert.equal(opened, 1);
  await click('安装节点');
  await waitFor('35%');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '正在处理…').disabled`), true);
  await screenshot('02-downloading.png');
  await waitFor('节点安装 / 更新完成');
  assert.equal(updateCalls, 1);
  assert.ok((await text()).includes('0.3.2 · 9acc82d'));
  await screenshot('03-completed.png');
  scenario = 'failure';
  await click('更新节点');
  await waitFor('Python 依赖安装失败');
  await delay(5200);
  assert.ok((await text()).includes('Python 依赖安装失败'));
  await screenshot('04-failed.png');
  await evaluate(`document.querySelector('button[title="Switch to English"]').click()`);
  await waitFor('Python dependency installation failed');
  await screenshot('05-english.png');
  await evaluate(`document.querySelector('button[title="切换到中文"]').click()`);
  if (process.env.PS_BRIDGE_UI_REAL_ROOT) {
    state = await createPSBridgeService({ getRoot: () => process.env.PS_BRIDGE_UI_REAL_ROOT, getSettings: () => settings, isComfyRunning: () => false }).getStatus();
    await click('重新检查');
    // A previous fixture error is intentionally retained until a new operation; reload the component to display the real state.
    await window.reload(); await delay(500); await click('设置');
    await waitFor('请安装 comfyui-ps-bridge-nodes');
    assert.equal(state.canUpdate, true);
    assert.ok(!(await text()).includes('移出 custom_nodes'));
    await screenshot('06-current-environment.png');
  }

  // Verify the actual preload also works from an ASAR archive and that Python is unpacked.
  const packageRoot = path.join(output, 'package-source');
  await fs.mkdir(path.join(packageRoot, 'electron'), { recursive: true });
  for (const name of ['preload.cjs', 'ps-bridge-service.cjs', 'ps-bridge-download.cjs', 'ps-bridge-probe.py']) {
    await fs.copyFile(path.resolve('electron', name), path.join(packageRoot, 'electron', name));
  }
  const packed = path.join(output, 'app.asar');
  await asar.createPackageWithOptions(packageRoot, packed, { unpack: '*.py' });
  assert.ok((await fs.stat(path.join(output, 'app.asar.unpacked', 'electron', 'ps-bridge-probe.py'))).isFile());
  const packagedWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true, contextIsolation: true, preload: path.join(packed, 'electron', 'preload.cjs') } });
  await packagedWindow.loadFile(path.join(buildDirectory, 'index.html'));
  assert.equal(await packagedWindow.webContents.executeJavaScript('typeof window.electronAPI.updatePSBridge'), 'function');
  const packedService = require(path.join(packed, 'electron', 'ps-bridge-service.cjs'));
  assert.equal(typeof packedService.createPSBridgeService, 'function');
  const probeRoot = path.join(output, 'probe-portable');
  await fs.mkdir(path.join(probeRoot, 'ComfyUI', 'custom_nodes'), { recursive: true });
  await fs.mkdir(path.join(probeRoot, 'ComfyUI', 'comfy_api', 'latest'), { recursive: true });
  await fs.writeFile(path.join(probeRoot, 'ComfyUI', 'main.py'), '# test', 'utf8');
  await fs.writeFile(path.join(probeRoot, 'ComfyUI', 'comfy_api', 'latest', '__init__.py'), '# test', 'utf8');
  let probeVerified = false;
  const probeService = packedService.createPSBridgeService({
    getRoot: () => probeRoot, getSettings: () => ({ pythonPath: process.execPath }),
    isComfyRunning: () => false, externalComfyRunning: async () => false,
    runProcess: async (_exe, args) => {
      assert.ok(args[2].includes(`app.asar.unpacked${path.sep}electron${path.sep}`));
      assert.ok((await fs.readFile(args[2], 'utf8')).includes('has_intermediate_output'));
      probeVerified = true;
      return '{}';
    },
    network: { readJson: async () => ({ sha: 'fixture-stop-after-probe' }) },
  });
  assert.equal((await probeService.update()).code, 'DOWNLOAD_FAILED');
  assert.ok(probeVerified);
  packagedWindow.destroy();
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: true, updateCalls, opened, errors, fixtures: true, asarPreload: true, pythonUnpacked: true }, null, 2) + '\n', 'utf8');
  console.log(`UI CHECK PASSED: ${output}`);
  window.destroy();
  app.quit();
}

main().catch(error => { console.error(error); app.exit(1); });
