import ScratchJr from '../ScratchJr';
import Menu from '../blocks/Menu';
import UI from '../ui/UI';
import {frame, gn} from '../../utils/lib';

const russianLayout = {
    Backquote: 'ё',
    KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н',
    KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з', BracketLeft: 'х', BracketRight: 'ъ',
    KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р',
    KeyJ: 'о', KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э',
    KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м', KeyB: 'и', KeyN: 'т',
    KeyM: 'ь', Comma: 'б', Period: 'ю'
};
let listening = false;

export default class Keyboard {
    static keyForEvent (event) {
        if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229) {
            return null;
        }
        const key = event.key || '';
        if (/^Arrow(Up|Down|Left|Right)$/.test(key)) return key;
        if (/^[а-яё]$/i.test(key)) return key.toLowerCase();
        // Printed Russian letters win over the physical mapping. With English
        // input selected, use the Russian label of the same physical key.
        if (key.length === 1) return russianLayout[event.code] || null;
        return null;
    }

    static isTyping (element) {
        for (let node = element; node; node = node.parentElement) {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable) return true;
        }
        return false;
    }

    static start () {
        if (listening) return;
        document.addEventListener('keydown', Keyboard.onKeyDown);
        window.addEventListener('pagehide', Keyboard.stop);
        listening = true;
    }

    static stop () {
        document.removeEventListener('keydown', Keyboard.onKeyDown);
        window.removeEventListener('pagehide', Keyboard.stop);
        listening = false;
    }

    static onKeyDown (event) {
        const key = Keyboard.keyForEvent(event);
        const backdrop = gn('backdrop');
        if (!key || event.defaultPrevented || document.hidden || !document.hasFocus() ||
            Keyboard.isTyping(event.target) || Keyboard.isTyping(document.activeElement) ||
            ScratchJr.onHold || ScratchJr.activeFocus || UI.infoBoxOpen || Menu.openMenu ||
            !frame || frame.style.display === 'none' || (backdrop && backdrop.classList.contains('in'))) return;
        const runtime = ScratchJr.runtime;
        if (!runtime || runtime.intervalId == null || !runtime.startKeyScripts(key)) return;
        event.preventDefault();
        ScratchJr.blur();
        ScratchJr.userStart = true;
        ScratchJr.startCurrentPageStrips(['ontouch', 'ontouchsprite']);
    }
}
