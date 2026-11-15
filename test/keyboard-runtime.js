// Run with node --experimental-vm-modules test/keyboard-runtime.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main () {
    function eventTarget () {
        const handlers = new Map();
        return {
            handlers,
            addEventListener (type, handler) {
                if (!handlers.has(type)) handlers.set(type, new Set());
                handlers.get(type).add(handler);
            },
            removeEventListener (type, handler) {
                if (handlers.has(type)) handlers.get(type).delete(handler);
            },
            dispatch (type, event) {
                if (handlers.has(type)) Array.from(handlers.get(type)).forEach(handler => handler(event));
            }
        };
    }
    const window = eventTarget();
    const document = Object.assign(eventTarget(), {
        hidden: false, activeElement: {tagName: 'BODY'}, hasFocus: () => true
    });
    const frame = {style: {display: 'block'}};
    const backdrop = {open: false, classList: {contains: () => backdrop.open}};
    const scripts = {};
    const nodes = {backdrop};
    const services = {
        ScratchJr: {
            stage: {currentPage: null}, onHold: false, activeFocus: null, userStart: false,
            updateRunStopButtons () {}, blur () {},
            startCurrentPageStrips (types) { this.startedHats = Array.from(types); }
        },
        Menu: {}, UI: {}, Grid: {size: 24}, Vector: {}, ScratchAudio: {}
    };
    const context = vm.createContext({window, document});
    const modules = new Map();
    const actual = new Set(['Prims', 'Thread', 'Runtime', 'Keyboard', 'KeyboardKeys']);
    async function load (relative) {
        const filename = path.resolve(__dirname, '../src/app/src', relative);
        if (modules.has(filename)) return modules.get(filename);
        const source = fs.readFileSync(filename, 'utf8');
        const module = new vm.SourceTextModule(source, {context, identifier: filename});
        modules.set(filename, module);
        await module.link(async specifier => {
            const name = path.basename(specifier);
            if (actual.has(name)) {
                return load(path.relative(path.resolve(__dirname, '../src/app/src'),
                    path.resolve(path.dirname(filename), specifier + '.js')));
            }
            const exports = name === 'lib'
                ? {frame, gn: id => nodes[id] || scripts[id]}
                : {default: services[name]};
            return new vm.SyntheticModule(Object.keys(exports), function () {
                Object.keys(exports).forEach(key => this.setExport(key, exports[key]));
            }, {context});
        });
        return module;
    }
    const keyboardModule = await load('editor/engine/Keyboard.js');
    await keyboardModule.evaluate();
    const Keyboard = keyboardModule.namespace.default;
    const runtimeModule = await load('editor/engine/Runtime.js');
    await runtimeModule.evaluate();
    const Runtime = runtimeModule.namespace.default;
    const primsModule = await load('editor/engine/Prims.js');
    const Prims = primsModule.namespace.default;
    const Keys = (await load('utils/KeyboardKeys.js')).namespace.default;
    const ScratchJr = services.ScratchJr;
    Prims.init();
    const runtime = ScratchJr.runtime = new Runtime();
    runtime.intervalId = 1;
    Prims.table.count = thread => {
        thread.spr.runs++;
        Prims.Ignore(thread);
    };

    const physical = [
        ['Backquote', 'ё'], ['KeyQ', 'й'], ['KeyW', 'ц'], ['KeyE', 'у'], ['KeyR', 'к'],
        ['KeyT', 'е'], ['KeyY', 'н'], ['KeyU', 'г'], ['KeyI', 'ш'], ['KeyO', 'щ'],
        ['KeyP', 'з'], ['BracketLeft', 'х'], ['BracketRight', 'ъ'], ['KeyA', 'ф'],
        ['KeyS', 'ы'], ['KeyD', 'в'], ['KeyF', 'а'], ['KeyG', 'п'], ['KeyH', 'р'],
        ['KeyJ', 'о'], ['KeyK', 'л'], ['KeyL', 'д'], ['Semicolon', 'ж'], ['Quote', 'э'],
        ['KeyZ', 'я'], ['KeyX', 'ч'], ['KeyC', 'с'], ['KeyV', 'м'], ['KeyB', 'и'],
        ['KeyN', 'т'], ['KeyM', 'ь'], ['Comma', 'б'], ['Period', 'ю']
    ];
    assert.strictEqual(new Set(physical.map(pair => pair[1])).size, 33);
    for (const [code, letter] of physical) {
        assert.strictEqual(Keyboard.keyForEvent({key: 'a', code}), letter);
        assert.strictEqual(Keyboard.keyForEvent({key: letter.toUpperCase(), code: 'KeyA', shiftKey: true}), letter);
        assert(Keys.values.includes(letter));
    }
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        assert.strictEqual(Keyboard.keyForEvent({key}), key);
        assert(Keys.values.includes(key));
    }
    for (const event of [{key: ' ', code: 'Space'}, {key: 'Spacebar'}, {code: 'Space'}]) {
        assert.strictEqual(Keyboard.keyForEvent(event), 'Space');
    }
    assert(Keys.values.includes('Space'));
    for (const extra of [{ctrlKey: true}, {altKey: true}, {metaKey: true}, {isComposing: true}, {keyCode: 229}]) {
        assert.strictEqual(Keyboard.keyForEvent(Object.assign({key: 'ф', code: 'KeyA'}, extra)), null);
    }
    for (const key of ['1', 'Dead', 'Process', 'Unidentified', 'Escape', 'Enter']) {
        assert.strictEqual(Keyboard.keyForEvent({key, code: key === '1' ? 'Digit1' : 'KeyA'}), null);
    }

    function hat (type, key, wait) {
        const block = {
            blocktype: type, aStart: true, next: null, getArgValue: () => key,
            findFirst () { return this; }, highlight () {}, unhighlight () {}
        };
        const count = {blocktype: 'count', next: null, highlight () {}, unhighlight () {}};
        block.next = wait ? {blocktype: 'wait', getArgValue: () => 1, next: count, highlight () {}, unhighlight () {}} : count;
        return block;
    }
    function sprite (id, hats, shown = true) {
        const result = {id, shown, type: 'sprite', runs: 0, closeBalloon () {}};
        scripts[id + '_scripts'] = {owner: {getBlocksType: types => hats.filter(block => types.includes(block.blocktype))}};
        return result;
    }
    function page (sprites) {
        return {div: {childElementCount: sprites.length, childNodes: sprites.map(owner => ({owner}))}};
    }
    function keydown (extra = {}) {
        const event = Object.assign({
            key: 'ArrowRight', target: document.activeElement, defaultPrevented: false,
            preventDefault () { this.defaultPrevented = true; }
        }, extra);
        document.dispatch('keydown', event);
        return event;
    }

    const right = hat('onkey', 'ArrowRight', true);
    const otherRight = hat('onkey', 'ArrowRight');
    const russian = hat('onkey', 'ё');
    const flag = hat('onflag');
    const click = hat('onclick');
    const one = sprite('one', [right, otherRight, russian, flag, click]);
    const hidden = sprite('hidden', [hat('onkey', 'ArrowRight')], false);
    const later = sprite('later', [hat('onkey', 'ArrowRight')]);
    const spaceSprite = sprite('space', [hat('onkey', 'Space')]);
    const firstPage = page([one, hidden, spaceSprite]);
    ScratchJr.stage.currentPage = firstPage;
    Keyboard.start();
    Keyboard.start();
    assert.strictEqual(document.handlers.get('keydown').size, 1);
    assert.strictEqual(window.handlers.get('pagehide').size, 1);
    assert.strictEqual(keydown().defaultPrevented, true);
    assert.strictEqual(runtime.threadsRunning.length, 3);
    assert.deepStrictEqual(ScratchJr.startedHats, ['ontouch', 'ontouchsprite']);
    assert.strictEqual(ScratchJr.userStart, true);
    runtime.tickTask();
    const waiting = runtime.threadsRunning.find(thread => thread.firstBlock === right);
    const waitTimer = waiting.waitTimer;
    keydown({repeat: true});
    assert.strictEqual(runtime.threadsRunning.find(thread => thread.firstBlock === right), waiting);
    assert.strictEqual(waiting.waitTimer, waitTimer);
    for (let i = 0; i < 6; i++) runtime.tickTask();
    assert.strictEqual(one.runs, 3); // short hat retriggered on repeat, waiting hat finished once
    assert.strictEqual(hidden.runs, 2);
    assert.strictEqual(later.runs, 0);

    runtime.stopThreads();
    assert.strictEqual(keydown({key: '`', code: 'Backquote'}).defaultPrevented, true);
    runtime.tickTask();
    assert.strictEqual(one.runs, 4);
    // Done entries still present between ticks must be launchable immediately.
    keydown({key: 'Ё', code: 'KeyA'});
    runtime.tickTask();
    assert.strictEqual(one.runs, 5);
    assert.strictEqual(runtime.threadsRunning.length, 1);

    runtime.stopThreads();
    ScratchJr.stage.currentPage = page([later]);
    keydown();
    runtime.tickTask();
    assert.strictEqual(later.runs, 1);
    assert.strictEqual(one.runs, 5);
    ScratchJr.stage.currentPage = firstPage;
    runtime.stopThreads();
    runtime.addRunScript(one, flag);
    runtime.tickTask();
    runtime.addRunScript(one, click);
    runtime.tickTask();
    assert.strictEqual(one.runs, 7);
    assert.strictEqual(Prims.table.onflag, Prims.Ignore);
    assert.strictEqual(Prims.table.onclick, Prims.Ignore);
    assert.strictEqual(Prims.table.onmessage, Prims.Ignore);
    assert.strictEqual(Prims.table.ontouch, Prims.OnTouch);
    assert.strictEqual(Prims.table.onkey, Prims.Ignore);

    function blocked (set, reset, event) {
        runtime.stopThreads();
        set();
        const input = keydown(event);
        reset();
        assert.strictEqual(runtime.threadsRunning.length, 0);
        assert.strictEqual(input.defaultPrevented, false);
    }
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        blocked(() => {}, () => {}, {target: {tagName}});
        blocked(() => { document.activeElement = {tagName}; }, () => { document.activeElement = {tagName: 'BODY'}; });
    }
    blocked(() => {}, () => {}, {target: {parentElement: {isContentEditable: true}}});
    blocked(() => { document.hidden = true; }, () => { document.hidden = false; });
    blocked(() => { document.hasFocus = () => false; }, () => { document.hasFocus = () => true; });
    blocked(() => { ScratchJr.onHold = true; }, () => { ScratchJr.onHold = false; });
    blocked(() => { ScratchJr.activeFocus = {}; }, () => { ScratchJr.activeFocus = null; });
    blocked(() => { services.UI.infoBoxOpen = true; }, () => { services.UI.infoBoxOpen = false; });
    blocked(() => { services.Menu.openMenu = {}; }, () => { services.Menu.openMenu = null; });
    blocked(() => { frame.style.display = 'none'; }, () => { frame.style.display = 'block'; });
    blocked(() => { backdrop.open = true; }, () => { backdrop.open = false; });
    blocked(() => { runtime.intervalId = undefined; }, () => { runtime.intervalId = 1; });
    blocked(() => { ScratchJr.stage.currentPage = null; }, () => { ScratchJr.stage.currentPage = firstPage; });
    blocked(() => {}, () => {}, {key: 'ArrowUp'});
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) blocked(() => {}, () => {}, {[modifier]: true});
    assert.strictEqual(keydown({defaultPrevented: true}).defaultPrevented, true);
    assert.strictEqual(runtime.threadsRunning.length, 0);

    // Space is serialized as a named key, launches its own script and does not
    // scroll the page. It remains available for typing and browser shortcuts.
    assert.strictEqual(keydown({key: ' ', code: 'Space'}).defaultPrevented, true);
    runtime.tickTask();
    assert.strictEqual(spaceSprite.runs, 1);
    assert.strictEqual(one.runs, 7);
    runtime.stopThreads();
    assert.strictEqual(keydown({key: 'Spacebar'}).defaultPrevented, true);
    runtime.tickTask();
    assert.strictEqual(spaceSprite.runs, 2);
    blocked(() => {}, () => {}, {key: ' ', code: 'Space', target: {tagName: 'INPUT'}});
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
        blocked(() => {}, () => {}, {key: ' ', code: 'Space', [modifier]: true});
    }
    blocked(() => { ScratchJr.stage.currentPage = page([later]); },
        () => { ScratchJr.stage.currentPage = firstPage; }, {key: ' ', code: 'Space'});

    ScratchJr.inFullscreen = true;
    keydown();
    assert.strictEqual(runtime.threadsRunning.length, 3);
    runtime.stopThreads();
    window.dispatch('pagehide');
    assert.strictEqual(document.handlers.get('keydown').size, 0);
    keydown();
    assert.strictEqual(runtime.threadsRunning.length, 0);
    Keyboard.start();
    keydown();
    assert.strictEqual(runtime.threadsRunning.length, 3);
    Keyboard.stop();
    assert.strictEqual(window.handlers.get('pagehide').size, 0);
    console.log('PASS keyboard runtime: 33 Russian letters, both layouts, arrows, Space, repeat, active page, hidden sprites, old hats, editor guards and lifecycle');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
