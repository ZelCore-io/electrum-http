module.exports = {
  root: true,
  env: {
    commonjs: true,
    node: true,
    mocha: true,
  },
  extends: [
    'airbnb-base',
  ],
  rules: {
    'max-len': [
      'error',
      {
        code: 300,
        ignoreUrls: true,
        ignoreTrailingComments: true,
      },
    ],
    'no-console': 'off',
    'import/extensions': [
      'error',
      'never',
    ],
    'linebreak-style': [
      'error',
      'unix',
    ],
    'prefer-destructuring': 'off',
  },
  parserOptions: {
    parser: 'babel-eslint',
  },
  overrides: [
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
      ],
      env: {
        mocha: true,
      },
    },
  ],
};
