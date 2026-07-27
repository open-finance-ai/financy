import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Tests use fixtures and assertion helpers that read cleaner without these rules.
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
