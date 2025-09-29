import process from 'node:process';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();

/**
 * 安全错误类
 */
export class SecurityError extends Error {
	code: string;
	suggestions: string[];

	constructor(message: string, code: string, suggestions: string[] = []) {
		super(message);
		this.name = 'SecurityError';
		this.code = code;
		this.suggestions = suggestions;
	}
}

/**
 * 验证错误类
 */
export class ValidationError extends Error {
	code: string;
	suggestions: string[];

	constructor(message: string, code: string, suggestions: string[] = []) {
		super(message);
		this.name = 'ValidationError';
		this.code = code;
		this.suggestions = suggestions;
	}
}

/**
 * 安全验证工具类
 */
export class Security {
	/**
	 * 安全验证路径输入，防止命令注入和路径遍历攻击
	 */
	static validatePath(inputPath: string): string {
		if (!inputPath || typeof inputPath !== 'string') {
			throw new ValidationError('路径不能为空', 'EMPTY_PATH', [
				'请输入有效的目录路径',
			]);
		}

		const trimmedPath = inputPath.trim();

		// 检查危险字符，防止命令注入
		// Windows 允许反斜杠作为路径分隔符，其他系统不允许
		const isWindows = process.platform === 'win32';
		const dangerousChars = isWindows
			? /[;|&$(){}[\]`"'<>*?]/
			: /[;|&$(){}[\]\\`"'<>*?]/;

		if (dangerousChars.test(trimmedPath)) {
			const excludedChars = isWindows
				? '; | & $ ( ) { } [ ] ` " \' < > * ?'
				: '; | & $ ( ) { } [ ] \\ ` " \' < > * ?';

			throw new SecurityError('路径包含不安全字符', 'UNSAFE_CHARACTERS', [
				`路径不能包含以下字符: ${excludedChars}`,
				'请使用标准的文件路径格式',
			]);
		}

		// 检查路径遍历攻击
		const normalized = path.normalize(trimmedPath);
		if (normalized.includes('..')) {
			throw new SecurityError('不允许使用相对路径遍历', 'PATH_TRAVERSAL', [
				'请使用绝对路径或不包含 .. 的相对路径',
			]);
		}

		// 展开 ~ 符号
		let resolvedPath = trimmedPath;
		if (trimmedPath.startsWith('~/')) {
			resolvedPath = path.join(HOME, trimmedPath.slice(2));
		} else if (trimmedPath === '~') {
			resolvedPath = HOME;
		}

		// 解析为绝对路径
		try {
			resolvedPath = path.resolve(resolvedPath);
		} catch {
			const isWindows = process.platform === 'win32';
			const examples = isWindows
				? 'C:\\Users\\username\\project 或 ~\\projects\\app'
				: '/Users/username/project 或 ~/projects/app';

			throw new ValidationError('无效的路径格式', 'INVALID_PATH_FORMAT', [
				'请检查路径格式是否正确',
				`示例: ${examples}`,
			]);
		}

		return resolvedPath;
	}

	/**
	 * 验证 Node.js 版本格式
	 */
	static validateVersion(version: string): string {
		if (!version || typeof version !== 'string') {
			throw new ValidationError('版本号不能为空', 'EMPTY_VERSION', [
				'请输入有效的 Node.js 版本号',
			]);
		}

		const trimmed = version.trim();

		// 检查危险字符
		if (/[;|&$(){}[\]\\`"'<>*?]/.test(trimmed)) {
			throw new SecurityError(
				'版本号包含不安全字符',
				'UNSAFE_VERSION_CHARACTERS',
				['版本号只能包含数字、点号、字母和连字符'],
			);
		}

		// 支持的版本格式
		const patterns = [
			/^\d+$/, // 18
			/^\d+\.\d+$/, // 18.17
			/^\d+\.\d+\.\d+$/, // 18.17.1
			/^v\d+(\.\d+){0,2}$/, // v18.17.1
			/^lts\/\*$/, // lts/*
			/^lts\/[\w-]+$/i, // lts/hydrogen
			/^latest$/i, // latest
			/^stable$/i, // stable
			/^node$/i, // node
		];

		const isValid = patterns.some(pattern => pattern.test(trimmed));
		if (!isValid) {
			throw new ValidationError('不支持的版本格式', 'INVALID_VERSION_FORMAT', [
				'支持的格式：18、18.17、18.17.1、v18.17.1、lts/*、lts/hydrogen、latest、stable',
				'请检查版本号是否正确',
			]);
		}

		return trimmed.replace(/^v/, ''); // 移除 v 前缀统一格式
	}

	/**
	 * 安全转义字符串用于 shell 脚本
	 */
	static escapeShellString(str: string): string {
		// 更安全的转义方法
		return str.replace(/'/g, "'\\''");
	}
}
