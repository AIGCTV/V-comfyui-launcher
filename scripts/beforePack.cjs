'use strict';
const { scanSource, assertClean } = require('./security-audit.cjs');
exports.default = async () => assertClean(scanSource());
