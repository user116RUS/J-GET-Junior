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

    // Built-in choices belong to the project, not to a sprite's indexed
    // recording array. Inserting them there would change playusersnd arguments.
    static selected (stage) {
        const result = [];
        const list = stage && Array.isArray(stage.librarySounds) ? stage.librarySounds : [];
        list.forEach(id => {
            if (id !== 'pop.mp3' && SoundLibrary.has(id) && result.indexOf(id) < 0) result.push(id);
        });
        return result;
    }

    static remember (stage, id) {
        if (!stage || id === 'pop.mp3' || !SoundLibrary.has(id)) return false;
        const list = SoundLibrary.selected(stage);
        if (list.indexOf(id) >= 0) return false;
        stage.librarySounds = list.concat(id);
        return true;
    }

    static fromProject (data) {
        const stage = {librarySounds: SoundLibrary.selected(data)};
        const visit = item => {
            if (!Array.isArray(item)) return;
            if (item[0] === 'playsnd') SoundLibrary.remember(stage, item[1]);
            item.forEach(child => { if (Array.isArray(child)) visit(child); });
        };
        // Seed the palette for projects saved before librarySounds existed.
        // Also retain sounds from imported/copied scripts in newer projects.
        (data.pages || []).forEach(pageId => {
            const page = data[pageId];
            if (!page || !Array.isArray(page.sprites)) return;
            page.sprites.forEach(spriteId => {
                const sprite = page[spriteId];
                if (!sprite) return;
                (sprite.sounds || []).forEach(id => SoundLibrary.remember(stage, id));
                visit(sprite.scripts);
            });
        });
        return stage.librarySounds;
    }
}
