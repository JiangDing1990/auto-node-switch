/**
 * Hook管理器
 * 重构后的Hook管理器，使用模块化架构
 * - 支持插件式Shell配置
 * - 基于模板引擎的Hook生成
 * - 更好的可维护性和扩展性
 */

import fs from 'node:fs';
import path from 'node:path';
import type {WorkdirConfig} from './config.js';
import {
	ShellConfigRegistry,
	type ShellConfig,
	type TemplateData,
} from './shell-configs/index.js';

const HOOK_MARKER = '# AUTO_NODE_SWITCH_HOOK_START';
const HOOK_END_MARKER = '# AUTO_NODE_SWITCH_HOOK_END';

/**
 * Hook管理器
 * 基于新架构的Hook管理器
 */
export class HookManager {
	/**
	 * 添加Hook到指定的shell配置文件
	 */
	static addHook(
		shellRcPath: string,
		manager: string,
		workdirs: WorkdirConfig[],
	): void {
		try {
			// 确保文件存在
			this.ensureFileExists(shellRcPath);

			// 获取对应的Shell配置
			const shellConfig = ShellConfigRegistry.getConfigForFile(shellRcPath);
			if (!shellConfig) {
				throw new Error(`不支持的配置文件类型: ${path.basename(shellRcPath)}`);
			}

			// 验证管理器是否支持
			if (!shellConfig.isSupportedManager(manager)) {
				throw new Error(`Shell ${shellConfig.name} 不支持管理器 ${manager}`);
			}

			// 读取现有内容并移除旧Hook
			let content = fs.readFileSync(shellRcPath, 'utf8');
			content = this.removeExistingHook(content);

			// 生成新的Hook
			const templateData: TemplateData = {
				workdirs,
				manager,
				escapedDirsJson: '', // 这个在shellConfig中生成
			};

			const hookCode = shellConfig.getHookTemplate(templateData);
			const hook = this.wrapHook(hookCode);

			// 添加Hook到配置文件
			content = this.appendHook(content, hook);

			// 写入文件
			fs.writeFileSync(shellRcPath, content, 'utf8');
			// 在测试环境中静默处理
			if (
				!process.env['NODE_ENV']?.includes('test') &&
				!process.env['XDG_CONFIG_HOME']?.includes('test')
			) {
				console.log(`✅ 已成功配置 ${path.basename(shellRcPath)}`);
			}
		} catch (error) {
			throw new Error(`配置 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 从指定的shell配置文件中移除Hook
	 */
	static removeHook(shellRcPath: string): void {
		try {
			if (!fs.existsSync(shellRcPath)) {
				// 在测试环境中静默处理，不输出警告避免CI失败
				if (
					!process.env['NODE_ENV']?.includes('test') &&
					!process.env['XDG_CONFIG_HOME']?.includes('test')
				) {
					console.warn(`文件不存在: ${shellRcPath}`);
				}
				return;
			}

			const content = fs.readFileSync(shellRcPath, 'utf8');
			const newContent = this.removeExistingHook(content);

			if (newContent !== content) {
				fs.writeFileSync(shellRcPath, newContent, 'utf8');
				// 在测试环境中静默处理
				if (
					!process.env['NODE_ENV']?.includes('test') &&
					!process.env['XDG_CONFIG_HOME']?.includes('test')
				) {
					console.log(`✅ 已从 ${path.basename(shellRcPath)} 中移除 Hook`);
				}
			} else {
				// 在测试环境中静默处理
				if (
					!process.env['NODE_ENV']?.includes('test') &&
					!process.env['XDG_CONFIG_HOME']?.includes('test')
				) {
					console.log(`ℹ️ ${path.basename(shellRcPath)} 中没有找到 Hook`);
				}
			}
		} catch (error) {
			throw new Error(`清理 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 获取所有支持的Shell配置
	 */
	static getSupportedShells(): ShellConfig[] {
		return ShellConfigRegistry.getAllConfigs();
	}

	/**
	 * 获取Shell支持的管理器列表
	 */
	static getSupportedManagers(shellName: string): string[] {
		const config = ShellConfigRegistry.getConfig(shellName);
		return config?.supportedManagers ?? [];
	}

	/**
	 * 确保文件存在
	 */
	private static ensureFileExists(filePath: string): void {
		if (!fs.existsSync(filePath)) {
			const dir = path.dirname(filePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, {recursive: true});
			}

			fs.writeFileSync(filePath, '', 'utf8');
		}
	}

	/**
	 * 移除现有Hook
	 */
	private static removeExistingHook(content: string): string {
		// 支持新的标记格式
		const newRegex = new RegExp(
			`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
			'g',
		);

		// 支持旧的标记格式（向后兼容）
		const oldRegex =
			/# Node\.js 工作目录环境切换[\s\S]*?# Node\.js 工作目录环境切换 END\n?/g;

		// 移除新格式的Hook
		let result = content.replace(newRegex, '');

		// 移除旧格式的Hook
		result = result.replace(oldRegex, '');

		return result;
	}

	/**
	 * 包装Hook代码（添加标记）
	 */
	private static wrapHook(hookCode: string): string {
		// 清理hookCode的首尾空白，避免多余空行
		const cleanedHookCode = hookCode.trim();
		return `\n${HOOK_MARKER}\n${cleanedHookCode}\n${HOOK_END_MARKER}`;
	}

	/**
	 * 将Hook添加到内容末尾
	 */
	private static appendHook(content: string, hook: string): string {
		// 清理现有内容的尾部空白
		let cleanedContent = content.replace(/\s+$/, '');

		// 如果内容不为空，确保有且仅有一个空行分隔
		if (cleanedContent) {
			cleanedContent += '\n';
		}

		// 添加Hook
		cleanedContent += hook;

		// 确保文件末尾有且仅有一个换行符
		if (!cleanedContent.endsWith('\n')) {
			cleanedContent += '\n';
		}

		return cleanedContent;
	}
}
