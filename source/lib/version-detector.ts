import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import os from 'node:os';

/**
 * 检测到的版本信息
 */
export interface VersionInfo {
	version: string;
	source: 'config' | 'file' | 'system';
	projectName: string;
	sourceFile?: string;
}

/**
 * Shell 信息
 */
export interface ShellInfo {
	name: string;
	path: string;
	version: string;
	detected: boolean;
}

/**
 * 操作系统检测
 */
export function detectOS(): 'macos' | 'linux' | 'windows' | 'unknown' {
	const platform = os.platform();
	if (platform === 'darwin') return 'macos';
	if (platform === 'linux') return 'linux';
	if (platform === 'win32') return 'windows';
	return 'unknown';
}

/**
 * Shell 检测
 */
export async function detectShell(): Promise<ShellInfo> {
	const shellInfo: ShellInfo = {
		name: 'unknown',
		path: process.env['SHELL'] || '',
		version: '',
		detected: false,
	};

	try {
		const currentOS = detectOS();

		// Windows 特殊处理
		if (currentOS === 'windows') {
			// 在 Windows 上检测常用的 shell
			const possibleShells = [
				{
					name: 'powershell',
					command:
						'powershell.exe -Command "$PSVersionTable.PSVersion.ToString()"',
				},
				{name: 'cmd', command: 'ver'},
				{name: 'bash', command: 'bash --version'}, // Git Bash
			];

			for (const shell of possibleShells) {
				try {
					execSync(shell.command, {
						encoding: 'utf8',
						timeout: 2000,
						stdio: 'ignore',
					});
					shellInfo.name = shell.name;
					shellInfo.detected = true;
					break;
				} catch {
					// 继续尝试下一个
				}
			}
		} else if (shellInfo.path) {
			shellInfo.name = path.basename(shellInfo.path);
			shellInfo.detected = true;
		}

		// 获取版本信息
		if (shellInfo.name.includes('zsh')) {
			try {
				shellInfo.version = execSync('zsh --version', {
					encoding: 'utf8',
					timeout: 2000,
				}).trim();
			} catch {
				// ignore
			}
		} else if (shellInfo.name.includes('bash')) {
			try {
				shellInfo.version = execSync('bash --version | head -1', {
					encoding: 'utf8',
					timeout: 2000,
				}).trim();
			} catch {
				// ignore
			}
		}
	} catch {
		// 检测失败时的默认处理
	}

	return shellInfo;
}

/**
 * 获取 Shell 配置文件路径
 */
export function getShellConfigFiles(shellType: string): string[] {
	const HOME = os.homedir();
	const currentOS = detectOS();

	switch (shellType) {
		case 'zsh': {
			return [path.join(HOME, '.zshrc')];
		}

		case 'bash': {
			if (currentOS === 'macos') {
				const bashProfile = path.join(HOME, '.bash_profile');
				const bashrc = path.join(HOME, '.bashrc');

				if (fs.existsSync(bashProfile)) {
					return [bashProfile];
				}

				if (fs.existsSync(bashrc)) {
					return [bashrc];
				}

				return [bashProfile];
			}

			if (currentOS === 'windows') {
				// Windows下的Git Bash配置
				const bashrc = path.join(HOME, '.bashrc');
				const bashProfile = path.join(HOME, '.bash_profile');

				if (fs.existsSync(bashrc)) {
					return [bashrc];
				}

				if (fs.existsSync(bashProfile)) {
					return [bashProfile];
				}

				return [bashrc]; // 默认创建 .bashrc
			}

			const bashrc = path.join(HOME, '.bashrc');
			const bashProfile = path.join(HOME, '.bash_profile');

			if (fs.existsSync(bashrc)) {
				return [bashrc];
			}

			if (fs.existsSync(bashProfile)) {
				return [bashProfile];
			}

			return [bashrc];
		}

		case 'fish': {
			const fishConfigDir = path.join(HOME, '.config', 'fish');
			try {
				fs.mkdirSync(fishConfigDir, {recursive: true});
			} catch {
				// 忽略创建失败
			}

			return [path.join(fishConfigDir, 'config.fish')];
		}

		case 'powershell': {
			if (currentOS === 'windows') {
				// PowerShell 配置文件路径
				const documentsPath = process.env['USERPROFILE'] || HOME;
				const profiles = [
					path.join(
						documentsPath,
						'Documents',
						'PowerShell',
						'Microsoft.PowerShell_profile.ps1',
					),
					path.join(
						documentsPath,
						'Documents',
						'WindowsPowerShell',
						'Microsoft.PowerShell_profile.ps1',
					),
				];

				// 检查哪个存在，或返回第一个作为默认
				for (const profile of profiles) {
					if (fs.existsSync(profile)) {
						return [profile];
					}
				}

				return [profiles[0]!]; // 返回 PowerShell Core 配置文件作为默认
			}

			break;
		}

		case 'cmd': {
			if (currentOS === 'windows') {
				// CMD 不支持配置文件，返回空数组
				return [];
			}

			break;
		}

		default: {
			if (currentOS === 'windows') {
				return []; // Windows 上默认不支持
			}

			return [path.join(HOME, '.profile')];
		}
	}

	return []; // 默认返回空数组
}

