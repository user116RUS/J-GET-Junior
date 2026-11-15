const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../src/databaseManager');
const ProjectLibrary = require('../src/projectLibrary');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scratchjr-media-'));
const docs = path.join(root, 'docs');
const local = path.join(root, 'local');
fs.mkdirSync(docs);
fs.mkdirSync(local);
const classroom = new ProjectLibrary(docs, 'win32', local);
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const media = data => path.join(classroom.mediaFolder, hash(data));
let db = classroom.open();

function removeTree(dir) {
  for (const name of fs.readdirSync(dir)) {
    const entry = path.join(dir, name);
    if (fs.statSync(entry).isDirectory()) removeTree(entry);
    else fs.unlinkSync(entry);
  }
  fs.rmdirSync(dir);
}

function failBeforeCommit(operation) {
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === classroom.filename) throw new Error('simulated access denied');
    return rename(from, to);
  };
  try {
    assert.throws(operation, /access denied/);
  } finally {
    fs.renameSync = rename;
  }
}

try {
  // Upgrade an already installed classroom version with inline content.
  db.close();
  fs.unlinkSync(classroom.filename);
  db = new DatabaseManager(classroom.filename);
  db.saveToProjectFiles('existing.svg', 'existing content');
  db.close();
  const inlineOriginal = fs.readFileSync(classroom.filename);
  failBeforeCommit(() => classroom.open());
  assert.deepStrictEqual(fs.readFileSync(classroom.filename), inlineOriginal);
  db = classroom.open();
  assert.strictEqual(db.readProjectFile('existing.svg'), 'existing content');
  assert.strictEqual(db.query({stmt: 'SELECT CONTENTS FROM PROJECTFILES'})[0].CONTENTS, null);

  // Failed replacement cannot overwrite the immutable bytes behind an old name.
  failBeforeCommit(() => db.saveToProjectFiles('existing.svg', 'updated content'));
  db = classroom.open();
  assert.strictEqual(db.readProjectFile('existing.svg'), 'existing content');
  db.saveToProjectFiles('existing.svg', 'updated content');
  db.saveToProjectFiles('alias.png', 'updated content');
  db.removeProjectFile('existing.svg');
  db.cleanProjectFiles('svg');
  assert(fs.existsSync(media('updated content')));
  assert(!fs.existsSync(media('existing content')));

  // A classroom restore snapshot pins its media even after deleting a live asset.
  const template = classroom.filename + '.restore';
  fs.writeFileSync(template, fs.readFileSync(classroom.filename));
  db.removeProjectFile('alias.png');
  db.cleanProjectFiles('svg');
  assert(fs.existsSync(media('updated content')));
  db.close();
  db = classroom.restore();
  assert.strictEqual(db.readProjectFile('alias.png'), 'updated content');

  // Errors during restore must leave the working library available.
  const before = fs.readFileSync(classroom.filename);
  fs.renameSync(media('updated content'), media('updated content') + '.missing');
  assert.throws(() => classroom.restore(), /ENOENT/);
  assert.throws(() => classroom.open(), /ENOENT/);
  assert.deepStrictEqual(fs.readFileSync(classroom.filename), before);
  fs.renameSync(media('updated content') + '.missing', media('updated content'));
  assert.strictEqual(db.readProjectFile('alias.png'), 'updated content');

  // Import an external compact template with its own media and verify its checksum.
  fs.unlinkSync(template);
  const official = new ProjectLibrary(docs, 'darwin');
  fs.mkdirSync(official.folder);
  const foreignMedia = path.join(official.folder, 'media');
  fs.mkdirSync(foreignMedia);
  const foreign = new DatabaseManager(official.filename + '.restore', null, foreignMedia);
  foreign.saveToProjectFiles('template.svg', 'template only');
  foreign.close();
  const foreignFile = path.join(foreignMedia, hash('template only'));
  fs.writeFileSync(foreignFile, 'corrupt');
  assert.throws(() => classroom.restore(), /Damaged media/);
  assert.deepStrictEqual(fs.readFileSync(classroom.filename), before);
  fs.writeFileSync(foreignFile, 'template only');
  db.close();
  db = classroom.restore();
  assert.strictEqual(db.readProjectFile('template.svg'), 'template only');
  assert.strictEqual(fs.readFileSync(media('template only'), 'utf8'), 'template only');
  const restoredMac = official.restore();
  assert.strictEqual(restoredMac.readProjectFile('template.svg'), 'template only');
  const columns = restoredMac.query({stmt: 'PRAGMA table_info(PROJECTFILES)'}).map(row => row.name);
  assert.deepStrictEqual(columns, ['MD5', 'CONTENTS']);
  restoredMac.close();
  console.log('PASS: inline migration, interrupted commit, deduplication, restore media, missing and corrupt backup');
} finally {
  db.close();
  removeTree(root);
}
