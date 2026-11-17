// Manual admin-only entrypoint in Apps Script Editor: configure Script Property VEHICLE_SHEET_ID.
// Never expose schema verification as a public API operation.
function verifyVehicleSchemaFromEditor() {
  var id=PropertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
  var result=verifySchemaUseCase_(makeSheetsSchemaRepository_(id));
  Logger.log(JSON.stringify({ok:result.ok,mismatches:result.mismatches}));
  return result;
}
