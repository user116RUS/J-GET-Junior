// Run with node test/sound-client.js.
// Execute the real Electron renderer bridge with a fake audio device and IPC.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main() {
    const completed = [];
    const pendingTimers = [];
    const requests = [];
    const sounds = [];
    class Audio {
        constructor(url) {
            this.src = url;
            this.currentTime = 0;
            this.playCalls = [];
            this.pauseCount = 0;
            this.result = () => Promise.resolve();
            sounds.push(this);
        }
        play() { this.playCalls.push(this.currentTime); return this.result(); }
        pause() { this.pauseCount++; }
    }
    const electron = {
        ipcRenderer: {
            on() {},
            send() {},
            sendSync(channel, name) {
                requests.push([channel, name]);
                assert.strictEqual(channel, 'io_getAudioData');
                return name === 'missing.wav' ? null : 'data:audio/wav;base64,UklGRg==';
            }
        },
        webFrame: {setVisualZoomLevelLimits() {}, setLayoutZoomLevelLimits() {}},
        remote: {getCurrentWebContents: () => ({browserWindowOptions: {isDebug: false}})}
    };
    const context = vm.createContext({
        require(name) { assert.strictEqual(name, 'electron'); return electron; },
        console,
        window: {Audio},
        navigator: {mediaDevices: {getUserMedia() {}}},
        iOS: {soundDone: name => completed.push(name)},
        setTimeout(callback) { pendingTimers.push(callback); }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/electronClient.js'), 'utf8'), context,
        {filename: 'electronClient.js'});
    const client = context.window.tablet;
    const settle = async () => {
        // play().then().catch() takes two microtask turns before its error callback.
        await Promise.resolve();
        await Promise.resolve();
        while (pendingTimers.length) pendingTimers.shift()();
    };
    client.io_registersound('', 'library/cat.wav');
    assert.strictEqual(sounds.length, 1);
    assert.strictEqual(sounds[0].volume, 0.8);
    client.io_registersound('', 'library/cat.wav');
    assert.strictEqual(sounds.length, 1, 're-registering a loaded sound reuses it');
    assert.strictEqual(requests.length, 1);
    const audio = sounds[0];
    assert.strictEqual(client.io_getsoundsource('library/cat.wav'), audio.src);
    assert.strictEqual(requests.length, 1, 'previewing cached audio does not re-read storage');
    const uncachedSource = client.io_getsoundsource('library/dog.wav');
    assert.strictEqual(uncachedSource, 'data:audio/wav;base64,UklGRg==',
        'uncached native previews receive audio data, not a file path');
    assert.strictEqual(client.currentAudio['library/dog.wav'].src, uncachedSource);
    assert.strictEqual(requests.length, 2, 'uncached preview registers its audio exactly once');
    assert.strictEqual(client.io_getsoundsource('missing.wav'), null, 'missing audio provides no misleading file URL');

    audio.currentTime = 1.5;
    client.io_playsound('library/cat.wav');
    assert.deepStrictEqual(audio.playCalls, [0], 'every play begins at the start');
    await settle();
    assert.deepStrictEqual(completed, [], 'starting a sound does not advance the script');
    audio.onended();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav'], 'normal ending advances the script');

    audio.currentTime = 0.7;
    client.io_stopsound('library/cat.wav');
    assert.strictEqual(audio.pauseCount, 1);
    assert.strictEqual(audio.currentTime, 0, 'stop rewinds audio before the next run');
    assert.deepStrictEqual(completed, [], 'stopping does not signal completion to unrelated runs');

    audio.result = () => Promise.reject(new Error('unsupported audio codec'));
    client.io_playsound('library/cat.wav');
    await settle();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav'], 'rejected play cannot stall the next block');

    audio.result = () => { throw new Error('audio device unavailable'); };
    client.io_playsound('library/cat.wav');
    assert.deepStrictEqual(completed, [], 'synchronous exceptions complete after Sound.play marks the sound playing');
    await settle();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav']);

    audio.result = () => undefined;
    client.io_playsound('library/cat.wav');
    await settle();
    assert.deepStrictEqual(completed, [], 'older Audio implementations without a play promise remain supported');
    audio.onerror();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav'], 'decode errors release the waiting script');

    let rejectInterrupted;
    audio.result = () => new Promise((resolve, reject) => { rejectInterrupted = reject; });
    client.io_playsound('library/cat.wav');
    client.io_stopsound('library/cat.wav');
    audio.result = () => Promise.resolve();
    client.io_playsound('library/cat.wav');
    rejectInterrupted(new Error('AbortError: first playback interrupted by pause'));
    await settle();
    assert.deepStrictEqual(completed, [], 'an interrupted play promise cannot finish a newer playback');
    audio.onended();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav']);

    audio.result = () => { throw new Error('failed previous run'); };
    client.io_playsound('library/cat.wav');
    audio.result = () => Promise.resolve();
    client.io_playsound('library/cat.wav');
    await settle();
    assert.deepStrictEqual(completed, [], 'a deferred exception cannot finish a newer playback');
    audio.onended();
    assert.deepStrictEqual(completed.splice(0), ['library/cat.wav']);

    audio.result = () => new Promise((resolve, reject) => { rejectInterrupted = reject; });
    client.io_playsound('library/cat.wav');
    client.io_stopsound('library/cat.wav');
    rejectInterrupted(new Error('AbortError: playback cancelled'));
    await settle();
    assert.deepStrictEqual(completed, [], 'stop invalidates a pending playback failure');

    client.io_playsound('not-registered.wav');
    assert.deepStrictEqual(completed, [], 'missing audio also finishes asynchronously');
    await settle();
    assert.deepStrictEqual(completed.splice(0), ['not-registered.wav']);
    assert.doesNotThrow(() => client.io_stopsound('not-registered.wav'));
    client.io_registersound('', 'missing.wav');
    assert.strictEqual(client.currentAudio['missing.wav'], undefined);
    client.io_playsound('missing.wav');
    await settle();
    assert.deepStrictEqual(completed.splice(0), ['missing.wav']);
    console.log('PASS: renderer audio restart/stop, normal end, failures, restart/cancellation races, decode errors, legacy play and missing audio');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