/**
 * 读取并解析项目目录中的版本文件
 */
export function readVersionFile(
	projectDir: string,
	manager = 'nvm',
): string | undefined {
	// 根据版本管理器类型调整优先级
	let versionFiles: string[];
	if (manager === 'n') {
		versionFiles = ['.node-version', '.nvmrc', 'package.json']; // n 用户优先 .node-version
	} else if (manager === 'nvm-windows' || manager === 'nvs') {
		versionFiles = ['.nvmrc', '.node-version', 'package.json']; // Windows版本管理器优先 .nvmrc
	} else {
		versionFiles = ['.nvmrc', '.node-version', 'package.json']; // 默认优先 .nvmrc
	}

	for (const fileName of versionFiles) {
		const filePath = path.join(projectDir, fileName);

		try {
			if (fs.existsSync(filePath)) {
				if (fileName === 'package.json') {
					const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
					const nodeVersion = packageJson.engines?.node;
					if (nodeVersion) {
						// 解析 package.json 中的版本范围，取最低版本
						const match = nodeVersion.match(/(\d+\.\d+\.\d+|\d+\.\d+|\d+)/);
						return match ? match[1] : undefined;
					}
				} else {
					const content = fs.readFileSync(filePath, 'utf8').trim();
					if (content) {
						return content.replace(/^v/, ''); // 移除 v 前缀
					}
				}
			}
		} catch {
			// 忽略读取错误，继续尝试下一个文件
		}
	}

	return undefined;
}

/**
 * 检测当前 Node.js 版本
 */
export function getCurrentNodeVersion(): string | undefined {
	try {
		const version = execSync('node -v', {encoding: 'utf8', timeout: 2000})
			.trim()
			.replace(/^v/, '');
		return version;
	} catch {
		return undefined;
	}
}

/**
 * 检测已安装的 Node.js 版本（通过 nvm）
 */
export function getInstalledVersionsNvm(): string[] {
	try {
		const output = execSync('nvm list', {
			encoding: 'utf8',
			timeout: 5000,
		});

		// 解析 nvm list 输出
		const versions = output
			.split('\n')
			.map(line => {
				// 匹配版本号，支持各种格式
				const match = /v?(\d+\.\d+\.\d+)/.exec(line);
				return match ? match[1] : undefined;
			})
			.filter((version): version is string => version !== null)
			.filter((version, index, array) => array.indexOf(version) === index) // 去重
			.sort((a, b) => {
				// 简单的版本号排序
				const aParts = a.split('.').map(Number);
				const bParts = b.split('.').map(Number);
				for (let i = 0; i < 3; i++) {
					if (aParts[i] !== bParts[i]) {
						return (bParts[i] ?? 0) - (aParts[i] ?? 0); // 降序
					}
				}

				return 0;
			});

		return versions;
	} catch {
		return [];
	}
}

/**
 * 检测已安装的 Node.js 版本（通过 n）
 */
export function getInstalledVersionsN(): string[] {
	try {
		const output = execSync('n ls', {
			encoding: 'utf8',
			timeout: 5000,
		});

		// 解析 n ls 输出
		const versions = output
			.split('\n')
			.map(line => {
				// 匹配版本号
				const match = /^(\d+\.\d+\.\d+)$/.exec(line.trim());
				return match ? match[1] : undefined;
			})
			.filter((version): version is string => version !== null)
			.filter((version, index, array) => array.indexOf(version) === index) // 去重
			.sort((a, b) => {
				// 简单的版本号排序
				const aParts = a.split('.').map(Number);
				const bParts = b.split('.').map(Number);
				for (let i = 0; i < 3; i++) {
					if (aParts[i] !== bParts[i]) {
						return (bParts[i] ?? 0) - (aParts[i] ?? 0); // 降序
					}
				}

				return 0;
			});

		return versions;
	} catch {
		return [];
	}
}

/**
 * 检测已安装的 Node.js 版本（通过 fnm）
 */
