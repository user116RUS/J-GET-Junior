/* Run with node test/library-startup.js. No GUI or user files are accessed. */
const assert = require('assert');
const openStartupLibrary = require('../src/libraryStartup');

const database = {};
let prompts = 0;
const unopenedDialog = {showMessageBox() { prompts++; throw new Error('Unexpected prompt'); }};
assert.strictEqual(openStartupLibrary({open() { return database; }}, unopenedDialog, 'ru'), database);
for (const code of ['EACCES', 'ENOSPC', 'ENOENT', 'SQLITE_CORRUPT', undefined]) {
  const failure = new Error('storage failure');
  failure.code = code;
  assert.throws(() => openStartupLibrary({open() { throw failure; }}, unopenedDialog, 'ru'),
    error => error === failure);
}
assert.strictEqual(prompts, 0);

const invalid = new Error('file is encrypted or is not a database');
invalid.code = 'LEGACY_LIBRARY_INVALID';
invalid.sourceFile = 'C:\\Users\\Student\\Documents\\ScratchJR\\scratchjr.sqllite';
let starts = 0;
const library = {
  open() { throw invalid; },
  startFresh(error) { assert.strictEqual(error, invalid); starts++; return database; }
};
for (const answer of [1, -1, undefined]) {
  assert.strictEqual(openStartupLibrary(library, {showMessageBox(options) {
    assert.strictEqual(options.defaultId, 1);
    assert.strictEqual(options.cancelId, 1);
    assert(options.detail.includes(invalid.sourceFile));
    assert(options.detail.includes('прежние проекты не появятся'));
    return answer;
  }}, 'ru-RU'), null);
}
assert.strictEqual(starts, 0);
assert.strictEqual(openStartupLibrary(library, {showMessageBox(options) {
  assert.strictEqual(options.buttons[0], 'Start with an empty library');
  assert(options.detail.includes('old projects will not appear'));
  return 0;
}}, 'en-US'), database);
assert.strictEqual(starts, 1);
const full = new Error('ENOSPC');
library.startFresh = () => { throw full; };
assert.throws(() => openStartupLibrary(library, {showMessageBox() { return 0; }}, 'ru'),
  error => error === full);
console.log('PASS: normal startup, narrow recovery prompt, cancel/close, explicit fresh start, write failure propagation');
