// Run with node --experimental-vm-modules test/target-collision-ui.js.
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
    get childElementCount() { return this.childNodes.length; }
    appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    removeChild(child) {
        this.childNodes.splice(this.childNodes.indexOf(child), 1);
        child.parentNode = null;
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    removeAttribute(key) { delete this.attributes[key]; }
    getContext() { return {drawImage() {}, clearRect() {}, fillText() {}}; }
    getBoundingClientRect() { return {left: 0, top: 0, bottom: 100, width: 1024, height: 768}; }
}

function descendants(node) {
    return node.childNodes.reduce((list, child) => list.concat(child, descendants(child)), []);
}

function valueLabel(block) {
    return descendants(block.div).find(node => node.className === 'spritearg-value').textContent;
}

async function main() {
    const frame = new Element('div');
    const scriptsContainer = new Element('div');
    const registry = {scriptscontainer: scriptsContainer};
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
        gn: id => registry[id]
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
    const page = {id: 'page1', div: new Element('div')};
    const otherPage = {id: 'page2', div: new Element('div')};
    page.div.owner = page;
    otherPage.div.owner = otherPage;
    const thumbnailDraws = [];
    function sprite(id, name, ownerPage = page, type = 'sprite') {
        const div = new Element('div');
        const spr = {
            id, name, page: ownerPage, type, shown: true, div, sounds: ['pop.mp3'],
            img: {complete: true}, border: {},
            drawMyImage(canvas, width, height) { thumbnailDraws.push({id, canvas, width, height}); }
        };
        div.owner = spr;
        ownerPage.div.appendChild(div);
        registry[id] = div;
        return spr;
    }
    const owner = sprite('cat', 'Кот');
    const target = sprite('dog 1', 'Собака');
    const sameName = sprite('dog 2', 'Собака');
    const hidden = sprite('hidden', 'Призрак');
    hidden.shown = false;
    sprite('caption', 'Текст', page, 'text');
    sprite('foreign', 'На другой странице', otherPage);
    services.ScratchJr.stage.pages = [page, otherPage];
    services.ScratchJr.stage.currentPage = page;
    services.ScratchJr.getSprite = () => owner;

    await load('utils/KeyboardKeys.js');
    const specs = await load('editor/blocks/BlockSpecs.js');
    specs.loadGraphics();
    specs.defs = specs.setupBlocksSpecs();
    assert(specs.setupPalettesDef()[0].includes('ontouch'));
    assert(specs.setupPalettesDef()[0].includes('ontouchsprite'));
    const Menu = await load('editor/blocks/Menu.js');
    await load('editor/blocks/BlockArg.js');
    const Block = await load('editor/blocks/Block.js');
    const Project = await load('editor/ui/Project.js');
    const Scripts = await load('editor/ui/Scripts.js');
    const scripts = new Scripts(owner);
    registry[owner.id + '_scripts'] = scripts.sc;
    const block = scripts.recreateStrip([['ontouchsprite', '', 24, 60]])[0];
    const click = {preventDefault() {}, stopPropagation() {}};
    assert(block.aStart, 'the targeted collision block must connect as a start block');
    assert.strictEqual(block.getArgValue(), '', 'new blocks require explicit selection');
    assert.strictEqual(valueLabel(block), 'Выбрать');
    assert.deepStrictEqual(Array.from(block.arg.getSpriteChoices(), spr => spr.id), ['dog 1', 'dog 2', 'hidden']);

    Menu.openDropDown(block.div, block.arg.closeSpriteMenu);
    const picker = Menu.openMenu;
    const choices = descendants(picker).filter(node => node.getAttribute('data-sprite-id') !== undefined);
    assert.deepStrictEqual(choices.map(node => node.getAttribute('data-sprite-id')), ['dog 1', 'dog 2', 'hidden']);
    assert(thumbnailDraws.some(draw => draw.id === target.id && draw.width === 96 && draw.height === 96),
        'the picker draws thumbnails through the actual Sprite drawing API');
    choices[0].onmousedown(click);
    assert.strictEqual(block.getArgValue(), target.id);
    assert.strictEqual(block.arg.getTargetSprite(), target);
    assert.strictEqual(valueLabel(block), 'Собака');
    assert.strictEqual(Menu.openMenu, undefined);
    assert.strictEqual(undo.length, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(undo[0])), {action: 'scripts', where: page.id, who: owner.id});
    Menu.openDropDown(block.div, block.arg.closeSpriteMenu);
    block.arg.closeSpriteMenu(click, Menu.openMenu, block.div, target.id);
    assert.strictEqual(undo.length, 1, 'selecting the same sprite does not create an undo step');
    Menu.openDropDown(block.div, block.arg.closeSpriteMenu);
    page.div.removeChild(sameName.div);
    block.arg.closeSpriteMenu(click, Menu.openMenu, block.div, sameName.id);
    assert.strictEqual(block.getArgValue(), target.id, 'a target deleted while the picker is open cannot replace the selection');
    assert.strictEqual(undo.length, 1);
    page.div.appendChild(sameName.div);

    const serialized = JSON.parse(JSON.stringify(Project.encodeStrip(block)));
    assert.strictEqual(serialized[0][1], target.id);
    const reopened = scripts.recreateStrip(serialized)[0];
    assert.strictEqual(reopened.getArgValue(), target.id);
    assert.strictEqual(reopened.arg.getTargetSprite(), target);
    const copy = reopened.duplicateBlock(100, 100, owner);
    assert.strictEqual(copy.getArgValue(), target.id);
    assert.strictEqual(copy.arg.getTargetSprite(), target);
    assert.strictEqual(specs.defs.ontouchsprite[4], '', 'selection must not change future block defaults');

    target.name = 'Пёс';
    scripts.activate();
    assert.strictEqual(valueLabel(reopened), 'Пёс');
    assert.strictEqual(reopened.getArgValue(), target.id, 'rename keeps stable ID reference');
    page.div.removeChild(target.div);
    reopened.update(owner);
    assert.strictEqual(reopened.arg.getTargetSprite(), undefined);
    assert.strictEqual(valueLabel(reopened), 'Нет на сцене');
    assert.strictEqual(reopened.getArgValue(), target.id, 'delete must preserve reference so undo can restore it');
    page.div.appendChild(target.div);
    reopened.update(owner);
    assert.strictEqual(reopened.arg.getTargetSprite(), target);
    assert.strictEqual(valueLabel(reopened), 'Пёс');

    services.ScratchJr.stage.currentPage = otherPage;
    assert.strictEqual(reopened.arg.getTargetSprite(), target, 'resolve by owner page, independent of selected scene');
    const foreignOwner = registry.foreign.owner;
    const foreignCopy = reopened.duplicateBlock(100, 100, foreignOwner);
    assert.strictEqual(foreignCopy.getArgValue(), target.id);
    assert.strictEqual(foreignCopy.arg.getTargetSprite(), undefined, 'copy to another scene must not select a same-name sprite');
    const selfCopy = reopened.duplicateBlock(100, 100, target);
    assert.strictEqual(selfCopy.arg.getTargetSprite(), undefined, 'copying the script to its target cannot select itself');
    assert.strictEqual(sameName.name, 'Собака');

    const foreignScripts = new Scripts(foreignOwner);
    foreignScripts.sc.appendChild(foreignCopy.div);
    Menu.openDropDown(foreignCopy.div, foreignCopy.arg.closeSpriteMenu);
    assert.strictEqual(descendants(Menu.openMenu).filter(node => node.getAttribute('data-sprite-id') !== undefined).length, 0);
    assert(descendants(Menu.openMenu).some(node => node.className === 'sprite-menu-empty'));
    Menu.openMenu.onkeydown(Object.assign({key: 'Escape'}, click));
    assert.strictEqual(Menu.openMenu, undefined);

    const empty = scripts.recreateStrip([['ontouchsprite', 'null', 0, 0]])[0];
    assert.strictEqual(empty.getArgValue(), '');
    assert.strictEqual(empty.arg.getTargetSprite(), undefined);
    const oldBlock = scripts.recreateStrip([['ontouch', null, 0, 0]])[0];
    assert(oldBlock.aStart);
    assert.strictEqual(oldBlock.getArgValue(), null);
    console.log('PASS: targeted collision palette, explicit selection, same-page choices, menu/undo, persistence, copies, rename/delete/restore and original collision block');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
