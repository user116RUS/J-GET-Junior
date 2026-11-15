// Run with node --experimental-vm-modules test/paint-regression.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main () {
    const layer = {svg: '', childElementCount: 1};
    const frame = {style: {display: 'none'}};
    const events = new EventTarget();
    const context = vm.createContext({
        window: events,
        document: {
            forms: {spriteform: {name: {value: 'Персонаж'}}},
            getElementById: () => ({style: {}})
        }
    });
    const lib = {
        frame, gn: id => id === 'layer1' ? layer : null, isTablet: false,
        newHTML: null, getIdFor: null, setCanvasSize: null, rgb2hsb: null,
        colorToRGBA: null, isAndroid: false, setProps: null, hitRect: null
    };
    const services = {
        ScratchJr: {storyStart () {}},
        ScratchAudio: {sndFX () {}},
        SVGTools: {
            svg2string: node => node.svg,
            toObject: svg => ({svg}),
            saveShape: node => node.svg
        },
        Camera: {active: false},
        BlockSpecs: {loadCount: 0},
        IO: {requestFromServer () {}},
        Alert: {close () {}}
    };
    async function load (relativeFile) {
        const filename = path.join(__dirname, '../src/app/src', relativeFile);
        const mod = new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), {context});
        await mod.link(specifier => {
            const name = path.basename(specifier);
            const exports = name === 'lib' ? lib : {default: services[name] || {}};
            return new vm.SyntheticModule(Object.keys(exports), function () {
                Object.keys(exports).forEach(key => this.setExport(key, exports[key]));
            }, {context});
        });
        await mod.evaluate();
        return mod.namespace.default;
    }

    services.Vector = await load('geom/Vector.js');
    services.SVG2Canvas = await load('utils/SVG2Canvas.js');
    const Path = services.Path = await load('painteditor/Path.js');
    context.Path = Path;
    const stuckCurve = [365, 118, 452, 83, 274, 145, 135, 260];
    context.curve = stuckCurve;
    const samples = vm.runInContext('Path.getBezierPoints(curve)', context, {timeout: 1000});
    assert.strictEqual(samples[0].x, 365);
    assert.strictEqual(samples[0].y, 118);
    assert.strictEqual(samples[samples.length - 1].x, 135);
    assert.strictEqual(samples[samples.length - 1].y, 260);
    for (let i = 1; i < samples.length; i++) {
        const before = samples[i - 1];
        const after = samples[i];
        assert.strictEqual(Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y)), 1);
    }
    const crossings = vm.runInContext(`Path.getPathCrossing(
        {getAttribute: () => 'M365,118 C452,83 274,145 135,260'},
        {getAttribute: () => 'M250,0 L250,360'})`, context, {timeout: 1000});
    assert(crossings.length > 0);
    assert(Path.getBezierPoints([0, 0, 0, 0, 0, 0, 0, 0]).length === 1);
    assert(Path.getBezierPoints([0, 0, 1e7, 1e7, -1e7, 0, 12, 34]).length <= 4097);

    const input = [{x: 0, y: 0}, {x: 8, y: 8}, {x: 16, y: 16}];
    const spaced = Path.addPoints(input);
    assert.strictEqual(JSON.stringify(spaced), JSON.stringify([input[0], input[1], {x: 12, y: 12}, input[2]]));

    services.Paint = {
        root: {
            removeChild () {},
            appendChild (node) { if (node) layer.svg = node.svg; }
        },
        setZoomTo () {}
    };
    const undo = services.PaintUndo = await load('painteditor/PaintUndo.js');
    const click = {preventDefault () {}, stopPropagation () {}};
    function record (svg) {
        layer.svg = svg;
        undo.record();
    }
    function edit (id) { return '<svg><path id="p' + id + '"/></svg>'; }
    record(edit(0));
    assert.strictEqual(undo.hasChanges, false);
    record(edit(1));
    undo.undo(click);
    assert.strictEqual(layer.svg, edit(0));
    assert.strictEqual(undo.hasChanges, false);
    undo.redo(click);
    assert.strictEqual(layer.svg, edit(1));
    undo.undo(click);
    record(edit('branch'));
    undo.redo(click);
    assert.strictEqual(layer.svg, edit('branch'));

    undo.reset();
    for (let i = 0; i < 2000; i++) record(edit(i));
    for (let i = 0; i < 50; i++) undo.undo(click);
    assert.strictEqual(layer.svg, edit(1968));
    assert(undo.hasChanges);
    for (let i = 0; i < 50; i++) undo.redo(click);
    assert.strictEqual(layer.svg, edit(1999));
    undo.reset();
    record(edit(0));
    const huge = '<svg>' + 'a'.repeat(8 * 1024 * 1024) + '</svg>';
    record(huge);
    undo.undo(click);
    assert.strictEqual(layer.svg, huge);
    assert(undo.hasChanges);

    const Paint = await load('painteditor/Paint.js');
    Paint.init();
    let attempts = 0;
    services.IO.setMedia = (svg, type) => {
        attempts++;
        assert.strictEqual(svg, huge);
        if (attempts === 1) {
            events.dispatchEvent(new Event('scratchjr-storage-error'));
            throw new Error('disk full');
        }
    };
    assert.throws(() => Paint.saveSprite(), /disk full/);
    assert.strictEqual(Paint.saving, false);
    Paint.saveSprite();
    assert.strictEqual(attempts, 2);
    console.log('PASS: curve sampling and intersection, stroke spacing, undo/redo, history bounds, save retry');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
