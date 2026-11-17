// Pure compare: physical observed headers vs canonical dictionary; no writes, no automatic approval.
export function compareSchema(dictionary, actualTables) {
  if (!dictionary || !dictionary.tables || !actualTables) throw new Error("Invalid schema comparison input");
  const changes = [];
  for (const [table, definition] of Object.entries(dictionary.tables)) {
    const expected = definition.columns.map(c=>c.name);
    const actual = actualTables[table];
    if (!actual) { changes.push({table,kind:"MISSING_TABLE",severity:"BLOCKING"}); continue; }
    const seen = new Set();
    actual.forEach((name,index)=>{
      if (!name) {changes.push({table,kind:"BLANK_HEADER",columnIndex:index+1,severity:"BLOCKING"});return;}
      if (seen.has(name)) changes.push({table,kind:"DUPLICATE_HEADER",column:name,severity:"BLOCKING"});
      seen.add(name);
      if (!expected.includes(name)) changes.push({table,kind:"UNDECLARED_COLUMN",column:name,columnIndex:index+1,severity:"PROPOSAL"});
    });
    expected.forEach(name=>{if (!actual.includes(name)) changes.push({table,kind:"MISSING_COLUMN",column:name,severity:"BLOCKING"});});
    if (expected.length === actual.length && expected.every(name=>actual.includes(name)) && expected.some((name,i)=>name!==actual[i])) {
      changes.push({table,kind:"REORDERED_COLUMNS",severity:"REVIEW"});
    }
  }
  for (const table of Object.keys(actualTables)) {
    if (!(table in dictionary.tables)) changes.push({table,kind:"UNDECLARED_TABLE",severity:"PROPOSAL"});
  }
  return {schemaId:dictionary.schemaId,version:dictionary.schemaVersion,match:changes.length===0,changes};
}
