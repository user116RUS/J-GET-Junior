//
//  main.js  - this is the entry point to the electron process
//  it is the main process that has access to the filesystem
//  and runs a js version of sql called sql.js to keep track of
//  created projects.
//
//  conceptually, the electron process itself is like a chrome process.
//  it one or more browser windows in their own processes (renderer processes)
//
//  the guts of scratchjr are running inside the renderer process.
//
//  ipcMain calls are usually called by ipcRenderer calls from another
//  file called electronClient.js


// The database we use is a sql lite database which is loaded in from
// a file in the documents directory.  if the file is not there, one is created.
// We use sql.js to manage the database, because the database is fairly small and
// not very complex.

const path = require('path');
const process = require('process');
const url = require('url');
const fs = require('fs');
const util = require('util');

const crypto = require('crypto');

let isDev =  require('electron-is-dev');

isDev = (isDev) || process.env.DEBUG_SCRATCHJR;


/* eslint-disable import/extensions */  // --> OFF
/* eslint-disable import/no-extraneous-dependencies */  // --> OFF
/* eslint-disable import/no-unresolved  */  // --> OFF

const { app, dialog, BrowserWindow, BrowserView, ipcMain, Menu } = require('electron');  



/* eslint-enable import/extensions */  // --> ON
/* eslint-enable import/no-extraneous-dependencies */  // --> ON
/* eslint-enable import/no-unresolved  */  // --> ON



const DEBUG =  isDev;
const DEBUG_DATABASE      = DEBUG && false;
const DEBUG_FILEIO        = DEBUG && true;
const DEBUG_RESOURCEIO    = DEBUG && false;
const DEBUG_CLEANASSETS   = DEBUG && false;
const DEBUG_NYI           = DEBUG && true;
const DEBUG_LOAD_DEVTOOLS = DEBUG && true;




// Debugging the electron process:
// note to use a debugger use 'npm run debugMain' and load up chrome://inspect
// ============================================================================
// use one wrapper for debugging so we can turn it on and off at a
// central place
function debugLog(...args) {
  if (DEBUG) {
    console.log(args); // eslint-disable-line no-console
  }
}
function reportCrash(error) {
  const message = String(error && error.stack || error).slice(0, 3000);
  let details = message;
  try {
    const folder = projectLibrary.folder;
    const log = path.join(folder, 'last-error.txt');
    fs.writeFileSync(log, new Date().toISOString() + '\n' + message);
    details = message + '\n\n' + log;
  } catch (logError) {
    // Early startup failures may occur before the library folder is available.
  }
  dialog.showErrorBox('ScratchJGET', details);
}
function exitAfterError(error) {
  try { reportCrash(error); } finally { process.exit(1); }
}
process.on('uncaughtException', exitAfterError);
process.on('unhandledRejection', exitAfterError);



// SQL JS adds its own uncaughtException handler  - so we need to register ours first.
const ProjectLibrary = require('./projectLibrary');



