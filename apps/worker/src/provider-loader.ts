import { decryptByokKey, type ByokKeyEnvelope } from "@specproof/core/byok";
import type { JudgmentProvider } from "@specproof/core";

import {
  AnthropicJudgmentProvider,
  OpenAiJudgmentProvider,
} from "./ai-providers";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type ProviderName = "anthropic" | "openai";

export interface ByokKeyStore {
  load(input: {
    readonly provider: ProviderName;
    readonly workspaceId: string;
  }): Promise<ByokKeyEnvelope | null>;
}

export class JudgmentProviderLoader {
  private readonly byokKeys: ByokKeyStore;
  private readonly fetch: Fetch;
  private readonly masterKey: string;
  private readonly platformKeys: Readonly<
    Partial<Record<ProviderName, string>>
  >;

  constructor(input: {
    readonly byokKeys: ByokKeyStore;
    readonly fetch?: Fetch;
    readonly masterKey: string;
    readonly platformKeys: Readonly<Partial<Record<ProviderName, string>>>;
  }) {
    this.byokKeys = input.byokKeys;
    this.fetch = input.fetch ?? globalThis.fetch;
    this.masterKey = input.masterKey;
    this.platformKeys = input.platformKeys;
  }

  async load(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: ProviderName;
    readonly workspaceId: string;
  }): Promise<JudgmentProvider> {
    let apiKey: string | undefined;
    if (input.billingMode === "byok") {
      const envelope = await this.byokKeys.load(input);
      if (!envelope) {
        throw new Error(`No ${input.provider} BYOK key is configured.`);
      }
      apiKey = decryptByokKey({ envelope, masterKey: this.masterKey });
    } else {
      apiKey = this.platformKeys[input.provider];
    }
    if (!apiKey) {
      throw new Error(`${input.provider} judgment provider is unavailable.`);
    }

    return input.provider === "openai"
      ? new OpenAiJudgmentProvider({
          apiKey,
          fetch: this.fetch,
          model: "gpt-5.6",
        })
      : new AnthropicJudgmentProvider({
          apiKey,
          fetch: this.fetch,
          model: "claude-sonnet-5",
        });
  }
}
