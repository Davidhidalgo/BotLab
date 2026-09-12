import { createBlockMessageResolver, parseBlockMessageCatalog, type BlockMessageCatalog } from './block-messages';
import { microDuckBlockMessages } from './microduck-block-messages';

describe('block message catalogs', () => {
  const external: BlockMessageCatalog = {
    schemaVersion: 1, namespace: 'org.example.balance', revision: 'commit-123', sourceLocale: 'fr',
    messages: { run: 'équilibrer %1 pendant %2', tooltip: 'Politique externe' },
    translations: { en: { run: 'balance %1 for %2' }, es: { run: 'equilibra %1 durante %2' } },
  };

  it('resolves bundled Catalan, Spanish and English text', () => {
    const resolve = createBlockMessageResolver(microDuckBlockMessages);
    expect(resolve('walk', 'ca')).toBe('mou el MicroDuck %1 m');
    expect(resolve('smile', 'es')).toBe('sonrisa');
    expect(resolve('walk', 'en')).toBe('walk MicroDuck %1 m');
  });

  it('adds local external translations without modifying the original catalog', () => {
    const original = JSON.stringify(external);
    const resolve = createBlockMessageResolver(external, {
      schemaVersion: 1, namespace: external.namespace, revision: external.revision,
      translations: { ca: { run: 'durant %2 equilibra %1' } },
    });
    expect(resolve('run', 'ca')).toBe('durant %2 equilibra %1');
    expect(resolve('run', 'es')).toBe('equilibra %1 durante %2');
    expect(resolve('run', 'de')).toBe('balance %1 for %2');
    expect(resolve('tooltip', 'ca')).toBe('Politique externe');
    expect(JSON.stringify(external)).toBe(original);
  });

  it.each(['revision', 'namespace'] as const)('rejects overlays for a different %s', (field) => {
    expect(() => createBlockMessageResolver(external, { ...external, [field]: 'other' })).toThrow('different integration or revision');
  });

  it.each(['equilibra %1', 'equilibra %1 %1', 'equilibra %1 %2 %3'])('rejects altered parameters: %s', (run) => {
    expect(() => parseBlockMessageCatalog({ ...external, translations: { ca: { run } } })).toThrow('parameters');
  });

  it.each([null, [], { schemaVersion: 2 }, { ...external, translations: { ca: { unknown: 'No' } } },
    { ...external, translations: { ca: { run: 42 } } }, { ...external, translations: { ca: { run: '%{BKY_OTHER}' } } }])(
    'rejects malformed catalogs', (input) => expect(() => parseBlockMessageCatalog(input)).toThrow()
  );

  it('does not resolve inherited properties or accept executable translation values', () => {
    const resolve = createBlockMessageResolver(external);
    expect(() => resolve('constructor', 'ca')).toThrow('Unknown block message');
    expect(() => parseBlockMessageCatalog({ ...external, translations: { ca: { run: () => 'text' } } })).toThrow();
  });
});
