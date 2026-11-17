import { createApiRouter } from "../api/routes/Router.js";
import { createSheetsSchemaRepository } from "../infrastructure/persistence/sheets/SheetsSchemaRepository.js";
import { verifySchemaUseCase } from "../application/use-cases/VerifySchema.js";
import { DATABASE_SCHEMA } from "../domain/ports/SchemaRepository.js";
import { proposeSchemaChanges } from "../application/schema-sync/ProposeMigration.js";
export function createApplication(deps={}) {
  const router=createApiRouter();
  function schemaRepository() {
    const id=deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
    return createSheetsSchemaRepository(deps.spreadsheetApp,id);
  }
  return Object.freeze({
    dispatch:router.dispatch,
    verifySchema(){return verifySchemaUseCase(schemaRepository());},
    inspectSchemaDrift(){
      const result=verifySchemaUseCase(schemaRepository());
      return {schemaId:DATABASE_SCHEMA.schemaId,version:DATABASE_SCHEMA.schemaVersion,match:result.ok,changes:result.mismatches};
    },
    proposeSchemaDrift(){
      const result=this.inspectSchemaDrift();
      return proposeSchemaChanges(result);
    }
  });
}
