/* Run with node test/legacy-recovery.js. Uses only synthetic temporary files. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SQL = require('sql.js/js/sql-memory-growth.js');
const DatabaseManager = require('../src/databaseManager');
const ProjectLibrary = require('../src/projectLibrary');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scratchjget-recovery-'));
let nextCase = 0;

function fixture() {
  const folder = path.join(root, String(++nextCase));
  const docs = path.join(folder, 'Документы');
  const local = path.join(folder, 'Local');
  fs.mkdirSync(folder);
  fs.mkdirSync(docs);
  fs.mkdirSync(local);
  const library = new ProjectLibrary(docs, 'win32', local);
  fs.mkdirSync(library.legacyFolder);
  return {library, docs, legacy: path.join(library.legacyFolder, 'scratchjr.sqllite')};
}

function failure(fn, code) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  assert(error, 'operation must fail');
  if (code) assert.strictEqual(error.code, code);
  return error;
}

function damagedFixture() {
  const test = fixture();
  fs.writeFileSync(test.legacy, 'unreadable old database');
  return test;
}

function validLegacy(test) {
  const db = new DatabaseManager(test.legacy);
  db.stmt({stmt: 'INSERT INTO PROJECTS (NAME) VALUES (?)', values: ['Старый кот']});
  db.close();
  return fs.readFileSync(test.legacy);
}

function recoveryNotes(library) {
  return fs.readdirSync(library.folder).filter(name => /^legacy-library-recovery-.*\.json$/.test(name));
}

function withPatched(object, key, replacement, fn) {
  const original = object[key];
  object[key] = replacement(original);
  try { fn(); } finally { object[key] = original; }
}

function removeTree(folder) {
  fs.readdirSync(folder).forEach((name) => {
    const entry = path.join(folder, name);
    if (fs.statSync(entry).isDirectory()) removeTree(entry);
    else fs.unlinkSync(entry);
  });
  fs.rmdirSync(folder);
}

try {
  // Startup remains fail-closed until an explicit call using its own error.
  const first = damagedFixture();
  const source = fs.readFileSync(first.legacy);
  fs.writeFileSync(first.legacy + '-wal', 'preserved WAL');
  fs.writeFileSync(first.legacy + '-shm', 'preserved SHM');
  fs.writeFileSync(first.legacy + '.restore', 'preserved restore');
  fs.mkdirSync(path.join(first.library.legacyFolder, 'media'));
  const oldMedia = path.join(first.library.legacyFolder, 'media', 'old-picture');
  fs.writeFileSync(oldMedia, 'preserved drawing');
  const error = failure(() => first.library.open(), 'LEGACY_LIBRARY_INVALID');
  assert.strictEqual(error.sourceFile, first.legacy);
  assert(!fs.existsSync(first.library.filename));
  assert.deepStrictEqual(recoveryNotes(first.library), []);
  failure(() => first.library.startFresh(Object.assign({}, error)));
  failure(() => first.library.startFresh(new Error('permission denied')));
  let db = first.library.startFresh(error);
  assert.deepStrictEqual(db.query({stmt: 'SELECT NAME FROM PROJECTS'}), []);
  assert.deepStrictEqual(fs.readFileSync(first.legacy), source);
  assert.strictEqual(fs.readFileSync(first.legacy + '-wal', 'utf8'), 'preserved WAL');
  assert.strictEqual(fs.readFileSync(first.legacy + '-shm', 'utf8'), 'preserved SHM');
  assert.strictEqual(fs.readFileSync(first.legacy + '.restore', 'utf8'), 'preserved restore');
  assert.strictEqual(fs.readFileSync(oldMedia, 'utf8'), 'preserved drawing');
  const note = JSON.parse(fs.readFileSync(first.library.recoveryNoteFilename, 'utf8'));
  assert.strictEqual(note.sourceFile, first.legacy);
  assert.strictEqual(note.sourceSha256, error.sourceDigest);
  assert.strictEqual(note.oldProjectsRecovered, false);
  db.stmt({stmt: 'INSERT INTO PROJECTS (NAME) VALUES (?)', values: ['Новый кот']});
  db.close();
  db = first.library.open();
  assert.deepStrictEqual(db.query({stmt: 'SELECT NAME FROM PROJECTS'}), [{NAME: 'Новый кот'}]);
  db.close();
  failure(() => first.library.startFresh(error));

  // Zero-length, unrelated and structurally damaged SQLite files qualify.
  const empty = fixture();
  fs.writeFileSync(empty.legacy, Buffer.alloc(0));
  failure(() => empty.library.open(), 'LEGACY_LIBRARY_INVALID');
  const foreign = fixture();
  const unrelated = new SQL.Database();
  unrelated.run('CREATE TABLE SOMETHING (ID INTEGER)');
  fs.writeFileSync(foreign.legacy, Buffer.from(unrelated.export()));
  unrelated.close();
  failure(() => foreign.library.open(), 'LEGACY_LIBRARY_INVALID');
  const columns = fixture();
  validLegacy(columns);
  const incomplete = new SQL.Database(fs.readFileSync(columns.legacy));
  incomplete.run('DROP TABLE PROJECTFILES');
  incomplete.run('CREATE TABLE PROJECTFILES (MD5 TEXT)');
  fs.writeFileSync(columns.legacy, Buffer.from(incomplete.export()));
  incomplete.close();
  failure(() => columns.library.open(), 'LEGACY_LIBRARY_INVALID');
  const corrupt = fixture();
  const corruptBytes = validLegacy(corrupt);
  corruptBytes[100] = 0; // Invalid SQLite b-tree page type, preserving the header.
  fs.writeFileSync(corrupt.legacy, corruptBytes);
  failure(() => corrupt.library.open(), 'LEGACY_LIBRARY_INVALID');

  // Never use a stale decision after the source has changed or been repaired.
  const changed = damagedFixture();
  const stale = failure(() => changed.library.open(), 'LEGACY_LIBRARY_INVALID');
  fs.writeFileSync(changed.legacy, 'different unreadable bytes');
  failure(() => changed.library.startFresh(stale), 'LEGACY_LIBRARY_CHANGED');
  assert(!fs.existsSync(changed.library.filename));
  assert.deepStrictEqual(recoveryNotes(changed.library), []);

  const existing = damagedFixture();
  const pending = failure(() => existing.library.open(), 'LEGACY_LIBRARY_INVALID');
  db = new DatabaseManager(existing.library.filename, null, existing.library.mediaFolder);
  db.stmt({stmt: 'INSERT INTO PROJECTS (NAME) VALUES (?)', values: ['Не трогать']});
  db.close();
  const existingBytes = fs.readFileSync(existing.library.filename);
  failure(() => existing.library.startFresh(pending));
  assert.deepStrictEqual(fs.readFileSync(existing.library.filename), existingBytes);

  // A different app can create the target during recovery. Publishing must be
  // atomic and exclusive, not a check followed by an overwriting rename.
  const racing = damagedFixture();
  const racingError = failure(() => racing.library.open(), 'LEGACY_LIBRARY_INVALID');
  withPatched(fs, 'linkSync', original => function(from, to) {
    if (to === racing.library.filename) fs.writeFileSync(to, existingBytes);
    return original.apply(fs, arguments);
  }, () => failure(() => racing.library.startFresh(racingError), 'EEXIST'));
  assert.deepStrictEqual(fs.readFileSync(racing.library.filename), existingBytes);
  assert.strictEqual(fs.readFileSync(racing.legacy, 'utf8'), 'unreadable old database');
  assert.strictEqual(recoveryNotes(racing.library).length, 1);
  assert(!fs.readdirSync(racing.library.folder).some(name => /\.new-library$/.test(name)));
  db = racing.library.open();
  assert.deepStrictEqual(db.query({stmt: 'SELECT NAME FROM PROJECTS'}), [{NAME: 'Не трогать'}]);
  db.close();

  const noLinks = damagedFixture();
  const noLinksError = failure(() => noLinks.library.open(), 'LEGACY_LIBRARY_INVALID');
  withPatched(fs, 'linkSync', () => function() {
    const unsupported = new Error('hard links unsupported'); unsupported.code = 'ENOTSUP'; throw unsupported;
  }, () => failure(() => noLinks.library.startFresh(noLinksError), 'ENOTSUP'));
  assert(!fs.existsSync(noLinks.library.filename));
  assert(!fs.readdirSync(noLinks.library.folder).some(name => /\.new-library$/.test(name)));
  assert.strictEqual(fs.readFileSync(noLinks.legacy, 'utf8'), 'unreadable old database');

  // Errors accessing the source and exhausted SQL.js memory are not corruption.
  const access = fixture();
  validLegacy(access);
  withPatched(fs, 'readFileSync', original => function(filename) {
    if (filename === access.legacy) {
      const denied = new Error('file is encrypted or is not a database');
      denied.code = 'EACCES';
      throw denied;
    }
    return original.apply(fs, arguments);
  }, () => {
    const denied = failure(() => access.library.open(), 'EACCES');
    failure(() => access.library.startFresh(denied));
  });
  withPatched(SQL, 'Database', () => function() { throw new Error('out of memory'); }, () => {
    const exhausted = failure(() => access.library.open());
    assert.notStrictEqual(exhausted.code, 'LEGACY_LIBRARY_INVALID');
    failure(() => access.library.startFresh(exhausted));
  });

  // Missing/corrupt external media must not offer an empty-library fallback.
  const assets = fixture();
  const assetFolder = path.join(assets.library.legacyFolder, 'media');
  fs.mkdirSync(assetFolder);
  db = new DatabaseManager(assets.legacy, null, assetFolder);
  db.saveToProjectFiles('cat.svg', 'original drawing');
  db.close();
  const asset = path.join(assetFolder, fs.readdirSync(assetFolder)[0]);
  fs.writeFileSync(asset, 'damaged drawing');
  const damagedAsset = failure(() => assets.library.open());
  assert.notStrictEqual(damagedAsset.code, 'LEGACY_LIBRARY_INVALID');
  failure(() => assets.library.startFresh(damagedAsset));
  fs.unlinkSync(asset);
  const missingAsset = failure(() => assets.library.open(), 'ENOENT');
  failure(() => assets.library.startFresh(missingAsset));

  // Current-library corruption, restore errors and offline Documents stay fatal.
  const current = fixture();
  db = current.library.open();
  db.close();
  fs.writeFileSync(current.library.filename, 'broken current library');
  const currentError = failure(() => current.library.open(), 'INVALID_PROJECT_DATABASE');
  failure(() => current.library.startFresh(currentError));
  fs.writeFileSync(current.library.filename + '.restore', 'broken backup');
  const restoreError = failure(() => current.library.restore(), 'INVALID_PROJECT_DATABASE');
  failure(() => current.library.startFresh(restoreError));
  const offline = fixture();
  fs.renameSync(offline.docs, offline.docs + '-offline');
  const offlineError = failure(() => offline.library.open(), 'ENOENT');
  failure(() => offline.library.startFresh(offlineError));

  // A failed durable recovery note must prevent creation of an empty database.
  const full = damagedFixture();
  const fullError = failure(() => full.library.open(), 'LEGACY_LIBRARY_INVALID');
  withPatched(fs, 'fsyncSync', () => function() {
    const diskFull = new Error('disk full'); diskFull.code = 'ENOSPC'; throw diskFull;
  }, () => failure(() => full.library.startFresh(fullError), 'ENOSPC'));
  assert(!fs.existsSync(full.library.filename));
  assert.deepStrictEqual(recoveryNotes(full.library), []);
  assert.strictEqual(fs.readFileSync(full.legacy, 'utf8'), 'unreadable old database');

  // A failed database commit preserves both the original and the recovery note.
  withPatched(fs, 'renameSync', original => function(from, to) {
    if (/\.new-library$/.test(to)) {
      const denied = new Error('write denied'); denied.code = 'EACCES'; throw denied;
    }
    return original.apply(fs, arguments);
  }, () => failure(() => full.library.startFresh(fullError), 'EACCES'));
  assert(!fs.existsSync(full.library.filename));
  assert.strictEqual(recoveryNotes(full.library).length, 1);
  assert.strictEqual(fs.readFileSync(full.legacy, 'utf8'), 'unreadable old database');
  db = full.library.startFresh(fullError);
  db.close();
  console.log('PASS: explicit legacy recovery, preserved source/sidecars/media, durable new library and note, stale-source and existing-target guards, narrow structural errors, IO/media/restore/offline exclusions');
} finally {
  removeTree(root);
}
