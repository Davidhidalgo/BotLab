import type { ValidationResult } from './botlab-model';

/**
 * Editor-engine-neutral block definitions a robot contributes. Editors (for
 * example `@botlab/blocks` with Scratch Blocks) translate these into their
 * own format; robots never import an editor engine.
 */

/** Local translations for a message catalog; display text only. */
export interface BlockTranslationOverlay {
  schemaVersion: 1;
  namespace: string;
  revision: string;
  translations: Record<string, Record<string, string>>;
}

/** Versioned block display text. `%1`, `%2`… mark block arguments. */
export interface BlockMessageCatalog extends BlockTranslationOverlay {
  sourceLocale: string;
  messages: Record<string, string>;
}

/** Direction glyphs editors render for movement blocks. */
export type RobotBlockIcon =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'around';

export type RobotBlockArgument =
  | {
      kind: 'number';
      name: string;
      value: number;
      min: number;
      max: number;
      precision: number;
      /** Round and clamp typed values to whole numbers within min/max. */
      clampToInteger?: boolean;
    }
  | {
      kind: 'dropdown';
      name: string;
      /** Pairs of message key and serialized value. */
      options: ReadonlyArray<readonly [message: string, value: string]>;
    }
  | {
      kind: 'icon';
      name: string;
      icon: RobotBlockIcon;
      /** Message key for the icon's accessible text. */
      alt: string;
      /** Swap the icon with the sign of a numeric argument. */
      signOf?: {
        field: string;
        negative: RobotBlockIcon;
        positive: RobotBlockIcon;
      };
    };

export interface RobotBlockDefinition {
  type: string;
  /** Message key; `%n` placeholders map to `args` in order. */
  message: string;
  args?: readonly RobotBlockArgument[];
  shape: 'statement' | 'boolean';
  style: 'motion' | 'sensing' | 'more';
  /** Message key for the tooltip. */
  tooltip: string;
}

export interface RobotBlockCategory {
  /** A message key of this set, a fixed label, or an editor built-in category. */
  name: { message: string } | { text: string } | { builtin: 'sensing' };
  style: 'motion' | 'sensing' | 'botlab';
  blockTypes: readonly string[];
  /** Toolbox position relative to the shared Events category (default: after). */
  placement?: 'before-events' | 'after-events';
}

export interface RobotBlockSet {
  messages: BlockMessageCatalog;
  blocks: readonly RobotBlockDefinition[];
  categories: readonly RobotBlockCategory[];
}

const placeholders = (text: string) =>
  (text.match(/%\d+/g) ?? []).sort().join(',');

/**
 * Checks that a block set only references its own messages and blocks, that
 * message placeholders match block arguments, and that translations keep the
 * source placeholders. `executableTypes` (for example a module's
 * `blockTypes`) must all be defined, except shared `control_*`/`event_*` blocks.
 */
export function validateRobotBlockSet(
  set: RobotBlockSet,
  executableTypes: readonly string[] = [],
): ValidationResult {
  const errors: string[] = [];
  const messages = set.messages.messages;
  const known = (key: string) =>
    Object.prototype.hasOwnProperty.call(messages, key);
  const types = new Set(set.blocks.map((block) => block.type));
  for (const block of set.blocks) {
    for (const key of [block.message, block.tooltip])
      if (!known(key)) errors.push(`${block.type}: unknown message ${key}.`);
    const inline = (block.args ?? []).filter((arg) => arg.kind !== 'icon');
    const expected = inline.map((_, index) => `%${index + 1}`).join(',');
    if (
      known(block.message) &&
      placeholders(messages[block.message]) !== expected
    )
      errors.push(
        `${block.type}: message placeholders do not match arguments.`,
      );
    for (const arg of block.args ?? []) {
      const keys =
        arg.kind === 'dropdown'
          ? arg.options.map(([label]) => label)
          : arg.kind === 'icon'
            ? [arg.alt]
            : [];
      for (const key of keys)
        if (!known(key)) errors.push(`${block.type}: unknown message ${key}.`);
    }
  }
  for (const category of set.categories) {
    if ('message' in category.name && !known(category.name.message))
      errors.push(`Category: unknown message ${category.name.message}.`);
    for (const type of category.blockTypes)
      if (!types.has(type)) errors.push(`Category: unknown block ${type}.`);
  }
  for (const [locale, entries] of Object.entries(set.messages.translations))
    for (const [key, text] of Object.entries(entries))
      if (!known(key) || placeholders(text) !== placeholders(messages[key]))
        errors.push(`${locale}: invalid translation ${key}.`);
  for (const type of executableTypes)
    if (!/^(control|event)_/.test(type) && !types.has(type))
      errors.push(`Executable block ${type} has no definition.`);
  return { valid: errors.length === 0, errors };
}
