// The GAS manifest asks only for what the code uses (least privilege, one source: the code).
// Sheets was removed by S1 (VC-ADR-029); its scope went with the dead-code cleanup (VC-ADR-044).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const code = walk(path.join(root, 'src')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
// scope → the Apps Script services that need it
const NEEDS = {
  'https://www.googleapis.com/auth/drive': ['DriveApp'],
  'https://www.googleapis.com/auth/script.external_request': ['UrlFetchApp'],
  'https://www.googleapis.com/auth/script.storage': ['PropertiesService'],
  'https://www.googleapis.com/auth/spreadsheets': ['SpreadsheetApp']
};

test('GAS-SCOPE-01 every manifest scope is used by the code, and every used service has its scope', () => {
  for (const scope of manifest.oauthScopes) {
    assert.ok(NEEDS[scope], 'unknown scope in appsscript.json: ' + scope);
    assert.ok(NEEDS[scope].some(s => new RegExp('\\b' + s + '\\b').test(code)), 'scope not used by any code: ' + scope);
  }
  for (const [scope, services] of Object.entries(NEEDS))
    if (services.some(s => new RegExp('\\b' + s + '\\.').test(code))) assert.ok(manifest.oauthScopes.includes(scope), 'code uses ' + services + ' but the manifest lacks ' + scope);
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'), false, 'Sheets is gone (S1)');
});
