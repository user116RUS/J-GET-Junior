const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DatabaseManager = require('./databaseManager');

const databaseName = 'scratchjr.sqllite';

function exists(filename) {
  try {
    fs.statSync(filename);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

// Electron 1.8's Node does not support mkdirSync({recursive: true}).
function ensureDirectory(folder) {
  try {
    fs.mkdirSync(folder);
  } catch (error) {
    if (error.code !== 'EEXIST' || !fs.statSync(folder).isDirectory()) throw error;
  }
}

class ProjectLibrary {
  constructor(documents, platform, localAppData) {
    this.documents = documents;
    this.legacyFolder = path.join(documents, 'ScratchJR');
    this.local = platform === 'win32';
    if (this.local && !localAppData) throw new Error('The Windows LOCALAPPDATA folder is unavailable.');
    this.folder = this.local ? path.join(localAppData, 'ScratchJr-Classroom', 'Projects') : this.legacyFolder;
    this.filename = path.join(this.folder, databaseName);
    this.mediaFolder = this.local ? path.join(this.folder, 'media') : null;
  }

  open() {
    this.pendingRecovery = null;
    if (this.local) ensureDirectory(path.dirname(this.folder));
    ensureDirectory(this.folder);
    if (this.local) ensureDirectory(this.mediaFolder);
    if (this.local && !exists(this.filename)) {
      // A redirected or disconnected Documents folder must not look like a new library.
      fs.statSync(this.documents);
      const legacy = path.join(this.legacyFolder, databaseName);
      if (exists(legacy)) {
        try {
          return new DatabaseManager(this.filename, legacy, this.mediaFolder);
        } catch (error) {
          const failure = new Error(legacy + '\n' + String(error.message || error));
          if (error.code === 'INVALID_PROJECT_DATABASE') {
            failure.code = 'LEGACY_LIBRARY_INVALID';
            failure.sourceFile = legacy;
            failure.sourceDigest = error.sourceDigest;
            this.pendingRecovery = failure;
          } else if (error.code) {
            failure.code = error.code;
          }
          throw failure;
        }
      }
    }
    return new DatabaseManager(this.filename, null, this.mediaFolder);
  }

  // Called only after the user explicitly chooses a new, empty library. The
  // unreadable source and all of its adjacent files stay where they were.
  startFresh(error) {
    if (!this.local || !error || error !== this.pendingRecovery || error.code !== 'LEGACY_LIBRARY_INVALID') {
      throw new Error('A fresh library requires an unreadable legacy library and an explicit recovery choice');
    }
    if (exists(this.filename)) throw new Error('The destination project library already exists');
    const sourceDigest = crypto.createHash('sha256').update(fs.readFileSync(error.sourceFile)).digest('hex');
    if (sourceDigest !== error.sourceDigest) {
      const changed = new Error('The old project library changed. Restart ScratchJGET to check it again.');
      changed.code = 'LEGACY_LIBRARY_CHANGED';
      throw changed;
    }
    const note = path.join(this.folder, 'legacy-library-recovery-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.json');
    const fd = fs.openSync(note, 'wx');
    try {
      try {
        fs.writeFileSync(fd, JSON.stringify({
          createdAt: new Date().toISOString(),
          action: 'user-requested-new-library',
          sourceFile: error.sourceFile,
          sourceSha256: sourceDigest,
          destinationFile: this.filename,
          cause: error.message,
          oldProjectsRecovered: false,
          instructions: 'The old ScratchJR folder has been preserved. Keep it for recovery; its projects were not imported.'
        }, null, 2) + '\n');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (writeError) {
      try { fs.unlinkSync(note); } catch (cleanupError) { /* Preserve the write error. */ }
      throw writeError;
    }
    // Publish a complete new file without replacing anything. A second process
    // can create the destination after our initial check; linkSync then fails
    // with EEXIST. Filesystems without hard links fail safely as well.
    const stagingFile = note + '.new-library';
    let database;
    try {
      database = new DatabaseManager(stagingFile, null, this.mediaFolder);
      fs.linkSync(stagingFile, this.filename);
      database.filename = this.filename;
      this.recoveryNoteFilename = note;
      this.pendingRecovery = null;
      return database;
    } catch (createError) {
      if (database) database.close();
      throw createError;
    } finally {
      try { fs.unlinkSync(stagingFile); } catch (cleanupError) { /* Keep the original outcome. */ }
    }
  }

  restore() {
    return new DatabaseManager(this.filename, this.restoreFilename(), this.mediaFolder);
  }

  restoreFilename() {
    const classroomCopy = this.filename + '.restore';
    if (!this.local || fs.existsSync(classroomCopy)) return classroomCopy;
    return path.join(this.legacyFolder, databaseName + '.restore');
  }
}

module.exports = ProjectLibrary;
