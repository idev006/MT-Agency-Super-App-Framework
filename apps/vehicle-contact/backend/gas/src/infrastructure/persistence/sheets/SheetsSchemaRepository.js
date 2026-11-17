import { DATABASE_SCHEMA } from "../../../domain/ports/SchemaRepository.js";
import { compareSchema } from "../../../application/schema-sync/CompareSchema.js";
// This adapter inspects ONLY worksheet names/header row; no row data is returned.
export function createSheetsSchemaRepository(spreadsheetApp, spreadsheetId) {
  if (!spreadsheetApp || typeof spreadsheetApp.openById !== "function") throw new Error("Spreadsheet adapter missing");
  if (!spreadsheetId) throw new Error("VEHICLE_SHEET_ID not configured");
  return Object.freeze({
    verifyHeaders() {
      const book=spreadsheetApp.openById(spreadsheetId);
      const observed={};
      for(const sheet of book.getSheets()) {
        const name=sheet.getName(),lastColumn=sheet.getLastColumn();
        observed[name]=lastColumn>0 ? sheet.getRange(1,1,1,lastColumn).getDisplayValues()[0] : [];
      }
      const diff=compareSchema(DATABASE_SCHEMA,observed);
      return {ok:diff.match,mismatches:diff.changes};
    }
  });
}
