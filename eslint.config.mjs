import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    ignores: [
      'dist/**',
      'node_modules/**',
      'ui/**',
      'src/tui/**',
      '*.js',
      '*.mjs',
      'scripts/**',
      'test-tools.js'
    ],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Ban any usage completely - this is the primary rule
      '@typescript-eslint/no-explicit-any': 'error',

      // Additional TypeScript best practices
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
];
