// Builds a local, bridge-only GAS candidate and a file-removal dry run. Never calls clasp.
import {build} from 'esbuild';
import {copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

const gas = resolve(import.meta.dirname, '..');
const backend = resolve(gas, '..');
const bridge = join(backend, 'gas-bridge');
const out = join(bridge, 'dist');
const files = ['MediaBridge.gs', 'appsscript.json'];
const source = join(bridge, 'src', 'WebApp.js');
const built = await build({entryPoints: [source], bundle: true, write: false, metafile: true,
  format: 'iife', globalName: 'P6VC_Bridge', platform: 'neutral', target: 'es2020',
  minifySyntax: true, legalComments: 'none', logLevel: 'silent'});
const sourceFiles = Object.keys(built.metafile.inputs).map(path => relative(backend, resolve(path)).replaceAll('\\', '/')).sort();
const expectedSources = ['gas-bridge/src/WebApp.js', 'gas/package.json',
  'gas/src/infrastructure/media/DrivePhotos.js', 'gas/src/infrastructure/media/MediaBridgeServer.js',
  'gas/src/infrastructure/media/MediaBridgeSignature.js'].sort();
if (JSON.stringify(sourceFiles) !== JSON.stringify(expectedSources))
  throw new Error('BRIDGE_DEPENDENCIES_CHANGED: ' + JSON.stringify(sourceFiles));
const compiled = built.outputFiles[0].text + '\nfunction doGet(e) { return P6VC_Bridge.doGet(e); }\n'
  + 'function doPost(e) { return P6VC_Bridge.doPost(e); }\n';
mkdirSync(out, {recursive: true});
writeFileSync(join(out, 'MediaBridge.gs'), compiled);
copyFileSync(join(gas, 'appsscript.json'), join(out, 'appsscript.json'));
const actual = readdirSync(out).sort();
if (JSON.stringify(actual) !== JSON.stringify(files.slice().sort()))
  throw new Error('BRIDGE_OUTPUT_HAS_EXTRA_FILES: ' + JSON.stringify(actual));
const currentFiles = readdirSync(join(gas, 'dist')).filter(name => name.endsWith('.gs')).sort();
const currentEntrypoints = [...readFileSync(join(gas, 'src/entrypoints/WebApp.js'), 'utf8')
  .matchAll(/^export function ([A-Za-z0-9_]+)/gm)].map(match => match[1]);
const report = {status: 'DRY_RUN_ONLY', currentGsCount: currentFiles.length, candidateGsCount: 1,
  candidateFiles: files, sourceFiles, removedRemoteFileNamesIfPublished: currentFiles,
  removedEditorEntrypointsIfPublished: currentEntrypoints.filter(name => !['doGet', 'doPost'].includes(name)),
  prerequisites: ['R10 core reference-seed job', 'R11 core admin provisioning/reset jobs and security review',
    'confirm old dailyDrivePhotoHousekeeping trigger is removed',
    'replace GAS full-API publish proof with bridge proof plus core suite',
    'owner confirmation after this exact remote-file dry run']};
const results = join(bridge, 'test-results');
mkdirSync(results, {recursive: true});
writeFileSync(join(results, 'gas-bridge-dry-run.json'), JSON.stringify(report, null, 2) + '\n');
console.log('GAS_BRIDGE_DRY_RUN ' + JSON.stringify({currentGsCount: report.currentGsCount,
  candidateGsCount: report.candidateGsCount, removedEditorEntrypoints: report.removedEditorEntrypointsIfPublished.length,
  sourceFiles: report.sourceFiles, report: 'apps/vehicle-contact/backend/gas-bridge/test-results/gas-bridge-dry-run.json'}));
