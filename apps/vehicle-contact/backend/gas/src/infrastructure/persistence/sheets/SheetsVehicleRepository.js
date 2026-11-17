// Read-only Sheets adapter. Authentication and authorization are enforced by the API layer.
export function createSheetsVehicleRepository(spreadsheetApp, spreadsheetId) {
  if (!spreadsheetApp || typeof spreadsheetApp.openById !== "function" || !spreadsheetId) throw new Error("STORAGE_NOT_CONFIGURED");
  function read(table, required) {
    const sheet = spreadsheetApp.openById(spreadsheetId).getSheetByName(table);
    if (!sheet) throw new Error("MISSING_TABLE");
    const values = sheet.getDataRange().getValues();
    if (!values.length) throw new Error("MISSING_HEADERS");
    const headers = values[0].map(String);
    if (headers.some(h => !h) || new Set(headers).size !== headers.length || required.some(h => !headers.includes(h))) throw new Error("SCHEMA_MISMATCH");
    return values.slice(1).filter(row => row.some(v => v !== "" && v !== null)).map(row => Object.fromEntries(headers.map((h,i) => [h,row[i]])));
  }
  const vehicles = () => read("vc_vehicles",["vehicle_id","plate_normalized","province_code","status"]);
  const normalizePlate = p => {
    if (typeof p !== "string") throw new Error("INVALID_PLATE");
    const value = p.normalize("NFKC").replace(/[\s\-]/g,"").toUpperCase();
    if (!value || value.length > 24) throw new Error("INVALID_PLATE");
    return value;
  };
  const normalizeProvince = p => {
    if (typeof p !== "string" || !/^[A-Z0-9-]{2,24}$/.test(p)) throw new Error("INVALID_PROVINCE");
    return p;
  };
  const getVehicle = id => {
    if (typeof id !== "string" || !id.trim()) throw new Error("INVALID_VEHICLE_ID");
    return vehicles().find(v => v.status === "ACTIVE" && v.vehicle_id === id) || null;
  };
  return Object.freeze({
    lookupByBusinessKey(key) {
      if (typeof key !== "string" || !key.includes("|")) throw new Error("INVALID_BUSINESS_KEY");
      const pos = key.lastIndexOf("|");
      const plate = normalizePlate(key.slice(0,pos)), province = normalizeProvince(key.slice(pos+1));
      const found = vehicles().filter(v => v.status === "ACTIVE" && v.plate_normalized === plate && v.province_code === province);
      if (found.length > 1) throw new Error("DUPLICATE_ACTIVE_VEHICLE");
      return found[0] || null;
    },
    getVehicle,
    getVehicleHistory(vehicleId) {
      if (!getVehicle(vehicleId)) return [];
      return read("vc_change_audit",["entity_type","entity_id","action","created_at"])
        .filter(a => a.entity_type === "vehicle" && a.entity_id === vehicleId)
        .sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));
    }
  });
}