const installing = require('electron-squirrel-startup');
const secondaryInstance = !installing && app.makeSingleInstance(() => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
if (installing || secondaryInstance) app.quit();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let dataStore;
let projectLibrary;

function createWindow(openedDatabase) {
  // Create the browser window.


  win = new BrowserWindow(
    {
      title: 'ScratchJGET',
      width: 1020,
      height: 800,
      minHeight: 800,
      minWidth: 1000,
      customVar: 'elephants',
      isDebug: DEBUG
    });

  const view = new BrowserView({
    title: 'ScratchJGET',
    icon: `${__dirname}app/assets/icon/icon.png`,
    webPreferences: {
      nodeIntegration: false
    },
  });

  dataStore = new ScratchJRDataStore(win);
  dataStore.databaseManager = openedDatabase;
  win.setBrowserView(view);


  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'app/index.html'),
    protocol: 'file',
    slashes: true,

  }));

  if (DEBUG_LOAD_DEVTOOLS) {
    // Open the DevTools.
    win.webContents.openDevTools();
  }

  // A native close can arrive between the last edit and the 30s autosave.
  let editorReady = false;
  let closing = false;
  let saved = false;
  const editorLoaded = (event) => {
    if (event.sender === win.webContents) editorReady = true;
  };
  const finishClose = (event, result) => {
    if (event.sender !== win.webContents || !closing) return;
    closing = false;
    if (result === 'saved') {
      saved = true;
      win.close();
    } else if (result === 'busy') {
      dialog.showMessageBox(win, {
        type: 'info', buttons: ['OK'],
        message: /^ru/i.test(app.getLocale())
          ? 'Редактор ещё завершает операцию. Закройте окно после появления персонажа на сцене.'
          : 'The editor is finishing an operation. Close the window after the stage is ready.'
      });
    } else if (result === 'paint') {
      const ru = /^ru/i.test(app.getLocale());
      const choice = dialog.showMessageBox(win, {
        type: 'question',
        message: ru ? 'Рисунок ещё открыт. Нажмите галочку в редакторе, чтобы добавить его в проект.'
                    : 'Your drawing is open. Use the check mark in the paint editor to add it to the project.',
        buttons: ru ? ['Вернуться к рисунку', 'Закрыть без этого рисунка']
                    : ['Return to drawing', 'Close without this drawing'],
        defaultId: 0, cancelId: 0
      });
      if (choice === 1) {
        closing = true;
        win.webContents.send('save-before-close', true);
      }
    }
  };
  ipcMain.on('editor-ready', editorLoaded);
  ipcMain.on('editor-close-result', finishClose);
  win.webContents.on('did-navigate', () => { editorReady = closing = false; });
  win.on('close', (event) => {
    if (!editorReady || saved || win.webContents.isCrashed()) return;
    event.preventDefault();
    if (!closing) {
      closing = true;
      win.webContents.send('save-before-close', false);
    }
  });
  win.webContents.on('crashed', () => {
    reportCrash(new Error('ScratchJGET editor process stopped unexpectedly.'));
    win.close();
  });

  // Emitted when the window is closed.
  win.on('closed', () => {
    ipcMain.removeListener('editor-ready', editorLoaded);
    ipcMain.removeListener('editor-close-result', finishClose);
    // All acknowledged changes have already been committed.
    if (dataStore.databaseManager) {
      dataStore.databaseManager.close();
    }

    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });

  win.webContents.on('did-finish-load', () => {
  });
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  if (installing || secondaryInstance) return;

  let database;
  try {
    projectLibrary = new ProjectLibrary(app.getPath('documents'), process.platform, process.env.LOCALAPPDATA);
    database = projectLibrary.open();
  } catch (error) {
    showStorageError(error);
    app.quit();
    return;
  }
  if (DEBUG) enableDebugLog();
  createWindow(database);

  let template;
  if (dataStore.hasRestoreDatabase()) {
	   template = [
	   {
		  label: 'File',
		  submenu: [
				{ label: 'Restore projects', click: dataStore.restoreProjects.bind(dataStore) },
				{ type: 'separator' },
				{ role: 'quit' },
		  ],
		}];
  } else {
      template = [ 
      {
		  label: 'File',
		  submenu: [
				{ role: 'quit' },
		  ],
		}];
  }  
  

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
  
  

});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
    // since we don't have a window menu we have to exit, even on mac.

    app.quit();
  //}
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});














// ipcMain calls for the tabletInterface =======================================

function showStorageError(error) {
  const details = String(error.message || error);
  const folder = projectLibrary ? projectLibrary.folder : '';
  const message = /^ru/i.test(app.getLocale())
    ? 'Не удалось прочитать или записать библиотеку ScratchJGET. Проверьте место на диске и права доступа к папке.'
    : 'ScratchJGET could not read or write the project library. Check free disk space and access to this folder.';
  dialog.showErrorBox('ScratchJGET', message + '\n' + folder + '\n\n' + details);
}

// A synchronous caller must always receive a reply, including on access or disk
// errors. The renderer stops its success callback chain when it sees this reply.
function onStorage(channel, handle) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      handle(event, ...args);
    } catch (error) {
      event.returnValue = {storageError: String(error.message || error)};
      showStorageError(error);
    }
  });
}

