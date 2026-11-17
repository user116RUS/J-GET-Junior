// Verify a staged app against this checkout and a trusted, pre-change app.
// Usage: NODE_PATH=<Babel 6.26 node_modules> node test/packaging/verify.cjs
//        <app resources directory> <baseline resources directory> <report.json>
// Works with macOS Contents/Resources/app and Windows resources/app.
// The staged app is never modified. Reports contain repository-relative paths.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');
const babel = require('babel-core');

const [appArg, baselineArg, reportArg] = process.argv.slice(2);
assert(appArg && baselineArg && reportArg,
    'Usage: verify.cjs <app-resources> <baseline-resources> <report.json>');
const root = path.resolve(__dirname, '../..');
const app = path.resolve(appArg);
const baseline = path.resolve(baselineArg);
const cache = path.join(app, '.cache');
const index = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(cache, 'compiler-info.json.gz'))));
const entries = index.fileChangeCache.changeCache;
const cacheDirs = fs.readdirSync(cache).filter(name => fs.statSync(path.join(cache, name)).isDirectory());
const normalize = value => value.replace(/\r\n/g, '\n');
const read = name => fs.readFileSync(name, 'utf8');
const sha1 = bytes => crypto.createHash('sha1').update(bytes).digest('hex');
const textExtensions = new Set(['.js', '.css', '.svg', '.json', '.html']);
const notices = ['README.md', 'LICENSE', 'TRADEMARKS', 'THIRD_PARTY_NOTICES.md',
    'docs/Windows-класс.txt', 'docs/Mac-установка.txt', 'docs/JGET-RELEASE.md', 'docs/SOUND-ASSETS.md', 'docs/CHARACTER-RESTORATION.md', 'docs/PROJECT-SOUNDS.md', 'docs/RELEASE-NOTES-1.3.2-jget.3.md', 'docs/RELEASE-NOTES-1.3.2-jget.4.md'];
const options = {babelrc: false, sourceMaps: false,
    presets: [[require('babel-preset-env'), {targets: {electron: '1.8'}}], require('babel-preset-react')],
    plugins: [require('babel-plugin-transform-async-to-generator')]};
assert.equal(babel.version, '6.26.0', 'Use the same Babel major/minor as the app compiler');
const result = {version: null, sourceFiles: 0, extensions: {}, normalizedTextFiles: 0,
    exactBinaryFiles: 0, changedTextFiles: [], compiledJavaScript: 0,
    productionSyncLoads: 0, productionAsyncLoads: 0, removedAssets: 0, notices: [],
    orphanCachePayloads: [],
    privatePathScanFiles: 0, privatePathMatches: [], unexpectedProjectData: [], failures: []};

function check(condition, message) {
    if (!condition) result.failures.push(message);
}
function walk(dir) {
    const files = [];
    for (const name of fs.readdirSync(dir)) {
        const filename = path.join(dir, name);
        const stat = fs.lstatSync(filename);
        if (stat.isDirectory()) files.push(...walk(filename));
        else if (stat.isFile()) files.push(filename);
    }
    return files;
}

