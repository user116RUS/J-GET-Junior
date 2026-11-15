// Run with node --experimental-vm-modules test/sound-library.js.
// Exercise the actual block, menu, serializer and audio registry without a browser.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Element {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.nodeName = this.tagName;
        this.style = {};
        this.attributes = {};
        this.childNodes = [];
        this.width = 85;
        this.height = 66;
        this.complete = true;
    }
    get childElementCount() { return this.childNodes.length; }
    get firstChild() { return this.childNodes[0]; }
    get offsetWidth() { return this.width; }
    get offsetHeight() { return this.height; }
    appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    removeChild(child) {
        const index = this.childNodes.indexOf(child);
        assert(index >= 0, 'remove only a child belonging to this element');
        this.childNodes.splice(index, 1);
        child.parentNode = null;
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() {}
    getContext() {
        return {drawImage() {}, clearRect() {}, fillText() {}, measureText: () => ({width: 10})};
    }
    getBoundingClientRect() { return {left: 0, top: 0, bottom: 100, width: 1024, height: 768}; }
}

function descendants(node) {
    return node.childNodes.reduce((list, child) => list.concat(child, descendants(child)), []);
}

function json(value) { return JSON.parse(JSON.stringify(value)); }

function inspectAudio(id) {
    const filename = path.join(__dirname, '../src/app/sounds', id);
    assert(fs.existsSync(filename), 'catalog audio must ship: ' + id);
    const data = fs.readFileSync(filename);
    assert(data.length > 44, 'audio cannot be empty: ' + id);
    if (!id.endsWith('.wav')) return;
    assert.strictEqual(data.toString('ascii', 0, 4), 'RIFF', id);
    assert.strictEqual(data.toString('ascii', 8, 12), 'WAVE', id);
    let format;
    let samples;
    for (let offset = 12; offset + 8 <= data.length;) {
        const name = data.toString('ascii', offset, offset + 4);
        const size = data.readUInt32LE(offset + 4);
        assert(offset + 8 + size <= data.length, 'complete WAV chunk: ' + id);
        if (name === 'fmt ') format = data.subarray(offset + 8, offset + 8 + size);
        if (name === 'data') samples = data.subarray(offset + 8, offset + 8 + size);
        offset += 8 + size + (size % 2);
    }
    assert(format && samples && samples.length, 'WAV needs format and samples: ' + id);
    assert.strictEqual(format.readUInt16LE(0), 1, 'PCM WAV works in the legacy Electron runtime');
    assert.strictEqual(format.readUInt16LE(14), 16, 'generated library uses 16-bit PCM');
    let peak = 0;
    for (let i = 0; i + 1 < samples.length; i += 2) peak = Math.max(peak, Math.abs(samples.readInt16LE(i)));
    assert(peak > 100, 'library audio is not silent: ' + id);
}

