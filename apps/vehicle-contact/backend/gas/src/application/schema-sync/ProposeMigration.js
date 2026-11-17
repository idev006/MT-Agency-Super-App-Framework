// Offline/admin-only proposal. Does not call GitHub or mutate a spreadsheet.
export function proposeSchemaChanges(diff) {
  return {
    schemaId:diff.schemaId,baseVersion:diff.version,status:"REVIEW_REQUIRED",
    automaticMigration:false,generatedFrom:"HEADER_COMPARISON_ONLY",
    changes:diff.changes.map(c=>({...c,approval:"PENDING",inferredType:null})),
    nextStep:"Review data steward approval, privacy, validation, migration and tests; then modify GitHub SSOT via PR"
  };
}
