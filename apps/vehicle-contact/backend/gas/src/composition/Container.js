import { createApiRouter } from "../api/routes/Router.js";
import { createSheetsSchemaRepository } from "../infrastructure/persistence/sheets/SheetsSchemaRepository.js";
import { verifySchemaUseCase } from "../application/use-cases/VerifySchema.js";

// Manual composition root: dependencies are selected at runtime, outside domain/application.
export function createApplication(deps = {}) {
  const router = createApiRouter();
  return Object.freeze({
    dispatch: router.dispatch,
    verifySchema() {
      const id = deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
      return verifySchemaUseCase(createSheetsSchemaRepository(deps.spreadsheetApp, id));
    }
  });
}
