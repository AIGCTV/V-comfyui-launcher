'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function git(args) {
    return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
}
function sourceSnapshot() {
    const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
    const hash = crypto.createHash('sha256');
    for (const name of files) hash.update(name).update('\0').update(fs.readFileSync(path.join(root, name))).update('\0');
    return hash.digest('hex');
}
function assertNewVersion(version, tags) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric major.minor.patch release version');
    const numbers = value => value.replace(/^v/, '').split('.').map(Number);
    const candidate = numbers(version);
    for (const tag of tags) {
        if (!/^v\d+\.\d+\.\d+$/.test(tag)) continue;
        const previous = numbers(tag);
        let comparison = 0;
        for (let i = 0; i < 3; i++) { if (candidate[i] !== previous[i]) { comparison = candidate[i] > previous[i] ? 1 : -1; break; } }
        if (comparison <= 0) throw new Error(`Release version must be newer than existing tag ${tag}`);
    }
}
module.exports = { git, sourceSnapshot, assertNewVersion };
