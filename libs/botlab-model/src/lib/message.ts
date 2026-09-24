/** Parameters interpolated into a localized message template. */
export type BotLabMessageParams = Record<string, string | number>;

/**
 * User-facing message identified by a stable code. `text` is the English
 * fallback for logs and hosts without a catalog entry; UIs translate by code.
 */
export interface BotLabMessage {
  code: string;
  params?: BotLabMessageParams;
  text: string;
}

export function createBotLabMessage(
  code: string,
  text: string,
  params?: BotLabMessageParams,
): BotLabMessage {
  return params ? { code, params, text } : { code, text };
}

/** Error carrying a message code, so hosts can localize failures without parsing text. */
export class BotLabError extends Error {
  readonly code: string;
  readonly params?: BotLabMessageParams;

  constructor(code: string, message: string, params?: BotLabMessageParams) {
    super(message);
    this.name = 'BotLabError';
    this.code = code;
    this.params = params;
  }
}

/** Converts any thrown value to a message; unknown errors keep their text under `error.unknown`. */
export function toBotLabMessage(
  error: unknown,
  fallback = 'Unknown error.',
): BotLabMessage {
  if (error instanceof BotLabError)
    return createBotLabMessage(error.code, error.message, error.params);
  return createBotLabMessage(
    'error.unknown',
    error instanceof Error ? error.message : fallback,
  );
}
