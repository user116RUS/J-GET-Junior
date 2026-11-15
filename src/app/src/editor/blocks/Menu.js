import BlockSpecs from './BlockSpecs';
import KeyboardKeys from '../../utils/KeyboardKeys';
import SoundLibrary from '../../utils/SoundLibrary';
import iOS from '../../iPad/iOS';
import {scaleMultiplier, setProps, setCanvasSize, newHTML, isTablet,
    newDiv, getDocumentHeight, drawThumbnail, frame, globalx, globaly} from '../../utils/lib';

let openMenu;

export default class Menu {
    static get openMenu () {
        return openMenu;
    }

    static set openMenu (newOpenMenu) {
        openMenu = newOpenMenu;
    }

    static openDropDown (b, fcn) {
        if (b.owner.blocktype == 'playsnd') {
            Menu.openSounds(b, fcn);
            return;
        }
        if (b.owner.blocktype == 'ontouchsprite') {
            Menu.openSprites(b, fcn);
            return;
        }
        if (b.owner.blocktype == 'onkey') {
            Menu.openKeyboard(b, fcn);
            return;
        }
        var size = 50;
        var color = b.owner.blocktype == 'setspeed' ? 'orange' : 'yellow';
        var list = JSON.parse(b.owner.arg.list);
        var num = b.owner.arg.numperrow;
        var p = b.parentNode;
        var dh = size * Math.round(list.length / num);
        var rows = list.length / num;
        var w = size * list.length / rows;
        var scaledWidth = w * scaleMultiplier;
        var dx = b.left + (b.offsetWidth - scaledWidth) / 2;
        if ((dx + scaledWidth) > p.width) {
            dx -= ((dx + scaledWidth) - p.width);
        }
        if (dx < 5) {
            dx = 5;
        }
        dx += globalx(p, 0);
        var dy = b.top + b.offsetHeight - ((10 + 18) * scaleMultiplier) + globaly(p, 0);
        if ((dy + ((10 + dh) * scaleMultiplier)) > getDocumentHeight()) {
            dy = getDocumentHeight() - ((15 + dh) * scaleMultiplier);
        }
        var mu = newDiv(frame, dx, dy, w, dh, {
            position: 'absolute',
            zIndex: 100000,
            webkitTransform: 'translate(' + (-w / 2) + 'px,' + (-dh / 2) + 'px) ' +
                'scale(' + scaleMultiplier + ', ' + scaleMultiplier + ') ' +
                'translate(' + (w / 2) + 'px, ' + (dh / 2) + 'px)'
        });
        mu.setAttribute('class', 'menustyle ' + color);
        mu.active = b;
        for (var i = 0; i < list.length; i++) {
            Menu.addImageToDropDown(mu, list[i], b, fcn);
        }
        openMenu = mu;
    }

