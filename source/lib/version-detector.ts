import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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
		path: process.env['SHELL'] ?? '',
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

	// 使用策略模式减少复杂度
	const shellHandlers = {
		zsh: () => [path.join(HOME, '.zshrc')],
		bash: () => getBashConfigFiles(HOME, currentOS),
		fish: () => getFishConfigFiles(HOME),
		powershell: () => getPowerShellConfigFiles(HOME, currentOS),
		cmd: () => getCmdConfigFiles(currentOS),
	};

	const handler = shellHandlers[shellType as keyof typeof shellHandlers];
	if (handler) {
		return handler();
	}

	// 默认处理
	return currentOS === 'windows' ? [] : [path.join(HOME, '.profile')];
}

/**
 * 获取 Bash 配置文件路径的辅助函数
 */
function getBashConfigFiles(HOME: string, currentOS: string): string[] {
	const candidates =
		currentOS === 'macos'
			? [path.join(HOME, '.bash_profile'), path.join(HOME, '.bashrc')]
			: [path.join(HOME, '.bashrc'), path.join(HOME, '.bash_profile')];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return [candidate];
		}
	}

	return [candidates[0]!]; // 返回首选项作为默认
}

/**
 * 获取 Fish 配置文件路径的辅助函数
 */
function getFishConfigFiles(HOME: string): string[] {
	const fishConfigDir = path.join(HOME, '.config', 'fish');
	try {
		fs.mkdirSync(fishConfigDir, {recursive: true});
	} catch {
		// 忽略创建失败
	}

	return [path.join(fishConfigDir, 'config.fish')];
}

/**
 * 获取 PowerShell 配置文件路径的辅助函数
 */
function getPowerShellConfigFiles(HOME: string, currentOS: string): string[] {
	if (currentOS !== 'windows') {
		return [];
	}

	const documentsPath = process.env['USERPROFILE'] ?? HOME;
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

	for (const profile of profiles) {
		if (fs.existsSync(profile)) {
			return [profile];
		}
	}

	return [profiles[0]!]; // 返回 PowerShell Core 配置文件作为默认
}

/**
 * 获取 CMD 配置文件路径的辅助函数
 */
function getCmdConfigFiles(currentOS: string): string[] {
	// CMD 不支持配置文件
	return currentOS === 'windows' ? [] : [];
}

/**
 * 获取版本文件优先级列表
 */
function getVersionFilesByManager(manager: string): string[] {
	if (manager === 'n') {
		return ['.node-version', '.nvmrc', 'package.json']; // n 用户优先 .node-version
	}

	if (manager === 'nvm-windows' || manager === 'nvs') {
		return ['.nvmrc', '.node-version', 'package.json']; // Windows版本管理器优先 .nvmrc
	}

	return ['.nvmrc', '.node-version', 'package.json']; // 默认优先 .nvmrc
}

/**
 * 尝试从单个文件读取版本
 */
function tryReadVersionFromFile(
	filePath: string,
	fileName: string,
): string | undefined {
	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	if (fileName === 'package.json') {
		return tryReadVersionFromPackageJson(filePath);
	}

	return tryReadVersionFromTextFile(filePath);
}

/**
 * 从 package.json 读取版本
 */
function tryReadVersionFromPackageJson(filePath: string): string | undefined {
	try {
		const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		const nodeVersion = packageJson.engines?.node;

		if (!nodeVersion) {
			return undefined;
		}

		return parseEngineVersion(nodeVersion);
	} catch {
		return undefined;
	}
}

/**
 * 从文本文件读取版本
 */
function tryReadVersionFromTextFile(filePath: string): string | undefined {
	try {
		const content = fs.readFileSync(filePath, 'utf8').trim();

		if (!content) {
			return undefined;
		}

		return content.replace(/^v/, ''); // 移除 v 前缀
	} catch {
		return undefined;
	}
}

/**
 * 读取并解析项目目录中的版本文件
 */
export function readVersionFile(
	projectDir: string,
	manager = 'nvm',
): string | undefined {
	const versionFiles = getVersionFilesByManager(manager);

	for (const fileName of versionFiles) {
		const filePath = path.join(projectDir, fileName);
		const version = tryReadVersionFromFile(filePath, fileName);

		if (version) {
			return version;
		}
	}

	return undefined;
}

/**
 * 解析 package.json engines.node 版本规范
 */
function parseEngineVersion(versionSpec: string): string | undefined {
	// 移除空格
	const spec = versionSpec.trim();

	// 常见格式处理
	const patterns = [
		// 精确版本: "18.17.1", "v18.17.1"
		/^v?(\d+\.\d+\.\d+)$/,
		// 主版本: "18", ">=18"
		/^>=?\s*v?(\d+)$/,
		// 主版本.次版本: "18.17", ">=18.17"
		/^>=?\s*v?(\d+\.\d+)$/,
		// 主版本.次版本.修订版: ">=18.17.1"
		/^>=?\s*v?(\d+\.\d+\.\d+)$/,
		// 范围表达式的最低版本: ">=16.0.0 <19.0.0"
		/^>=?\s*v?(\d+\.\d+\.\d+)\s+<.*$/,
		// 波浪号范围: "~18.17.0"
		/^~\s*v?(\d+\.\d+\.\d+)$/,
		// 插入符范围: "^18.17.0"
		/^\^\s*v?(\d+\.\d+\.\d+)$/,
	];

	for (const pattern of patterns) {
		const match = spec.match(pattern);
		if (match) {
			let version = match[1]!;

			// 补全版本号
			const parts = version.split('.');
			if (parts.length === 1) {
				version = `${parts[0]}.0.0`; // 18 -> 18.0.0
			} else if (parts.length === 2) {
				version = `${parts[0]}.${parts[1]}.0`; // 18.17 -> 18.17.0
			}

			return version;
		}
	}

	// 特殊情况：LTS 标识符
	if (spec.includes('lts')) {
		// 返回当前LTS版本，这里可以设置一个默认值
		return '18.17.0'; // 当前LTS版本，可以配置化
	}

	// 如果无法解析，返回undefined
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
