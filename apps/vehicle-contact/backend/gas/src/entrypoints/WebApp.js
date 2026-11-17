import { createApplication } from "../composition/Container.js";
import { apiFailure } from "../api/responses/ResponseFactory.js";

// GAS global entrypoints are emitted by the bundler footer; this module stays testable.
function gasJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
export function doGet(e) {
  return gasJson(createApplication().dispatch({apiVersion:"v1",group:"system",action:"health",payload:{}},"GET"));
}
export function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string" || e.postData.contents.length > 8192) {
    return gasJson(apiFailure("BAD_REQUEST","Missing or oversized request",null));
  }
  try {
    const req = JSON.parse(e.postData.contents);
    return gasJson(createApplication().dispatch(req,"POST"));
  } catch (_) {
    return gasJson(apiFailure("BAD_REQUEST","Malformed request",null));
  }
}
export function verifyVehicleSchemaFromEditor() {
  // Invoked by a trusted admin in Apps Script Editor, never through the API router.
  const result = createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp}).verifySchema();
  Logger.log(JSON.stringify({ok:result.ok,mismatches:result.mismatches}));
  return result;
}