/** returns if we are in a debug mode */
ipcMain.on('io_getIsDebug', (event, arg) =>  { // eslint-disable-line  no-unused-vars
	event.returnValue = DEBUG; 
	
});

ipcMain.on('debugWriteLog', (event, args) =>  { // eslint-disable-line  no-unused-vars
	debugLog(args); // send to our debugLog which will write to a file.
	event.returnValue = true;
});

/**
* Clean any assets that are not referenced in the database
*
* @param fileType The extension of the type of file to clean
*/
onStorage('io_cleanassets', (event, fileType) => {
  if (DEBUG_NYI) debugLog('cleanAssets - ', fileType);
  const db = dataStore.getDatabaseManager();
  if (db) {
    db.cleanProjectFiles(fileType);
  }
  event.returnValue = true;
});

/** Sets the file with the given name to the given contents
    java version writes byte array using Base64.decode
 */
onStorage('io_setfile', (event, arg) => {
  if (DEBUG_FILEIO) debugLog('io_setfile', arg);

  event.returnValue = dataStore.writeProjectFile(arg.name, arg.contents, { encoding: 'utf8' });
});

/** Gets a base64-encoded view of the contents of the given file
    java version returns Base64.encodeToString
*/
onStorage('io_getfile', (event, arg) => {
  if (DEBUG_FILEIO) debugLog('io_getfile', arg);

  event.returnValue = dataStore.readProjectFileAsBase64EncodedString(arg);
});


/**
 * Returns the media data associated with the given filename and return the result base64-encoded.
 * NOTE: appears to be the same as getfile??
 */
onStorage('io_getmedia', (event, filename) => {
  if (DEBUG_FILEIO)debugLog('io_getmedia', filename);


  event.returnValue = dataStore.readProjectFileAsBase64EncodedString(filename);
});


/**
 * Allows incremental loading of large resources
 *
 * This API loads an entire file and then encodes it to
 * base 64 string and sends it chunk by chunk.
 *     Unnecessary for loading from disk... can we remove?
 */

ipcMain.on('io_getmediadata', (event, key, offset, length) => {
  if (DEBUG_FILEIO) debugLog('io_getmediadata', key, offset, length);

  const mediaString = dataStore.getCachedMedia(key);

  if (mediaString) {
    try {
      event.returnValue = mediaString.substring(offset, offset + length); 
    } catch (e) {
      debugLog('error parsing media');
    }
    return;
  }
  event.returnValue = null;
});

ipcMain.on('io_getmediadone', (event, key) => {
  if (DEBUG_FILEIO) debugLog('io_getmediadone', key);


  dataStore.removeFromMediaCache(key);
  event.returnValue = true;
});

onStorage('io_getmedialen', (event, file, key) => {
  if (DEBUG_FILEIO) debugLog('io_getmedialen', file, key);

  const encodedStr = dataStore.readProjectFileAsBase64EncodedString(file);
  dataStore.cacheMedia(key, encodedStr);

  event.returnValue = (encodedStr) ? encodedStr.length : 0;
});

/**
 * Store the given content in a filereadProjectFileAsBase64EncodedString whose filename is constructed using the md5 sum of the base64 content string
 * followed by the given extension, and return the filename.
 *
 * @param base64ContentStr Base64-encoded content to store in the file
 * @param extension The extension of the filename to store to
 * @return The filename of the file that was saved.
 */
onStorage('io_setmedia', (event, base64ContentStr, ext) => {
  if (DEBUG_FILEIO) debugLog('io_setmedia - write file', ext);

  const filename = `${dataStore.getMD5(base64ContentStr)}.${ext}`;
  event.returnValue = dataStore.writeProjectFile(filename, base64ContentStr);
});


/**
 * Writes the given base64-encoded content to a filename with the name key.ext.
 */

onStorage('io_setmedianame', (event, encodedData, key, ext) => {
  if (DEBUG_FILEIO) debugLog('io_setmedianame', key, ext);

  const filename = `${key}.${ext}`;
  event.returnValue = dataStore.writeProjectFile(filename, encodedData);
});

