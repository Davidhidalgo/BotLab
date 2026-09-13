const nx = require('@nx/eslint-plugin');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['scope:model', 'scope:runtime', 'scope:blocks', 'scope:adapter', 'scope:simulator', 'scope:ui'], bannedExternalImports: ['scratch-blocks', 'blockly', 'blockly/*'] },
            { sourceTag: 'scope:model', onlyDependOnLibsWithTags: ['scope:model'], bannedExternalImports: ['react', 'react/*', 'react-dom', 'react-dom/*', 'scratch-blocks', 'blockly', 'blockly/*'] },
            { sourceTag: 'scope:runtime', onlyDependOnLibsWithTags: ['scope:model', 'scope:runtime'], bannedExternalImports: ['react', 'react/*', 'react-dom', 'react-dom/*', 'scratch-blocks', 'blockly', 'blockly/*'] },
            { sourceTag: 'scope:blocks', onlyDependOnLibsWithTags: ['scope:model', 'scope:blocks', 'scope:ui'] },
            { sourceTag: 'scope:adapter', onlyDependOnLibsWithTags: ['scope:model', 'scope:adapter'] },
            { sourceTag: 'scope:simulator', onlyDependOnLibsWithTags: ['scope:model', 'scope:runtime', 'scope:simulator'] },
            { allSourceTags: ['scope:simulator', 'type:core'], onlyDependOnLibsWithTags: ['scope:model', 'type:core'] },
            { sourceTag: 'scope:ui', onlyDependOnLibsWithTags: ['scope:ui'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
