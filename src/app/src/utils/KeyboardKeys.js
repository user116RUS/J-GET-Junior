const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const letters = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'.split('');
const symbols = {ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'};

export default class KeyboardKeys {
    static get values () {
        return arrows.concat(letters);
    }

    static normalize (value) {
        if (arrows.indexOf(value) >= 0) {
            return value;
        }
        const letter = typeof value === 'string' ? value.toLowerCase() : '';
        return letters.indexOf(letter) >= 0 ? letter : 'ArrowRight';
    }

    static label (value) {
        const key = KeyboardKeys.normalize(value);
        return symbols[key] || key.toUpperCase();
    }
}
