// Application accepts a repository port, not a Google Sheets implementation.
export function verifySchemaUseCase(repository) {
  if (!repository || typeof repository.verifyHeaders !== "function") throw new Error("Repository port missing");
  return repository.verifyHeaders();
}
