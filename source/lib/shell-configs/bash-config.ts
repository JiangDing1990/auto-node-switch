/**
 * Bash/Zsh Shell配置
 * 支持 Bash, Zsh 等POSIX兼容Shell
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Security} from '../security.js';
import {templateEngine} from '../template-engine.js';
import type {ShellConfig, TemplateData} from './types.js';

const HOME = os.homedir();

export class BashShellConfig implements ShellConfig {
	name = 'bash';

	configFiles = ['.bashrc', '.bash_profile', '.zshrc', '.profile'];

	supportedManagers = ['nvm', 'n', 'fnm'];

	isConfigFile(filePath: string): boolean {
		const fileName = path.basename(filePath);
		return this.configFiles.includes(fileName);
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
			nvm: `npm() {
  local WORKDIRS='{{escapedDirsJson}}'
  local TARGET_VERSION=""
  local PREVIOUS_VERSION=""

  # 获取当前 Node 版本
  if command -v node >/dev/null 2>&1; then
    PREVIOUS_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  # 检查是否在工作目录中 (纯Shell实现，避免Node.js依赖)
  if [ -n "$WORKDIRS" ]; then
    local CURRENT_DIR="$(pwd)"
    local WORKDIR_INFO=""
    
    # 使用更简单可靠的JSON解析方法
    local CURRENT_DIR="$(pwd)"
    # 提取目录和版本，使用更安全的方法
    local work_dir=$(echo "$WORKDIRS" | sed 's/.*"dir":"\\([^"]*\\)".*/\\1/')
    local work_version=$(echo "$WORKDIRS" | sed 's/.*"version":"\\([^"]*\\)".*/\\1/')
    
    # 检查当前目录是否匹配工作目录
    if [ "$CURRENT_DIR" = "$work_dir" ] || echo "$CURRENT_DIR" | grep -q "^$work_dir/"; then
      WORKDIR_INFO="$work_version|$(basename "$work_dir")"
    fi
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%|*}"
      local WORKDIR_NAME="\${WORKDIR_INFO#*|}"
      echo "📁 检测到工作目录: $WORKDIR_NAME"
    fi
  fi

  # 🔧 终极修复：使用trap确保版本恢复
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
    source "{{nvmPath}}" >/dev/null 2>&1
    nvm use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      nvm install "$TARGET_VERSION" >/dev/null 2>&1 && nvm use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; source '{{nvmPath}}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; source '{{nvmPath}}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}`,
			n: `npm() {
  local WORKDIRS='{{escapedDirsJson}}'
  local TARGET_VERSION=""
  local PREVIOUS_VERSION=""

  # 获取当前 Node 版本
  if command -v node >/dev/null 2>&1; then
    PREVIOUS_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  # 检查是否在工作目录中 (纯Shell实现，避免Node.js依赖)
  if [ -n "$WORKDIRS" ]; then
    local CURRENT_DIR="$(pwd)"
    local WORKDIR_INFO=""
    
    # 使用更简单可靠的JSON解析方法
    local CURRENT_DIR="$(pwd)"
    # 提取目录和版本，使用更安全的方法
    local work_dir=$(echo "$WORKDIRS" | sed 's/.*"dir":"\\([^"]*\\)".*/\\1/')
    local work_version=$(echo "$WORKDIRS" | sed 's/.*"version":"\\([^"]*\\)".*/\\1/')
    
    # 检查当前目录是否匹配工作目录
    if [ "$CURRENT_DIR" = "$work_dir" ] || echo "$CURRENT_DIR" | grep -q "^$work_dir/"; then
      WORKDIR_INFO="$work_version|$(basename "$work_dir")"
    fi
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%|*}"
      local WORKDIR_NAME="\${WORKDIR_INFO#*|}"
      echo "📁 检测到工作目录: $WORKDIR_NAME"
    fi
  fi

  # 🔧 终极修复：使用trap确保版本恢复
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
    n use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      n install "$TARGET_VERSION" >/dev/null 2>&1 && n use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; n use '$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; n use '$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}`,
			fnm: `npm() {
  local WORKDIRS='{{escapedDirsJson}}'
  local TARGET_VERSION=""
  local PREVIOUS_VERSION=""

  # 获取当前 Node 版本
  if command -v node >/dev/null 2>&1; then
    PREVIOUS_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  # 检查是否在工作目录中 (纯Shell实现，避免Node.js依赖)
  if [ -n "$WORKDIRS" ]; then
    local CURRENT_DIR="$(pwd)"
    local WORKDIR_INFO=""
    
    # 使用更简单可靠的JSON解析方法
    local CURRENT_DIR="$(pwd)"
    # 提取目录和版本，使用更安全的方法
    local work_dir=$(echo "$WORKDIRS" | sed 's/.*"dir":"\\([^"]*\\)".*/\\1/')
    local work_version=$(echo "$WORKDIRS" | sed 's/.*"version":"\\([^"]*\\)".*/\\1/')
    
    # 检查当前目录是否匹配工作目录
    if [ "$CURRENT_DIR" = "$work_dir" ] || echo "$CURRENT_DIR" | grep -q "^$work_dir/"; then
      WORKDIR_INFO="$work_version|$(basename "$work_dir")"
    fi
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%|*}"
      local WORKDIR_NAME="\${WORKDIR_INFO#*|}"
      echo "📁 检测到工作目录: $WORKDIR_NAME"
    fi
  fi

  # 🔧 终极修复：使用trap确保版本恢复
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
    fnm use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      fnm install "$TARGET_VERSION" >/dev/null 2>&1 && fnm use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; fnm use '$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; fnm use '$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}`,
		};
	}
}
