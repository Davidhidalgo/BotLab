import type { BlockMessageCatalog } from './block-messages';

export const microDuckBlockMessages: BlockMessageCatalog = {
  schemaVersion: 1,
  namespace: 'botlab.microduck',
  revision: '1',
  sourceLocale: 'en',
  messages: {
    leds: 'set MicroDuck LEDs %1',
    walk: 'walk MicroDuck %1 m',
    ledsTooltip: 'Controls the MicroDuck robot LEDs.',
    walkTooltip: 'Moves the MicroDuck simulator forward for the requested distance.',
    smile: 'smile', blink: 'blink', solid: 'solid', off: 'off',
  },
  translations: {
    ca: {
      leds: 'LED MicroDuck: %1',
      walk: 'mou el MicroDuck %1 m',
      ledsTooltip: 'Controla els LED del robot MicroDuck.',
      walkTooltip: 'Fa avançar el MicroDuck al simulador la distància indicada.',
      smile: 'somriure', blink: 'parpelleig', solid: 'fix', off: 'apagat',
    },
    es: {
      leds: 'LED MicroDuck: %1',
      walk: 'mueve MicroDuck %1 m',
      ledsTooltip: 'Controla los LED del robot MicroDuck.',
      walkTooltip: 'Hace avanzar MicroDuck en el simulador la distancia indicada.',
      smile: 'sonrisa', blink: 'parpadeo', solid: 'fijo', off: 'apagado',
    },
  },
};
