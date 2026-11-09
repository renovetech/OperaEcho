
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['build/**', 'node_modules/**'] },
    {
        files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', 'playwright.config.ts'],
        extends: [js.configs.recommended, ...tseslint.configs.strict],
        languageOptions: { globals: globals.browser },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-console': 'error',
            'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
            'max-depth': ['warn', 4],
            '@typescript-eslint/consistent-type-imports': 'error'
        }
    }
);
