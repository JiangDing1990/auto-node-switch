import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {WorkdirConfig} from './config.js';
import {Security} from './security.js';

const HOME = os.homedir();

const HOOK_MARKER = '# Node.js 工作目录环境切换';
const HOOK_END_MARKER = '# Node.js 工作目录环境切换 END';

/**
 * Hook 管理类 - 与 node-auto-switch.js 中的实现保持一致
 */
export class HookManager {
	/**
	 * 添加 Hook 到指定的 shell 配置文件
	 */
	static addHook(
		shellRcPath: string,
		manager: string,
		workdirs: WorkdirConfig[],
	): void {
		try {
			// 确保文件存在
			if (!fs.existsSync(shellRcPath)) {
				// 确保目录存在
				const dir = path.dirname(shellRcPath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, {recursive: true});
				}

				fs.writeFileSync(shellRcPath, '', 'utf8');
			}

			let content = fs.readFileSync(shellRcPath, 'utf8');

			// 移除现有 hook
			const regex = new RegExp(
				`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
				'g',
			);
			content = content.replace(regex, '');

			// 检测配置文件类型并生成对应的 hook
			let hook = '';
			const isPowerShell = shellRcPath.endsWith('.ps1');
			const isFishShell = shellRcPath.includes('config.fish');
			const isCmdBatch =
				shellRcPath.endsWith('.bat') || shellRcPath.endsWith('.cmd');

			if (isPowerShell) {
				hook = this.generatePowerShellHook(manager, workdirs);
			} else if (isFishShell) {
				hook = this.generateReliableFishHook(manager, workdirs);
			} else if (isCmdBatch) {
				// CMD 不支持函数，跳过
				console.warn(
					`⚠️ CMD 不支持自定义函数，跳过 ${path.basename(shellRcPath)} 配置`,
				);
				return;
			} else {
				// 默认使用 Bash/Zsh hook
				hook = this.generateReliableBashHook(manager, workdirs);
			}

			if (hook) {
				// 添加 hook
				// 确保前面有换行符但避免多余换行
			if (content && !content.endsWith('\n')) {
				content += '\n';
			}
			content += hook;
		// 确保文件末尾有换行符
		if (!content.endsWith('\n')) {
			content += '\n';
		}
				fs.writeFileSync(shellRcPath, content, 'utf8');
				console.log(`✅ 已成功配置 ${path.basename(shellRcPath)}`);
			}
		} catch (error) {
			throw new Error(`配置 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 从指定的 shell 配置文件中移除 Hook
	 */
	static removeHook(shellRcPath: string): void {
		try {
			if (!fs.existsSync(shellRcPath)) {
				console.warn(`文件不存在: ${shellRcPath}`);
				return;
			}

			const content = fs.readFileSync(shellRcPath, 'utf8');
			const regex = new RegExp(
				`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
				'g',
			);
			const newContent = content.replace(regex, '');
			// eslint-disable-next-line no-negated-condition
			if (newContent !== content) {
				fs.writeFileSync(shellRcPath, newContent, 'utf8');
				console.log(`✅ 已从 ${path.basename(shellRcPath)} 中移除 Hook`);
			} else {
				console.log(`ℹ️ ${path.basename(shellRcPath)} 中没有找到 Hook`);
			}
		} catch (error) {
			throw new Error(`清理 ${shellRcPath} 失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 生成可靠的 Bash Hook（基于 node-auto-switch.js 的最新实现）
	 */
	private static generateReliableBashHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		// 为了安全起见，对工作目录进行额外验证
		const validatedWorkdirs = workdirs.map(w => ({
			dir: Security.validatePath(w.dir),
			version: Security.validateVersion(w.version),
		}));

		const dirsJson = JSON.stringify(validatedWorkdirs);
		const escapedDirsJson = Security.escapeShellString(dirsJson);

		// 检测 nvm 路径
		const nvmPaths = [
			path.join(HOME, '.nvm/nvm.sh'),
			'/usr/local/share/nvm/nvm.sh',
			'/opt/homebrew/share/nvm/nvm.sh',
		];
		const nvmPath =
			nvmPaths.find(p => fs.existsSync(p)) ?? path.join(HOME, '.nvm/nvm.sh');

		if (manager === 'nvm') {
			return `\n${HOOK_MARKER}
npm() {
  local WORKDIRS='${escapedDirsJson}'
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
    source "${nvmPath}" >/dev/null 2>&1
    nvm use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      nvm install "$TARGET_VERSION" >/dev/null 2>&1 && nvm use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}
${HOOK_END_MARKER}`;
		}

		if (manager === 'n') {
			return `\n${HOOK_MARKER}
npm() {
  local WORKDIRS='${escapedDirsJson}'
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
}
${HOOK_END_MARKER}`;
		}

		return '';
	}

	/**
	 * 生成可靠的 Fish Hook（基于 node-auto-switch.js 的最新实现）
	 */
	private static generateReliableFishHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		// 为了安全起见，对工作目录进行额外验证
		const validatedWorkdirs = workdirs.map(w => ({
			dir: Security.validatePath(w.dir),
			version: Security.validateVersion(w.version),
		}));

		const dirsJson = JSON.stringify(validatedWorkdirs);
		const escapedDirsJson = Security.escapeShellString(dirsJson);

		// 检测 nvm 路径
		const nvmPaths = [
			path.join(HOME, '.nvm/nvm.sh'),
			'/usr/local/share/nvm/nvm.sh',
			'/opt/homebrew/share/nvm/nvm.sh',
		];
		const nvmPath =
			nvmPaths.find(p => fs.existsSync(p)) ?? path.join(HOME, '.nvm/nvm.sh');

		if (manager === 'nvm') {
			return `\n${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""

    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end

    # 检查是否在工作目录中 (Fish语法，避免Node.js依赖)
    if test -n "$WORKDIRS"
        set WORKDIR_INFO ""
        
        # 优先使用Python解析JSON
        if command -v python3 >/dev/null 2>&1
            set WORKDIR_INFO (echo "$WORKDIRS" | python3 -c "
import json, sys, os
try:
    workdirs = json.load(sys.stdin)
    cwd = os.getcwd()
    best_match = None
    best_length = -1
    
    for w in workdirs:
        w_dir = w['dir']
        if cwd == w_dir or cwd.startswith(w_dir + '/'):
            if len(w_dir) > best_length:
                best_match = w
                best_length = len(w_dir)
    
    if best_match:
        dir_name = os.path.basename(best_match['dir'])
        print(best_match['version'] + '|' + dir_name)
except:
    pass
" 2>/dev/null)
        else if command -v python >/dev/null 2>&1
            set WORKDIR_INFO (echo "$WORKDIRS" | python -c "
import json, sys, os
try:
    workdirs = json.load(sys.stdin)
    cwd = os.getcwd()
    best_match = None
    best_length = -1
    
    for w in workdirs:
        w_dir = w['dir']
        if cwd == w_dir or cwd.startswith(w_dir + '/'):
            if len(w_dir) > best_length:
                best_match = w
                best_length = len(w_dir)
    
    if best_match:
        dir_name = os.path.basename(best_match['dir'])
        print(best_match['version'] + '|' + dir_name)
except:
    pass
" 2>/dev/null)
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
        
        # 定义恢复函数
        function restore_version
            if test -n "$PREVIOUS_VERSION"
                echo "📦 执行完成，恢复到之前的 Node.js 版本..."
                echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
                bash -c "source '${nvmPath}' >/dev/null 2>&1; nvm use '$PREVIOUS_VERSION' >/dev/null 2>&1"
            end
        end
        
        # 设置信号处理
        trap restore_version INT
        trap restore_version EXIT
        
        # 切换到目标版本
        bash -c "source '${nvmPath}' >/dev/null 2>&1; nvm use '$TARGET_VERSION' >/dev/null 2>&1"
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            bash -c "source '${nvmPath}' >/dev/null 2>&1; nvm install '$TARGET_VERSION' >/dev/null 2>&1; nvm use '$TARGET_VERSION' >/dev/null 2>&1"
        end
    end

    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    return $exit_code
end
${HOOK_END_MARKER}`;
		}

		if (manager === 'n') {
			return `\n${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""

    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end

    # 检查是否在工作目录中 (Fish语法，避免Node.js依赖)
    if test -n "$WORKDIRS"
        set WORKDIR_INFO ""
        
        # 优先使用Python解析JSON
        if command -v python3 >/dev/null 2>&1
            set WORKDIR_INFO (echo "$WORKDIRS" | python3 -c "
import json, sys, os
try:
    workdirs = json.load(sys.stdin)
    cwd = os.getcwd()
    best_match = None
    best_length = -1
    
    for w in workdirs:
        w_dir = w['dir']
        if cwd == w_dir or cwd.startswith(w_dir + '/'):
            if len(w_dir) > best_length:
                best_match = w
                best_length = len(w_dir)
    
    if best_match:
        dir_name = os.path.basename(best_match['dir'])
        print(best_match['version'] + '|' + dir_name)
except:
    pass
" 2>/dev/null)
        else if command -v python >/dev/null 2>&1
            set WORKDIR_INFO (echo "$WORKDIRS" | python -c "
import json, sys, os
try:
    workdirs = json.load(sys.stdin)
    cwd = os.getcwd()
    best_match = None
    best_length = -1
    
    for w in workdirs:
        w_dir = w['dir']
        if cwd == w_dir or cwd.startswith(w_dir + '/'):
            if len(w_dir) > best_length:
                best_match = w
                best_length = len(w_dir)
    
    if best_match:
        dir_name = os.path.basename(best_match['dir'])
        print(best_match['version'] + '|' + dir_name)
except:
    pass
" 2>/dev/null)
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
        
        # 定义恢复函数
        function restore_version
            if test -n "$PREVIOUS_VERSION"
                echo "📦 执行完成，恢复到之前的 Node.js 版本..."
                echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
                n use "$PREVIOUS_VERSION" >/dev/null 2>&1
            end
        end
        
        # 设置信号处理
        trap restore_version INT
        trap restore_version EXIT
        
        # 切换到目标版本
        n use "$TARGET_VERSION" >/dev/null 2>&1
        if test $status -ne 0
            echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
            n install "$TARGET_VERSION" >/dev/null 2>&1
            n use "$TARGET_VERSION" >/dev/null 2>&1
        end
    end

    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    return $exit_code
end
${HOOK_END_MARKER}`;
		}

		return '';
	}

	/**
	 * 生成PowerShell Hook（Windows支持）
	 */
	private static generatePowerShellHook(
		manager: string,
		workdirs: WorkdirConfig[],
	): string {
		// 为了安全起见，对工作目录进行额外验证
		const validatedWorkdirs = workdirs.map(w => ({
			dir: Security.validatePath(w.dir),
			version: Security.validateVersion(w.version),
		}));

		const dirsJson = JSON.stringify(validatedWorkdirs);
		// PowerShell字符串转义：双引号转义，反斜杠转义，换行符转义
		const escapedDirsJson = dirsJson
			.replace(/\\/g, '\\\\') // 反斜杠转义
			.replace(/"/g, '""') // PowerShell双引号转义
			.replace(/\n/g, '\\n') // 换行符转义
			.replace(/\r/g, '\\r'); // 回车符转义

		if (manager === 'nvm-windows') {
			return `\n${HOOK_MARKER}
function npm {
    $WORKDIRS = '${escapedDirsJson}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        $WorkdirInfo = $WORKDIRS | ConvertFrom-Json | ForEach-Object {
            $workdir = $_
            $cwd = Get-Location | Select-Object -ExpandProperty Path
            if ($cwd -eq $workdir.dir -or $cwd.StartsWith($workdir.dir + [System.IO.Path]::DirectorySeparatorChar)) {
                return @{
                    version = $workdir.version
                    name = Split-Path $workdir.dir -Leaf
                    length = $workdir.dir.Length
                }
            }
        } | Sort-Object length -Descending | Select-Object -First 1

        if ($WorkdirInfo) {
            $TARGET_VERSION = $WorkdirInfo.version
            $WORKDIR_NAME = $WorkdirInfo.name
            Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
        }
    }

    # 切换版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION) {
        Write-Host "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION" -ForegroundColor Yellow
        
        try {
            nvm use $TARGET_VERSION 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..." -ForegroundColor Yellow
                nvm install $TARGET_VERSION
                nvm use $TARGET_VERSION
            }
            
            # 执行 npm 命令
            & npm.cmd @args
            $exitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                nvm use $PREVIOUS_VERSION 2>$null
            }
            
            # PowerShell函数正确返回退出码
            $global:LASTEXITCODE = $exitCode
            exit $exitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @args
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @args
    }
}
${HOOK_END_MARKER}`;
		}

		if (manager === 'fnm') {
			return `\n${HOOK_MARKER}
function npm {
    $WORKDIRS = '${escapedDirsJson}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        $WorkdirInfo = $WORKDIRS | ConvertFrom-Json | ForEach-Object {
            $workdir = $_
            $cwd = Get-Location | Select-Object -ExpandProperty Path
            if ($cwd -eq $workdir.dir -or $cwd.StartsWith($workdir.dir + [System.IO.Path]::DirectorySeparatorChar)) {
                return @{
                    version = $workdir.version
                    name = Split-Path $workdir.dir -Leaf
                    length = $workdir.dir.Length
                }
            }
        } | Sort-Object length -Descending | Select-Object -First 1

        if ($WorkdirInfo) {
            $TARGET_VERSION = $WorkdirInfo.version
            $WORKDIR_NAME = $WorkdirInfo.name
            Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
        }
    }

    # 切换版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION) {
        Write-Host "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION" -ForegroundColor Yellow
        
        try {
            fnm use $TARGET_VERSION 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..." -ForegroundColor Yellow
                fnm install $TARGET_VERSION
                fnm use $TARGET_VERSION
            }
            
            # 执行 npm 命令
            & npm.cmd @args
            $exitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                fnm use $PREVIOUS_VERSION 2>$null
            }
            
            # PowerShell函数正确返回退出码
            $global:LASTEXITCODE = $exitCode
            exit $exitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @args
            $exitCode = $LASTEXITCODE
            $global:LASTEXITCODE = $exitCode
            exit $exitCode
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @args
        $exitCode = $LASTEXITCODE
        $global:LASTEXITCODE = $exitCode
        exit $exitCode
    }
}
${HOOK_END_MARKER}`;
		}

		if (manager === 'nvs') {
			return `\n${HOOK_MARKER}
function npm {
    $WORKDIRS = '${escapedDirsJson}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        $WorkdirInfo = $WORKDIRS | ConvertFrom-Json | ForEach-Object {
            $workdir = $_
            $cwd = Get-Location | Select-Object -ExpandProperty Path
            if ($cwd -eq $workdir.dir -or $cwd.StartsWith($workdir.dir + [System.IO.Path]::DirectorySeparatorChar)) {
                return @{
                    version = $workdir.version
                    name = Split-Path $workdir.dir -Leaf
                    length = $workdir.dir.Length
                }
            }
        } | Sort-Object length -Descending | Select-Object -First 1

        if ($WorkdirInfo) {
            $TARGET_VERSION = $WorkdirInfo.version
            $WORKDIR_NAME = $WorkdirInfo.name
            Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
        }
    }

    # 切换版本
    if ($TARGET_VERSION -and $TARGET_VERSION -ne $PREVIOUS_VERSION) {
        Write-Host "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION" -ForegroundColor Yellow
        
        try {
            nvs use $TARGET_VERSION 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..." -ForegroundColor Yellow
                nvs add $TARGET_VERSION
                nvs use $TARGET_VERSION
            }
            
            # 执行 npm 命令
            & npm.cmd @args
            $exitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                nvs use $PREVIOUS_VERSION 2>$null
            }
            
            # PowerShell函数正确返回退出码
            $global:LASTEXITCODE = $exitCode
            exit $exitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @args
            $exitCode = $LASTEXITCODE
            $global:LASTEXITCODE = $exitCode
            exit $exitCode
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @args
        $exitCode = $LASTEXITCODE
        $global:LASTEXITCODE = $exitCode
        exit $exitCode
    }
}
${HOOK_END_MARKER}`;
		}

		return '';
	}
}
