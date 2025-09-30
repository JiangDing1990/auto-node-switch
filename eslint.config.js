import js from '@eslint/js';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
	// 忽略的文件和目录
	{
		ignores: [
			'**/node_modules/**',
			'dist/**',
			'build/**',
			'coverage/**',
			'tests/**',
			'*.js',
			'*.mjs',
			'.claude/**',
			'.git/**',
			'.DS_Store',
			'*.log',
			'*.cache',
		],
	},

	// JavaScript/TypeScript 文件配置
	{
		files: ['source/**/*.ts', 'source/**/*.tsx'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				project: './tsconfig.json',
			},
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				// Node.js 全局变量
				process: 'readonly',
				console: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				global: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tsEslint,
		},
		rules: {
			// 基础 ESLint 规则
			...js.configs.recommended.rules,

			// TypeScript 规则
			...tsEslint.configs.recommended.rules,

			// 自定义规则覆盖
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'off', // 允许 any 类型
			'@typescript-eslint/no-use-before-define': 'off', // 允许函数提升
			'@typescript-eslint/no-shadow': 'off', // 关闭 shadow 检查
			'@typescript-eslint/dot-notation': 'off', // 允许方括号访问
			'@typescript-eslint/lines-between-class-members': 'off',
			'@typescript-eslint/no-throw-literal': 'off',

			// 控制台输出允许
			'no-console': 'off',

			// 代码风格调整
			'no-plusplus': 'off', // 允许 ++ 操作符
			'prefer-template': 'off', // 允许字符串拼接
			'default-case': 'off', // 不强制 default case
			'no-restricted-syntax': 'off', // 允许 for...of 循环
			'prefer-arrow-callback': 'off', // 允许普通函数回调
			'func-names': 'off', // 允许匿名函数
			'no-lonely-if': 'off', // 允许单独的 if
			'no-underscore-dangle': [
				'error',
				{allowAfterThis: true, allow: ['__dirname', '__filename']},
			],
			'class-methods-use-this': 'off',
			'max-classes-per-file': 'off',
		},
	},

	// Prettier 兼容性（必须放在最后）
	prettier,
];
