// Run with node --experimental-vm-modules test/input-responsiveness.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main () {
    const nodes = {};
    const timers = new Map();
    let nextTimer = 0;
    function element (name) {
        return {
            tagName: name, style: {}, childNodes: [], offsetHeight: 800,
            get childElementCount () { return this.childNodes.length; },
            setAttribute (key, value) {
                this[key] = value;
                if (key === 'id') nodes[value] = this;
            },
            appendChild (child) { this.childNodes.push(child); child.parentNode = this; },
            removeChild (child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); }
        };
    }
    ['frame', 'libframe', 'scrollarea', 'wrapc'].forEach(id => { nodes[id] = element('div'); });
    const browser = {};
    const context = vm.createContext({
        window: browser,
        document: {getElementById: id => nodes[id], body: {scrollTop: 0}},
        setTimeout (fn, ms) { const id = ++nextTimer; timers.set(id, {fn, ms}); return id; },
        clearTimeout: id => timers.delete(id)
    });
    const lib = {
        gn: id => nodes[id], frame: nodes.frame, isTablet: false, scaleMultiplier: 1,
        getDocumentHeight: () => 800, getDocumentWidth: () => 1024,
        newHTML (name, className, parent) {
            const child = element(name);
            child.className = className;
            if (parent) parent.appendChild(child);
            return child;
        }
    };
    const editor = {
        onHold: false, onBackButtonCallback: [() => {}],
        blur () {}, clearSelection () {},
        editorEvents () { browser.onmouseup = undefined; },
        isEditable: () => true,
        startScriptsFor (sprite, types) { this.started = {sprite, types: Array.from(types)}; },
        startCurrentPageStrips () {}
    };
    const lobby = {busy: true};
    const services = {ScratchJr: editor, Lobby: lobby, ScratchAudio: {sndFX () {}}};
    async function implementation (relative) {
        const filename = path.join(__dirname, '../src/app/src', relative);
        const source = fs.readFileSync(filename, 'utf8');
        const mod = new vm.SourceTextModule(source, {context});
        await mod.link(specifier => {
            const name = path.basename(specifier);
            let exports = {default: services[name] || {}};
            if (name === 'lib') {
                exports = {};
                const names = source.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*lib['"]/)[1];
                names.split(',').map(value => value.trim()).forEach(key => { exports[key] = lib[key]; });
            }
            return new vm.SyntheticModule(Object.keys(exports), function () {
                Object.keys(exports).forEach(key => this.setExport(key, exports[key]));
            }, {context});
        });
        await mod.evaluate();
        return mod.namespace.default;
    }
    const Library = await implementation('editor/ui/Library.js');
    Library.init();
    let prevented = false;
    let stopped = false;
    const event = {
        clientX: 10, clientY: 10,
        preventDefault () { prevented = true; }, stopPropagation () { stopped = true; }
    };
    browser.onmouseup = () => { throw new Error('stale library release'); };
    Library.cancelPick(event);
    assert(prevented && stopped, 'the closing press cannot propagate into the stage');
    assert.strictEqual(browser.onmouseup, undefined, 'no release callback survives closing');
    assert.strictEqual(nodes.frame.style.display, 'block');
    assert.strictEqual(editor.onHold, false, 'the next editor action is accepted immediately');
    assert.strictEqual(editor.onBackButtonCallback.length, 0);
    assert.strictEqual(timers.size, 0, 'closing a loaded library needs no timed input lock');

    const Home = await implementation('lobby/Home.js');
    let links = 0;
    Home.addProjectLink = () => { links++; };
    Home.displayProjects(JSON.stringify([{id: 1}, {id: 2}]));
    assert.strictEqual(links, 2, 'links are populated before the lobby unlocks');
    assert.strictEqual(lobby.busy, false, 'navigation works as soon as projects are displayed');
    assert.strictEqual(timers.size, 0);

    const Events = await implementation('utils/Events.js');
    services.Events = Events;
    let clicks = 0;
    let holds = 0;
    Events.startDrag(event, {}, () => {}, () => {}, null, () => { clicks++; }, () => { holds++; });
    assert.strictEqual(Array.from(timers.values())[0].ms, 500, 'delete still requires a deliberate hold');
    browser.onmouseup(event);
    assert.strictEqual(clicks, 1, 'a quick release clicks without waiting for the hold timer');
    assert.strictEqual(holds, 0);
    assert.strictEqual(timers.size, 0, 'release cancels the pending delete hold');

    const Stage = await implementation('editor/engine/Stage.js');
    const stage = Object.create(Stage.prototype);
    const sprite = {type: 'sprite', div: {}};
    sprite.div.owner = sprite;
    stage.mouseDownOnSprite(sprite, {x: 10, y: 10});
    assert.strictEqual(editor.started, undefined, 'press can still become a drag or long hold');
    browser.onmouseup(event);
    assert.strictEqual(editor.started.sprite, sprite);
    assert.deepStrictEqual(editor.started.types, ['onclick'], 'release queues the click script immediately');
    assert.strictEqual(timers.size, 0);
    console.log('PASS input responsiveness: library cancel and lobby navigation unlock immediately; quick clicks run on release; long-hold deletion remains deliberate');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
