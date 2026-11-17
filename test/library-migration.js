/* Run with node test/library-migration.js. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ProjectLibrary = require('../src/projectLibrary');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scratchjr-migration-'));
const documents = path.join(root, 'Документы');
const localAppData = path.join(root, 'Local');
fs.mkdirSync(documents);
fs.mkdirSync(localAppData);

function removeTree(folder) {
  fs.readdirSync(folder).forEach((entry) => {
    const filename = path.join(folder, entry);
    if (fs.statSync(filename).isDirectory()) removeTree(filename);
    else fs.unlinkSync(filename);
  });
  fs.rmdirSync(folder);
}

try {
  const original = new ProjectLibrary(documents, 'darwin');
  const classroom = new ProjectLibrary(documents, 'win32', localAppData);
  const legacy = original.open();
  legacy.stmt({stmt: 'INSERT INTO PROJECTS (NAME) VALUES (?)', values: ['Робот']});
  legacy.saveToProjectFiles('robot.svg', 'drawing');
  legacy.close();
  const bytes = fs.readFileSync(original.filename);
  const template = original.filename + '.restore';
  fs.writeFileSync(template, bytes);
  assert.strictEqual(classroom.restoreFilename(), template);
  assert.strictEqual(original.filename, path.join(documents, 'ScratchJR', 'scratchjr.sqllite'));

  fs.writeFileSync(original.filename, 'damaged DB');
  assert.throws(() => classroom.open(), error => error.code === 'LEGACY_LIBRARY_INVALID' && error.sourceFile === original.filename);
  assert(!fs.existsSync(classroom.filename));
  assert.strictEqual(fs.readFileSync(original.filename, 'utf8'), 'damaged DB');
  fs.writeFileSync(original.filename, bytes);

  const copied = classroom.open();
  assert.deepStrictEqual(copied.query({stmt: 'SELECT NAME FROM PROJECTS'}), [{NAME: 'Робот'}]);
  assert.strictEqual(copied.readProjectFile('robot.svg'), 'drawing');
  copied.stmt({stmt: 'UPDATE PROJECTS SET NAME = ?', values: ['Новый робот']});
  copied.close();
  assert.deepStrictEqual(fs.readFileSync(original.filename), bytes);

  fs.writeFileSync(classroom.filename + '.restore', bytes);
  assert.strictEqual(classroom.restoreFilename(), classroom.filename + '.restore');
  const offline = path.join(root, 'Documents unavailable');
  fs.renameSync(documents, offline);
  const reopened = classroom.open();
  assert.deepStrictEqual(reopened.query({stmt: 'SELECT NAME FROM PROJECTS'}), [{NAME: 'Новый робот'}]);
  reopened.close();

  fs.unlinkSync(classroom.filename);
  assert.throws(() => classroom.open(), /ENOENT/);
  assert(!fs.existsSync(classroom.filename));

  fs.mkdirSync(documents);
  const fresh = classroom.open();
  assert.deepStrictEqual(fresh.query({stmt: 'SELECT NAME FROM PROJECTS'}), []);
  fresh.close();
  console.log('PASS: original preserved, retry after failed import, isolated updates, offline and first launch, restore precedence');
} finally {
  removeTree(root);
}