export function getInstalledVersionsFnm(): string[] {
	try {
		const output = execSync('fnm list', {
			encoding: 'utf8',
			timeout: 5000,
		});

		// 解析 fnm list 输出
		const versions = output
			.split('\n')
			.map(line => {
				// 匹配版本号
				const match = /v?(\d+\.\d+\.\d+)/.exec(line);
				return match ? match[1] : undefined;
			})
			.filter((version): version is string => version !== null)
			.filter((version, index, array) => array.indexOf(version) === index) // 去重
			.sort((a, b) => {
				// 简单的版本号排序
				const aParts = a.split('.').map(Number);
				const bParts = b.split('.').map(Number);
				for (let i = 0; i < 3; i++) {
					if (aParts[i] !== bParts[i]) {
						return (bParts[i] ?? 0) - (aParts[i] ?? 0); // 降序
					}
				}

				return 0;
			});

		return versions;
	} catch {
		return [];
	}
}

/**
 * 检测已安装的 Node.js 版本（通过 nvm-windows）
 */
export function getInstalledVersionsNvmWindows(): string[] {
	try {
		const output = execSync('nvm list', {
			encoding: 'utf8',
			timeout: 5000,
		});

		// 解析 nvm-windows list 输出
		const versions = output
			.split('\n')
			.map(line => {
				// 匹配版本号，nvm-windows 格式略有不同
				const match = /v?(\d+\.\d+\.\d+)/.exec(line);
				return match ? match[1] : undefined;
			})
			.filter((version): version is string => version !== null)
			.filter((version, index, array) => array.indexOf(version) === index) // 去重
			.sort((a, b) => {
				// 简单的版本号排序
				const aParts = a.split('.').map(Number);
				const bParts = b.split('.').map(Number);
				for (let i = 0; i < 3; i++) {
					if (aParts[i] !== bParts[i]) {
						return (bParts[i] ?? 0) - (aParts[i] ?? 0); // 降序
					}
				}

				return 0;
			});

		return versions;
	} catch {
		return [];
	}
}

/**
 * 检测已安装的 Node.js 版本（通过 nvs）
 */
export function getInstalledVersionsNvs(): string[] {
	try {
		const output = execSync('nvs list', {
			encoding: 'utf8',
			timeout: 5000,
		});

		// 解析 nvs list 输出
		const versions = output
			.split('\n')
			.map(line => {
				// 匹配版本号
				const match = /(\d+\.\d+\.\d+)/.exec(line);
				return match ? match[1] : undefined;
			})
			.filter((version): version is string => version !== null)
			.filter((version, index, array) => array.indexOf(version) === index) // 去重
			.sort((a, b) => {
				// 简单的版本号排序
				const aParts = a.split('.').map(Number);
				const bParts = b.split('.').map(Number);
				for (let i = 0; i < 3; i++) {
					if (aParts[i] !== bParts[i]) {
						return (bParts[i] ?? 0) - (aParts[i] ?? 0); // 降序
					}
				}

				return 0;
			});

		return versions;
	} catch {
		return [];
	}
}

/**
 * 根据管理器类型获取已安装版本
 */
export function getInstalledVersions(manager: string): string[] {
	switch (manager.toLowerCase()) {
		case 'nvm': {
			return getInstalledVersionsNvm();
		}

		case 'n': {
			return getInstalledVersionsN();
		}

		case 'fnm': {
			return getInstalledVersionsFnm();
		}

		case 'nvm-windows': {
			return getInstalledVersionsNvmWindows();
		}

		case 'nvs': {
			return getInstalledVersionsNvs();
		}

		default: {
			return [];
		}
	}
}

/**
 * 检测版本管理器是否可用
 */
export function detectAvailableManagers(): Array<{
	name: string;
	available: boolean;
}> {
	const currentOS = detectOS();
	let managers: Array<{name: string; command: string}> = [];

	if (currentOS === 'windows') {
		managers = [
			{name: 'nvm-windows', command: 'nvm version'},
			{name: 'fnm', command: 'fnm --version'},
			{name: 'nvs', command: 'nvs --version'},
		];
	} else {
		managers = [
			{name: 'nvm', command: 'nvm --version'},
			{name: 'n', command: 'n --version'},
			{name: 'fnm', command: 'fnm --version'},
		];
	}

	return managers.map(manager => ({
		name: manager.name,
		available: (() => {
			try {
				execSync(manager.command, {
					encoding: 'utf8',
					timeout: 2000,
					stdio: 'ignore',
				});
				return true;
			} catch {
				return false;
			}
		})(),
	}));
}