/**
*  gets the app wide settings.
*  UNDONE - ask for permission for sound and video
*/
ipcMain.on('io_getsettings', (event, arg) => {
  if (DEBUG_RESOURCEIO) debugLog('io_getsettings', arg);

  try {
    // NSString *choice =[[NSUserDefaults standardUserDefaults] stringForKey:@"debugstate"];
    // return [NSString stringWithFormat: @"%@,%@,%@,%@", [NSHomeDirectory() stringByAppendingPathComponent:@"Documents"],
    // choice, [RecordSound getPermission], [ViewFinder cameraHasPermission]];

    event.returnValue = `${projectLibrary.folder},false,YES,YES`;
  } catch (e) {
    event.returnValue = null;

    debugLog('io_getsettings', e);
  }
});


/**
*  get an MD5 checksum of data.
*/
ipcMain.on('io_getmd5', (event, data) => {
  if (DEBUG_FILEIO) debugLog('io_getmd5');
  try {
    event.returnValue = dataStore.getMD5(data);
  } catch (e) {
    event.returnValue = null;
    debugLog('io_getmd5', e);
  }
});

/**
*  removes a file from the PROJECTFILES table
*/
onStorage('io_remove', (event, filename) => {
  if (DEBUG_FILEIO) debugLog('io_remove: ', filename);
  dataStore.removeProjectFile(filename);
  event.returnValue = true;
});


ipcMain.on('io_gettextresource', (event, filename) => {
  if (DEBUG_RESOURCEIO) debugLog('io_gettextresource', filename);


    // returns a file from the app resource directory
  const filePath = dataStore.safeGetFilenameInAppDirectory(filename, true);


  if (filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    event.returnValue = data;
  } else {
    debugLog('io_gettextresource: File could not be resolved.', filename);

    event.returnValue = null;
  }
});


/** search for audio data 
	first look for app/src/samples
	then look for  app/src/sounds
	then look in db for the audio name
*/
onStorage('io_getAudioData', (event, audioName) => {
   if (DEBUG_FILEIO) debugLog('io_getAudioData - looking for', audioName);
  
   
    // try fishing out of the app directory first - samples/pig.wav
  let filePath = dataStore.safeGetFilenameInAppDirectory(audioName, false);

  if (!filePath) { // if not pull from the sounds directory
    filePath = dataStore.safeGetFilenameInAppDirectory(`sounds/${audioName}`, false);
  }


  
  if (!filePath) { // if not pull from the scratch document folder.
  	if (DEBUG_FILEIO) debugLog('...trying to look in the PROJECTFILE table', audioName);
   
   	// this is already stored as a string, we do not need to convert it
     let projectDBFile = dataStore.readProjectFileAsBase64EncodedString(audioName);
     if (DEBUG_FILEIO && !projectDBFile) debugLog('...WARNING: unable to find: ',  audioName);
     event.returnValue = projectDBFile;
	return;
  }
  
  
  const  data = fs.readFileSync(filePath);
  
  if (!data) {
  	if (DEBUG_FILEIO) debugLog('io_getAudioData - could not find on disk', audioName, filePath);
  
    event.returnValue = null;
    return;
  }

  const dataStr = new Buffer(data).toString('base64');
  const extension = path.extname(filePath);
  if (extension === '.mp3') {
    event.returnValue = `data:audio/mp3;base64,${dataStr}`;
  } else if (extension === '.wav') {
    event.returnValue = `data:audio/wav;base64,${dataStr}`;
  } else {
    event.returnValue = null;
  }
});

onStorage('database_stmt', (event, json) => {
// {"stmt":"select name,thumbnail,id,isgift from projects where deleted = ? AND version = ? AND gallery IS NULL order by ctime desc","values":["NO","iOSv01"]}
  if (DEBUG_DATABASE) debugLog('database_stmt', json);

  const db = dataStore.getDatabaseManager();
  event.returnValue = db.stmt(json);


  if (DEBUG_DATABASE) debugLog('database_stmt result:', event.returnValue);
});
onStorage('database_query', (event, json) => {
  if (DEBUG_DATABASE) debugLog('database_query', json);

  const db = dataStore.getDatabaseManager();

  event.returnValue = JSON.stringify(db.query(json));
});


