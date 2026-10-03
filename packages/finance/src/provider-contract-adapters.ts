import type {
  ProviderAdapter,
  ProviderCallback,
  ProviderIdentity,
  ProviderPaymentCommand,
  ProviderPaymentResult,
  VerifiedProviderEvent
} from "./provider-contract.js";

export type ProviderAdapterTransport = {
  initiate(command: ProviderPaymentCommand): Promise<ProviderPaymentResult>;
  query(providerReference: string, correlationId: string): Promise<ProviderPaymentResult>;
  verifyCallback(callback: ProviderCallback): Promise<VerifiedProviderEvent>;
};

class ContractOnlyProviderAdapter implements ProviderAdapter {
  constructor(
    readonly identity: ProviderIdentity,
    private readonly transport: ProviderAdapterTransport
  ) {}

  initiate(command: ProviderPaymentCommand): Promise<ProviderPaymentResult> {
    return this.transport.initiate(command);
  }

  query(providerReference: string, correlationId: string): Promise<ProviderPaymentResult> {
    return this.transport.query(providerReference, correlationId);
  }

  verifyCallback(callback: ProviderCallback): Promise<VerifiedProviderEvent> {
    return this.transport.verifyCallback(callback);
  }
}

export class TMoneyAdapter extends ContractOnlyProviderAdapter {
  constructor(transport: ProviderAdapterTransport) {
    super(
      { id: "tmoney", version: "contract-v1", capabilities: new Set(["initiate", "query", "callback"]) },
      transport
    );
  }
}

export class FloozAdapter extends ContractOnlyProviderAdapter {
  constructor(transport: ProviderAdapterTransport) {
    super(
      { id: "flooz", version: "contract-v1", capabilities: new Set(["initiate", "query", "callback"]) },
      transport
    );
  }
}

export class MicrofinanceAdapter extends ContractOnlyProviderAdapter {
  constructor(transport: ProviderAdapterTransport) {
    super(
      { id: "microfinance", version: "contract-v1", capabilities: new Set(["initiate", "query", "callback"]) },
      transport
    );
  }
}
