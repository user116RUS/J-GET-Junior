// The default sql.js 0.4.0 build aborts when its fixed asm.js heap fills.
// The same package ships the same SQLite engine with a growable heap.
const SQL = require('sql.js/js/sql-memory-growth.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function writeAtomic(filename, bytes) {
  const temp = filename + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  const fd = fs.openSync(temp, 'wx');
  try {
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, filename);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (cleanupError) { /* Preserve the write error. */ }
    throw error;
  }
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function mediaFile(folder, hash) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid media hash');
  return path.join(folder, hash);
}

function checkedMedia(folder, hash) {
  const filename = mediaFile(folder, hash);
  const bytes = fs.readFileSync(filename);
  if (digest(bytes) !== hash) throw new Error('Damaged media file: ' + filename);
  return bytes;
}

class DatabaseManager {
  constructor(filename, restoreFilename, mediaFolder) {
    this.filename = filename;
    this.mediaFolder = mediaFolder;
    let bytes;
    try {
      bytes = fs.readFileSync(restoreFilename || filename);
    } catch (error) {
      if (error.code !== 'ENOENT' || restoreFilename) throw error;
    }

    this.db = new SQL.Database(bytes);
    try {
      if (!bytes) this.initTables();
      // Checking the tables also rejects empty or unrelated files before writing.
      const tables = this.query({stmt: "SELECT name FROM sqlite_master WHERE type = 'table'"});
      ['projects', 'projectfiles', 'usershapes', 'userbkgs'].forEach((table) => {
        if (!tables.some(row => row.name.toLowerCase() === table)) {
          throw new Error('Missing ScratchJr table: ' + table);
        }
      });
      if (restoreFilename && this.db.exec('PRAGMA integrity_check')[0].values[0][0] !== 'ok') {
        throw new Error('ScratchJr restore file failed SQLite integrity check');
      }
      const columns = this.query({stmt: 'PRAGMA table_info(PROJECTS)'});
      const needsMigration = !columns.some(row => row.name.toUpperCase() === 'ISGIFT');
      if (needsMigration) this.db.run('ALTER TABLE PROJECTS ADD COLUMN ISGIFT INTEGER DEFAULT 0');
      const migratedMedia = mediaFolder ? this.prepareMedia(restoreFilename) : this.restoreInlineMedia(restoreFilename || filename);
      if (!bytes || needsMigration || migratedMedia || restoreFilename) this.save();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  // Install media first. Until save() replaces the metadata, the old database
  // and all its files remain intact, including when conversion is interrupted.
  prepareMedia(restoreFilename) {
    const columns = this.query({stmt: 'PRAGMA table_info(PROJECTFILES)'});
    const legacy = !columns.some(row => row.name.toUpperCase() === 'MEDIAHASH');
    if (legacy) this.db.run('ALTER TABLE PROJECTFILES ADD COLUMN MEDIAHASH TEXT');
    const rows = this.query({stmt: 'SELECT MD5, MEDIAHASH FROM PROJECTFILES'});
    let extracted = false;
    const source = restoreFilename ? path.join(path.dirname(restoreFilename), 'media') : this.mediaFolder;
    for (const row of rows) {
      if (row.MEDIAHASH !== null) {
        if (restoreFilename) {
          const bytes = checkedMedia(source, row.MEDIAHASH);
          if (source !== this.mediaFolder) this.storeMedia(bytes, true);
        } else {
          fs.accessSync(mediaFile(this.mediaFolder, row.MEDIAHASH), fs.constants.R_OK);
        }
      } else {
        const content = this.query({stmt: 'SELECT CONTENTS FROM PROJECTFILES WHERE MD5 = ?', values: [row.MD5]})[0].CONTENTS;
        // A NULL in a legacy database denotes absent content and remains NULL.
        if (content === null) continue;
        const hash = this.storeMedia(Buffer.from(content), true);
        this.db.run('UPDATE PROJECTFILES SET CONTENTS = NULL, MEDIAHASH = ? WHERE MD5 = ?', [hash, row.MD5]);
        extracted = true;
      }
    }
    if (extracted) this.db.run('VACUUM');
    return legacy || extracted;
  }

  restoreInlineMedia(sourceFile) {
    const columns = this.query({stmt: 'PRAGMA table_info(PROJECTFILES)'});
    if (!columns.some(row => row.name.toUpperCase() === 'MEDIAHASH')) return false;
    const folder = path.join(path.dirname(sourceFile), 'media');
    const rows = this.query({stmt: 'SELECT MD5, MEDIAHASH FROM PROJECTFILES WHERE MEDIAHASH IS NOT NULL'});
    for (const row of rows) {
      const content = checkedMedia(folder, row.MEDIAHASH).toString('utf8');
      this.db.run('UPDATE PROJECTFILES SET CONTENTS = ? WHERE MD5 = ?', [content, row.MD5]);
    }
    // A Mac that restores a full Windows backup keeps using the original
    // two-column format, so the resulting sqllite is again self-contained.
    this.db.run('CREATE TABLE INLINE_PROJECTFILES (MD5 TEXT PRIMARY KEY, CONTENTS TEXT)');
    this.db.run('INSERT INTO INLINE_PROJECTFILES SELECT MD5, CONTENTS FROM PROJECTFILES');
    this.db.run('DROP TABLE PROJECTFILES');
    this.db.run('ALTER TABLE INLINE_PROJECTFILES RENAME TO PROJECTFILES');
    this.db.run('VACUUM');
    return true;
  }

  storeMedia(bytes, verifyWrite) {
    const hash = digest(bytes);
    const filename = mediaFile(this.mediaFolder, hash);
    try {
      if (digest(fs.readFileSync(filename)) === hash) return hash;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    // An intact source or a retry can repair a damaged copy of this hash.
    writeAtomic(filename, bytes);
    if (verifyWrite) checkedMedia(this.mediaFolder, hash);
    return hash;
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }

  // Replace the last committed file only when the entire new database is on disk.
  save() {
    try {
      const data = this.db.export();
      writeAtomic(this.filename, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    } catch (error) {
      // Reopen the last durable state on the next request.
      this.close();
      throw error;
    }
  }

  initTables() {
    this.db.run('CREATE TABLE PROJECTS (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MTIME DATETIME, ALTMD5 TEXT, POS INTEGER, NAME TEXT, JSON TEXT, THUMBNAIL TEXT, OWNER TEXT, GALLERY TEXT, DELETED TEXT, VERSION TEXT)');
    this.db.run('CREATE TABLE USERSHAPES (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MD5 TEXT, ALTMD5 TEXT, WIDTH TEXT, HEIGHT TEXT, EXT TEXT, NAME TEXT, OWNER TEXT, SCALE TEXT, VERSION TEXT)');
    this.db.run('CREATE TABLE USERBKGS (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MD5 TEXT, ALTMD5 TEXT, WIDTH TEXT, HEIGHT TEXT, EXT TEXT, OWNER TEXT, VERSION TEXT)');
    this.db.run('CREATE TABLE PROJECTFILES (MD5 TEXT PRIMARY KEY, CONTENTS TEXT)');
  }

  query(request) {
    const json = typeof request === 'string' ? JSON.parse(request) : request;
    const statement = this.db.prepare(json.stmt);
    try {
      if (json.values) statement.bind(json.values);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  // The renderer uses this channel for INSERT, UPDATE and DELETE. Get the ID
  // before exporting: sql.js reopens its connection as part of export().
  stmt(request) {
    this.query(request);
    const result = this.db.exec('SELECT last_insert_rowid(), changes()')[0].values[0];
    if (result[1]) this.save();
    return result[0];
  }

  readProjectFile(name) {
    if (this.mediaFolder) {
      const rows = this.query({stmt: 'SELECT MEDIAHASH FROM PROJECTFILES WHERE MD5 = ?', values: [name]});
      if (!rows.length || rows[0].MEDIAHASH === null) return null;
      return checkedMedia(this.mediaFolder, rows[0].MEDIAHASH).toString('utf8');
    }
    const rows = this.query({stmt: 'SELECT CONTENTS FROM PROJECTFILES WHERE MD5 = ?', values: [name]});
    return rows.length ? rows[0].CONTENTS : null;
  }

  saveToProjectFiles(name, content) {
    if (this.mediaFolder) {
      const hash = this.storeMedia(Buffer.from(content), false);
      this.stmt({
        stmt: 'INSERT OR REPLACE INTO PROJECTFILES (MD5, MEDIAHASH) SELECT ?1, ?2 ' +
          'WHERE NOT EXISTS (SELECT 1 FROM PROJECTFILES WHERE MD5 = ?1 AND MEDIAHASH = ?2)',
        values: [name, hash]
      });
      return;
    }
    // Replaying a content-addressed write is common when a drawing or thumbnail
    // is unchanged. Also support replacing named files with different contents.
    this.stmt({
      stmt: 'INSERT OR REPLACE INTO PROJECTFILES (MD5, CONTENTS) SELECT ?1, ?2 ' +
        'WHERE NOT EXISTS (SELECT 1 FROM PROJECTFILES WHERE MD5 = ?1 AND CONTENTS = ?2)',
      values: [name, content]
    });
  }

  removeProjectFile(name) {
    this.stmt({stmt: 'DELETE FROM PROJECTFILES WHERE MD5 = ?', values: [name]});
  }

  cleanProjectFiles(type) {
    // One write for the whole sweep, including when many drawings were deleted.
    this.stmt({
      stmt: 'DELETE FROM PROJECTFILES WHERE MD5 LIKE ? ' +
        'AND NOT EXISTS (SELECT 1 FROM PROJECTS WHERE instr(JSON, PROJECTFILES.MD5) > 0 ' +
        'OR instr(THUMBNAIL, PROJECTFILES.MD5) > 0 OR ALTMD5 = PROJECTFILES.MD5) ' +
        'AND NOT EXISTS (SELECT 1 FROM USERSHAPES WHERE MD5 = PROJECTFILES.MD5 OR ALTMD5 = PROJECTFILES.MD5) ' +
        'AND NOT EXISTS (SELECT 1 FROM USERBKGS WHERE MD5 = PROJECTFILES.MD5 OR ALTMD5 = PROJECTFILES.MD5)',
      values: ['%.' + (type === 'wav' ? 'webm' : type)]
    });
    if (this.mediaFolder) this.pruneMedia();
  }

  pruneMedia() {
    // A classroom restore snapshot can reference files absent from the live
    // database. Keep the shared media directory intact while a template exists.
    try {
      fs.statSync(this.filename + '.restore');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') return;
    }
    const used = new Set(this.query({stmt: 'SELECT DISTINCT MEDIAHASH FROM PROJECTFILES'}).map(row => row.MEDIAHASH));
    for (const name of fs.readdirSync(this.mediaFolder)) {
      if (!/^[0-9a-f]{64}$/.test(name) || used.has(name)) continue;
      try {
        fs.unlinkSync(path.join(this.mediaFolder, name));
      } catch (error) {
        // Antivirus or a backup tool may still have a deleted asset open.
        // Retry on the next sweep after its handle has been released.
        if (['EPERM', 'EBUSY', 'EACCES', 'ENOENT'].indexOf(error.code) === -1) throw error;
      }
    }
  }
}

module.exports = DatabaseManager;
