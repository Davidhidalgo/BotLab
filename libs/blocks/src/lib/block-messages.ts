export type BlocksLocale = 'ca' | 'es' | 'en';

export interface BlockTranslationOverlay {
  schemaVersion: 1;
  namespace: string;
  revision: string;
  translations: Record<string, Record<string, string>>;
}

export interface BlockMessageCatalog extends BlockTranslationOverlay {
  sourceLocale: string;
  messages: Record<string, string>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a block translation object.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 4096 ||
    value.includes('%{')
  ) {
    throw new Error('Invalid block translation text.');
  }
  return value;
}

function messages(value: unknown): Record<string, string> {
  const entries = Object.entries(record(value));
  if (entries.length > 1000) throw new Error('Too many block messages.');
  return Object.fromEntries(
    entries.map(([key, value]) => [text(key), text(value)]),
  );
}

export function parseBlockTranslationOverlay(
  input: unknown,
): BlockTranslationOverlay {
  const data = record(input);
  if (data.schemaVersion !== 1)
    throw new Error('Unsupported block translation schema.');
  const entries = Object.entries(record(data.translations));
  if (entries.length > 100)
    throw new Error('Too many block translation locales.');
  return {
    schemaVersion: 1,
    namespace: text(data.namespace),
    revision: text(data.revision),
    translations: Object.fromEntries(
      entries.map(([locale, value]) => [text(locale), messages(value)]),
    ),
  };
}

export function parseBlockMessageCatalog(input: unknown): BlockMessageCatalog {
  const data = record(input);
  const catalog = {
    ...parseBlockTranslationOverlay(input),
    sourceLocale: text(data.sourceLocale),
    messages: messages(data.messages),
  };
  validateTranslations(catalog, catalog);
  return catalog;
}

function placeholders(message: string) {
  return (message.match(/%\d+/g) ?? []).sort().join(',');
}

function hasOwn(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateTranslations(
  catalog: BlockMessageCatalog,
  overlay: BlockTranslationOverlay,
) {
  if (
    catalog.namespace !== overlay.namespace ||
    catalog.revision !== overlay.revision
  ) {
    throw new Error(
      'Block translations belong to a different integration or revision.',
    );
  }
  for (const entries of Object.values(overlay.translations)) {
    for (const [key, translation] of Object.entries(entries)) {
      if (
        !hasOwn(catalog.messages, key) ||
        placeholders(translation) !== placeholders(catalog.messages[key])
      ) {
        throw new Error(`Invalid block translation parameters: ${key}.`);
      }
    }
  }
}

/** Resolves display text only; catalogs never define executable blocks or commands. */
export function createBlockMessageResolver(
  input: BlockMessageCatalog,
  localTranslations?: BlockTranslationOverlay,
) {
  const catalog = parseBlockMessageCatalog(input);
  const overlay =
    localTranslations && parseBlockTranslationOverlay(localTranslations);
  if (overlay) validateTranslations(catalog, overlay);
  return (key: string, locale: string): string => {
    if (!hasOwn(catalog.messages, key))
      throw new Error(`Unknown block message: ${key}.`);
    for (const language of new Set([locale, 'en', catalog.sourceLocale])) {
      for (const translations of [
        overlay?.translations,
        catalog.translations,
      ]) {
        const entries =
          translations && hasOwn(translations, language)
            ? translations[language]
            : undefined;
        if (entries && hasOwn(entries, key)) return entries[key];
      }
    }
    return catalog.messages[key];
  };
}
