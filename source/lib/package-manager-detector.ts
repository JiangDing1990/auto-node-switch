/**
 * 包管理器检测器
 * 根据项目中的lock文件自动检测使用的包管理器
 */

import fs from 'node:fs';
import path from 'node:path';

export type PackageManagerType = 'npm' | 'yarn' | 'pnpm';

export interface PackageManagerInfo {
	type: PackageManagerType;
	lockFile: string;
	confidence: number; // 置信度 0-100
	detected: boolean;
}

/**
 * 检测项目使用的包管理器
 */
export function detectPackageManager(projectDir: string): PackageManagerInfo {
	const lockFiles = [
		{type: 'pnpm' as const, file: 'pnpm-lock.yaml', confidence: 95},
		{type: 'yarn' as const, file: 'yarn.lock', confidence: 90},
		{type: 'npm' as const, file: 'package-lock.json', confidence: 85},
	];

	// 检查每个lock文件是否存在
	for (const {type, file, confidence} of lockFiles) {
		const lockPath = path.join(projectDir, file);
		if (fs.existsSync(lockPath)) {
			return {
				type,
				lockFile: file,
				confidence,
				detected: true,
			};
		}
	}

	// 检查package.json中的packageManager字段 (Node.js 16.9+)
	try {
		const packageJsonPath = path.join(projectDir, 'package.json');
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			if (packageJson.packageManager) {
				const pmSpec = packageJson.packageManager as string;
				if (pmSpec.startsWith('pnpm@')) {
					return {
						type: 'pnpm',
						lockFile: 'package.json',
						confidence: 100,
						detected: true,
					};
				}

				if (pmSpec.startsWith('yarn@')) {
					return {
						type: 'yarn',
						lockFile: 'package.json',
						confidence: 100,
						detected: true,
					};
				}

				if (pmSpec.startsWith('npm@')) {
					return {
						type: 'npm',
						lockFile: 'package.json',
						confidence: 100,
						detected: true,
					};
				}
			}
		}
	} catch {
		// 忽略package.json解析错误
	}

	// 默认返回npm
	return {
		type: 'npm',
		lockFile: 'none',
		confidence: 50,
		detected: false,
	};
}

/**
 * 获取包管理器的安装检查命令
 */
export function getPackageManagerCheckCommand(
	type: PackageManagerType,
): string {
	switch (type) {
		case 'npm': {
			return 'npm --version';
		}

		case 'yarn': {
			return 'yarn --version';
		}

		case 'pnpm': {
			return 'pnpm --version';
		}

		default: {
			return 'npm --version';
		}
	}
}

/**
 * 检查包管理器是否已安装
 */
export async function isPackageManagerInstalled(
	type: PackageManagerType,
): Promise<boolean> {
	try {
		const {execSync} = await import('node:child_process');
		const command = getPackageManagerCheckCommand(type);
		execSync(command, {stdio: 'pipe'});
		return true;
	} catch {
		return false;
	}
}

/**
 * 获取包管理器的安装指南
 */
export function getPackageManagerInstallGuide(
	type: PackageManagerType,
): string {
	switch (type) {
		case 'yarn': {
			return 'npm install -g yarn 或访问 https://yarnpkg.com/getting-started/install';
		}

		case 'pnpm': {
			return 'npm install -g pnpm 或访问 https://pnpm.io/installation';
		}

		case 'npm': {
			return 'npm 随 Node.js 一起安装';
		}

		default: {
			return '请参考官方文档';
		}
	}
}
