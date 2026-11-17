// GAS runtime bridges only. Public data operations are NOT enabled.
function doGet(e) {
  return gasJson_(apiDispatch_({apiVersion:"v1",group:"system",action:"health",payload:{}}, "GET"));
}
function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== "string" || e.postData.contents.length > 8192) {
      return gasJson_(apiFailure_("BAD_REQUEST","Missing or oversized request",null));
    }
    var req = JSON.parse(e.postData.contents);
    return gasJson_(apiDispatch_(req,"POST"));
  } catch (_) { return gasJson_(apiFailure_("BAD_REQUEST","Malformed request",null)); }
}
function gasJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
