const fs = require('fs');
const path = require('path');
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
          throw new Error(legacy + '\n' + String(error.message || error));
        }
      }
    }
    return new DatabaseManager(this.filename, null, this.mediaFolder);
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
