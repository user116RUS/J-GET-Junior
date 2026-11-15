import sounds from './sound-library-data';

const entries = [{id: 'pop.mp3', name: 'Хлопок', shortName: 'Хлопок', category: 'Эффекты'}].concat(sounds);

export default class SoundLibrary {
    static get entries () {
        return entries;
    }

    static has (id) {
        return entries.some(sound => sound.id === id);
    }

    static get (id) {
        return entries.filter(sound => sound.id === id)[0] ||
            {id, name: id, shortName: id.split('/').pop().split('.')[0]};
    }
}
