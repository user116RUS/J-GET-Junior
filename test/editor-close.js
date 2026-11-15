// Run with node --experimental-vm-modules test/editor-close.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main() {
    let paintOpen = false;
    let pending;
    const paint = {saving: false};
    const project = {saving: false};
    const lib = {
        gn: () => ({classList: {contains: () => paintOpen}}),
        libInit: null, scaleMultiplier: null, newHTML: null, isAndroid: false,
        isTablet: false, getUrlVars: null, CSSTransition3D: null, frame: null
    };
    const context = vm.createContext({
        document: {createElement: () => ({})},
        setTimeout: fn => { pending = fn; }
    });
    const file = path.join(__dirname, '../src/app/src/editor/ScratchJr.js');
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), {context});
    await mod.link(specifier => {
        const name = path.basename(specifier);
        const exports = name === 'lib' ? lib : {default: {Project: project, Paint: paint}[name] || {}};
        return new vm.SyntheticModule(Object.keys(exports), function () {
            Object.keys(exports).forEach(key => this.setExport(key, exports[key]));
        }, {context});
    });
    await mod.evaluate();
    const editor = mod.namespace.default;
    const replies = [];
    let commit;
    editor.unfocus = editor.stopStrips = () => {};
    editor.saveProject = (_, done) => { commit = done; };
    const reply = result => replies.push(result);
    paintOpen = true;
    editor.saveBeforeClose(false, reply);
    assert.deepStrictEqual(replies, ['paint']);
    assert.strictEqual(commit, undefined);
    editor.saveBeforeClose(true, reply);
    assert.deepStrictEqual(replies, ['paint']);
    commit();
    paintOpen = false;
    paint.saving = true;
    editor.onHold = true;
    editor.saveBeforeClose(false, reply);
    assert.deepStrictEqual(replies, ['paint', 'saved']);
    paint.saving = false;
    editor.onHold = false;
    pending();
    commit();
    assert.deepStrictEqual(replies, ['paint', 'saved', 'saved']);
    project.saving = true;
    editor.saveBeforeClose(false, reply, Date.now() - 5100);
    assert.strictEqual(replies.pop(), 'busy');
    console.log('PASS: open drawing, discard drawing, wait for stage update, close only after save');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
