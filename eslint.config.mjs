import js from '@eslint/js';
import globals from 'globals';

// Schlanke, bug-fokussierte Konfiguration (keine Formatierungs-Regeln):
// gelintet werden Adapter-Code (CommonJS/Node) und Tests; admin/tab.html (Inline-JS)
// und generierte/fremde Verzeichnisse sind ausgenommen.
export default [
    { ignores: ['node_modules/', '.dev-server/', 'docs/', 'admin/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
        },
    },
    {
        files: ['eslint.config.mjs'],
        languageOptions: { sourceType: 'module' },
    },
];
