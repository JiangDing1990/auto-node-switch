import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {WorkdirConfig} from './config.js';
import {Security} from './security.js';

const HOME = os.homedir();

const HOOK_MARKER = '# Node.js 工作目录环境切换';
const HOOK_END_MARKER = '# Node.js 工作目录环境切换 END';
const POWERSHELL_HOOK_MARKER = '# Node.js 工作目录环境切换';
const POWERSHELL_HOOK_END_MARKER = '# Node.js 工作目录环境切换 END';

/**
 * Hook 管理类
 */
export class HookManager {
	/**
	 * 生成版本检测的 JavaScript 代码（用于嵌入 shell hook）
	 */
	private static generateVersionDetectionJS(manager: string): string {
		const isForN = manager === 'n';
		const versionFiles = isForN
			? "'.node-version', '.nvmrc'"
			: "'.nvmrc', '.node-version'";
		const sourceFileDesc = isForN
			? '".node-version或.nvmrc"'
			: '".nvmrc或.node-version"';

		return `
      const fs = require('fs');
      const path = require('path');
      const workdirs = JSON.parse(fs.readFileSync(0, 'utf8'));
      const cwd = process.cwd();
      
      // 版本文件读取函数
      function readVersionFile(projectDir) {
        const versionFiles = [${versionFiles}];
        
        for (const fileName of versionFiles) {
          const filePath = path.join(projectDir, fileName);
          try {
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf8').trim();
              if (content) return content.replace(/^v/, '');
            }
          } catch (e) { /* ignore */ }
        }
        
        // 检查 package.json 的 engines.node
        try {
          const pkgPath = path.join(projectDir, 'package.json');
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const nodeVersion = pkg.engines && pkg.engines.node;
            if (nodeVersion) {
              const match = nodeVersion.match(/(\\\\d+\\\\.\\\\d+\\\\.\\\\d+|\\\\d+\\\\.\\\\d+|\\\\d+)/);
              return match ? match[1] : null;
            }
          }
        } catch (e) { /* ignore */ }
        return null;
      }
      
      // 1. 优先查找脚本配置的工作目录
      let bestMatch = null;
      let bestLength = -1;
      
      for (const w of workdirs) {
        if (cwd === w.dir || cwd.startsWith(w.dir + '/')) {
          if (w.dir.length > bestLength) {
            bestMatch = w;
            bestLength = w.dir.length;
          }
        }
      }
      
      if (bestMatch) {
        const dirName = path.basename(bestMatch.dir);
        console.log(\\\`\\\${bestMatch.version}|config|\\\${dirName}\\\`);
        return;
      }
      
      // 2. 如果没有脚本配置，尝试读取版本文件
      const fileVersion = readVersionFile(cwd);
      if (fileVersion) {
        const dirName = path.basename(cwd);
        const sourceFile = ${sourceFileDesc};
        console.log(\\\`\\\${fileVersion}|file|\\\${dirName}|\\\${sourceFile}\\\`);
        return;
      }
  `
			.replace(/\n\s*/g, ' ')
			.trim();
	}

	/**
	 * 为 Bash/Zsh 生成 Hook
	 */
	private static generateBashHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		const dirsJson = JSON.stringify(workdirs);
		const escapedDirsJson = Security.escapeShellString(dirsJson);

		// 生成版本检测的 JavaScript 代码
		const versionDetectionJS = this.generateVersionDetectionJS(manager);

		let nvmPath = '';
		if (manager === 'nvm') {
			const nvmPaths = [
				path.join(HOME, '.nvm/nvm.sh'),
				'/usr/local/share/nvm/nvm.sh',
				'/opt/homebrew/share/nvm/nvm.sh',
			];
			nvmPath =
				nvmPaths.find(p => fs.existsSync(p)) || path.join(HOME, '.nvm/nvm.sh');
		}

		if (manager === 'nvm') {
			return `${HOOK_MARKER}
npm() {
  local WORKDIRS='${escapedDirsJson}'
  local TARGET_VERSION=""
  local PREVIOUS_VERSION=""

  # 获取当前 Node 版本
  if command -v node >/dev/null 2>&1; then
    PREVIOUS_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  # 检查是否在工作目录中
  if [ -n "$WORKDIRS" ]; then
    local WORKDIR_INFO=$(echo "$WORKDIRS" | node -e '${versionDetectionJS}' 2>/dev/null)
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%%|*}"
      local VERSION_SOURCE="\$(echo "$WORKDIR_INFO" | cut -d'|' -f2)"
      local WORKDIR_NAME="\$(echo "$WORKDIR_INFO" | cut -d'|' -f3)"
      local SOURCE_FILE="\$(echo "$WORKDIR_INFO" | cut -d'|' -f4)"
      
      if [ "$VERSION_SOURCE" = "config" ]; then
        echo "📁 检测到配置项目: \$WORKDIR_NAME (Node \$TARGET_VERSION)"
      else
        echo "📁 检测到项目版本文件: \$WORKDIR_NAME (Node \$TARGET_VERSION from \$SOURCE_FILE)"
      fi
    fi
  fi

  # 版本切换和恢复机制
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: \$PREVIOUS_VERSION -> \$TARGET_VERSION"
    source "${nvmPath}" >/dev/null 2>&1
    nvm use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      nvm install "$TARGET_VERSION" >/dev/null 2>&1 && nvm use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 设置恢复机制
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '\$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '\$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 执行 npm 命令
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}
${HOOK_END_MARKER}
`;
		}

