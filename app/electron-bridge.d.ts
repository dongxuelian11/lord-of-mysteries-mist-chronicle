export {};

type MistCredentialResult = {
  available: boolean;
  apiKey?: string;
  saved?: boolean;
  cleared?: boolean;
  error?: string;
};

declare global {
  interface Window {
    mistCredentials?: {
      load(): Promise<MistCredentialResult>;
      save(apiKey: string): Promise<MistCredentialResult>;
      clear(): Promise<MistCredentialResult>;
    };
  }
}
