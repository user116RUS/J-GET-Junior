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
    w.webContents.on('did-finish-load', function () {
        setTimeout(function () {
            w.focus();
            w.webContents.executeJavaScript(qaf.readFileSync(qap.join(qar, 'renderer.js'), 'utf8'), true, function (result) {
                if (result && result.navigation) return;
                qaf.writeFileSync(qap.join(qar, 'last-result.json'), JSON.stringify(result, null, 2));
                if (result && result.readyForClose) {
                    w.on('closed', function () { qaf.writeFileSync(qap.join(qar, 'native-close.txt'), 'closed'); });
                    w.close();
                } else qae.app.exit(result && result.pass ? 0 : 1);
            });
        }, 1800);
    });
});
setTimeout(function () {
    qaf.writeFileSync(qap.join(qar, 'timeout.txt'), 'Native test timed out');
    qae.app.exit(3);
}, 180000);
