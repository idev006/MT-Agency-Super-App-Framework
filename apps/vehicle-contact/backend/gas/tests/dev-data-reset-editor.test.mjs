// Offline tests for the editor-only synthetic DEV truncate (Mode B). No real Sheets access.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {resetDevData, DEV_RESET_PRESERVE_TABLES} from '../src/infrastructure/persistence/sheets/DevDataReset.js';

const NAMES = Object.keys(DATABASE_SCHEMA.tables);
const PRESERVE = new Set(DEV_RESET_PRESERVE_TABLES);

function createFakeBook({rows = 2, driftTable = null, missingTable = null, failClearTable = null} = {}) {
  const order = [];
  const sheets = new Map();
  for (const name of NAMES) {
    if (name === missingTable) continue;
    const columns = DATABASE_SCHEMA.tables[name].columns;
    const header = columns.map(c => c.name);
    const data = Array.from({length: rows}, (_, r) => columns.map((c, j) => `${name}:${r}:${j}`));
    const calls = {clearContent: 0, clearedRange: null};
    const lastCol = name === driftTable ? columns.length - 1 : columns.length;
    sheets.set(name, {
      getLastRow: () => 1 + rows,
      getLastColumn: () => lastCol,
      getRange: (row, col, numRows, numCols) => ({
        getDisplayValues: () => { order.push('read:' + name); return [header.slice(0, numCols)]; },
        getValues: () => { order.push('read:' + name); return data.slice(row - 2, row - 2 + numRows).map(r => r.slice(0, numCols)); },
        clearContent: () => {
          order.push('clear:' + name); calls.clearContent++; calls.clearedRange = {row, numRows};
          if (name === failClearTable) throw new Error('CLEAR_FAILED');
        },
      }),
      _calls: calls,
    });
  }
  const book = {getSheetByName: name => sheets.get(name) || null};
  return {
    order, sheets,
    spreadsheetApp: {openById: () => book},
    spreadsheetId: 'dev-sheet',
    lockService: {getScriptLock: () => ({tryLock: () => true, releaseLock: () => {}})},
  };
}

test('OK: clears 15 transactional tables, preserves 10, headers untouched, backup before clear', () => {
  const fake = createFakeBook({rows: 2});
  const result = resetDevData(fake);
  assert.equal(result.status, 'OK');
  assert.equal(result.clearedTables.length, NAMES.length - PRESERVE.size);
  assert.equal(result.preservedTables.length, PRESERVE.size);
  assert.equal(result.totalRowsCleared, (NAMES.length - PRESERVE.size) * 2);
  assert.equal(result.backupRows, NAMES.length * 2);
  // every read happens before the first clear (backup captured before mutation)
  const firstClear = fake.order.findIndex(x => x.startsWith('clear:'));
  const lastRead = fake.order.map((x, i) => x.startsWith('read:') ? i : -1).filter(i => i >= 0).pop();
  assert.ok(lastRead < firstClear, 'backup read before any clear');
  // preserve tables never cleared; clear ranges start at row 2 (header preserved)
  for (const name of PRESERVE) assert.equal(fake.sheets.get(name)._calls.clearContent, 0, name + ' preserved');
  for (const [name, sheet] of fake.sheets) if (!PRESERVE.has(name)) {
    assert.equal(sheet._calls.clearContent, 1);
    assert.equal(sheet._calls.clearedRange.row, 2);
  }
  // backup holds original row values for every table
  assert.equal(result.backup.vc_vehicles.length, 2);
  assert.equal(result.backup.vc_users.length, 2);
});

test('schema drift fails closed with zero clears', () => {
  const fake = createFakeBook({rows: 2, driftTable: 'vc_vehicles'});
  const result = resetDevData(fake);
  assert.equal(result.status, 'SCHEMA_DRIFT');
  assert.equal(result.totalRowsCleared, 0);
  assert.ok(result.drift.some(d => d.name === 'vc_vehicles'));
  assert.ok(fake.order.every(x => x.startsWith('read:')), 'no clear on drift');
});

test('missing table fails closed', () => {
  const fake = createFakeBook({rows: 2, missingTable: 'vc_qr_tokens'});
  const result = resetDevData(fake);
  assert.equal(result.status, 'SCHEMA_DRIFT');
  assert.ok(result.drift.some(d => d.name === 'vc_qr_tokens' && d.skipped === 'MISSING_TABLE'));
  assert.equal(result.totalRowsCleared, 0);
});

test('injected mid-clear failure returns PARTIAL_FAILURE with full backup', () => {
  const fake = createFakeBook({rows: 2, failClearTable: 'vc_vehicle_photos'});
  const result = resetDevData(fake);
  assert.equal(result.status, 'PARTIAL_FAILURE');
  assert.equal(result.failedTable, 'vc_vehicle_photos');
  assert.equal(result.backupRows, NAMES.length * 2); // backup complete despite failure
  assert.ok(result.backup.vc_vehicle_photos.length === 2);
  // the failed table was not counted as cleared
  assert.ok(!result.clearedTables.some(c => c.name === 'vc_vehicle_photos'));
});

test('idempotent: empty tables clear zero rows', () => {
  const fake = createFakeBook({rows: 0});
  const result = resetDevData(fake);
  assert.equal(result.status, 'OK');
  assert.equal(result.totalRowsCleared, 0);
  assert.equal(result.backupRows, 0);
});

test('guards: missing deps and busy lock', () => {
  assert.throws(() => resetDevData({}), /STORAGE_NOT_CONFIGURED/);
  const fake = createFakeBook({rows: 1});
  fake.lockService = {getScriptLock: () => ({tryLock: () => false, releaseLock: () => {}})};
  assert.throws(() => resetDevData(fake), /BUSY/);
});

test('preserve list covers identity/config/reference and excludes transactional tables', () => {
  for (const t of ['vc_users', 'vc_roles', 'vc_settings', 'vc_reference_values', 'vc_migration_journal', 'vc_organizations'])
    assert.ok(PRESERVE.has(t), t + ' must be preserved');
  for (const t of ['vc_vehicles', 'vc_vehicle_contacts', 'vc_qr_tokens', 'vc_sessions', 'vc_operation_journal'])
    assert.ok(!PRESERVE.has(t), t + ' must be clearable');
  assert.equal(PRESERVE.size + (NAMES.length - PRESERVE.size), NAMES.length);
});