		if (manager === 'n') {
			return `${HOOK_MARKER}
npm() {
  local WORKDIRS='${escapedDirsJson}'
  local TARGET_VERSION=""
  local PREVIOUS_VERSION=""

  # 获取当前 Node 版本
  if command -v node >/dev/null 2>&1; then
    PREVIOUS_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  # 检查是否在工作目录中
  if [ -n "$WORKDIRS" ]; then
    local WORKDIR_INFO=$(echo "$WORKDIRS" | node -e '${versionDetectionJS}' 2>/dev/null)
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%%|*}"
      local VERSION_SOURCE="\$(echo "$WORKDIR_INFO" | cut -d'|' -f2)"
      local WORKDIR_NAME="\$(echo "$WORKDIR_INFO" | cut -d'|' -f3)"
      local SOURCE_FILE="\$(echo "$WORKDIR_INFO" | cut -d'|' -f4)"
      
      if [ "$VERSION_SOURCE" = "config" ]; then
        echo "📁 检测到配置项目: \$WORKDIR_NAME (Node \$TARGET_VERSION)"
      else
        echo "📁 检测到项目版本文件: \$WORKDIR_NAME (Node \$TARGET_VERSION from \$SOURCE_FILE)"
      fi
    fi
  fi

  # 版本切换和恢复机制
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: \$PREVIOUS_VERSION -> \$TARGET_VERSION"
    
    # 检查版本是否存在，如不存在则安装
    if ! n ls 2>/dev/null | grep -q "$TARGET_VERSION"; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，正在安装..."
      n install "$TARGET_VERSION" >/dev/null 2>&1
      if [ $? -ne 0 ]; then
        echo "❌ 版本 $TARGET_VERSION 安装失败，将使用当前版本"
        TARGET_VERSION="$PREVIOUS_VERSION"
      else
        echo "✅ 版本 $TARGET_VERSION 安装成功"
      fi
    fi
    
    if [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
      n "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 设置恢复机制
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; n '\$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; n '\$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 执行 npm 命令
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}
${HOOK_END_MARKER}
`;
		}

