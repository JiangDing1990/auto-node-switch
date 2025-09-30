/**
 * Fish Shell配置
 * 支持Fish Shell (Friendly Interactive Shell)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Security} from '../security.js';
import {templateEngine} from '../template-engine.js';
import type {ShellConfig, TemplateData} from './types.js';

const HOME = os.homedir();

export class FishShellConfig implements ShellConfig {
	name = 'fish';

	configFiles = ['config.fish'];

	supportedManagers = ['nvm', 'n', 'fnm'];

	isConfigFile(filePath: string): boolean {
		const fileName = path.basename(filePath);
		return (
			this.configFiles.includes(fileName) || filePath.includes('config.fish')
		);
	}

	isSupportedManager(manager: string): boolean {
		return this.supportedManagers.includes(manager);
	}

	getHookTemplate(data: TemplateData): string {
		const {manager, workdirs} = data;

		if (!this.isSupportedManager(manager)) {
			throw new Error(`不支持的管理器: ${manager}`);
		}

		// 验证工作目录
		const validatedWorkdirs = workdirs.map(w => ({
			dir: Security.validatePath(w.dir),
			version: Security.validateVersion(w.version),
		}));

		// 生成转义的JSON字符串
		const dirsJson = JSON.stringify(validatedWorkdirs);
		const escapedDirsJson = Security.escapeShellString(dirsJson);

		// 检测nvm路径
		const nvmPath = this.detectNvmPath();

		const templateData: TemplateData = {
			...data,
			escapedDirsJson,
			nvmPath,
		};

		// 获取对应的模板
		const template = this.getTemplate(manager);

		return templateEngine.render(template, templateData);
	}

	private detectNvmPath(): string {
		const nvmPaths = [
			path.join(HOME, '.nvm/nvm.sh'),
			'/usr/local/share/nvm/nvm.sh',
			'/opt/homebrew/share/nvm/nvm.sh',
		];

		return (
			nvmPaths.find(p => fs.existsSync(p)) ?? path.join(HOME, '.nvm/nvm.sh')
		);
	}

	private getTemplate(manager: string): string {
		const templates = this.getTemplates();
		const template = templates[manager];

		if (!template) {
			throw new Error(`不支持的管理器模板: ${manager}`);
		}

		return template;
	}

	private getTemplates(): Record<string, string> {
		return {
			nvm: `function npm
    set WORKDIRS '{{escapedDirsJson}}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""

    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end

    # 检查是否在工作目录中 (Fish语法，使用纯Shell解析避免Python依赖)
    if test -n "$WORKDIRS"
        set WORKDIR_INFO ""
        set CURRENT_DIR (pwd)
        
        # 使用Fish的string命令解析JSON
        set work_dir (echo "$WORKDIRS" | string match -r '"dir":"([^"]*)"' | tail -1)
        set work_version (echo "$WORKDIRS" | string match -r '"version":"([^"]*)"' | tail -1)
        
        # 检查当前目录是否匹配工作目录
        if test "$CURRENT_DIR" = "$work_dir"; or string match -q "$work_dir/*" "$CURRENT_DIR"
            set WORKDIR_INFO "$work_version|"(basename "$work_dir")
        end
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo $WORKDIR_INFO | cut -d'|' -f1)
            set WORKDIR_NAME (echo $WORKDIR_INFO | cut -d'|' -f2)
            echo "📁 检测到工作目录: $WORKDIR_NAME"
        end
    end

    # 切换版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        
        # Fish中使用bash来运行nvm命令（因为nvm是bash脚本）
        bash -c "source '{{nvmPath}}' >/dev/null 2>&1; nvm use '$TARGET_VERSION' >/dev/null 2>&1"
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            bash -c "source '{{nvmPath}}' >/dev/null 2>&1; nvm install '$TARGET_VERSION' >/dev/null 2>&1; nvm use '$TARGET_VERSION' >/dev/null 2>&1"
        end
        
        # 执行npm命令
        command npm $argv
        set exit_code $status
        
        # 恢复到之前的版本
        if test -n "$PREVIOUS_VERSION"
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            bash -c "source '{{nvmPath}}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1"
        end
    else
        # 直接执行npm命令
        command npm $argv
        set exit_code $status
    end
    
    return $exit_code
end`,
			n: `function npm
    set WORKDIRS '{{escapedDirsJson}}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""

    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end

    # 检查是否在工作目录中 (Fish语法，使用纯Shell解析避免Python依赖)
    if test -n "$WORKDIRS"
        set WORKDIR_INFO ""
        set CURRENT_DIR (pwd)
        
        # 使用Fish的string命令解析JSON
        set work_dir (echo "$WORKDIRS" | string match -r '"dir":"([^"]*)"' | tail -1)
        set work_version (echo "$WORKDIRS" | string match -r '"version":"([^"]*)"' | tail -1)
        
        # 检查当前目录是否匹配工作目录
        if test "$CURRENT_DIR" = "$work_dir"; or string match -q "$work_dir/*" "$CURRENT_DIR"
            set WORKDIR_INFO "$work_version|"(basename "$work_dir")
        end
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo $WORKDIR_INFO | cut -d'|' -f1)
            set WORKDIR_NAME (echo $WORKDIR_INFO | cut -d'|' -f2)
            echo "📁 检测到工作目录: $WORKDIR_NAME"
        end
    end

    # 切换版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        
        # 使用n命令切换版本
        n use "$TARGET_VERSION" >/dev/null 2>&1
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            n install "$TARGET_VERSION" >/dev/null 2>&1
            n use "$TARGET_VERSION" >/dev/null 2>&1
        end
        
        # 执行npm命令
        command npm $argv
        set exit_code $status
        
        # 恢复到之前的版本
        if test -n "$PREVIOUS_VERSION"
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            n use "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    else
        # 直接执行npm命令
        command npm $argv
        set exit_code $status
    end
    
    return $exit_code
end`,
			fnm: `function npm
    set WORKDIRS '{{escapedDirsJson}}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""

    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end

    # 检查是否在工作目录中 (Fish语法，使用纯Shell解析避免Python依赖)
    if test -n "$WORKDIRS"
        set WORKDIR_INFO ""
        set CURRENT_DIR (pwd)
        
        # 使用Fish的string命令解析JSON
        set work_dir (echo "$WORKDIRS" | string match -r '"dir":"([^"]*)"' | tail -1)
        set work_version (echo "$WORKDIRS" | string match -r '"version":"([^"]*)"' | tail -1)
        
        # 检查当前目录是否匹配工作目录
        if test "$CURRENT_DIR" = "$work_dir"; or string match -q "$work_dir/*" "$CURRENT_DIR"
            set WORKDIR_INFO "$work_version|"(basename "$work_dir")
        end
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo $WORKDIR_INFO | cut -d'|' -f1)
            set WORKDIR_NAME (echo $WORKDIR_INFO | cut -d'|' -f2)
            echo "📁 检测到工作目录: $WORKDIR_NAME"
        end
    end

    # 切换版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        
        # 使用fnm命令切换版本
        fnm use "$TARGET_VERSION" >/dev/null 2>&1
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            fnm install "$TARGET_VERSION" >/dev/null 2>&1
            fnm use "$TARGET_VERSION" >/dev/null 2>&1
        end
        
        # 执行npm命令
        command npm $argv
        set exit_code $status
        
        # 恢复到之前的版本
        if test -n "$PREVIOUS_VERSION"
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            fnm use "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    else
        # 直接执行npm命令
        command npm $argv
        set exit_code $status
    end
    
    return $exit_code
end`,
		};
	}
}