class ScratchJRDataStore {

  constructor(electronBrowserWindow) {
        /** Cache of key to base64-encoded media value */
    this.mediaStrings = {};
    this.electronBrowserWindow = electronBrowserWindow; 
  }
    /** gets an md5 checksum of the data passed in.
        @param {object} data
    */
  getMD5(data) { // eslint-disable class-methods-use-this
    return crypto.createHash('md5').update(data).digest('hex');
  }


  getDatabaseManager() {
    if (!this.databaseManager || !this.databaseManager.db) {
      this.databaseManager = projectLibrary.open();
      if (DEBUG_DATABASE) debugLog('DatabaseManager created');
    }
    return this.databaseManager;
  }

  hasRestoreDatabase() {
    return fs.existsSync(projectLibrary.restoreFilename());
  }

  restoreProjects() {
    try {
      const restored = projectLibrary.restore();
      if (this.databaseManager) this.databaseManager.close();
      this.databaseManager = restored;
    } catch (error) {
      showStorageError(error);
      return;
    }
    this.electronBrowserWindow.webContents.send('databaseRestored', {});
    dialog.showMessageBox(this.electronBrowserWindow, {
      type: 'info', buttons: ['OK'], title: 'Database Restored', message: 'The database has been restored'
    });
  }

  isParentFolder(parent, dir) {
    const relative = path.relative(parent, dir);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  }


    /** save a media string to the cache
        @param {string} key
        @param {string} base64EncodedStr string of audio
     */
  cacheMedia(key, base64EncodedStr) {
    this.mediaStrings[key] = base64EncodedStr;
  }

    /** return a media string from the cache */
  getCachedMedia(key) {
    return this.mediaStrings[key];
  }

    /** remove from media cache */
  removeFromMediaCache(key) {
    delete this.mediaStrings[key];
  }

    /** looks for a file inside the database, returns as a base64 encoded string
        @param {string} filename inside of PROJECTFILES table
    */
  readProjectFileAsBase64EncodedString(filename) {
    const db = this.getDatabaseManager();
    return db.readProjectFile(filename);
  }

    /** removes a file from the PROJECTFILES table
        @param {string} filename inside of PROJECTFILES table
    */
  removeProjectFile(filename) {
    const db = this.getDatabaseManager();
    db.removeProjectFile(filename);
  }

    /** writes a file to database as a base64 encoded string
        @param {string} filename inside of PROJECTFILES table
        @param {string} contents - base64 encoded string
        @param {string} encoding

    */
  writeProjectFile(file, contents) {
    const db = this.getDatabaseManager();
    db.saveToProjectFiles(file, contents);
    return file;
  }


    /** gets a file from the app directory - usually CSS or some asset
        @param  {string} file  filename relative to application root
        @param {bool} warnIfNotPresent make a warning if not present

     */

  safeGetFilenameInAppDirectory(file, warnIfNotPresent) {
        // if the filename is null throw
    if (!file || file === '') throw new Error('File cannot be null or empty');
    if (!__dirname || __dirname === '') throw new Error('Application dir is empty');


    const appRoot = path.join(__dirname, 'app');


        // join on the application directory
    const filePath = path.join(appRoot, file);
    if (!this.isParentFolder(appRoot, filePath)) {
      throw new Error(`safe resolve path - file outside app folder.${filePath}`);
    }

        // check if the file exists
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    if (DEBUG_FILEIO || warnIfNotPresent) debugLog('safeGetFilenameInAppDirectory: file does not exist.', file, filePath);

            // if not return null.
    return null;
  }
}


// Debug logging must not be a prerequisite for opening the library.
function enableDebugLog() {
  try {
    const logFile = fs.createWriteStream(path.join(projectLibrary.folder, 'debug.log'), { flags: 'a' });
    logFile.on('error', () => {}); // Storage errors are reported by the database operations.
    const logStdout = process.stdout;
    console.log = (...args) => {
      const line = util.format(...args) + '\n';
      if (logFile.writable) logFile.write(line);
      logStdout.write(line);
    };
    console.error = console.log;
  } catch (error) {
    debugLog('Debug log unavailable', error.message);
  }
}
