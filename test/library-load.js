// Exercise the storage path used by Windows, with a synthetic 75 MiB legacy library.
// All files are created under the OS temporary directory. Run with Node 18+.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { performance } = require('perf_hooks');
const os = require('os');
const ProjectLibrary = require('../src/projectLibrary');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scratchjr-load-'));
const documents = path.join(root, 'documents');
const local = path.join(root, 'local');
const original = new ProjectLibrary(documents, 'darwin');
const classroom = new ProjectLibrary(documents, 'win32', local);
const originalHashes = [];
const expectedProjects = [];
const writes = [];
const cycles = [];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const payload = kib => crypto.randomBytes(kib * 1024).toString('base64');
let db;

function timedWrite(write) {
  const start = performance.now();
  write();
  writes.push(performance.now() - start);
}

function report(label, values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(1);
  console.log(label, 'p50', percentile(.5), 'p95', percentile(.95));
}

try {
  fs.mkdirSync(documents);
  fs.mkdirSync(local);
  db = original.open();
  db.db.run('BEGIN TRANSACTION');
  for (let id = 1; id <= 300; id++) {
    const data = payload(192);
    db.db.run('INSERT INTO PROJECTFILES (MD5, CONTENTS) VALUES (?, ?)', [`sprite${id}.svg`, data]);
    originalHashes.push(hash(data));
  }
  for (let id = 1; id <= 100; id++) {
    const assets = [id * 3 - 2, id * 3 - 1, id * 3].map(n => `sprite${n}.svg`);
    expectedProjects.push(assets);
    db.db.run('INSERT INTO PROJECTS (NAME, JSON) VALUES (?, ?)', ['Урок ' + id, JSON.stringify(assets)]);
  }
  db.db.run('COMMIT');
  db.save();
  db.close();
  db = classroom.open();
  console.log('Original MiB', (fs.statSync(original.filename).size / 1048576).toFixed(2),
    'metadata KiB', fs.statSync(classroom.filename).size / 1024, process.platform, process.arch, process.version);

  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const drawing = `drawing${i}.svg`;
    const thumb = `thumb${i}.png`;
    const page = `page${i}.png`;
    const assets = [expectedProjects[i][0], drawing];
    timedWrite(() => db.saveToProjectFiles(drawing, payload(24)));
    timedWrite(() => db.saveToProjectFiles(thumb, payload(4)));
    timedWrite(() => db.stmt({
      stmt: 'INSERT INTO USERSHAPES (MD5, ALTMD5, NAME) VALUES (?, ?, ?)',
      values: [drawing, thumb, 'Робот ' + i]
    }));
    timedWrite(() => db.saveToProjectFiles(page, payload(4)));
    timedWrite(() => db.stmt({
      stmt: 'UPDATE PROJECTS SET THUMBNAIL = ?, JSON = ? WHERE ID = ?',
      values: [JSON.stringify({md5: page}), JSON.stringify(assets), i + 1]
    }));
    cycles.push(performance.now() - start);
    expectedProjects[i] = assets;
  }

  db.close();
  db = classroom.open();
  assert.strictEqual(db.query({stmt: 'SELECT count(*) AS n FROM PROJECTS'})[0].n, 100);
  assert.strictEqual(db.query({stmt: 'SELECT count(*) AS n FROM USERSHAPES'})[0].n, 10);
  assert.strictEqual(db.query({stmt: 'SELECT count(*) AS n FROM PROJECTFILES'})[0].n, 330);
  assert.strictEqual(db.query({stmt: 'PRAGMA integrity_check'})[0].integrity_check, 'ok');
  originalHashes.forEach((expected, i) => {
    assert.strictEqual(hash(db.readProjectFile(`sprite${i + 1}.svg`)), expected);
  });
  expectedProjects.forEach((expected, i) => {
    const row = db.query({stmt: 'SELECT NAME, JSON FROM PROJECTS WHERE ID = ?', values: [i + 1]})[0];
    assert.strictEqual(row.NAME, 'Урок ' + (i + 1));
    assert.deepStrictEqual(JSON.parse(row.JSON), expected);
  });
  report('50 durable writes (ms)', writes);
  report('10 character and project saves (ms)', cycles);
  console.log('PASS: 300 original assets, 100 projects and 10 new drawings after reopening');
} finally {
  if (db) db.close();
  fs.rmSync(root, {recursive: true, force: true});
}
