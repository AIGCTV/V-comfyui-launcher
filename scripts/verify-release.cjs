'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { scanDirectory, scanSource, scanHistory, assertClean } = require('./security-audit.cjs');
const { sourceSnapshot } = require('./release-policy.cjs');
const root = path.resolve(__dirname, '..');
function verifyRelease(directory) {
    assertClean(scanSource());
    assertClean(scanHistory());
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (manifest.version !== pkg.version) throw new Error('Release version does not match package.json');
    if (!manifest.sourceSnapshot || manifest.sourceSnapshot !== sourceSnapshot()) throw new Error('Source files changed since the build; rebuild before publishing');
    const auditRoot = fs.mkdtempSync(path.join(root, '.cache', 'final-audit-'));
    const hashes = {};
    for (const name of [manifest.exe, manifest.zip]) {
        if (!name || path.basename(name) !== name) throw new Error('Unsafe artifact filename');
        const file = path.join(directory, name);
        const before = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        const destination = path.join(auditRoot, name.endsWith('.exe') ? 'exe' : 'zip');
        // Inspect both final distributables, including compressed ASAR contents.
        // All targets are newly generated paths; old artifacts are never removed.
        execFileSync(require('7zip-bin').path7za, ['x', file, '-o' + destination, '-y'], { windowsHide: true, stdio: 'pipe' });
        assertClean(scanDirectory(destination));
        const asar = path.join(destination, 'resources', 'app.asar');
        const app = JSON.parse(require('@electron/asar').extractFile(asar, 'package.json').toString('utf8'));
        if (app.version !== manifest.version) throw new Error('Packaged app version mismatch');
        hashes[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (hashes[name] !== before) throw new Error('Artifact changed during verification');
    }
    const report = { status: 'pass', version: manifest.version, sourceSnapshot: manifest.sourceSnapshot, checkedAt: new Date().toISOString(), sha256: hashes };
    fs.writeFileSync(path.join(directory, 'security-audit.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(directory, `SHA256SUMS_${manifest.version}_${manifest.date}.txt`), Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}\n`).join(''), 'utf8');
    return report;
}
if (require.main === module) {
    try { console.log(JSON.stringify(verifyRelease(path.resolve(process.argv[2])), null, 2)); }
    catch (error) { console.error(error.message.split('\n')[0]); process.exitCode = 1; }
}
module.exports = { verifyRelease };
