'use strict';

// Opt-in live smoke test. All node, dependency, image and server state stays in .cache.
// It reads the chosen ComfyUI Git checkout and borrows its Python's existing core dependencies.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');
const extract = require('extract-zip');
const sharp = require('sharp');
const { createPSBridgeService, runProcess } = require('../electron/ps-bridge-service.cjs');
const { download } = require('../electron/ps-bridge-download.cjs');

async function main() {
  const sourceCore = process.env.PS_BRIDGE_TEST_COMFY_ROOT;
  const python = process.env.PS_BRIDGE_TEST_PYTHON;
  if (!sourceCore || !python) throw new Error('Set PS_BRIDGE_TEST_COMFY_ROOT and PS_BRIDGE_TEST_PYTHON to the existing core checkout and Python executable.');
  const root = path.resolve('.cache', 'ps-bridge-live', `${Date.now()}-${crypto.randomUUID()}`);
  await fs.mkdir(root, { recursive: true });
  const core = path.join(root, 'ComfyUI');
  const dependencies = path.join(root, 'isolated-dependencies');
  const referenceDependencies = path.join(root, 'reference-dependencies');
  const archive = path.join(root, 'comfy-core.zip');
  console.log(`Isolated test directory: ${root}`);
  const referenceCommit = process.env.PS_BRIDGE_TEST_CORE_COMMIT;
  if (referenceCommit) {
    if (!/^[a-f0-9]{40}$/.test(referenceCommit)) throw new Error('Expected a full ComfyUI reference commit SHA.');
    if (process.env.PS_BRIDGE_TEST_CORE_ARCHIVE) await fs.copyFile(process.env.PS_BRIDGE_TEST_CORE_ARCHIVE, archive);
    else await download(`https://github.com/Comfy-Org/ComfyUI/archive/${referenceCommit}.zip`, archive);
    const unpacked = path.join(root, 'reference-core');
    await extract(archive, { dir: unpacked });
    const source = path.join(unpacked, `ComfyUI-${referenceCommit}`);
    if (!source.startsWith(root + path.sep) || !core.startsWith(root + path.sep)) throw new Error('Invalid test directory');
    await fs.rename(source, core);
    await runProcess(python, ['-s', '-m', 'pip', 'install', '--target', referenceDependencies, '--no-deps', '--no-compile', '--disable-pip-version-check', 'av==17.0.0', 'comfyui-frontend-package==1.49.6', 'comfy-kitchen==0.2.31', 'comfy-aimdo==0.4.15', 'simpleeval', 'blake3'], { timeoutMs: 600000, onLog: console.log });
  } else {
    await runProcess('git', ['-c', `safe.directory=${sourceCore.replace(/\\/g, '/')}`, '-C', sourceCore, 'archive', 'HEAD', '-o', archive], { timeoutMs: 120000 });
    await extract(archive, { dir: core });
  }
  await fs.mkdir(path.join(core, 'custom_nodes'), { recursive: true });
  const wrapper = 'import sys,os,runpy; sys.path[:0]=sys.argv.pop(1).split(os.pathsep); sys.argv=sys.argv[1:]; runpy.run_path(sys.argv[0],run_name="__main__")';
  const log = [];
  const service = createPSBridgeService({
    getRoot: () => root,
    getSettings: () => ({ pythonPath: python }),
    isComfyRunning: () => false,
    externalComfyRunning: async () => false,
    log: message => { log.push(message); console.log(message); },
    runProcess: (exe, args, options) => args.includes('pip')
      ? runProcess(exe, [...args, '--target', dependencies, '--no-compile'], options)
      : runProcess(exe, ['-s', '-B', '-c', wrapper, [dependencies, referenceDependencies].join(path.delimiter), ...args.slice(2)], options),
  });
  const result = await service.update();
  await fs.writeFile(path.join(root, 'installer-log.txt'), log.join('\n'), 'utf8');
  if (!result.success) throw new Error(JSON.stringify(result));
  const installed = path.join(core, 'custom_nodes', 'comfyui-ps-bridge-nodes');
  const port = await new Promise(resolve => {
    const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  const bootstrap = path.join(root, 'run-isolated-comfy.py');
  const userDirectory = path.join(core, 'user');
  await fs.mkdir(userDirectory, { recursive: true });
  // Skip ComfyUI's recursive temp cleanup in this test. Artifacts are retained for review.
  const args = [path.join(core, 'main.py'), '--cpu', '--listen', '127.0.0.1', '--port', String(port), '--base-directory', core,
    '--user-directory', userDirectory, '--disable-auto-launch', '--disable-api-nodes', '--disable-all-custom-nodes',
    '--whitelist-custom-nodes', 'comfyui-ps-bridge-nodes', '--database-url', 'sqlite:///:memory:'];
  await fs.writeFile(bootstrap, `import sys\nsys.dont_write_bytecode = True\nsys.path.insert(0, ${JSON.stringify(referenceDependencies)})\nsys.path.insert(0, ${JSON.stringify(dependencies)})\nsys.path.insert(0, ${JSON.stringify(core)})\nsys.argv = ${JSON.stringify(args)}\nimport main\nmain.cleanup_temp = lambda: None\nloop, server, start = main.start_comfyui()\nloop.run_until_complete(start())\n`, 'utf8');
  const server = spawn(python, ['-s', '-B', bootstrap], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PS_BRIDGE_AUTH_TOKEN: '', PS_BRIDGE_ALLOW_LAN: '0', PS_BRIDGE_DATA_DIR: path.join(root, 'bridge-data') } });
  const output = [];
  server.stdout.on('data', data => output.push(data));
  server.stderr.on('data', data => output.push(data));
  const serverExit = new Promise(resolve => { server.once('exit', resolve); server.once('error', error => { output.push(Buffer.from(error.message, 'utf8')); resolve(); }); });
  const base = `http://127.0.0.1:${port}`;
  try {
    let catalog;
    for (let attempt = 0; attempt < 90; attempt++) {
      try { const response = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(2000) }); if (response.ok) { catalog = await response.json(); break; } } catch {}
      if (server.exitCode !== null) throw new Error('Isolated ComfyUI exited during startup.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!catalog) throw new Error('Isolated ComfyUI did not become ready.');
    const expected = ['VP_Image', 'VP_SendToPS', 'VP_Seed', 'VP_Slider', 'VP_Prompt', 'VP_Batch'];
    for (const name of expected) if (!catalog[name]) throw new Error(`Node missing: ${name}`);
    const health = await (await fetch(`${base}/ps-bridge/v3/health`)).json();
    if (!health.ok || health.data.contractVersion !== 3) throw new Error('Bridge health check failed.');
    console.log('All six nodes and Bridge health endpoint loaded. Running the public model-free example…');
    const png = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 45, g: 170, b: 210, alpha: 0.5 } } }).png().toBuffer();
    const upload = new FormData(); upload.append('image', new Blob([png], { type: 'image/png' }), 'bridge-smoke.png');
    const uploaded = await (await fetch(`${base}/upload/image`, { method: 'POST', body: upload })).json();
    const workflow = JSON.parse(await fs.readFile(path.join(installed, 'data', 'workflows', 'example-roundtrip.json'), 'utf8'));
    workflow['1'].inputs.file_name = uploaded.name;
    workflow['2'].inputs.value = 1;
    workflow['3'].inputs.value = 2;
    const queued = await (await fetch(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }) })).json();
    if (!queued.prompt_id) throw new Error(`Queue rejected: ${JSON.stringify(queued)}`);
    let history;
    for (let attempt = 0; attempt < 90; attempt++) {
      history = (await (await fetch(`${base}/history/${queued.prompt_id}`)).json())[queued.prompt_id];
      if (history) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!history || history.status.status_str !== 'success') throw new Error(`Execution failed: ${JSON.stringify(history)}`);
    const images = history.outputs['6'].images;
    if (images.length !== 2) throw new Error(`Expected two output images, got ${images.length}`);
    for (const [index, entry] of images.entries()) {
      const image = Buffer.from(await (await fetch(`${base}/view?${new URLSearchParams(entry)}`)).arrayBuffer());
      const metadata = await sharp(image).metadata();
      if (metadata.format !== 'png' || metadata.width !== 64 || metadata.height !== 48 || metadata.channels !== 4) throw new Error('Unexpected output image shape.');
      await fs.writeFile(path.join(root, `result-${index + 1}.png`), image);
    }
    const report = { installer: result, nodes: expected, health: health.data, promptId: queued.prompt_id, outputCount: images.length, image: { format: 'png', width: 64, height: 48, channels: 4 }, history };
    await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`LIVE CHECK PASSED: ${path.join(root, 'report.json')}`);
  } finally {
    if (server.exitCode === null) server.kill();
    await serverExit;
    await fs.writeFile(path.join(root, 'comfy-server.log'), Buffer.concat(output));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