async function main() {
    const currentPackage = JSON.parse(read(path.join(root, 'package.json')));
    const packaged = JSON.parse(read(path.join(app, 'package.json')));
    result.version = packaged.version;
    check(packaged.version === currentPackage.version, 'Application version differs from source');
    check(packaged.name === 'j-get-junior' && packaged.productName === 'ScratchJGET', 'Wrong application product identity');
    for (const sourceFile of walk(path.join(root, 'src'))) {
        const rel = path.relative(root, sourceFile).split(path.sep).join('/');
        if (path.basename(sourceFile) === '.DS_Store') continue;
        const stagedFile = path.join(app, rel);
        const extension = path.extname(rel) || '(none)';
        result.sourceFiles++;
        result.extensions[extension] = (result.extensions[extension] || 0) + 1;
        if (!fs.existsSync(stagedFile)) { result.failures.push('Missing source resource: ' + rel); continue; }
        const sourceBytes = fs.readFileSync(sourceFile);
        const stagedBytes = fs.readFileSync(stagedFile);
        if (!textExtensions.has(extension)) {
            check(sourceBytes.equals(stagedBytes), 'Binary/text asset mismatch: ' + rel);
            result.exactBinaryFiles++;
            continue;
        }
        const source = sourceBytes.toString('utf8');
        check(normalize(source) === normalize(stagedBytes.toString('utf8')), 'Source text mismatch: ' + rel);
        result.normalizedTextFiles++;
        const baseFile = path.join(baseline, rel);
        if (fs.existsSync(baseFile) && normalize(read(baseFile)) === normalize(source)) continue;
        result.changedTextFiles.push(rel);
        const entry = entries['/' + rel];
        if (!entry || !entry.info) { result.failures.push('Missing changed-resource cache entry: ' + rel); continue; }
        check(entry.info.hash === sha1(sourceBytes), 'Stale changed-resource source hash: ' + rel);
        const payloadPath = cacheDirs.map(dir => path.join(cache, dir, entry.info.hash))
            .find(filename => fs.existsSync(filename));
        if (!payloadPath) { result.failures.push('Missing changed-resource cache payload: ' + rel); continue; }
        const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(payloadPath)));
        const expected = extension === '.js' ? babel.transform(source, options).code : source;
        check(payload.code === expected, 'Production cache code mismatch: ' + rel);
        if (extension === '.js') result.compiledJavaScript++;
    }
    const removed = JSON.parse(read(path.join(root, 'scripts/removed-brand-assets.json')));
    for (const rel of removed) {
        check(!fs.existsSync(path.join(app, rel)), 'Removed resource remains packaged: ' + rel);
        check(!entries['/' + rel], 'Removed resource remains indexed in cache: ' + rel);
        result.removedAssets++;
    }
    const referencedHashes = new Set(Object.values(entries).filter(entry => entry.info)
        .map(entry => entry.info.hash));
    for (const dir of cacheDirs) for (const name of fs.readdirSync(path.join(cache, dir))) {
        if (/^[a-f0-9]{40}$/.test(name) && !referencedHashes.has(name)) {
            result.orphanCachePayloads.push(dir + '/' + name);
        }
    }
    check(result.orphanCachePayloads.length === 0, 'Unreferenced production cache payloads remain packaged');
    for (const rel of notices) {
        if (!fs.existsSync(path.join(root, rel))) continue;
        check(fs.existsSync(path.join(app, rel)) && fs.readFileSync(path.join(root, rel))
            .equals(fs.readFileSync(path.join(app, rel))), 'Notice/guide mismatch: ' + rel);
        result.notices.push(rel);
    }
    const docs = path.join(app, 'docs');
    if (fs.existsSync(docs)) for (const file of walk(docs)) {
        const rel = path.relative(app, file).split(path.sep).join('/');
        check(notices.includes(rel), 'Unexpected inherited document: ' + rel);
    }
    const CompilerHost = require(path.join(app, 'node_modules/electron-compile/lib/compiler-host')).default;
    const syncHost = CompilerHost.createReadonlyFromConfigurationSync(cache, app);
    const asyncHost = await CompilerHost.createReadonlyFromConfiguration(cache, app);
    for (const rel of result.changedTextFiles) {
        // This Electron distribution reads JSON as raw data, outside the MIME compiler.
        if (rel.endsWith('.json')) continue;
        const source = read(path.join(root, rel));
        const expected = rel.endsWith('.js') ? babel.transform(source, options).code : source;
        try {
            check(syncHost.compileSync(path.join(app, rel)).code === expected, 'Synchronous production loader mismatch: ' + rel);
            result.productionSyncLoads++;
            check((await asyncHost.compile(path.join(app, rel))).code === expected, 'Asynchronous production loader mismatch: ' + rel);
            result.productionAsyncLoads++;
        } catch (error) { result.failures.push('Production loader rejected: ' + rel + ': ' + String(error.message)); }
    }
    const personalHome = process.env.HOME && Buffer.from(process.env.HOME + '/');
    for (const file of walk(app)) {
        const rel = path.relative(app, file).split(path.sep).join('/');
        const bytes = fs.readFileSync(file);
        result.privatePathScanFiles++;
        if (personalHome && bytes.includes(personalHome)) result.privatePathMatches.push(rel);
        if (/\.(sqllite|sqlite|sqlite3|db)$/i.test(file) || /(^|\/)(\.env|id_rsa|id_ed25519|last-error\.txt)$/.test(rel)) {
            result.unexpectedProjectData.push(rel);
        }
    }
    check(result.privatePathMatches.length === 0, 'Current user home path occurs in packaged files');
    check(result.unexpectedProjectData.length === 0, 'Unexpected project/private data files in application');
    result.passed = result.failures.length === 0;
    fs.writeFileSync(reportArg, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({passed: result.passed, sourceFiles: result.sourceFiles,
        changedTextFiles: result.changedTextFiles.length, compiledJavaScript: result.compiledJavaScript,
        productionSyncLoads: result.productionSyncLoads, productionAsyncLoads: result.productionAsyncLoads,
        failures: result.failures}, null, 2));
    if (!result.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
