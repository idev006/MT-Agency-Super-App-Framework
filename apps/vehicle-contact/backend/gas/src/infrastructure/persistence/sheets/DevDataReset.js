import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// Editor-only synthetic DEV clean-slate truncate (Mode B). Clears DATA ROWS only on
// transactional tables, preserving headers/schema and all identity/config/reference/
// migration-history tables. Captures a full row backup BEFORE any mutation so the clear
// is reversible. Fails closed on schema drift. Never callable over doGet/doPost; the
// wrapper enforces an exact script-property approval gate. Not a retention/deletion path.
export const DEV_RESET_PRESERVE_TABLES = Object.freeze([
  'vc_users', 'vc_user_identities', 'vc_roles', 'vc_user_roles', 'vc_role_permissions',
  'vc_user_permissions', 'vc_organizations', 'vc_settings', 'vc_reference_values', 'vc_migration_journal',
]);

function inspectTable(book, name) {
  const columns = DATABASE_SCHEMA.tables[name].columns;
  const sheet = book.getSheetByName(name);
  if (!sheet) return {name, skipped: 'MISSING_TABLE'};
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastCol !== columns.length) return {name, skipped: 'SCHEMA_MISMATCH', lastCol, expected: columns.length};
  if (lastRow < 1) return {name, skipped: 'SCHEMA_MISMATCH', reason: 'NO_HEADER'};
  const headers = sheet.getRange(1, 1, 1, columns.length).getDisplayValues()[0].map(String);
  if (headers.some((h, i) => h !== columns[i].name)) return {name, skipped: 'SCHEMA_MISMATCH', reason: 'HEADER'};
  const dataRows = Math.max(0, lastRow - 1);
  const values = dataRows > 0 ? sheet.getRange(2, 1, dataRows, columns.length).getValues() : [];
  return {name, sheet, columns, dataRows, values};
}

export function resetDevData({spreadsheetApp, spreadsheetId, lockService}) {
  if (!spreadsheetApp || !spreadsheetId || !lockService) throw new Error('STORAGE_NOT_CONFIGURED');
  const lock = lockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('BUSY');
  try {
    const book = spreadsheetApp.openById(spreadsheetId);
    const preserve = new Set(DEV_RESET_PRESERVE_TABLES);
    const inspected = [], backup = {};
    for (const name of Object.keys(DATABASE_SCHEMA.tables)) {
      const info = inspectTable(book, name);
      inspected.push(info);
      if (!info.skipped) backup[name] = info.values;
    }
    const drift = inspected.filter(i => i.skipped);
    if (drift.length) {
      return {status: 'SCHEMA_DRIFT', drift: drift.map(d => ({name: d.name, skipped: d.skipped})),
        clearedTables: [], preservedTables: [], totalRowsCleared: 0, backupRows: 0};
    }
    const clearedTables = [], preservedTables = [];
    let totalRowsCleared = 0;
    const backupRows = Object.values(backup).reduce((n, rows) => n + rows.length, 0);
    for (const info of inspected) {
      if (preserve.has(info.name)) { preservedTables.push(info.name); continue; }
      if (info.dataRows === 0) { clearedTables.push({name: info.name, rowsCleared: 0}); continue; }
      try {
        info.sheet.getRange(2, 1, info.dataRows, info.columns.length).clearContent();
      } catch (error) {
        return {status: 'PARTIAL_FAILURE', failedTable: info.name,
          reason: String(error?.message || error).slice(0, 120), clearedTables, preservedTables,
          totalRowsCleared, backupRows, backup};
      }
      clearedTables.push({name: info.name, rowsCleared: info.dataRows});
      totalRowsCleared += info.dataRows;
    }
    return {status: 'OK', clearedTables, preservedTables, totalRowsCleared, backupRows, backup};
  } finally {
    lock.releaseLock();
  }
}