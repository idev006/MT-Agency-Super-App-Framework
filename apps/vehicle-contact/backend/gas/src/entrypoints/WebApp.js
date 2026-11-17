import { createApplication } from "../composition/Container.js";
import { apiFailure } from "../api/responses/ResponseFactory.js";
function gasJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
export function doGet(e) {
  return gasJson(createApplication().dispatch({apiVersion:"v1",group:"system",action:"health",payload:{}},"GET"));
}
export function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string" || e.postData.contents.length>8192)
    return gasJson(apiFailure("BAD_REQUEST","Missing or oversized request",null));
  try {
    return gasJson(createApplication().dispatch(JSON.parse(e.postData.contents),"POST"));
  } catch (_) { return gasJson(apiFailure("BAD_REQUEST","Malformed request",null)); }
}
// Trusted Editor entrypoints only; NEVER expose these operations via doGet/doPost.
export function verifyVehicleSchemaFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const result=a.verifySchema();
  Logger.log(JSON.stringify(result));
  return result;
}
export function inspectVehicleSchemaDriftFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const diff=a.inspectSchemaDrift();
  Logger.log(JSON.stringify(diff));
  return diff;
}
export function proposeVehicleSchemaChangeFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const proposal=a.proposeSchemaDrift();
  Logger.log(JSON.stringify(proposal));
  return proposal;
}

// Run only from GAS Editor. Dry-run by default; no public HTTP access.
export function migrateVehicleSchemaFromEditor() {
 const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,lockService:LockService});
 const result=a.migrateSchema({dryRun:true});
 Logger.log(JSON.stringify(result));
 return result;
}
