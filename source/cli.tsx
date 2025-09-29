#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {configCache, ConfigPaths} from './lib/config.js';
import {Security, ValidationError, SecurityError} from './lib/security.js';
import {HookManager} from './lib/hook-manager.js';
import {getShellConfigFiles} from './lib/version-detector.js';

const cli = meow(
	`
🔧 Node.js 智能版本管理工具 - 命令行接口

用法:
  $ auto-node-switch [命令] [参数]

命令:
  add <路径> <版本>     添加项目配置
  remove <路径>        删除项目配置  
  list                 列出所有配置
  info                 显示配置文件信息
  regenerate          重新生成Hook
  clean               清理所有Hook
  help                显示帮助信息

示例:
  $ auto-node-switch add ~/my-project 18.17.1
  $ auto-node-switch remove ~/my-project
  $ auto-node-switch list
  $ auto-node-switch regenerate

交互模式:
  $ auto-node-switch
`,
	{
		importMeta: import.meta,
		flags: {},
	},
);

// 命令行模式处理
const args = cli.input;

if (args.length > 0) {
	const command = args[0];

	try {
		switch (command) {
			case 'add': {
				await handleAddCommand(args[1] || '', args[2] || '');
				break;
			}

			case 'remove': {
				await handleRemoveCommand(args[1] || '');
				break;
			}

			case 'list': {
				handleListCommand();
				break;
			}

			case 'info': {
				handleInfoCommand();
				break;
			}

			case 'regenerate': {
				await handleRegenerateCommand();
				break;
			}

			case 'clean': {
				await handleCleanCommand();
				break;
			}

			case 'help': {
				cli.showHelp();
				break;
			}

			default: {
				console.error(`❌ 未知命令: ${command}`);
				cli.showHelp();
				process.exit(1);
			}
		}
	} catch (error) {
		handleError(error);
		process.exit(1);
	}
} else {
	// 交互模式
	render(<App />);
}

async function handleAddCommand(
	projectPath: string,
	version: string,
): Promise<void> {
	if (!projectPath || !version) {
		console.error('❌ 添加项目需要指定路径和版本');
		console.log('用法: add <路径> <版本>');
		process.exit(1);
	}

	try {
		const validatedPath = Security.validatePath(projectPath);
		const validatedVersion = Security.validateVersion(version);

		const config = configCache.getConfig();
		config.workdirs = config.workdirs || [];

		// 检查重复
		const existingIndex = config.workdirs.findIndex(
			w => path.resolve(w.dir) === validatedPath,
		);
		if (existingIndex >= 0) {
			console.log(
				`⚠️ 项目 ${path.basename(
					validatedPath,
				)} 已存在，更新版本为 ${validatedVersion}`,
			);
			config.workdirs[existingIndex]!.version = validatedVersion;
		} else {
			config.workdirs.push({dir: validatedPath, version: validatedVersion});
			console.log(
				`✅ 已添加项目 ${path.basename(
					validatedPath,
				)} → Node ${validatedVersion}`,
			);
		}

		// 创建版本文件
		try {
			fs.mkdirSync(validatedPath, {recursive: true});
			const versionFileName =
				config.manager === 'n' ? '.node-version' : '.nvmrc';
			fs.writeFileSync(
				path.join(validatedPath, versionFileName),
				validatedVersion,
				'utf8',
			);
			console.log(`ℹ️ 已创建 ${versionFileName} 文件`);
		} catch (error) {
			console.warn(`⚠️ 创建版本文件失败: ${(error as Error).message}`);
		}

		configCache.saveConfig(config);

		// 如果有基本配置，重新生成Hook
		if (config.shell && config.manager) {
			await handleRegenerateCommand();
		} else {
			console.warn(
				'⚠️ 尚未配置终端类型和版本管理器，请运行交互模式进行初始设置',
			);
		}
	} catch (error) {
		throw error;
	}
}

async function handleRemoveCommand(projectPath: string): Promise<void> {
	if (!projectPath) {
		console.error('❌ 删除项目需要指定路径');
		console.log('用法: remove <路径>');
		process.exit(1);
	}

	try {
		const validatedPath = Security.validatePath(projectPath);
		const config = configCache.getConfig();

		const initialLength = config.workdirs.length;
		config.workdirs = config.workdirs.filter(
			w => path.resolve(w.dir) !== validatedPath,
		);

		if (config.workdirs.length < initialLength) {
			console.log(`✅ 已删除项目配置: ${path.basename(validatedPath)}`);
			configCache.saveConfig(config);

			if (config.shell && config.manager) {
				await handleRegenerateCommand();
			}
		} else {
			console.warn(`⚠️ 未找到项目配置: ${path.basename(validatedPath)}`);
		}
	} catch (error) {
		throw error;
	}
}

