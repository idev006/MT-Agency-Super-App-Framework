export function validateApiRequest(req) {
  if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("Invalid request");
  if (req.apiVersion !== "v1") throw new Error("Unsupported version");
  if (typeof req.group !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(req.group)) throw new Error("Invalid group");
  if (typeof req.action !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(req.action)) throw new Error("Invalid action");
  if (req.payload !== undefined && (!req.payload || typeof req.payload !== "object" || Array.isArray(req.payload))) throw new Error("Invalid payload");
}
