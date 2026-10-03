import type { ProviderAdapter } from "./provider-contract.js";

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    const id = adapter.identity.id.trim();
    if (!id) throw new Error("PROVIDER_ID_REQUIRED");
    if (this.adapters.has(id)) throw new Error("PROVIDER_ALREADY_REGISTERED");
    this.adapters.set(id, adapter);
  }

  resolve(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error("PROVIDER_NOT_REGISTERED");
    return adapter;
  }

  has(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  list(): readonly string[] {
    return [...this.adapters.keys()].sort();
  }
}
