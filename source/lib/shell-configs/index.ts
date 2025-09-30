/**
 * Shell配置统一导出
 * 提供Shell配置的注册中心
 */

import type {ShellConfig} from './types.js';
import {BashShellConfig} from './bash-config.js';
import {FishShellConfig} from './fish-config.js';
import {PowerShellConfig} from './powershell-config.js';

/**
 * Shell配置注册表
 */
export class ShellConfigRegistry {
	/**
	 * 注册Shell配置
	 */
	static register(config: ShellConfig): void {
		this.configs.set(config.name, config);
	}

	/**
	 * 根据配置文件路径获取Shell配置
	 */
	static getConfigForFile(filePath: string): ShellConfig | undefined {
		for (const config of this.configs.values()) {
			if (config.isConfigFile(filePath)) {
				return config;
			}
		}

		return undefined;
	}

	/**
	 * 获取所有已注册的Shell配置
	 */
	static getAllConfigs(): ShellConfig[] {
		return [...this.configs.values()];
	}

	/**
	 * 根据名称获取Shell配置
	 */
	static getConfig(name: string): ShellConfig | undefined {
		return this.configs.get(name);
	}

	private static readonly configs = new Map<string, ShellConfig>();

	static {
		// 注册所有支持的Shell配置
		this.register(new BashShellConfig());
		this.register(new FishShellConfig());
		this.register(new PowerShellConfig());
	}
}

// 导出类型和主要类
export type {ShellConfig, TemplateData} from './types.js';
export {BashShellConfig} from './bash-config.js';
export {FishShellConfig} from './fish-config.js';
export {PowerShellConfig} from './powershell-config.js';