function handleListCommand(): void {
	const config = configCache.getConfig();

	if (!config.workdirs || config.workdirs.length === 0) {
		console.log('ℹ️ 暂无项目配置');
		return;
	}

	console.log('📁 项目配置列表：');
	config.workdirs.forEach((workdir, index) => {
		console.log(`   ${index + 1}. ${workdir.dir} → Node ${workdir.version}`);
	});

	console.log(`\n🔧 基本配置：`);
	console.log(`   终端类型: ${config.shell || '未设置'}`);
	console.log(`   版本管理器: ${config.manager || '未设置'}`);
}

function handleInfoCommand(): void {
	console.log('📋 配置文件信息：');
	console.log(`\n📂 配置路径：`);
	console.log(`   当前使用: ${ConfigPaths.getActiveConfigFile()}`);
	console.log(`   现代路径: ${ConfigPaths.modernConfigFile}`);
	console.log(`   旧版路径: ${ConfigPaths.legacyConfigFile}`);
	console.log(`   备份目录: ${ConfigPaths.backupDir}`);

	// 显示文件状态
	console.log('\n📄 文件状态：');

	if (fs.existsSync(ConfigPaths.modernConfigFile)) {
		const stat = fs.statSync(ConfigPaths.modernConfigFile);
		console.log(
			`   现代配置: ✅ 存在 (${(stat.size / 1024).toFixed(
				2,
			)} KB, 修改时间: ${stat.mtime.toLocaleString()})`,
		);
	} else {
		console.log('   现代配置: ❌ 不存在');
	}

	if (fs.existsSync(ConfigPaths.legacyConfigFile)) {
		const stat = fs.statSync(ConfigPaths.legacyConfigFile);
		console.log(
			`   旧版配置: ✅ 存在 (${(stat.size / 1024).toFixed(
				2,
			)} KB, 修改时间: ${stat.mtime.toLocaleString()})`,
		);
	} else {
		console.log('   旧版配置: ❌ 不存在');
	}
}

async function handleRegenerateCommand(): Promise<void> {
	const config = configCache.getConfig();

	if (!config.shell || !config.manager) {
		console.error('❌ 终端类型或版本管理器未设置');
		console.log('请先运行交互模式进行初始设置');
		process.exit(1);
	}

	if (!config.workdirs || config.workdirs.length === 0) {
		console.warn('⚠️ 暂无项目配置，无需生成Hook');
		return;
	}

	const shellRcFiles = getShellConfigFiles(config.shell);
	let generatedCount = 0;

	shellRcFiles.forEach(rcFile => {
		try {
			HookManager.addHook(rcFile, config.manager, config.workdirs);
			generatedCount++;
		} catch (error) {
			console.warn(`⚠️ 生成 ${rcFile} Hook失败: ${(error as Error).message}`);
		}
	});

	if (generatedCount > 0) {
		console.log(`✅ 已重新生成 ${generatedCount} 个Hook配置`);
		console.log('\n💡 执行以下命令使配置立即生效：');
		shellRcFiles.forEach(rcFile => {
			console.log(`  source ${rcFile}`);
		});
	}
}

async function handleCleanCommand(): Promise<void> {
	const config = configCache.getConfig();

	if (!config.shell) {
		console.error('❌ 未设置终端类型');
		process.exit(1);
	}

	const shellRcFiles = getShellConfigFiles(config.shell);
	let cleanedCount = 0;

	shellRcFiles.forEach(rcFile => {
		try {
			HookManager.removeHook(rcFile);
			cleanedCount++;
		} catch (error) {
			console.warn(`⚠️ 清理 ${rcFile} 失败: ${(error as Error).message}`);
		}
	});

	if (cleanedCount > 0) {
		console.log(`✅ 已清理 ${cleanedCount} 个Hook配置`);
		console.log('ℹ️ 请重新打开终端使更改生效');
	}
}

function handleError(error: any): void {
	if (error instanceof SecurityError || error instanceof ValidationError) {
		let message = `❌ ${error.message}`;
		if (error.suggestions && error.suggestions.length > 0) {
			message += '\n\n💡 建议解决方案：';
			error.suggestions.forEach((suggestion: string) => {
				message += `\n   • ${suggestion}`;
			});
		}

		console.error(message);
	} else {
		console.error(`❌ 发生错误: ${error.message}`);
	}
}
