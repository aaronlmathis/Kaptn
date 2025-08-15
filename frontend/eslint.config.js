import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
	{
		ignores: ['dist', '.astro'],
	},
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				ecmaFeatures: { jsx: true },
				sourceType: 'module',
			},
		},
		settings: { react: { version: '18.2' } },
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
			'@typescript-eslint': tseslint,
			'unused-imports': unusedImports,
		},
		rules: {
			...js.configs.recommended.rules,
			...tseslint.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,

			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true },
			],

			// Remove unused imports automatically.
			'unused-imports/no-unused-imports': 'error',

			// Warn on unused vars, ignore ones starting with "_"
			'unused-imports/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					argsIgnorePattern: '^_',
				},
			],

			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-non-null-assertion': 'warn',
		},
	},
	{
		files: [
			'**/*.test.{ts,tsx}',
			'**/*.spec.{ts,tsx}',
			'**/e2e/**/*.{ts,tsx}',
		],
		languageOptions: {
			globals: {
				...globals.browser,
				describe: 'readonly',
				it: 'readonly',
				expect: 'readonly',
				vi: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly',
				test: 'readonly',
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