    static openSounds (b, fcn) {
        Menu.closeMyOpenMenu();
        const parent = frame.getBoundingClientRect();
        const width = Math.min(620, parent.width - 24);
        const height = Math.min(480, parent.height - 24);
        const mu = newDiv(frame, (parent.width - width) / 2, (parent.height - height) / 2,
            width, height, {position: 'absolute', zIndex: 100000});
        mu.className = 'sound-menu';
        mu.setAttribute('role', 'dialog');
        mu.setAttribute('aria-label', 'Библиотека звуков');
        mu.active = b;
        mu.onmousedown = evt => evt.stopPropagation();
        mu.onkeydown = evt => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                Menu.closeMyOpenMenu();
            }
        };
        newHTML('div', 'sound-menu-title', mu).textContent = 'Библиотека звуков';
        const close = newHTML('button', 'sound-menu-close', mu);
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Закрыть библиотеку звуков');
        close.onclick = () => Menu.closeMyOpenMenu();
        newHTML('div', 'sound-menu-hint', mu).textContent =
            '▶ — послушать. Нажмите на название, чтобы добавить звук в проект.';
        const tabs = newHTML('div', 'sound-menu-tabs', mu);
        const list = newHTML('div', 'sound-menu-list', mu);
        const status = newHTML('div', 'sound-menu-status', mu);
        status.setAttribute('aria-live', 'polite');
        const categories = ['Животные', 'Природа', 'Музыка', 'Эффекты', 'Техника'];
        const stopPreview = () => {
            if (mu.preview) {
                mu.preview.pause();
                mu.preview.currentTime = 0;
                mu.preview = null;
            }
            if (mu.previewButton) {
                mu.previewButton.textContent = '▶';
                mu.previewButton = null;
            }
        };
        mu.onClose = stopPreview;
        const showCategory = category => {
            stopPreview();
            status.textContent = '';
            while (list.firstChild) list.removeChild(list.firstChild);
            Array.prototype.forEach.call(tabs.childNodes, tab =>
                tab.setAttribute('aria-pressed', tab.textContent === category ? 'true' : 'false'));
            SoundLibrary.entries.filter(sound => sound.category === category).forEach(sound => {
                const row = newHTML('div', 'sound-menu-row', list);
                const choice = newHTML('button', 'sound-menu-choice', row);
                choice.type = 'button';
                choice.textContent = sound.name;
                choice.setAttribute('data-sound-id', sound.id);
                choice.setAttribute('aria-pressed', sound.id === b.owner.arg.argValue ? 'true' : 'false');
                choice.onclick = evt => fcn(evt, mu, b, sound.id);
                const preview = newHTML('button', 'sound-menu-preview', row);
                preview.type = 'button';
                preview.textContent = '▶';
                preview.setAttribute('aria-label', 'Послушать: ' + sound.name);
                preview.onclick = () => {
                    const wasPlaying = mu.previewButton === preview;
                    stopPreview();
                    status.textContent = '';
                    if (wasPlaying) return;
                    const source = iOS.getSoundSource(sound.id);
                    if (!source) {
                        status.textContent = 'Не удалось загрузить звук.';
                        return;
                    }
                    const audio = new window.Audio(source);
                    audio.volume = 0.8;
                    mu.preview = audio;
                    mu.previewButton = preview;
                    preview.textContent = '■';
                    const failed = () => {
                        if (mu.preview !== audio) return;
                        stopPreview();
                        status.textContent = 'Не удалось проиграть звук.';
                    };
                    audio.onended = () => { if (mu.preview === audio) stopPreview(); };
                    audio.onerror = failed;
                    const promise = audio.play();
                    if (promise && promise.catch) promise.catch(failed);
                };
            });
        };
        categories.forEach(category => {
            const tab = newHTML('button', 'sound-menu-tab', tabs);
            tab.type = 'button';
            tab.textContent = category;
            tab.onclick = () => showCategory(category);
        });
        openMenu = mu;
        showCategory('Животные');
        close.focus();
    }

    static openSprites (b, fcn) {
        Menu.closeMyOpenMenu();
        b.owner.arg.update();
        const choices = b.owner.arg.getSpriteChoices();
        const bounds = b.getBoundingClientRect();
        const parent = frame.getBoundingClientRect();
        const width = Math.min(342, parent.width - 16);
        const height = Math.min(318, Math.max(138, 52 + Math.ceil(choices.length / 3) * 94), parent.height - 16);
        const left = Math.max(8, Math.min(bounds.left - parent.left, parent.width - width - 8));
        const top = Math.max(8, Math.min(bounds.bottom - parent.top, parent.height - height - 8));
        const mu = newDiv(frame, left, top, width, height, {position: 'absolute', zIndex: 100000});
        mu.className = 'menustyle yellow sprite-menu';
        mu.setAttribute('role', 'dialog');
        mu.setAttribute('aria-label', 'Кого касается персонаж?');
        mu.active = b;
        mu.onmousedown = evt => evt.stopPropagation();
        mu.onkeydown = evt => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                Menu.closeMyOpenMenu();
            }
        };
        newHTML('div', 'sprite-menu-title', mu).textContent = 'Кого касается персонаж?';
        const close = newHTML('button', 'keyboard-menu-close', mu);
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Закрыть выбор персонажа');
        close.onmousedown = evt => {
            evt.preventDefault();
            Menu.closeMyOpenMenu();
        };
        close.onclick = () => Menu.closeMyOpenMenu();
        const list = newHTML('div', 'sprite-menu-list', mu);
        if (!choices.length) {
            newHTML('div', 'sprite-menu-empty', list).textContent = 'Добавьте на эту сцену ещё одного персонажа.';
        }
        choices.forEach(sprite => {
            const button = newHTML('button', 'sprite-menu-choice', list);
            button.type = 'button';
            button.title = sprite.name;
            button.setAttribute('data-sprite-id', sprite.id);
            button.setAttribute('aria-pressed', sprite.id === b.owner.arg.argValue ? 'true' : 'false');
            const canvas = newHTML('canvas', 'sprite-menu-icon', button);
            setCanvasSize(canvas, 96, 96);
            b.owner.arg.drawSpriteIcon(canvas, sprite);
            newHTML('span', 'sprite-menu-name', button).textContent = sprite.name;
            button.onmousedown = evt => fcn(evt, mu, b, sprite.id);
            button.onclick = evt => {
                if (openMenu === mu) fcn(evt, mu, b, sprite.id);
            };
        });
        openMenu = mu;
    }

    static openKeyboard (b, fcn) {
        Menu.closeMyOpenMenu();
        const bounds = b.getBoundingClientRect();
        const parent = frame.getBoundingClientRect();
        const width = Math.min(376, parent.width - 16);
        const height = 286;
        const left = Math.max(8, Math.min(bounds.left - parent.left, parent.width - width - 8));
        const top = Math.max(8, Math.min(bounds.bottom - parent.top, parent.height - height - 8));
        const mu = newDiv(frame, left, top, width, height, {position: 'absolute', zIndex: 100000});
        mu.className = 'menustyle yellow keyboard-menu';
        mu.setAttribute('role', 'dialog');
        mu.setAttribute('aria-label', 'Выберите клавишу');
        mu.active = b;
        mu.onmousedown = evt => evt.stopPropagation();
        mu.onkeydown = evt => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                Menu.closeMyOpenMenu();
            }
        };
        newHTML('div', 'keyboard-menu-title', mu).textContent = 'Выберите клавишу';
        const close = newHTML('button', 'keyboard-menu-close', mu);
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Закрыть выбор клавиши');
        close.onmousedown = evt => {
            evt.preventDefault();
            Menu.closeMyOpenMenu();
        };
        close.onclick = () => Menu.closeMyOpenMenu();
        const arrowRow = newHTML('div', 'keyboard-menu-arrows', mu);
        const letters = newHTML('div', 'keyboard-menu-letters', mu);
        KeyboardKeys.values.forEach(key => {
            const special = key === 'Space' || key.indexOf('Arrow') === 0;
            const button = newHTML('button', 'keyboard-menu-key', special ? arrowRow : letters);
            if (key === 'Space') button.className += ' keyboard-menu-space';
            button.type = 'button';
            button.textContent = KeyboardKeys.label(key);
            button.setAttribute('data-key', key);
            button.setAttribute('aria-pressed', key === b.owner.arg.argValue ? 'true' : 'false');
            button.onmousedown = evt => fcn(evt, mu, b, key);
            button.onclick = evt => {
                if (openMenu === mu) {
                    fcn(evt, mu, b, key);
                }
            };
        });
        openMenu = mu;
    }

    static addImageToDropDown (mu, c, block, fcn) {
        var img = BlockSpecs.getImageFrom('assets/blockicons/' + c, 'svg');
        var cs = newHTML('div', 'ddchoice', mu);
        var micon = newHTML('canvas', undefined, cs);
        var iconSize = 42;
        var scaledIconSize = iconSize * window.devicePixelRatio;
        setCanvasSize(micon, scaledIconSize, scaledIconSize);
        setProps(micon.style, {
            webkitTransform: 'translate(' + (-scaledIconSize / 2) + 'px, ' + (-scaledIconSize / 2) + 'px) ' +
                'scale(' + (1 / window.devicePixelRatio) + ', ' + (1 / window.devicePixelRatio) + ') ' +
                'translate(' + (scaledIconSize / 2) + 'px, ' + (scaledIconSize / 2) + 'px)'
        });
        if (!img.complete) {
            img.onload = function () {
                drawThumbnail(img, micon);
            };
        } else {
            drawThumbnail(img, micon);
        }
        if (isTablet) {
            cs.onmousedown = function (evt) {
                handleTouchStart(evt);
            };
        } else {
            cs.onmouseover = function (evt) {
                Menu.highlightdot(evt);
            };
            cs.onmouseout = function (evt) {
                Menu.unhighlightdot(evt);
            };
            cs.onmousedown = function (evt) {
                fcn(evt, mu, block, c);
            };
        }
        function handleTouchStart (e) {
            if (isTablet && e.touches && (e.touches.length > 1)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            fcn(e, mu, block, c);
        }
    }

    static closeMyOpenMenu () {
        if (!openMenu) {
            return;
        }
        if (openMenu.onClose) openMenu.onClose();
        openMenu.parentNode.removeChild(openMenu);
        openMenu = undefined;
    }
}
