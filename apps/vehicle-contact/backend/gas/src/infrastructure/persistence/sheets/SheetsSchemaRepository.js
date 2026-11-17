import { VEHICLE_SCHEMA_V1 } from "../../../domain/ports/SchemaRepository.js";

// Infrastructure owns the only SpreadsheetApp API calls. Inject the platform for tests.
export function createSheetsSchemaRepository(spreadsheetApp, spreadsheetId) {
  if (!spreadsheetApp || typeof spreadsheetApp.openById !== "function") throw new Error("Spreadsheet adapter missing");
  if (!spreadsheetId) throw new Error("VEHICLE_SHEET_ID not configured");
  return {
    verifyHeaders() {
      const book = spreadsheetApp.openById(spreadsheetId);
      const mismatches = [];
      for (const [name, expected] of Object.entries(VEHICLE_SCHEMA_V1)) {
        const sheet = book.getSheetByName(name);
        if (!sheet) { mismatches.push({table:name,reason:"MISSING_TAB"}); continue; }
        const actual = sheet.getRange(1,1,1,expected.length).getDisplayValues()[0];
        if (JSON.stringify(actual)!==JSON.stringify(expected)) mismatches.push({table:name,reason:"HEADER_MISMATCH"});
      }
      return {ok:mismatches.length===0,mismatches};
    }
  };
}
