// Run with node --experimental-vm-modules test/keyboard-ui.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Element {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.style = {};
        this.attributes = {};
        this.childNodes = [];
        this.width = 85;
        this.height = 66;
        this.complete = true;
    }
    appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    removeChild(child) {
        this.childNodes.splice(this.childNodes.indexOf(child), 1);
        child.parentNode = null;
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    getContext() { return {drawImage() {}, clearRect() {}}; }
    getBoundingClientRect() { return {left: 0, top: 0, bottom: 100, width: 1024, height: 768}; }
}

async function main() {
    const frame = new Element('div');
    const scriptsContainer = new Element('div');
    const context = vm.createContext({
        window: {Settings: {}, devicePixelRatio: 1, addEventListener() {}},
        document: {createElement: tag => new Element(tag)}
    });
    const lib = {
        frame, scaleMultiplier: 1, isTablet: false, isAndroid: false,
        setProps: (object, values) => Object.assign(object, values),
        setCanvasSize: (element, width, height) => Object.assign(element, {width, height}),
        newHTML: (tag, className, parent) => {
            const node = new Element(tag);
            node.className = className;
            if (parent) parent.appendChild(node);
            return node;
        },
        newDiv: parent => parent.appendChild(new Element('div')),
        gn: id => id === 'scriptscontainer' ? scriptsContainer : null
    };
    const undo = [];
    const services = {
        ScratchJr: {storyStart() {}, stage: {pages: []}},
        Localization: {localize: key => key},
        Undo: {record: action => undo.push(action)}
    };
    async function load(relativeFile) {
        const filename = path.join(__dirname, '../src/app/src', relativeFile);
        const source = fs.readFileSync(filename, 'utf8');
        const mod = new vm.SourceTextModule(source, {context});
        await mod.link(specifier => {
            const name = path.basename(specifier);
            const names = name === 'lib' ? source.match(/import\s*\{([^}]+)\}\s*from\s*'[^']*lib'/)[1].split(',').map(s => s.trim()) : ['default'];
            return new vm.SyntheticModule(names, function() {
                names.forEach(key => this.setExport(key, name === 'lib' ? lib[key] : services[name] || {}));
            }, {context});
        });
        await mod.evaluate();
        services[path.basename(relativeFile, '.js')] = mod.namespace.default;
        return mod.namespace.default;
    }

    const keys = await load('utils/KeyboardKeys.js');
    assert.strictEqual(keys.values.length, 38);
    assert.strictEqual(new Set(keys.values).size, 38);
    assert.strictEqual(keys.normalize('Ё'), 'ё');
    for (const value of ['Space', ' ', 'Spacebar']) assert.strictEqual(keys.normalize(value), 'Space');
    assert.strictEqual(keys.label('Space'), 'Пробел');
    assert.strictEqual(keys.normalize('garbage'), 'ArrowRight');
    const specs = await load('editor/blocks/BlockSpecs.js');
    specs.loadGraphics();
    specs.defs = specs.setupBlocksSpecs();
    assert(specs.setupPalettesDef()[0].includes('onkey'));
    const Menu = await load('editor/blocks/Menu.js');
    await load('editor/blocks/BlockArg.js');
    const Block = await load('editor/blocks/Block.js');
    const Project = await load('editor/ui/Project.js');
    const Scripts = await load('editor/ui/Scripts.js');
    const spr = {id: 'cat', name: 'Cat', div: {parentNode: {owner: {id: 'page1'}}}};
    const scripts = new Scripts(spr);
    const click = {preventDefault() {}, stopPropagation() {}};
    let selected;
    for (const value of keys.values) {
        const spec = specs.defs.onkey.slice();
        spec[4] = value;
        const block = new Block(spec, false, 1);
        block.moveBlock(24, 60);
        scripts.sc.appendChild(block.div);
        assert(block.aStart);
        assert.strictEqual(block.arg.keyLabel.textContent, keys.label(value));
        assert.strictEqual(block.arg.div.getAttribute('data-key'), value);
        const serialized = JSON.parse(JSON.stringify(Project.encodeStrip(block)));
        assert.strictEqual(serialized[0][0], 'onkey');
        assert.strictEqual(serialized[0][1], value);
        const reopened = scripts.recreateStrip(serialized)[0];
        assert.strictEqual(reopened.getArgValue(), value);
        assert.strictEqual(reopened.arg.keyLabel.textContent, keys.label(value));
        const copy = reopened.duplicateBlock(100, 100, spr);
        assert.strictEqual(copy.getArgValue(), value);
        assert.strictEqual(specs.defs.onkey[4], 'ArrowRight');
        selected = reopened;
    }
    assert.strictEqual(specs.blockDesc(selected, spr).onkey, 'Нажата клавиша Я');
    Menu.openDropDown(selected.div, selected.arg.closeKeyMenu);
    const picker = Menu.openMenu;
    const buttons = picker.childNodes.slice(2).reduce((all, row) => all.concat(row.childNodes), []);
    assert.strictEqual(buttons.length, 38);
    const letter = buttons.find(button => button.getAttribute('data-key') === 'ё');
    letter.onmousedown(click);
    assert.strictEqual(selected.getArgValue(), 'ё');
    assert.strictEqual(selected.arg.keyLabel.textContent, 'Ё');
    assert.strictEqual(Menu.openMenu, undefined);
    assert.strictEqual(undo.length, 1);
    assert.strictEqual(undo[0].action, 'scripts');
    Menu.openDropDown(selected.div, selected.arg.closeKeyMenu);
    selected.arg.closeKeyMenu(click, Menu.openMenu, selected.div, 'ё');
    assert.strictEqual(undo.length, 1);
    Menu.openDropDown(selected.div, selected.arg.closeKeyMenu);
    const space = Menu.openMenu.childNodes[2].childNodes.find(button => button.getAttribute('data-key') === 'Space');
    assert.strictEqual(space.textContent, 'Пробел');
    assert(space.className.includes('keyboard-menu-space'));
    space.onmousedown(click);
    assert.strictEqual(selected.getArgValue(), 'Space');
    assert.strictEqual(selected.arg.keyLabel.textContent, 'Пробел');
    assert.strictEqual(selected.arg.div.getAttribute('data-key'), 'Space');
    assert.strictEqual(specs.blockDesc(selected, spr).onkey, 'Нажата клавиша Пробел');
    assert.strictEqual(undo.length, 2);
    assert.strictEqual(Menu.openMenu, undefined);
    const oldBlock = scripts.recreateStrip([['onflag', null, 0, 0]])[0];
    assert(oldBlock.aStart);
    assert.strictEqual(oldBlock.getArgValue(), null);
    console.log('PASS: 38 keyboard arguments including Space, palette, start shape, serialize/reopen, copy, picker selection and undo record');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
