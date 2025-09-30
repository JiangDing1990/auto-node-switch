/**
 * PowerShell配置
 * 支持Windows PowerShell和PowerShell Core
 */

import path from 'node:path';
import {Security} from '../security.js';
import {templateEngine} from '../template-engine.js';
import type {ShellConfig, TemplateData} from './types.js';

export class PowerShellConfig implements ShellConfig {
	name = 'powershell';

	configFiles = ['Microsoft.PowerShell_profile.ps1', 'profile.ps1', '$PROFILE'];

	supportedManagers = ['nvm-windows', 'fnm', 'nvs'];

	isConfigFile(filePath: string): boolean {
		const fileName = path.basename(filePath);
		// 更精确的PowerShell配置文件检测
		return (
			this.configFiles.some(
				pattern =>
					fileName === pattern ||
					fileName.includes('profile') ||
					fileName === 'Microsoft.PowerShell_profile.ps1',
			) ||
			(filePath.endsWith('.ps1') && fileName.includes('profile'))
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

		// 生成转义的JSON字符串 (PowerShell专用转义)
		const dirsJson = JSON.stringify(validatedWorkdirs);
		const escapedDirsJson = this.escapePowerShellString(dirsJson);

		const templateData: TemplateData = {
			...data,
			escapedDirsJson,
		};

		// 获取对应的模板
		const template = this.getTemplate(manager);

		return templateEngine.render(template, templateData);
	}

	private escapePowerShellString(str: string): string {
		// PowerShell字符串转义：双引号转义，反斜杠转义
		return str
			.replace(/\\/g, '\\\\') // 反斜杠转义
			.replace(/"/g, '""') // PowerShell双引号转义
			.replace(/\n/g, '\\n') // 换行符转义
			.replace(/\r/g, '\\r'); // 回车符转义
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
			'nvm-windows': `function npm {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    
    $WORKDIRS = '{{escapedDirsJson}}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        try {
            $WorkdirData = $WORKDIRS | ConvertFrom-Json
            $CurrentDir = Get-Location | Select-Object -ExpandProperty Path
            
            # 查找最佳匹配的工作目录
            $BestMatch = $null
            $BestLength = -1
            
            foreach ($workdir in $WorkdirData) {
                $workPath = $workdir.dir
                if ($CurrentDir -eq $workPath -or $CurrentDir.StartsWith($workPath + [System.IO.Path]::DirectorySeparatorChar)) {
                    if ($workPath.Length -gt $BestLength) {
                        $BestMatch = $workdir
                        $BestLength = $workPath.Length
                    }
                }
            }
            
            if ($BestMatch) {
                $TARGET_VERSION = $BestMatch.version
                $WORKDIR_NAME = Split-Path $BestMatch.dir -Leaf
                Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
            }
        }
        catch {
            # JSON解析失败，忽略错误
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
            & npm.cmd @Arguments
            $ExitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                nvm use $PREVIOUS_VERSION 2>$null
            }
            
            return $ExitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @Arguments
            return $LASTEXITCODE
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @Arguments
        return $LASTEXITCODE
    }
}`,
			fnm: `function npm {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    
    $WORKDIRS = '{{escapedDirsJson}}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        try {
            $WorkdirData = $WORKDIRS | ConvertFrom-Json
            $CurrentDir = Get-Location | Select-Object -ExpandProperty Path
            
            # 查找最佳匹配的工作目录
            $BestMatch = $null
            $BestLength = -1
            
            foreach ($workdir in $WorkdirData) {
                $workPath = $workdir.dir
                if ($CurrentDir -eq $workPath -or $CurrentDir.StartsWith($workPath + [System.IO.Path]::DirectorySeparatorChar)) {
                    if ($workPath.Length -gt $BestLength) {
                        $BestMatch = $workdir
                        $BestLength = $workPath.Length
                    }
                }
            }
            
            if ($BestMatch) {
                $TARGET_VERSION = $BestMatch.version
                $WORKDIR_NAME = Split-Path $BestMatch.dir -Leaf
                Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
            }
        }
        catch {
            # JSON解析失败，忽略错误
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
            & npm.cmd @Arguments
            $ExitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                fnm use $PREVIOUS_VERSION 2>$null
            }
            
            return $ExitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @Arguments
            return $LASTEXITCODE
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @Arguments
        return $LASTEXITCODE
    }
}`,
			nvs: `function npm {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    
    $WORKDIRS = '{{escapedDirsJson}}'
    $TARGET_VERSION = ""
    $PREVIOUS_VERSION = ""

    # 获取当前 Node 版本
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $PREVIOUS_VERSION = (node -v 2>$null) -replace '^v', ''
    }

    # 检查是否在工作目录中
    if ($WORKDIRS) {
        try {
            $WorkdirData = $WORKDIRS | ConvertFrom-Json
            $CurrentDir = Get-Location | Select-Object -ExpandProperty Path
            
            # 查找最佳匹配的工作目录
            $BestMatch = $null
            $BestLength = -1
            
            foreach ($workdir in $WorkdirData) {
                $workPath = $workdir.dir
                if ($CurrentDir -eq $workPath -or $CurrentDir.StartsWith($workPath + [System.IO.Path]::DirectorySeparatorChar)) {
                    if ($workPath.Length -gt $BestLength) {
                        $BestMatch = $workdir
                        $BestLength = $workPath.Length
                    }
                }
            }
            
            if ($BestMatch) {
                $TARGET_VERSION = $BestMatch.version
                $WORKDIR_NAME = Split-Path $BestMatch.dir -Leaf
                Write-Host "📁 检测到工作目录: $WORKDIR_NAME" -ForegroundColor Green
            }
        }
        catch {
            # JSON解析失败，忽略错误
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
            & npm.cmd @Arguments
            $ExitCode = $LASTEXITCODE
            
            # 恢复版本
            if ($PREVIOUS_VERSION) {
                Write-Host "📦 执行完成，恢复到之前的 Node.js 版本..." -ForegroundColor Green
                Write-Host "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION" -ForegroundColor Cyan
                nvs use $PREVIOUS_VERSION 2>$null
            }
            
            return $ExitCode
        }
        catch {
            Write-Host "❌ 版本切换失败: $_" -ForegroundColor Red
            & npm.cmd @Arguments
            return $LASTEXITCODE
        }
    }
    else {
        # 直接执行 npm
        & npm.cmd @Arguments
        return $LASTEXITCODE
    }
}`,
		};
	}
}
