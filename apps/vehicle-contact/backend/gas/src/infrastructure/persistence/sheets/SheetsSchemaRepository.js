// This adapter reads only schema headers; no confidential rows leave the spreadsheet.
function makeSheetsSchemaRepository_(spreadsheetId) {
  if (!spreadsheetId) throw Error("VEHICLE_SHEET_ID not configured");
  return { verifyHeaders:function() {
    var book = SpreadsheetApp.openById(spreadsheetId), mismatches=[];
    Object.keys(VEHICLE_SCHEMA_V1).forEach(function(name) {
      var sheet = book.getSheetByName(name), expected=VEHICLE_SCHEMA_V1[name];
      if (!sheet) {mismatches.push({table:name,reason:"MISSING_TAB"});return;}
      var actual=sheet.getRange(1,1,1,expected.length).getDisplayValues()[0];
      if (JSON.stringify(actual)!==JSON.stringify(expected)) mismatches.push({table:name,reason:"HEADER_MISMATCH"});
    });
    return {ok:mismatches.length===0,mismatches:mismatches};
  }};
}
