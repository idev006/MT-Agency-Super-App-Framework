// Editor-only, injected SpreadsheetApp adapter. No network route or automatic invocation.
export function createSheetsMigrationAdapter(spreadsheetApp,spreadsheetId){
 if(!spreadsheetApp||typeof spreadsheetApp.openById!=='function'||!spreadsheetId) throw new Error('MIGRATION_ADAPTER_UNCONFIGURED');
 return Object.freeze({
  inspect(){
   const book=spreadsheetApp.openById(spreadsheetId),out={};
   for(const sheet of book.getSheets()){
    const width=sheet.getLastColumn();
    out[sheet.getName()]=width?sheet.getRange(1,1,1,width).getDisplayValues()[0]:[];
   }
   return out;
  },
  // Apply only after independent authorization, backup, locking, journal and staging verification.
  // Deliberately unavailable until these controls are implemented and tested.
  apply(){throw new Error('MIGRATION_EXECUTOR_NOT_AUTHORIZED');}
 });
}
