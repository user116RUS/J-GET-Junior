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
qae.app.on('browser-window-created', function (ev, w) {
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
