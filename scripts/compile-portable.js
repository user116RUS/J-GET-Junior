// Update the Electron 1.8 production cache as well as the installed sources.
// Plain source replacements alone are ignored by electron-compile in production.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const babel = require('babel-core');
const assert = require('assert');

const app = path.resolve(process.argv[2]);
const root = path.join(__dirname, '..');
const cache = path.join(app, '.cache');
const indexFile = path.join(cache, 'compiler-info.json.gz');
const index = JSON.parse(zlib.gunzipSync(fs.readFileSync(indexFile)));
const entries = index.fileChangeCache.changeCache;
const mainEntry = entries['/src/main.js'];
const jsCache = fs.readdirSync(cache).find(dir => fs.existsSync(path.join(cache, dir, mainEntry.info.hash)));
const textEntry = entries['/src/app/css/editor.css'];
const textCache = fs.readdirSync(cache).find(dir => fs.existsSync(path.join(cache, dir, textEntry.info.hash)));
const htmlEntry = entries['/src/app/index.html'];
const htmlCache = fs.readdirSync(cache).find(dir => fs.existsSync(path.join(cache, dir, htmlEntry.info.hash)));
assert(jsCache && htmlCache && babel.version === '6.26.0');
const options = {
    babelrc: false, sourceMaps: false,
    presets: [[require('babel-preset-env'), {targets: {electron: '1.8'}}], require('babel-preset-react')],
    plugins: [require('babel-plugin-transform-async-to-generator')]
};

function refresh(rel) {
    const src = path.join(root, rel);
    const dest = path.join(app, rel);
    if (fs.statSync(src).isDirectory()) {
        for (const name of fs.readdirSync(src)) refresh(path.posix.join(rel, name));
        return;
    }
    const extension = path.extname(rel);
    if (['.png', '.gif', '.icns', '.ico', '.wav', '.mp3', '.txt', '.md'].includes(extension)) {
        const bytes = fs.readFileSync(src);
        if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(bytes)) {
            fs.mkdirSync(path.dirname(dest), {recursive: true});
            fs.writeFileSync(dest, bytes);
            console.log('Copied ' + rel);
        }
        return;
    }
    const mimeTypes = {
        '.js': 'application/javascript', '.svg': 'image/svg+xml',
        '.css': 'text/css', '.json': 'application/json', '.html': 'text/html'
    };
    if (!mimeTypes[extension]) return;
    const source = fs.readFileSync(src, 'utf8');
    if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8').replace(/\r\n/g, '\n') === source.replace(/\r\n/g, '\n')) return;
    const javascript = extension === '.js';
    const code = javascript ? babel.transform(source, options).code : source;
    const hash = crypto.createHash('sha1').update(source).digest('hex');
    const output = {code, mimeType: mimeTypes[extension], dependentFiles: []};
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, source);
    fs.writeFileSync(path.join(cache, javascript ? jsCache : extension === '.html' ? htmlCache : textCache, hash), zlib.gzipSync(JSON.stringify(output)));
    entries['/' + rel] = {
        ctime: fs.statSync(dest).ctime.getTime(), size: Buffer.byteLength(source),
        info: Object.assign({}, mainEntry.info, {hash})
    };
    console.log('Compiled ' + rel);
}
refresh('src');
// These are upstream promotional assets removed from this derivative's sources.
// Never use a wildcard cleanup: installed projects and other files are unrelated.
const removedAssets = JSON.parse(fs.readFileSync(path.join(__dirname, 'removed-brand-assets.json')));
removedAssets.forEach(rel => {
    assert((rel.startsWith('src/') || rel.startsWith('docs/')) && !rel.split('/').includes('..'));
    if (rel.startsWith('src/')) assert(!fs.existsSync(path.join(root, rel)), 'Removed asset is still in source: ' + rel);
    const dest = path.join(app, rel);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    const oldEntry = entries['/' + rel];
    delete entries['/' + rel];
    if (!oldEntry || !oldEntry.info) return;
    const hash = oldEntry.info.hash;
    if (Object.keys(entries).some(key => entries[key].info && entries[key].info.hash === hash)) return;
    fs.readdirSync(cache).forEach(dir => {
        const cached = path.join(cache, dir, hash);
        if (fs.existsSync(cached) && fs.statSync(cached).isFile()) fs.unlinkSync(cached);
    });
});
// Old HTML/SVG cache payloads otherwise retain replaced artwork. A production
// lookup uses the final file index, so hashes absent from it are unreachable.
const referencedHashes = new Set(Object.keys(entries).filter(key => entries[key].info)
    .map(key => entries[key].info.hash));
fs.readdirSync(cache).forEach(dir => {
    const compilerDir = path.join(cache, dir);
    if (!fs.statSync(compilerDir).isDirectory()) return;
    fs.readdirSync(compilerDir).forEach(hash => {
        const payload = path.join(compilerDir, hash);
        if (/^[0-9a-f]{40}$/.test(hash) && !referencedHashes.has(hash) && fs.statSync(payload).isFile()) {
            fs.unlinkSync(payload);
        }
    });
});
// Copy the project notices and installation guide without shipping QA reports.
['README.md', 'LICENSE', 'TRADEMARKS', 'THIRD_PARTY_NOTICES.md', 'docs/Windows-класс.txt',
    'docs/Mac-установка.txt', 'docs/JGET-RELEASE.md', 'docs/SOUND-ASSETS.md'].forEach(rel => {
    if (!fs.existsSync(path.join(root, rel))) return;
    const dest = path.join(app, rel);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.copyFileSync(path.join(root, rel), dest);
});
fs.writeFileSync(indexFile, zlib.gzipSync(JSON.stringify(index)));
const manifest = path.join(app, 'package.json');
const pkg = JSON.parse(fs.readFileSync(manifest));
const sourcePkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
['name', 'productName', 'version', 'description', 'license', 'repository'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(sourcePkg, key)) pkg[key] = sourcePkg[key];
});
fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2));
