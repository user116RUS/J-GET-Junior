// Run with node --experimental-vm-modules test/target-collision-runtime.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main () {
    const nodes = {};
    const events = {clearEvents () {}};
    const editor = {
        workingCanvas: {}, workingCanvas2: {}, updateRunStopButtons () {}, blur () {},
        clearSelection () {}, startedHats: [],
        startCurrentPageStrips (types) { this.startedHats = Array.from(types); },
        startScriptsFor () {}
    };
    const lib = {
        gn: id => nodes[id], setCanvasSize (canvas, width, height) { Object.assign(canvas, {width, height}); }
    };
    const services = {
        ScratchJr: editor, Events: events, Grid: {size: 24}, ScratchAudio: {},
        Thumbs: {updatePages () {}}
    };
    const context = vm.createContext({document: {createElement: () => ({})}, window: {}, clearTimeout () {}});
    const modules = new Map();
    const actual = new Set(['Prims', 'Runtime', 'Thread', 'KeyboardKeys']);
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
            let exports = {default: services[name] || {}};
            if (name === 'lib') {
                const match = source.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*lib['"]/);
                exports = {};
                match[1].split(',').map(item => item.trim()).forEach(key => { exports[key] = lib[key]; });
            }
            return new vm.SyntheticModule(Object.keys(exports), function () {
                Object.keys(exports).forEach(key => this.setExport(key, exports[key]));
            }, {context});
        });
        return module;
    }
    async function implementation (relative) {
        const module = await load(relative);
        await module.evaluate();
        return module.namespace.default;
    }
    const Sprite = await implementation('editor/engine/Sprite.js');
    const Runtime = await implementation('editor/engine/Runtime.js');
    const Prims = await implementation('editor/engine/Prims.js');
    const Stage = await implementation('editor/engine/Stage.js');
    const ScriptsPane = await implementation('editor/ui/ScriptsPane.js');
    Prims.init();
    assert.strictEqual(Prims.table.ontouchsprite, Prims.OnTouchSprite);
    assert.strictEqual(Prims.table.ontouch, Prims.OnTouch);

    function sprite (id) {
        return Object.assign(Object.create(Sprite.prototype), {
            id, name: 'Same visible name', type: 'sprite', shown: true, div: {}, pixelChecks: [], runs: 0,
            box: {intersects: other => other.overlap}, overlap: true, hit: false,
            getBoxWithEffects () { return Object.assign(this.box, {overlap: this.overlap}); },
            verifyHit (other) { this.pixelChecks.push(other.id); return other.hit; },
            closeBalloon () {}, goHome () {}
        });
    }
    function page (sprites) {
        const div = {childNodes: sprites.map(owner => ({owner}))};
        div.childNodes.push({}); // Stage decorations have no sprite owner.
        div.childElementCount = div.childNodes.length;
        sprites.forEach(spr => { spr.div.parentNode = div; });
        return {div};
    }
    const actor = sprite('actor');
    const target = sprite('target');
    const other = sprite('other');
    const firstPage = page([actor, target, other]);
    other.hit = true;
    assert.strictEqual(actor.touchingAny(), true, 'original trigger still detects another character');
    actor.pixelChecks = [];
    assert.strictEqual(actor.touchingSprite(target.id), false, 'bounding overlap alone is not a hit');
    assert.deepStrictEqual(actor.pixelChecks, ['target'], 'only the selected sprite reaches the pixel test');
    target.hit = true;
    assert.strictEqual(actor.touchingSprite(target.id), true);
    for (const id of ['', null, undefined, {}, actor.id, 'removed']) {
        assert.strictEqual(actor.touchingSprite(id), false, 'empty, invalid, self and deleted targets do not match');
    }
    target.overlap = false;
    actor.pixelChecks = [];
    assert.strictEqual(actor.touchingSprite(target.id), false);
    assert.deepStrictEqual(actor.pixelChecks, []);
    target.overlap = true;
    target.shown = false;
    assert.strictEqual(actor.touchingSprite(target.id), false);
    target.shown = true;
    actor.shown = false;
    assert.strictEqual(actor.touchingSprite(target.id), false);
    actor.shown = true;
    target.type = 'text';
    assert.strictEqual(actor.touchingSprite(target.id), false);
    target.type = 'sprite';
    events.dragthumbnail = {owner: target};
    assert.strictEqual(actor.touchingSprite(target.id), false);
    events.dragthumbnail = undefined;
    page([actor, other]);
    const secondPage = page([target]);
    assert.strictEqual(actor.touchingSprite(target.id), false, 'a target on another page cannot match');
    actor.div.parentNode = null;
    assert.strictEqual(actor.touchingSprite(target.id), false, 'detached sprites do not throw');
    actor.div.parentNode = firstPage.div;
    target.div.parentNode = firstPage.div;
    other.div.parentNode = firstPage.div;

    function hat (type, targetId, wait) {
        const block = {
            blocktype: type, aStart: true, getArgValue: () => targetId,
            findFirst () { return this; }, highlight () {}, unhighlight () {}
        };
        const count = {blocktype: 'count', next: null, highlight () {}, unhighlight () {}};
        block.next = wait ? {
            blocktype: 'wait', next: count, getArgValue: () => 3, highlight () {}, unhighlight () {}
        } : count;
        return block;
    }
    const selected = hat('ontouchsprite', target.id, true);
    const any = hat('ontouch');
    const flag = hat('onflag');
    const runtime = editor.runtime = new Runtime();
    Prims.table.count = thread => { thread.spr.runs++; Prims.Ignore(thread); };
    function ticks (count) { for (let i = 0; i < count; i++) runtime.tickTask(); }
    target.hit = false;
    runtime.addRunScript(actor, selected);
    ticks(8);
    assert.strictEqual(actor.runs, 0, 'touching other sprites does not run the selected-target script');
    assert.strictEqual(runtime.inactive(), true, 'waiting collision watches do not keep stop button active');
    target.hit = true;
    ticks(4);
    const running = runtime.threadsRunning[0];
    assert.strictEqual(runtime.inactive(), false);
    const pending = running.thisblock;
    const waitTimer = running.waitTimer;
    runtime.addRunScript(actor, selected);
    assert.strictEqual(runtime.threadsRunning.length, 1);
    assert.strictEqual(runtime.threadsRunning[0], running);
    assert.strictEqual(running.thisblock, pending);
    assert.strictEqual(running.waitTimer, waitTimer, 'other launches must not interrupt collision response');
    ticks(40);
    assert(actor.runs > 1, 'continued contact repeats completed scripts, like the original trigger');
    runtime.stopThreads();
    const runsBefore = actor.runs;
    target.hit = false;
    runtime.addRunScript(actor, selected);
    ticks(20);
    assert.strictEqual(actor.runs, runsBefore);
    runtime.stopThreadSprite(actor);
    ticks(4);
    assert.strictEqual(runtime.threadsRunning.length, 0);
    runtime.addRunScript(actor, any);
    ticks(8);
    assert(actor.runs > runsBefore, 'original collision trigger continues to work');
    runtime.stopThreads();
    runtime.addRunScript(actor, hat('ontouchsprite', ''));
    ticks(12);
    assert.strictEqual(runtime.inactive(), true);
    runtime.stopThreads();

    nodes.actor_scripts = {owner: {getBlocksType: types => [selected, any, flag].filter(b => types.includes(b.blocktype))}};
    const stage = Object.assign(Object.create(Stage.prototype), {currentPage: firstPage});
    stage.loadPageThreads();
    assert.deepStrictEqual(Array.from(runtime.threadsRunning, t => t.firstBlock.blocktype).sort(),
        ['onflag', 'ontouch', 'ontouchsprite'].sort());
    runtime.stopThreads();
    stage.currentPage = secondPage;
    stage.loadPageThreads();
    assert.strictEqual(runtime.threadsRunning.length, 0, 'page transition does not launch old page watches');
    const event = {preventDefault () {}, stopPropagation () {}};
    stage.clickOnSprite(event, actor);
    assert.deepStrictEqual(editor.startedHats, ['ontouch', 'ontouchsprite']);
    editor.getSprite = () => actor;
    ScriptsPane.runBlock(event, {owner: selected});
    assert.deepStrictEqual(editor.startedHats, ['ontouch', 'ontouchsprite']);
    runtime.stopThreads();
    events.dragthumbnail = {owner: Object.assign(actor, {threads: []})};
    events.dragged = true;
    stage.mouseUp(event);
    assert.deepStrictEqual(editor.startedHats, ['ontouch', 'ontouchsprite']);
    const ScratchJr = await implementation('editor/ScratchJr.js');
    ScratchJr.resetSprites = () => {};
    let greenFlagTypes;
    ScratchJr.startCurrentPageStrips = types => { greenFlagTypes = Array.from(types); };
    ScratchJr.startGreenFlagThreads();
    assert.deepStrictEqual(greenFlagTypes, ['onflag', 'ontouch', 'ontouchsprite']);
    console.log('PASS target collision: exact sprite identity, pixel-hit gate, same page, hidden/text/deleted/self/dragged guards, polling/repeat/stop, old trigger and launch lifecycle');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
