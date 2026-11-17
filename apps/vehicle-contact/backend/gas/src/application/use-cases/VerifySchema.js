function verifySchemaUseCase_(repository) {
  if (!repository || typeof repository.verifyHeaders !== "function") throw Error("Repository port missing");
  return repository.verifyHeaders();
}
