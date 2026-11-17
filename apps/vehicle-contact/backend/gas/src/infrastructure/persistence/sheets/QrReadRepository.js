export function createQrReadRepository(spreadsheetApp, spreadsheetId, sha256) {
  if (!spreadsheetApp || typeof spreadsheetApp.openById !== 'function' || !spreadsheetId || typeof sha256 !== 'function')
    throw new Error('QR_STORAGE_NOT_CONFIGURED');
  return Object.freeze({
    resolveQr(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('INVALID_QR_TOKEN');
      const digest = sha256(token.toLowerCase());
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) throw new Error('INVALID_QR_DIGEST');
      const book = spreadsheetApp.openById(spreadsheetId);
      const qrSheet = book.getSheetByName('vc_qr_tokens');
      const vehicleSheet = book.getSheetByName('vc_vehicles');
      if (!qrSheet || !vehicleSheet) throw new Error('SCHEMA_MISMATCH');
      function rows(sheet, required) {
        const values = sheet.getDataRange().getValues();
        if (!values.length) throw new Error('SCHEMA_MISMATCH');
        const headers = values[0].map(String);
        if (headers.some(h => !h) || new Set(headers).size !== headers.length || required.some(h => !headers.includes(h)))
          throw new Error('SCHEMA_MISMATCH');
        return values.slice(1).filter(row => row.some(v => v !== '' && v !== null))
          .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
      }
      const tokens = rows(qrSheet, ['vehicle_id','token_digest','status']);
      const matches = tokens.filter(t => t.status === 'ACTIVE' && String(t.token_digest).toLowerCase() === digest.toLowerCase());
      if (matches.length > 1) throw new Error('DUPLICATE_ACTIVE_QR');
      if (!matches.length) return null;
      const vehicles = rows(vehicleSheet, ['vehicle_id','status']);
      const matched = vehicles.filter(v => v.vehicle_id === matches[0].vehicle_id && v.status === 'ACTIVE');
      if (matched.length > 1) throw new Error('DUPLICATE_ACTIVE_VEHICLE');
      if (!matched.length) return null;
      return {vehicleId:matched[0].vehicle_id, status:matched[0].status};
    }
  });
}
