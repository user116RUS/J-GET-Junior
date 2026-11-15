/* Run with node test/storage.js. Uses only generated data in a temp folder. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../src/databaseManager');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scratchjr-storage-'));
const filename = path.join(folder, 'scratchjr.sqllite');
const restore = path.join(folder, 'scratchjr.sqllite.restore');
let db;
try {
  db = new DatabaseManager(filename);
  const id = db.stmt({stmt: 'INSERT INTO PROJECTS (NAME, JSON) VALUES (?, ?)', values: ['Кот', 'cat.svg']});
  assert.strictEqual(id, 1);
  db.stmt({stmt: 'UPDATE PROJECTS SET NAME = ? WHERE ID = ?', values: ['Рыжий кот', id]});
  // Independent reader opens the committed project while its original session is still open.
  const reader = new DatabaseManager(filename);
  assert.deepStrictEqual(reader.query({stmt: 'SELECT NAME FROM PROJECTS'}), [{NAME: 'Рыжий кот'}]);
  reader.close();

  const media = 'Z'.repeat(18 * 1024 * 1024); // Past the default asm.js heap.
  db.saveToProjectFiles('cat.svg', media);
  db.close();
  db = new DatabaseManager(filename);
  assert.strictEqual(db.readProjectFile('cat.svg'), media);

  // Simulate full disk before replacement. Preserve every byte and allow a retry.
  const committed = fs.readFileSync(filename);
  const fsync = fs.fsyncSync;
  fs.fsyncSync = () => { throw new Error('simulated ENOSPC'); };
  try {
    db.saveToProjectFiles('cat.svg', media); // Identical writes do not flush.
    assert.throws(() => db.saveToProjectFiles('cat.svg', 'new'), /ENOSPC/);
  } finally {
    fs.fsyncSync = fsync;
  }
  assert.deepStrictEqual(fs.readFileSync(filename), committed);
  assert.deepStrictEqual(fs.readdirSync(folder), ['scratchjr.sqllite']);
  db = new DatabaseManager(filename);
  assert.strictEqual(db.readProjectFile('cat.svg'), media);
  db.saveToProjectFiles('cat.svg', 'new');
  assert.strictEqual(db.readProjectFile('cat.svg'), 'new');

  // Repeated reads and SQL exceptions release their prepared statements.
  const prepare = db.db.prepare.bind(db.db);
  let freed = 0;
  db.db.prepare = (sql) => {
    const statement = prepare(sql);
    const free = statement.free.bind(statement);
    statement.free = () => { freed++; return free(); };
    return statement;
  };
  for (let n = 0; n < 100; n++) db.readProjectFile('cat.svg');
  assert.throws(() => db.stmt({stmt: 'INSERT INTO PROJECTS (ID) VALUES (?)', values: [id]}), /unique/i);
  assert.strictEqual(freed, 101);

  db.stmt({stmt: 'INSERT INTO USERSHAPES (ALTMD5) VALUES (?)', values: ['preview.svg']});
  db.saveToProjectFiles('preview.svg', 'thumbnail');
  db.saveToProjectFiles('unused.svg', 'unused');
  db.cleanProjectFiles('svg');
  assert.strictEqual(db.readProjectFile('preview.svg'), 'thumbnail');
  assert.strictEqual(db.readProjectFile('cat.svg'), 'new');
  assert.strictEqual(db.readProjectFile('unused.svg'), null);

  fs.writeFileSync(restore, 'broken library');
  const beforeRestore = fs.readFileSync(filename);
  assert.throws(() => new DatabaseManager(filename, restore));
  assert.deepStrictEqual(fs.readFileSync(filename), beforeRestore);
  fs.writeFileSync(restore, beforeRestore);
  db.close();

  // An existing classroom restore file can also initialize a missing live file.
  fs.unlinkSync(filename);
  db = new DatabaseManager(filename, restore);
  assert.deepStrictEqual(db.query({stmt: 'PRAGMA integrity_check'}), [{integrity_check: 'ok'}]);
  assert.strictEqual(db.readProjectFile('cat.svg'), 'new');
  console.log('PASS: immediate saves, 18 MiB media, retry after disk failure, statement lifetime, cleanup, restore');
} finally {
  if (db) db.close();
  fs.readdirSync(folder).forEach(name => fs.unlinkSync(path.join(folder, name)));
  fs.rmdirSync(folder);
}
