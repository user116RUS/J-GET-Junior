// Prepend to es6-shim.js in a disposable package copy, never a release artifact.
// Set JGET_QA_ROOT to a fresh directory containing Documents/, Profile/ and renderer.js.
var qae = require('electron');
var qaf = require('fs');
var qap = require('path');
var qar = process.env.JGET_QA_ROOT;
if (!qar || !qap.isAbsolute(qar)) throw new Error('An absolute JGET_QA_ROOT is required');
qae.app.setPath('documents', qap.join(qar, 'Documents'));
qae.app.setPath('userData', qap.join(qar, 'Profile'));
if (process.platform === 'win32') process.env.LOCALAPPDATA = qap.join(qar, 'Local');
// Opt-in Windows recovery probe. The fixture is created only in a fresh QA
// library, and all dialog interception stays in this disposable package copy.
var qaLegacy = process.env.JGET_QA_LEGACY === '1';
var qaPhase = process.env.JGET_QA_PHASE;
var qaStartup;
var qaLegacyFolder = qap.join(qar, 'Documents', 'ScratchJR');
var qaLegacyFile = qap.join(qaLegacyFolder, 'scratchjr.sqllite');
var qaProjectFolder = qap.join(qar, 'Local', 'ScratchJr-Classroom', 'Projects');
var qaProjectFile = qap.join(qaProjectFolder, 'scratchjr.sqllite');
var qaFixture;
function qaRequire(condition, message) {
    if (!condition) throw new Error(message);
}
function qaDigest(bytes) { return require('crypto').createHash('sha256').update(bytes).digest('hex'); }
function qaWriteStartup() {
    qaf.writeFileSync(qap.join(qar, 'startup-' + qaPhase + '.json'), JSON.stringify(qaStartup, null, 2));
}
function qaStartupFailure(error) {
    qaStartup.pass = false;
    qaStartup.error = String(error.stack || error);
    qaWriteStartup();
    qae.app.exit(4);
}
function qaCheckLegacy() {
    qaFixture.files.forEach(function (file) {
        qaRequire(qaDigest(qaf.readFileSync(qap.join(qaLegacyFolder, file.relative))) === file.sha256,
            'Legacy fixture changed: ' + file.relative);
    });
    qaStartup.sourcePreserved = true;
}
if (qaLegacy) {
    qaStartup = {phase: qaPhase, pass: false, promptCount: 0, choice: null,
        windowCreated: false, sourcePreserved: false};
    try {
        qaRequire(process.platform === 'win32', 'Legacy startup probe requires Windows');
        qaRequire(['legacy-cancel', 'create', 'reopen'].indexOf(qaPhase) >= 0, 'Unknown legacy startup phase');
        var fixtureFile = qap.join(qar, 'legacy-fixture.json');
        if (qaPhase === 'legacy-cancel') {
            qaRequire(!qaf.existsSync(qaLegacyFolder) && !qaf.existsSync(qaProjectFile), 'A fresh QA library is required');
            qaf.mkdirSync(qaLegacyFolder);
            qaf.mkdirSync(qap.join(qaLegacyFolder, 'media'));
            var fixtures = [
                {relative: 'scratchjr.sqllite', content: 'ScratchJGET synthetic invalid SQLite fixture; no user data.'},
                {relative: 'scratchjr.sqllite-wal', content: 'Synthetic old WAL; preserve these bytes.'},
                {relative: 'media/preserved.bin', content: 'Synthetic old drawing; preserve these bytes.'}
            ];
            qaFixture = {files: fixtures.map(function (file) {
                qaf.writeFileSync(qap.join(qaLegacyFolder, file.relative), file.content, {flag: 'wx'});
                return {relative: file.relative, sha256: qaDigest(Buffer.from(file.content))};
            })};
            qaf.writeFileSync(fixtureFile, JSON.stringify(qaFixture, null, 2), {flag: 'wx'});
        } else qaFixture = JSON.parse(qaf.readFileSync(fixtureFile, 'utf8'));
        qaCheckLegacy();
    } catch (error) { qaStartupFailure(error); }

    var qaOriginalMessageBox = qae.dialog.showMessageBox;
    qae.dialog.showMessageBox = function () {
        var options = arguments[0];
        if (qaStartup.windowCreated) return qaOriginalMessageBox.apply(qae.dialog, arguments);
        try {
            qaRequire(options && options.title === 'ScratchJGET' && options.type === 'warning' &&
                typeof options.detail === 'string' && options.detail.indexOf(qaLegacyFile) >= 0,
                'Unexpected startup dialog');
            qaRequire(qaPhase !== 'reopen', 'Reopening a saved library must not ask to skip legacy import');
            qaRequire(qaStartup.promptCount === 0 && options.buttons.length === 2 &&
                options.defaultId === 1 && options.cancelId === 1, 'Recovery dialog does not default to cancel');
            qaStartup.promptCount++;
            qaStartup.choice = qaPhase === 'legacy-cancel' ? 1 : 0;
            qaWriteStartup();
            return qaStartup.choice;
        } catch (error) { qaStartupFailure(error); return 1; }
    };
    qae.dialog.showErrorBox = function (title, content) {
        qaStartupFailure(new Error('Unexpected application error: ' + title + ': ' + content));
    };
    qae.app.on('will-quit', function () {
        try {
            qaCheckLegacy();
            if (qaPhase === 'legacy-cancel') {
                qaRequire(qaStartup.promptCount === 1 && qaStartup.choice === 1 && !qaStartup.windowCreated,
                    'Cancellation did not stop before opening the editor');
                qaRequire(!qaf.existsSync(qaProjectFile), 'Cancellation created a project database');
                qaRequire(!qaf.existsSync(qaProjectFolder) || !qaf.readdirSync(qaProjectFolder).some(function (name) {
                    return /^legacy-library-recovery-.*\.json$/.test(name);
                }), 'Cancellation recorded a fresh-library choice');
                qaStartup.pass = true;
            } else qaRequire(qaStartup.pass, 'Application quit before completing the startup check');
            qaWriteStartup();
        } catch (error) { qaStartupFailure(error); }
    });
}
qae.app.on('browser-window-created', function (ev, w) {
    if (qaLegacy) {
        try {
            qaStartup.windowCreated = true;
            qaRequire(qaPhase !== 'legacy-cancel', 'Cancellation opened a browser window');
            qaCheckLegacy();
            qaRequire(qaf.existsSync(qaProjectFile), 'The new project database was not saved');
            var qaSQL = require('sql.js/js/sql-memory-growth.js');
            var qaDatabase = new qaSQL.Database(qaf.readFileSync(qaProjectFile));
            try { qaStartup.projectCount = qaDatabase.exec('SELECT COUNT(*) FROM PROJECTS')[0].values[0][0]; }
            finally { qaDatabase.close(); }
            var qaNotes = qaf.readdirSync(qaProjectFolder).filter(function (name) {
                return /^legacy-library-recovery-.*\.json$/.test(name);
            });
            qaRequire(qaNotes.length === 1, 'Expected exactly one durable recovery note');
            var qaNote = JSON.parse(qaf.readFileSync(qap.join(qaProjectFolder, qaNotes[0]), 'utf8'));
            qaRequire(qaNote.sourceFile === qaLegacyFile && qaNote.destinationFile === qaProjectFile &&
                qaNote.sourceSha256 === qaFixture.files[0].sha256 && qaNote.oldProjectsRecovered === false &&
                qaNote.action === 'user-requested-new-library', 'Recovery note does not describe the preserved fixture');
            qaStartup.recoveryNote = qaNotes[0];
            if (qaPhase === 'create') {
                qaRequire(qaStartup.promptCount === 1 && qaStartup.choice === 0 && qaStartup.projectCount === 0,
                    'Explicit recovery did not open an empty library');
            } else {
                qaRequire(qaStartup.promptCount === 0 && qaStartup.projectCount > 0,
                    'Reopen did not use the saved project library');
            }
            qaStartup.pass = true;
            qaWriteStartup();
        } catch (error) { qaStartupFailure(error); return; }
    }
    qae.ipcMain.on('jget-qa-result', function (event, result) {
        if (event.sender !== w.webContents || (result && result.navigation)) return;
        qaf.writeFileSync(qap.join(qar, 'last-result.json'), JSON.stringify(result, null, 2));
        if (result && result.readyForClose) {
            w.on('closed', function () { qaf.writeFileSync(qap.join(qar, 'native-close.txt'), 'closed'); });
            w.close();
        } else qae.app.exit(result && result.pass ? 0 : 1);
    });
    w.webContents.on('did-finish-load', function () {
        setTimeout(function () {
            w.focus();
            // Electron 1.8 can return stale captures while executeJavaScript
            // awaits a long-lived Promise. Return first, then run the QA task.
            var source = qaf.readFileSync(qap.join(qar, 'renderer.js'), 'utf8');
            var script = 'setTimeout(function () { Promise.resolve().then(function () { return eval(' +
                JSON.stringify(source) + '); }).then(function (result) {' +
                "require('electron').ipcRenderer.send('jget-qa-result', result);" +
                '}, function (error) {' +
                "require('electron').ipcRenderer.send('jget-qa-result', {pass:false,error:String(error.stack||error)});" +
                '}); }, 0); void 0;';
            w.webContents.executeJavaScript(script, true);
        }, 1800);
    });
});
setTimeout(function () {
    qaf.writeFileSync(qap.join(qar, 'timeout.txt'), 'Native test timed out');
    qae.app.exit(3);
}, 180000);
