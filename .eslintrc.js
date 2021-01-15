'use strict'

module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    commonjs: true,
    es6: true,
    node: true
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: ['@typescript-eslint'],
  rules: {
    eqeqeq: ['error', 'smart'],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-shadow': [
      'error',
      {
        allow: ['cb']
      }
    ],
    'prefer-promise-reject-errors': ['error']
  },
  settings: {}
}