async function main() {
    const frame = new Element('div');
    const scriptsContainer = new Element('div');
    const registry = {scriptscontainer: scriptsContainer};
    const previews = [];
    class PreviewAudio {
        constructor(url) { this.url = url; this.currentTime = 0; this.plays = 0; this.pauses = 0; previews.push(this); }
        play() { this.plays++; return Promise.resolve(); }
        pause() { this.pauses++; }
    }
    const context = vm.createContext({
        console, setTimeout, clearTimeout,
        window: {Settings: {}, devicePixelRatio: 1, Audio: PreviewAudio, addEventListener() {}},
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
        newP: (parent, text) => {
            const node = parent.appendChild(new Element('p'));
            node.textContent = text;
            return node;
        },
        gn: id => registry[id]
    };
    const undo = [];
    const audioCalls = [];
    const previewSource = 'data:audio/wav;base64,UklGRg==';
    const services = {
        ScratchJr: {storyStart() {}, stage: {pages: []}, clearSelection() {}, blur() {}, stopStrips() {}},
        Localization: {localize: key => key},
        Undo: {record: action => undo.push(action)},
        iOS: {
            getSoundSource(id) { audioCalls.push(['source', id]); return previewSource; },
            registerSound(dir, id, done) { audioCalls.push(['register', id]); done(id); },
            playSound(id) { audioCalls.push(['play', id]); },
            stopSound(id) { audioCalls.push(['stop', id]); }
        }
    };
    async function load(relativeFile) {
        const filename = path.join(__dirname, '../src/app/src', relativeFile);
        const source = fs.readFileSync(filename, 'utf8');
        const mod = new vm.SourceTextModule(source, {context});
        await mod.link(async specifier => {
            const name = path.basename(specifier, '.js');
            if (name !== 'lib' && !services[name] && relativeFile === 'utils/SoundLibrary.js') {
                const dependency = path.relative(path.join(__dirname, '../src/app/src'),
                    path.resolve(path.dirname(filename), specifier + (path.extname(specifier) ? '' : '.js')));
                await load(dependency);
            }
            const names = name === 'lib' ? source.match(/import\s*\{([^}]+)\}\s*from\s*'[^']*lib'/)[1].split(',').map(s => s.trim()) : ['default'];
            return new vm.SyntheticModule(names, function() {
                names.forEach(key => this.setExport(key, name === 'lib' ? lib[key] : services[name] || {}));
            }, {context});
        });
        await mod.evaluate();
        services[path.basename(relativeFile, '.js')] = mod.namespace.default;
        return mod.namespace.default;
    }

    const catalog = await load('utils/SoundLibrary.js');
    const ids = Array.from(catalog.entries, item => item.id);
    assert(ids.length > 1, 'the library offers sounds beyond the original pop');
    assert.strictEqual(new Set(ids).size, ids.length, 'stable catalog IDs are unique');
    assert(catalog.has('pop.mp3'), 'existing projects retain their original built-in sound');
    assert(!catalog.has('missing-sound.wav'));
    for (const entry of catalog.entries) {
        assert(entry.name && entry.name.length, 'every sound has a user-facing name');
        assert.strictEqual(catalog.get(entry.id).id, entry.id);
        inspectAudio(entry.id);
    }
    services.IO = {requestFromServer(url, done) {
        assert.strictEqual(url, 'media.json');
        done(fs.readFileSync(path.join(__dirname, '../src/app/media.json'), 'utf8'));
    }};
    const MediaLib = await load('iPad/MediaLib.js');
    let mediaLoaded = false;
    MediaLib.loadMediaLib('', () => { mediaLoaded = true; });
    assert(mediaLoaded);
    for (const id of ids) assert(MediaLib.sounds.includes(id), 'catalog is recognized as built-in media: ' + id);
    assert.strictEqual(MediaLib.sounds.filter(id => id === 'pop.mp3').length, 1);
    await load('utils/Sound.js');
    const audio = await load('utils/ScratchAudio.js');
    audio.init();
    for (const id of ids) {
        assert(audio.projectSounds[id], 'built-in can run before a picker preview: ' + id);
        assert.strictEqual(audioCalls.filter(call => call[0] === 'register' && call[1] === id).length, 1);
    }
    const chosen = ids.find(id => id !== 'pop.mp3');
    let cachedLoaded;
    audio.loadProjectSound(chosen, id => { cachedLoaded = id; });
    assert.strictEqual(cachedLoaded, chosen, 'cached sound loading still completes its callback');

    await load('utils/KeyboardKeys.js');
    const specs = await load('editor/blocks/BlockSpecs.js');
    specs.loadGraphics();
    specs.defs = specs.setupBlocksSpecs();
    const Menu = await load('editor/blocks/Menu.js');
    await load('editor/blocks/BlockArg.js');
    const Block = await load('editor/blocks/Block.js');
    const Project = await load('editor/ui/Project.js');
    const Scripts = await load('editor/ui/Scripts.js');
    const page = {id: 'page1'};
    const owner = {id: 'cat', name: 'Кот', sounds: ['pop.mp3', 'recorded-voice.webm'], div: {parentNode: {owner: page}}};
    const destination = {id: 'dog', name: 'Пёс', sounds: ['pop.mp3'], div: {parentNode: {owner: page}}};
    const scripts = new Scripts(owner);
    const copiedScripts = new Scripts(destination);
    services.ScratchJr.getSprite = () => owner;
    services.ScratchJr.getActiveScript = () => scripts.sc;
    const click = {preventDefault() {}, stopPropagation() {}};

    for (const id of ids) {
        const block = scripts.recreateStrip([['playsnd', id, 24, 60]])[0];
        assert.strictEqual(block.getArgValue(), id);
        assert.strictEqual(block.arg.soundLabel.textContent, catalog.get(id).shortName);
        const encoded = json(Project.encodeStrip(block));
        assert.strictEqual(encoded[0][1], id, 'save uses the stable ID, not its translated label');
        assert.strictEqual(scripts.recreateStrip(json(encoded))[0].getArgValue(), id, 'reopen retains sound');
        assert.strictEqual(copiedScripts.recreateStrip(json(encoded))[0].getArgValue(), id,
            'copy to a character without the sound retains the built-in choice');
        assert.strictEqual(block.duplicateBlock(100, 100, destination).getArgValue(), id);
    }
    assert.deepStrictEqual(owner.sounds, ['pop.mp3', 'recorded-voice.webm']);
    assert.deepStrictEqual(destination.sounds, ['pop.mp3']);
    const recorded = scripts.recreateStrip([['playusersnd', 1, 0, 0]])[0];
    assert.strictEqual(recorded.getSoundName(owner.sounds), 'recorded-voice.webm');
    assert.strictEqual(json(Project.encodeStrip(recorded))[0][1], 1);
    assert.strictEqual(scripts.recreateStrip([['playsnd', 'missing-sound.wav', 0, 0]])[0].getArgValue(), 'pop.mp3');
    const repeat = scripts.recreateStrip([['repeat', 2, 0, 0, [['playsnd', chosen, 0, 0]]]])[0];
    assert.strictEqual(repeat.inside.getArgValue(), chosen);
    const repeatCopy = copiedScripts.recreateStrip(json(Project.encodeStrip(repeat)))[0];
    assert.strictEqual(repeatCopy.inside.getArgValue(), chosen, 'nested sound choices survive save and character copy');

    const Prims = await load('editor/engine/Prims.js');
    const soundBlock = scripts.recreateStrip([['playsnd', chosen, 0, 0]])[0];
    const nextBlock = {blocktype: 'forward'};
    soundBlock.next = nextBlock;
    const thread = {spr: owner, thisblock: soundBlock};
    Prims.playSound(thread);
    assert.strictEqual(thread.thisblock, soundBlock, 'execution waits while sound is playing');
    assert.strictEqual(thread.audio, audio.projectSounds[chosen]);
    audio.soundDone(chosen);
    Prims.playSound(thread);
    assert.strictEqual(thread.thisblock, nextBlock, 'execution advances when sound finishes');
    assert.strictEqual(thread.audio, undefined);

    const block = scripts.recreateStrip([['playsnd', 'pop.mp3', 24, 60]])[0];
    Menu.openSounds(block.div, block.arg.closeSoundMenu);
    const available = [];
    const tabs = descendants(Menu.openMenu).filter(node => node.className === 'sound-menu-tab');
    assert.strictEqual(tabs.length, new Set(Array.from(catalog.entries, entry => entry.category)).size);
    for (const tab of tabs) {
        tab.onclick(click);
        available.push(...descendants(Menu.openMenu).filter(node => node.getAttribute('data-sound-id') !== undefined)
            .map(node => node.getAttribute('data-sound-id')));
    }
    assert.deepStrictEqual(available.sort(), ids.slice().sort(),
        'all sounds can be selected in the picker');
    tabs.find(tab => tab.textContent === catalog.get(chosen).category).onclick(click);
    descendants(Menu.openMenu).find(node => node.getAttribute('data-sound-id') === chosen).onclick(click);
    assert.strictEqual(block.getArgValue(), chosen);
    assert.strictEqual(Menu.openMenu, undefined);
    assert.deepStrictEqual(json(undo), [{action: 'scripts', where: page.id, who: owner.id}]);
    Menu.openSounds(block.div, block.arg.closeSoundMenu);
    block.arg.closeSoundMenu(click, Menu.openMenu, block.div, chosen);
    assert.strictEqual(undo.length, 1, 'choosing the current sound does not add an undo step');

    const palette = new Element('div');
    const paletteBlock = new Block(specs.defs.playsnd.slice(), true, 0.75);
    palette.appendChild(paletteBlock.div);
    Menu.openSounds(paletteBlock.div, paletteBlock.arg.closeSoundMenu);
    paletteBlock.arg.closeSoundMenu(click, Menu.openMenu, paletteBlock.div, chosen);
    assert.strictEqual(paletteBlock.getArgValue(), chosen);
    assert.strictEqual(undo.length, 1, 'palette selection does not change the saved project');
    assert.strictEqual(specs.defs.playsnd[4], 'pop.mp3', 'block defaults remain backward compatible');
    assert.deepStrictEqual(owner.sounds, ['pop.mp3', 'recorded-voice.webm'], 'selection must not shift recording indices');

    Menu.openSounds(block.div, block.arg.closeSoundMenu);
    const preview = descendants(Menu.openMenu).find(node => node.className === 'sound-menu-preview');
    assert(preview, 'the catalog provides a preview before selection');
    preview.onclick(click);
    const playing = previews[previews.length - 1];
    assert.strictEqual(playing.url, previewSource, 'native previews use the audio data URI, never a raw file path');
    assert(audioCalls.some(call => call[0] === 'source' && call[1] === chosen));
    assert.strictEqual(playing.plays, 1, 'preview plays audio independently of project sounds');
    playing.currentTime = 0.5;
    Menu.openMenu.onkeydown(Object.assign({key: 'Escape'}, click));
    assert.strictEqual(Menu.openMenu, undefined);
    assert.strictEqual(playing.pauses, 1, 'closing stops preview audio');
    assert.strictEqual(playing.currentTime, 0, 'preview is rewound when closing');
    assert.strictEqual(block.getArgValue(), chosen, 'preview/cancel preserves selection');
    assert.strictEqual(undo.length, 1);
    console.log('PASS: ' + ids.length + ' catalog assets, preload, persistence/copy, playback continuation, picker/undo, palette, recordings and preview cancellation');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
