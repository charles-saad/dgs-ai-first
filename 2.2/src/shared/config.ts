export function getEnv(name: string): string | undefined {
  return process.env[name];
}

export function isAzureConfigured(): boolean {
  return Boolean(
    getEnv('AZURE_SEARCH_ENDPOINT') &&
      getEnv('AZURE_SEARCH_INDEX') &&
      getEnv('AZURE_SEARCH_API_KEY') &&
      getEnv('AZURE_OPENAI_ENDPOINT') &&
      getEnv('AZURE_OPENAI_API_KEY') &&
      getEnv('AZURE_OPENAI_DEPLOYMENT'),
  );
}
