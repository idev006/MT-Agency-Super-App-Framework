// Inventory verification is a planning gate, NOT a deployment readiness claim.
export function auditApiInventory(inventory, supportedOperations) {
  if (!inventory || !Array.isArray(inventory.operations)) throw new TypeError('Invalid API inventory');
  const declared = inventory.operations.map(op => `${op.group}.${op.action}`);
  const supported = new Set(supportedOperations);
  const duplicates = declared.filter((name, index) => declared.indexOf(name) !== index);
  return Object.freeze({
    declaredCount: declared.length,
    implementedCount: declared.filter(name => supported.has(name)).length,
    missing: declared.filter(name => !supported.has(name)),
    extra: [...supported].filter(name => !declared.includes(name)),
    duplicates: [...new Set(duplicates)],
    ready: declared.length === 55 && duplicates.length === 0 && declared.every(name => supported.has(name)) && [...supported].every(name => declared.includes(name))
  });
}
