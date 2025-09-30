/**
 * Shell配置类型定义
 * 统一管理不同Shell的配置接口
 */

import type {WorkdirConfig} from '../config.js';

/**
 * 模板数据结构
 */
export interface TemplateData {
	workdirs: WorkdirConfig[];
	manager: string;
	nvmPath?: string;
	escapedDirsJson: string;
}

/**
 * Shell配置接口
 */
export interface ShellConfig {
	/** Shell名称 */
	name: string;

	/** 支持的配置文件路径模式 */
	configFiles: string[];

	/** 支持的Node.js版本管理器 */
	supportedManagers: string[];

	/** 检测是否为此Shell的配置文件 */
	isConfigFile(filePath: string): boolean;

	/** 获取Hook模板 */
	getHookTemplate(data: TemplateData): string;

	/** 验证管理器是否支持 */
	isSupportedManager(manager: string): boolean;
}

/**
 * 模板渲染器接口
 */
export interface TemplateRenderer {
	render(template: string, data: TemplateData): string;
}
