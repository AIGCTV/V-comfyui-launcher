'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanFile, scanSource, scanHistory } = require('./security-audit.cjs');
const { assertNewVersion } = require('./release-policy.cjs');
const { validateRemoteAssets } = require('./publish-release.cjs');
const scan = (name, text, mode) => scanFile(name, Buffer.from(text, 'utf8'), mode);

test('detects a RunningHub-style key without printing its value', () => {
    const secret = 'a1'.repeat(16);
    const result = scan('config.json', JSON.stringify({ apiKey: secret }));
    assert.ok(result.some(x => x.rule === 'literal-secret'));
    assert.equal(JSON.stringify(result).includes(secret), false);
});
test('checks cjs, tsx and files larger than the old two-MB limit', () => {
    for (const name of ['main.cjs', 'App.tsx', 'large.json']) {
        const result = scan(name, ' '.repeat(2100000) + JSON.stringify({ apiKey: 'b2'.repeat(16) }));
        assert.ok(result.length);
    }
});
test('only empty env templates are allowed in source', () => {
    assert.equal(scan('.env.example', 'GEMINI_API_KEY=\n').length, 0);
    assert.ok(scan('.env.example', 'GEMINI_API_KEY=' + 'c3'.repeat(16)).length);
    assert.ok(scan('.env.example', 'GEMINI_API_KEY=\n', 'artifact').length);
});
test('private configs and debug data are blocked even when empty', () => {
    for (const name of ['rh-config.json', 'sub/launcher-settings.json', '.env', 'private.key']) assert.ok(scan(name, '{}').length);
    for (const name of ['fixtures/data.json', 'bundle.js.map', 'test.log']) assert.ok(scan(name, '{}', 'artifact').length);
});
test('runtime assignments and empty credentials are not literal secrets', () => {
    assert.equal(scan('runtime.cjs', 'const password = this.base.password; const apiKey = "";').length, 0);
});
test('URL rules detect literal secrets and allow runtime interpolation', () => {
    assert.ok(scan('client.cjs', 'https://example.invalid/?apiKey=' + 'e5'.repeat(16)).some(x => x.rule === 'url-secret'));
    assert.equal(scan('client.cjs', 'const url = `https://example.invalid/?apiKey=${config.apiKey}`;').length, 0);
});
test('release policy refuses same-version rebuilds and version downgrades', () => {
    assert.throws(() => assertNewVersion('1.2.0', ['v1.2.0']));
    assert.throws(() => assertNewVersion('1.2.1', ['v1.3.0']));
    assert.throws(() => assertNewVersion('latest', []));
    assert.doesNotThrow(() => assertNewVersion('1.2.1', ['v1.1.0', 'v1.2.0']));
});
test('publication refuses missing, extra or mismatched remote files', () => {
    const expected = { 'app.exe': { hash: 'a'.repeat(64), size: 123 } };
    const asset = { name: 'app.exe', digest: 'sha256:' + 'a'.repeat(64), size: 123 };
    assert.doesNotThrow(() => validateRemoteAssets([asset], expected));
    for (const assets of [[], [asset, asset], [{ ...asset, size: 122 }], [{ ...asset, digest: 'sha256:' + 'b'.repeat(64) }]]) assert.throws(() => validateRemoteAssets(assets, expected));
});
test('staged content and historical secrets are checked even after a working-file cleanup', () => {
    const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
    const { execFileSync } = require('node:child_process');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-security-test-'));
    const git = args => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'user.name=Security test', '-c', 'user.email=test@example.invalid', ...args], { cwd, stdio: 'pipe', windowsHide: true });
    git(['init']);
    const file = path.join(cwd, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ apiKey: 'd4'.repeat(16) }), 'utf8');
    git(['add', 'config.json']);
    fs.writeFileSync(file, JSON.stringify({ apiKey: '' }), 'utf8');
    assert.equal(scanSource({ cwd }).length, 0);
    assert.ok(scanSource({ cwd, staged: true }).some(x => x.rule === 'literal-secret'));
    git(['commit', '-m', 'Synthetic fixture']);
    git(['add', 'config.json']);
    git(['commit', '-m', 'Clear synthetic fixture']);
    assert.ok(scanHistory(cwd).some(x => x.rule === 'literal-secret'));
    // Retain the synthetic fixture; never recursively delete user or test directories.
});
