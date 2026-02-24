import nodePreset from '@kb-labs/devkit/eslint/node.js';

export default [
  ...nodePreset,
  {
    ignores: [
      '**/tsup.config.ts',
      '**/vitest.config.ts',
      '**/*.vue'
    ]
  },
  {
    // REST API handles HTTP requests — await-in-loop matters here
    rules: {
      'no-await-in-loop': 'warn',
    },
  },
];