		return '';
	}

	/**
	 * 为 Fish Shell 生成 Hook
	 */
	private static generateFishHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		const dirsJson = JSON.stringify(workdirs);
		const escapedDirsJson = Security.escapeShellString(dirsJson);

		// 生成版本检测的 JavaScript 代码（与 Bash 版本相同）
		const versionDetectionJS = this.generateVersionDetectionJS(manager);

		if (manager === 'nvm') {
			const nvmPaths = [
				path.join(HOME, '.nvm/nvm.sh'),
				'/usr/local/share/nvm/nvm.sh',
				'/opt/homebrew/share/nvm/nvm.sh',
			];
			const nvmPath =
				nvmPaths.find(p => fs.existsSync(p)) || path.join(HOME, '.nvm/nvm.sh');

			return `${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""
    
    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end
    
    # 检查是否在工作目录中（支持 .nvmrc/.node-version 文件检测）
    if test -n "$WORKDIRS"
        set WORKDIR_INFO (echo "$WORKDIRS" | node -e '${versionDetectionJS}' 2>/dev/null)
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo "$WORKDIR_INFO" | cut -d'|' -f1)
            set VERSION_SOURCE (echo "$WORKDIR_INFO" | cut -d'|' -f2)
            set WORKDIR_NAME (echo "$WORKDIR_INFO" | cut -d'|' -f3)
            set SOURCE_FILE (echo "$WORKDIR_INFO" | cut -d'|' -f4)
            
            if test "$VERSION_SOURCE" = "config"
                echo "📁 检测到配置项目: $WORKDIR_NAME (Node $TARGET_VERSION)"
            else
                echo "📁 检测到项目版本文件: $WORKDIR_NAME (Node $TARGET_VERSION from $SOURCE_FILE)"
            end
        end
    end
    
    # 切换到目标版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        
        # 确保 nvm 已加载
        if not type -q nvm
            if test -f "${nvmPath}"
                source "${nvmPath}" >/dev/null 2>&1
            end
        end
        
        nvm use "$TARGET_VERSION" >/dev/null 2>&1
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            nvm install "$TARGET_VERSION" >/dev/null 2>&1; and nvm use "$TARGET_VERSION" >/dev/null 2>&1
        end
        
        # Fish shell 修复：版本切换成功后设置恢复机制
        function _restore_nvm_version --on-signal INT --on-signal TERM
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            nvm use "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    end
    
    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    # Fish shell 修复：正常完成时恢复版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION" -a -n "$PREVIOUS_VERSION"
        echo "📦 执行完成，恢复到之前的 Node.js 版本..."
        echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
        nvm use "$PREVIOUS_VERSION" >/dev/null 2>&1
    end
    
    return $exit_code
end
${HOOK_END_MARKER}
`;
		}

		if (manager === 'n') {
			return `${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""
    
    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end
    
    # 检查是否在工作目录中（支持 .nvmrc/.node-version 文件检测）
    if test -n "$WORKDIRS"
        set WORKDIR_INFO (echo "$WORKDIRS" | node -e '${versionDetectionJS}' 2>/dev/null)
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo "$WORKDIR_INFO" | cut -d'|' -f1)
            set VERSION_SOURCE (echo "$WORKDIR_INFO" | cut -d'|' -f2)
            set WORKDIR_NAME (echo "$WORKDIR_INFO" | cut -d'|' -f3)
            set SOURCE_FILE (echo "$WORKDIR_INFO" | cut -d'|' -f4)
            
            if test "$VERSION_SOURCE" = "config"
                echo "📁 检测到配置项目: $WORKDIR_NAME (Node $TARGET_VERSION)"
            else
                echo "📁 检测到项目版本文件: $WORKDIR_NAME (Node $TARGET_VERSION from $SOURCE_FILE)"
            end
        end
    end
    
    # Fish shell 修复：版本切换和恢复机制
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        
        # 检查版本是否存在，如不存在则安装
        if not n ls 2>/dev/null | grep -q "$TARGET_VERSION"
            echo "⚠️ 版本 $TARGET_VERSION 不存在，正在安装..."
            n install "$TARGET_VERSION" >/dev/null 2>&1
            if test $status -ne 0
                echo "❌ 版本 $TARGET_VERSION 安装失败，将使用当前版本"
                set TARGET_VERSION "$PREVIOUS_VERSION"
            else
                echo "✅ 版本 $TARGET_VERSION 安装成功"
            end
        end
        
        if test "$TARGET_VERSION" != "$PREVIOUS_VERSION"
            n "$TARGET_VERSION" >/dev/null 2>&1
        end
        
        # Fish shell 修复：版本切换成功后设置恢复机制
        function _restore_n_version --on-signal INT --on-signal TERM
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            n "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    end
    
    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    # Fish shell 修复：正常完成时恢复版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION" -a -n "$PREVIOUS_VERSION"
        echo "📦 执行完成，恢复到之前的 Node.js 版本..."
        echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
        n "$PREVIOUS_VERSION" >/dev/null 2>&1
    end
    
    return $exit_code
end
${HOOK_END_MARKER}
`;
		}

		return '';
	}

	/**
	 * 为 PowerShell 生成 Hook
	 */
	private static generatePowerShellHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		const dirsJson = JSON.stringify(workdirs);

		if (manager === 'nvm-windows') {
			return `${POWERSHELL_HOOK_MARKER}
function npm {
    $WORKDIRS = '${dirsJson}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""
    
    # 获取当前 Node 版本
    try {
        $PREVIOUS_VERSION = (node -v 2>$null).Replace("v", "")
    } catch {
        $PREVIOUS_VERSION = ""
    }
    
    # 检查是否在工作目录中
    if ($WORKDIRS) {
        try {
            $workdirArray = $WORKDIRS | ConvertFrom-Json
            $currentDir = Get-Location
            
            foreach ($workdir in $workdirArray) {
                $resolvedWorkdir = [System.IO.Path]::GetFullPath($workdir.dir)
                $resolvedCurrent = [System.IO.Path]::GetFullPath($currentDir.Path)
                
                if ($resolvedCurrent.StartsWith($resolvedWorkdir)) {
                    $TARGET_VERSION = $workdir.version
                    Write-Host "📁 检测到配置项目: $(Split-Path $workdir.dir -Leaf) (Node $TARGET_VERSION)"
                    break
                }
            }
        } catch {
            # 忽略 JSON 解析错误
        }
    }
    
    # 切换到目标版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION) {
        Write-Host "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        nvm use $TARGET_VERSION 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️ 版本 $TARGET_VERSION 未安装，尝试安装..."
            nvm install $TARGET_VERSION 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ 版本 $TARGET_VERSION 安装成功"
                nvm use $TARGET_VERSION 2>$null
            }
        }
    }
    
    # 执行原始 npm 命令
    & "npm.cmd" @args
    $exitCode = $LASTEXITCODE
    
    # 命令执行完成后恢复版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION -and $PREVIOUS_VERSION) {
        Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..."
        Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
        nvm use $PREVIOUS_VERSION 2>$null
    }
    
    return $exitCode
}
${POWERSHELL_HOOK_END_MARKER}
`;
		}

		if (manager === 'fnm' || manager === 'nvs') {
			return `${POWERSHELL_HOOK_MARKER}
function npm {
    $WORKDIRS = '${dirsJson}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""
    
    # 获取当前 Node 版本
    try {
        $PREVIOUS_VERSION = (node -v 2>$null).Replace("v", "")
    } catch {
        $PREVIOUS_VERSION = ""
    }
    
    # 检查是否在工作目录中
    if ($WORKDIRS) {
        try {
            $workdirArray = $WORKDIRS | ConvertFrom-Json
            $currentDir = Get-Location
            
            foreach ($workdir in $workdirArray) {
                $resolvedWorkdir = [System.IO.Path]::GetFullPath($workdir.dir)
                $resolvedCurrent = [System.IO.Path]::GetFullPath($currentDir.Path)
                
                if ($resolvedCurrent.StartsWith($resolvedWorkdir)) {
                    $TARGET_VERSION = $workdir.version
                    Write-Host "📁 检测到配置项目: $(Split-Path $workdir.dir -Leaf) (Node $TARGET_VERSION)"
                    break
                }
            }
        } catch {
            # 忽略 JSON 解析错误
        }
    }
    
    # 切换到目标版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION) {
        Write-Host "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        ${manager} use $TARGET_VERSION 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️ 版本 $TARGET_VERSION 未安装，尝试安装..."
            ${manager} install $TARGET_VERSION 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ 版本 $TARGET_VERSION 安装成功"
                ${manager} use $TARGET_VERSION 2>$null
            }
        }
    }
    
    # 执行原始 npm 命令
    & "npm.cmd" @args
    $exitCode = $LASTEXITCODE
    
    # 命令执行完成后恢复版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION -and $PREVIOUS_VERSION) {
        Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..."
        Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
        ${manager} use $PREVIOUS_VERSION 2>$null
    }
    
    return $exitCode
}
${POWERSHELL_HOOK_END_MARKER}
`;
		}

		return '';
	}

	/**
	 * 添加 Hook 到 Shell 配置文件
	 */
	static addHook(
		shellRcPath: string,
		manager: string,
		workdirs: WorkdirConfig[],
	): void {
		try {
			// 确保文件存在
			if (!fs.existsSync(shellRcPath)) {
				fs.writeFileSync(shellRcPath, '', 'utf8');
			}

			let content = fs.readFileSync(shellRcPath, 'utf8');

			// 移除现有 hook
			const regex = new RegExp(
				`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
				'g',
			);
			content = content.replace(regex, '');

			// 生成新 hook
			let hook = '';
			const isFishShell = shellRcPath.includes('config.fish');
			const isPowerShell =
				shellRcPath.includes('.ps1') || shellRcPath.includes('PowerShell');

			if (isPowerShell) {
				hook = this.generatePowerShellHook(manager, workdirs);
			} else if (isFishShell) {
				hook = this.generateFishHook(manager, workdirs);
			} else {
				hook = this.generateBashHook(manager, workdirs);
			}

			// 添加 hook
			const separator = content.endsWith('\n') ? '' : '\n';
			content += `${separator}${hook}`;

			fs.writeFileSync(shellRcPath, content, 'utf8');
			console.log(`✅ 已成功配置 ${path.basename(shellRcPath)}`);
		} catch (error) {
			console.error(`❌ 更新 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 移除 Shell 配置文件中的 Hook
	 */
	static removeHook(shellRcPath: string): void {
		try {
			if (!fs.existsSync(shellRcPath)) {
				console.warn(`⚠️ 文件不存在: ${shellRcPath}`);
				return;
			}

			const content = fs.readFileSync(shellRcPath, 'utf8');
			const regex = new RegExp(
				`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
				'g',
			);
			const newContent = content.replace(regex, '');

			if (newContent !== content) {
				fs.writeFileSync(shellRcPath, newContent, 'utf8');
				console.log(`✅ 已清理 ${path.basename(shellRcPath)} 中的 hook`);
			} else {
				console.log(`ℹ️ ${path.basename(shellRcPath)} 中没有找到 hook`);
			}
		} catch (error) {
			console.error(`❌ 清理 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 检查 Shell 配置文件中是否存在 Hook
	 */
	static hasHook(shellRcPath: string): boolean {
		try {
			if (!fs.existsSync(shellRcPath)) {
				return false;
			}

			const content = fs.readFileSync(shellRcPath, 'utf8');
			return content.includes(HOOK_MARKER);
		} catch {
			return false;
		}
	}
}
