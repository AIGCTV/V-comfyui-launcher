'use strict';

// The only supported publishing entry point. Never upload a directory wholesale.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { git, assertNewVersion } = require('./release-policy.cjs');
const { verifyRelease } = require('./verify-release.cjs');
const { scanFile, assertClean } = require('./security-audit.cjs');
const root = path.resolve(__dirname, '..');
const repo = 'AIGCTV/V-comfyui-launcher';
function gh(args) {
    return execFileSync('gh', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
}
function validateRemoteAssets(assets, expected) {
    const names = Object.keys(expected);
    if (assets.length !== names.length) throw new Error('Asset count mismatch; release remains a draft');
    for (const name of names) {
        const asset = assets.find(item => item.name === name);
        if (!asset || asset.digest !== `sha256:${expected[name].hash}` || asset.size !== expected[name].size) throw new Error('Remote checksum mismatch; release remains a draft');
    }
}
function main(directory) {
    if (git(['status', '--porcelain']).trim()) throw new Error('Commit and audit all release changes before publishing');
    const report = verifyRelease(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
    const tag = `v${report.version}`;
    const commit = git(['rev-parse', 'HEAD']).trim();
    if (git(['rev-parse', `${tag}^{commit}`]).trim() !== commit) throw new Error('Release tag must point to the audited current commit');
    const remoteRefs = git(['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).trim().split('\n').map(line => line.split(/\s+/));
    const remoteCommit = remoteRefs.find(([, ref]) => ref.endsWith('^{}'))?.[0] || remoteRefs[0]?.[0];
    if (remoteCommit !== commit) throw new Error('Push the locally audited tag before publishing');
    const releases = JSON.parse(gh(['release', 'list', '--repo', repo, '--limit', '1000', '--json', 'tagName']));
    if (releases.some(release => release.tagName === tag)) throw new Error('Release already exists; inspect it manually, never overwrite published assets');
    assertNewVersion(report.version, releases.map(release => release.tagName));

    const sourceName = `V_comfyui_launcher_source_${manifest.version}_${manifest.date}.zip`;
    const source = path.join(directory, sourceName);
    if (fs.existsSync(source)) throw new Error('Source archive already exists; inspect it before retrying');
    // This tag and every reachable blob were scanned before any network upload.
    git(['archive', '--format=zip', `--output=${source}`, `${tag}^{commit}`]);
    const notes = path.join(root, 'docs', `Release_${manifest.version}.md`);
    assertClean(scanFile(path.basename(notes), fs.readFileSync(notes)));
    const checksumName = `SHA256SUMS_${manifest.version}_${manifest.date}.txt`;
    const checksum = path.join(directory, checksumName);
    const hashes = { ...report.sha256, [sourceName]: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') };
    fs.writeFileSync(checksum, Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}\n`).join(''), 'utf8');
    hashes[checksumName] = crypto.createHash('sha256').update(fs.readFileSync(checksum)).digest('hex');
    const names = Object.keys(hashes);
    gh(['release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--title', `VLauncher ${tag}`, '--notes-file', notes, ...names.map(name => path.join(directory, name))]);
    const assets = JSON.parse(gh(['api', `repos/${repo}/releases/tags/${tag}`])).assets;
    validateRemoteAssets(assets, Object.fromEntries(names.map(name => [name, { hash: hashes[name], size: fs.statSync(path.join(directory, name)).size }])));
    gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
    console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
}
module.exports = { validateRemoteAssets };
if (require.main === module) {
    try {
        if (!process.argv[2]) throw new Error('Usage: npm run release:publish -- <audited release directory>');
        main(path.resolve(process.argv[2]));
    } catch (error) { console.error(error.message.split('\n')[0]); process.exitCode = 1; }
}
