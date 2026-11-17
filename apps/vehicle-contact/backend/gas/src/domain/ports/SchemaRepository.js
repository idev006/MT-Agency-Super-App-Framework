// Canonical dictionary is apps/vehicle-contact/schema/database.schema.json.
// This module is a runtime projection. Do NOT hand-edit table headers here.
import dictionary from "../../../../../schema/database.schema.json" with { type: "json" };
export const DATABASE_SCHEMA = Object.freeze(dictionary);
export const VEHICLE_SCHEMA_V1 = Object.freeze(Object.fromEntries(
  Object.entries(DATABASE_SCHEMA.tables).map(([name, def]) => [name, def.columns.map(c=>c.name)])
));
