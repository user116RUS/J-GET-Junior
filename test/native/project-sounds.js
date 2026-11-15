// Copy next to renderer.js in the isolated QA directory. Production modules
// are resolved with the renderer's require, never from this helper's location.
module.exports = function (options) {
    var fs = require('fs');
    var SJ = options.SJ;
    var Project = options.Project;
    var Palette = options.requireApp('./src/editor/ui/Palette.js').default;
    var Menu = options.requireApp('./src/editor/blocks/Menu.js').default;
    var Record = options.requireApp('./src/editor/ui/Record.js').default;
    var SoundLibrary = options.requireApp('./src/utils/SoundLibrary.js').default;
    var assert = options.assert;
    var mouse = options.mouse;
    var ids = ['library/cat.wav', 'library/dog.wav', 'library/duck.wav',
        'library/cow.wav', 'library/horse.wav', 'library/owl.wav'];
    function click(node) {
        assert(!!node, 'sound control exists before click');
        mouse(node, 'mousedown'); mouse(node, 'mouseup'); mouse(node, 'click');
    }
    function children() { return Array.prototype.slice.call(document.getElementById('palette').childNodes); }
    function values() { return children().filter(function (node) { return node.owner; })
        .map(function (node) { return node.owner.getArgValue(); }); }
    function button(title) { return children().filter(function (node) { return node.title === title; })[0]; }
    function microphone() { return children().filter(function (node) { return node.onmousedown === Palette.recordSound; })[0]; }
    function fit() {
        var bounds = document.getElementById('blockspalette').getBoundingClientRect();
        var selectors = document.getElementById('selectors').getBoundingClientRect();
        children().forEach(function (node) {
            var rect = node.getBoundingClientRect();
            assert(rect.width > 0 && rect.height > 0 && rect.left >= selectors.right - 1 &&
                rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1,
            'native sound block/control fits the visible green panel');
        });
        return {panelWidth: bounds.width, selectorWidth: selectors.width,
            visibleSounds: values(), rightmost: Math.max.apply(Math, children().map(function (node) {
                return node.getBoundingClientRect().right;
            }))};
    }
    function choose(id, preview) {
        click(button('Добавить звук из библиотеки'));
        assert(!!Menu.openMenu, 'native + Звук opens the library');
        var category = SoundLibrary.get(id).category;
        click(Array.prototype.slice.call(Menu.openMenu.querySelectorAll('.sound-menu-tab')).filter(function (tab) {
            return tab.textContent === category;
        })[0]);
        var choice = Menu.openMenu.querySelector('[data-sound-id="' + id + '"]');
        var heard = Promise.resolve();
        var audio;
        if (preview) {
            click(choice.parentNode.querySelector('.sound-menu-preview'));
            audio = Menu.openMenu.preview;
            assert(!!audio, 'native sound preview creates an independent player');
            heard = options.until(function () { return audio.currentTime > 0; }, 5000).then(function () {
                assert(audio.currentTime > 0, 'native library preview advances before adding the sound');
            });
        }
        return heard.then(function () {
            click(choice);
            assert(!Menu.openMenu, 'choosing a library sound closes the picker');
            assert(SoundLibrary.selected(SJ.stage).indexOf(id) >= 0, 'selected sound remains in the project collection');
            if (audio) assert(audio.paused && audio.currentTime === 0, 'adding a sound stops its preview');
        });
    }

    Palette.selectCategory(3);
    if (options.phase === 'reopen') {
        var expected = JSON.parse(fs.readFileSync(options.root + '/expected-sounds.json', 'utf8'));
        assert(JSON.stringify(SoundLibrary.selected(SJ.stage)) === JSON.stringify(expected),
            'all chosen project sounds survive native close and reopen, including unused choices');
        Palette.showSound('pop.mp3');
        assert(values().indexOf(ids[0]) >= 0 && values().indexOf(ids[1]) >= 0,
            'reopened green palette offers both cat and dog');
        options.report.projectSounds = {reopened: expected, layout: fit()};
        return options.capture('sounds-reopened');
    }

    return choose(ids[0], true).then(function () { return choose(ids[1], false); }).then(function () {
        assert(values().indexOf(ids[0]) >= 0 && values().indexOf(ids[1]) >= 0 && values().indexOf('pop.mp3') >= 0,
            'adding dog retains the cat and original pop palette blocks');
        SJ.stage.currentPage.setCurrentSprite(options.target);
        Palette.selectCategory(3);
        assert(values().indexOf(ids[0]) >= 0 && values().indexOf(ids[1]) >= 0,
            'another character can reuse both project sounds');
        SJ.stage.currentPage.setCurrentSprite(options.sprite);
        Palette.selectCategory(3);
        options.report.projectSounds = {initialLayout: fit()};
        return options.capture('sounds-two-selected');
    }).then(function () {
        var sequence = Promise.resolve();
        ids.slice(2).forEach(function (id) { sequence = sequence.then(function () { return choose(id, false); }); });
        return sequence;
    }).then(function () {
        Palette.showSound('pop.mp3');
        options.report.projectSounds.firstPageLayout = fit();
        assert(values().length === 5, 'native sound collection displays five blocks per page');
        assert(microphone() && button('Добавить звук из библиотеки'), 'microphone and + Звук remain available with many sounds');
        return options.capture('sounds-first-page');
    }).then(function () {
        var firstPage = values();
        click(button('Следующие звуки'));
        var secondPage = values();
        assert(secondPage.indexOf(ids[5]) >= 0, 'next palette page exposes the newest sound');
        assert(ids.every(function (id) { return firstPage.concat(secondPage).indexOf(id) >= 0; }),
            'all six selected sounds are reachable through palette pages');
        options.report.projectSounds.secondPageLayout = fit();
        return options.capture('sounds-second-page');
    }).then(function () {
        mouse(microphone(), 'mousedown');
        assert(Record.dialogOpen, 'microphone still opens its recording dialog');
        Record.disappear();
        return options.wait(400);
    }).then(function () {
        var selected = SoundLibrary.selected(SJ.stage);
        assert(JSON.stringify(Project.getProject(SJ.stage.currentPage.id).librarySounds) === JSON.stringify(selected),
            'native project serializer includes all selected sounds');
        fs.writeFileSync(options.root + '/expected-sounds.json', JSON.stringify(selected, null, 2));
        options.report.projectSounds.selected = selected;
        Palette.showSound('pop.mp3');
    });
};
