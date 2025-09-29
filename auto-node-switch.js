#!/usr/bin/env node
/**
 * Node.js 工作目录环境配置工具
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const crypto = require('crypto');

const HOME = os.homedir();

// 配置文件路径管理 - 支持 XDG 基础目录规范
const ConfigPaths = {
  // XDG 标准配置目录
  get xdgConfigHome() {
    return process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
  },
  
  // 新的标准配置路径
  get modernConfigDir() {
    return path.join(this.xdgConfigHome, 'node-workdir');
  },
  
  get modernConfigFile() {
    return path.join(this.modernConfigDir, 'config.json');
  },
  
  // 旧的配置文件路径（向后兼容）
  get legacyConfigFile() {
    return path.join(HOME, '.node_workdir_config.json');
  },
  
  // 备份目录
  get backupDir() {
    return path.join(this.modernConfigDir, 'backups');
  },
  
  // 获取实际使用的配置文件路径
  getActiveConfigFile() {
    // 优先使用现代路径，如果不存在则检查旧路径
    if (fs.existsSync(this.modernConfigFile)) {
      return this.modernConfigFile;
    }
    if (fs.existsSync(this.legacyConfigFile)) {
      return this.legacyConfigFile;
    }
    // 都不存在则使用现代路径
    return this.modernConfigFile;
  },
  
  // 确保配置目录存在
  ensureConfigDir() {
    try {
      fs.mkdirSync(this.modernConfigDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o700 });
    } catch (e) {
      // 忽略目录已存在的错误
    }
  }
};

const CONFIG_FILE = ConfigPaths.getActiveConfigFile();
const HOOK_MARKER = '# Node.js 工作目录环境切换';
const HOOK_END_MARKER = '# Node.js 工作目录环境切换 END';

// 颜色常量
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m'
};

// 自动加执行权限
try { fs.chmodSync(__filename, 0o755); } catch(e) { /* ignore */ }

/*--------------- 安全和验证模块 ---------------*/
class SecurityError extends Error {
  constructor(message, code, suggestions = []) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.suggestions = suggestions;
  }
}

class ValidationError extends Error {
  constructor(message, code, suggestions = []) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.suggestions = suggestions;
  }
}

const Security = {
  /**
   * 安全验证路径输入，防止命令注入和路径遍历攻击
   * @param {string} inputPath - 用户输入的路径
   * @returns {string} 验证后的安全路径
   */
  validatePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new ValidationError(
        '路径不能为空',
        'EMPTY_PATH',
        ['请输入有效的目录路径']
      );
    }
    
    const trimmedPath = inputPath.trim();
    
    // 检查危险字符，防止命令注入
    const dangerousChars = /[;|&$(){}[\]\\`"'<>*?]/;
    if (dangerousChars.test(trimmedPath)) {
      throw new SecurityError(
        '路径包含不安全字符',
        'UNSAFE_CHARACTERS',
        [
          '路径不能包含以下字符: ; | & $ ( ) { } [ ] \\ ` " \' < > * ?',
          '请使用标准的文件路径格式'
        ]
      );
    }
    
    // 检查路径遍历攻击
    const normalized = path.normalize(trimmedPath);
    if (normalized.includes('..')) {
      throw new SecurityError(
        '不允许使用相对路径遍历',
        'PATH_TRAVERSAL',
        ['请使用绝对路径或不包含 .. 的相对路径']
      );
    }
    
    // 展开 ~ 符号
    let resolvedPath = trimmedPath;
    if (trimmedPath.startsWith('~/')) {
      resolvedPath = path.join(HOME, trimmedPath.slice(2));
    } else if (trimmedPath === '~') {
      resolvedPath = HOME;
    }
    
    // 解析为绝对路径
    try {
      resolvedPath = path.resolve(resolvedPath);
    } catch (error) {
      throw new ValidationError(
        '无效的路径格式',
        'INVALID_PATH_FORMAT',
        ['请检查路径格式是否正确', '示例: /Users/username/project 或 ~/projects/app']
      );
    }
    
    return resolvedPath;
  },

  /**
   * 验证 Node.js 版本格式
   * @param {string} version - 版本字符串
   * @returns {string} 规范化的版本字符串
   */
  validateVersion(version) {
    if (!version || typeof version !== 'string') {
      throw new ValidationError(
        '版本号不能为空',
        'EMPTY_VERSION',
        ['请输入有效的 Node.js 版本号']
      );
    }
    
    const trimmed = version.trim();
    
    // 检查危险字符
    if (/[;|&$(){}[\]\\`"'<>*?]/.test(trimmed)) {
      throw new SecurityError(
        '版本号包含不安全字符',
        'UNSAFE_VERSION_CHARACTERS',
        ['版本号只能包含数字、点号、字母和连字符']
      );
    }
    
    // 支持的版本格式
    const patterns = [
      /^\d+$/,                    // 18
      /^\d+\.\d+$/,              // 18.17
      /^\d+\.\d+\.\d+$/,         // 18.17.1
      /^v\d+(\.\d+){0,2}$/,      // v18.17.1
      /^lts\/\*$/,               // lts/*
      /^lts\/[\w-]+$/i,          // lts/hydrogen
      /^latest$/i,               // latest
      /^stable$/i,               // stable
      /^node$/i                  // node
    ];
    
    const isValid = patterns.some(pattern => pattern.test(trimmed));
    if (!isValid) {
      throw new ValidationError(
        '不支持的版本格式',
        'INVALID_VERSION_FORMAT',
        [
          '支持的格式：18、18.17、18.17.1、v18.17.1、lts/*、lts/hydrogen、latest、stable',
          '请检查版本号是否正确'
        ]
      );
    }
    
    return trimmed.replace(/^v/, ''); // 移除 v 前缀统一格式
  },

  /**
   * 安全转义字符串用于 shell 脚本
   * @param {string} str - 要转义的字符串
   * @returns {string} 转义后的字符串
   */
  escapeShellString(str) {
    // 更安全的转义方法
    return str.replace(/'/g, "'\\''");
  }
};

/*--------------- 缓存管理模块 ---------------*/
class ConfigCache {
  constructor() {
    this.data = null;
    this.lastModified = 0;
    this.shellInfo = null;
    this.shellInfoTimestamp = 0;
  }
  
  /**
   * 获取配置数据，带缓存机制
   * @returns {Object} 配置数据
   */
  getConfig() {
    try {
      // 检查并执行配置迁移
      this.migrateConfigIfNeeded();
      
      if (!fs.existsSync(CONFIG_FILE)) {
        return this.getDefaultConfig();
      }
      
      const stat = fs.statSync(CONFIG_FILE);
      if (!this.data || stat.mtime.getTime() > this.lastModified) {
        const rawData = fs.readFileSync(CONFIG_FILE, 'utf8');
        this.data = JSON.parse(rawData);
        this.lastModified = stat.mtime.getTime();
        
        // 验证配置数据完整性
        this.data = this.validateConfig(this.data);
      }
      
      return { ...this.data }; // 返回副本防止意外修改
    } catch (error) {
      warning(`配置文件读取失败: ${error.message}`);
      return this.getDefaultConfig();
    }
  }
  
  /**
   * 保存配置数据
   * @param {Object} config - 配置数据
   */
  saveConfig(config) {
    try {
      ConfigPaths.ensureConfigDir();
      
      const validatedConfig = this.validateConfig(config);
      validatedConfig.lastUpdated = new Date().toISOString();
      
      // 创建备份（如果配置文件已存在）
      this.createBackup();
      
      const configJson = JSON.stringify(validatedConfig, null, 2);
      
      // 确保使用现代配置文件路径
      const targetFile = ConfigPaths.modernConfigFile;
      fs.writeFileSync(targetFile, configJson, 'utf8');
      
      // 设置安全权限
      fs.chmodSync(targetFile, 0o600);
      
      // 更新缓存
      this.data = validatedConfig;
      this.lastModified = Date.now();
      
      success('配置已保存');
    } catch (error) {
      throw new Error(`保存配置失败: ${error.message}`);
    }
  }
  
  /**
   * 验证配置数据格式
   * @param {Object} config - 配置数据
   * @returns {Object} 验证后的配置
   */
  validateConfig(config) {
    const validated = {
      manager: '',
      shell: '',
      workdirs: [],
      lastUpdated: null,
      ...config
    };
    
    // 验证 workdirs 数组
    if (Array.isArray(validated.workdirs)) {
      validated.workdirs = validated.workdirs.filter(workdir => 
        workdir && 
        typeof workdir.dir === 'string' && 
        typeof workdir.version === 'string' &&
        workdir.dir.length > 0 &&
        workdir.version.length > 0
      );
    } else {
      validated.workdirs = [];
    }
    
    return validated;
  }
  
  /**
   * 获取默认配置
   * @returns {Object} 默认配置
   */
  getDefaultConfig() {
    return {
      manager: '',
      shell: '',
      workdirs: [],
      lastUpdated: null
    };
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this.data = null;
    this.lastModified = 0;
    this.shellInfo = null;
    this.shellInfoTimestamp = 0;
  }
  
  /**
   * 检查并执行配置迁移
   */
  migrateConfigIfNeeded() {
    const legacyFile = ConfigPaths.legacyConfigFile;
    const modernFile = ConfigPaths.modernConfigFile;
    
    // 如果现代配置文件已存在，无需迁移
    if (fs.existsSync(modernFile)) {
      return;
    }
    
    // 如果旧配置文件存在，执行迁移
    if (fs.existsSync(legacyFile)) {
      try {
        ConfigPaths.ensureConfigDir();
        
        // 读取旧配置
        const legacyData = fs.readFileSync(legacyFile, 'utf8');
        
        // 写入新位置
        fs.writeFileSync(modernFile, legacyData, 'utf8');
        fs.chmodSync(modernFile, 0o600);
        
        // 备份旧文件而不是直接删除
        const backupName = `legacy-config-${Date.now()}.json.bak`;
        const backupPath = path.join(ConfigPaths.backupDir, backupName);
        fs.copyFileSync(legacyFile, backupPath);
        
        success(`配置已迁移到新位置: ${modernFile}`);
        info(`旧配置已备份到: ${backupPath}`);
        
        // 删除旧文件（可选，用户可以手动决定）
        // fs.unlinkSync(legacyFile);
        
      } catch (error) {
        warning(`配置迁移失败: ${error.message}`);
      }
    }
  }
  
  /**
   * 创建配置备份
   */
  createBackup() {
    const currentFile = CONFIG_FILE;
    
    if (!fs.existsSync(currentFile)) {
      return; // 没有现有配置文件，无需备份
    }
    
    try {
      ConfigPaths.ensureConfigDir();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `config-${timestamp}.json.bak`;
      const backupPath = path.join(ConfigPaths.backupDir, backupName);
      
      fs.copyFileSync(currentFile, backupPath);
      
      // 只保留最近的 5 个备份
      this.cleanupOldBackups();
      
    } catch (error) {
      warning(`创建备份失败: ${error.message}`);
    }
  }
  
  /**
   * 清理旧备份文件
   */
  cleanupOldBackups() {
    try {
      const backupDir = ConfigPaths.backupDir;
      if (!fs.existsSync(backupDir)) return;
      
      const backups = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.bak'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          mtime: fs.statSync(path.join(backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      // 保留最新的 5 个备份
      const maxBackups = 5;
      if (backups.length > maxBackups) {
        const toDelete = backups.slice(maxBackups);
        toDelete.forEach(backup => {
          try {
            fs.unlinkSync(backup.path);
          } catch (e) {
            // 忽略删除失败
          }
        });
      }
    } catch (error) {
      // 忽略清理失败
    }
  }
}

// 全局缓存实例
const configCache = new ConfigCache();

/*--------------- 错误处理模块 ---------------*/
class ErrorHandler {
  /**
   * 处理并显示错误信息
   * @param {Error} error - 错误对象
   */
  static handle(error) {
    if (error instanceof SecurityError || error instanceof ValidationError) {
      console.error(`❌ ${error.message}`);
      if (error.suggestions && error.suggestions.length > 0) {
        log('\n💡 建议解决方案：', 'yellow');
        error.suggestions.forEach(suggestion => {
          log(`   • ${suggestion}`, 'dim');
        });
      }
    } else {
      console.error(`❌ 发生错误: ${error.message}`);
      if (process.env.NODE_ENV === 'development') {
        console.error(error.stack);
      }
    }
  }
  
  /**
   * 包装异步函数，提供统一的错误处理
   * @param {Function} fn - 异步函数
   * @returns {Function} 包装后的函数
   */
  static wrapAsync(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        ErrorHandler.handle(error);
        throw error;
      }
    };
  }
}

/*--------------- 工具函数 ---------------*/
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warning(message) {
  log(`⚠️ ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️ ${message}`, 'cyan');
}

function printSeparator(char = '=', length = 50) {
  log(char.repeat(length), 'gray');
}

function printHeader(title) {
  console.clear();
  printSeparator();
  log(`               ${title}             `, 'brightCyan');
  printSeparator();
}

// readline 封装
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

/*--------------- Shell 检测和配置 ---------------*/
function detectOS() {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  return 'unknown';
}

async function detectShell() {
  const shellInfo = {
    name: 'unknown',
    path: process.env.SHELL || '',
    version: '',
    detected: false
  };
  
  try {
    if (shellInfo.path) {
      shellInfo.name = path.basename(shellInfo.path);
      shellInfo.detected = true;
    }
    
    // 获取版本信息
    if (shellInfo.name.includes('zsh')) {
      try {
        shellInfo.version = execSync('zsh --version', { encoding: 'utf8', timeout: 2000 }).trim();
      } catch (e) {
        // ignore
      }
    } else if (shellInfo.name.includes('bash')) {
      try {
        shellInfo.version = execSync('bash --version | head -1', { encoding: 'utf8', timeout: 2000 }).trim();
      } catch (e) {
        // ignore
      }
    }
    
  } catch (e) {
    // 检测失败时的默认处理
  }
  
  return shellInfo;
}

function getShellConfigFiles(shellType) {
  const currentOS = detectOS();
  
  switch (shellType) {
    case 'zsh':
      return [path.join(HOME, '.zshrc')];
      
    case 'bash':
      if (currentOS === 'macos') {
        const bashProfile = path.join(HOME, '.bash_profile');
        const bashrc = path.join(HOME, '.bashrc');
        
        if (fs.existsSync(bashProfile)) {
          return [bashProfile];
        } else if (fs.existsSync(bashrc)) {
          return [bashrc];
        } else {
          return [bashProfile];
        }
      } else {
        const bashrc = path.join(HOME, '.bashrc');
        const bashProfile = path.join(HOME, '.bash_profile');
        
        if (fs.existsSync(bashrc)) {
          return [bashrc];
        } else if (fs.existsSync(bashProfile)) {
          return [bashProfile];
        } else {
          return [bashrc];
        }
      }
      
    case 'fish':
      const fishConfigDir = path.join(HOME, '.config', 'fish');
      try {
        fs.mkdirSync(fishConfigDir, { recursive: true });
      } catch (e) {
        // 忽略创建失败
      }
      return [path.join(fishConfigDir, 'config.fish')];
      
    default:
      return [path.join(HOME, '.profile')];
  }
}

/*--------------- Hook 生成（可靠版本）---------------*/
function generateReliableBashHook(manager, workdirs) {
  const dirsJson = JSON.stringify(workdirs);
  const escapedDirsJson = Security.escapeShellString(dirsJson);
  
  let nvmPath = '';
  if (manager === 'nvm') {
    const nvmPaths = [
      path.join(HOME, '.nvm/nvm.sh'),
      '/usr/local/share/nvm/nvm.sh',
      '/opt/homebrew/share/nvm/nvm.sh'
    ];
    nvmPath = nvmPaths.find(p => fs.existsSync(p)) || path.join(HOME, '.nvm/nvm.sh');
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
    local WORKDIR_INFO=$(echo "$WORKDIRS" | node -e "
      const workdirs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const cwd = process.cwd();
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
        const dirName = require('path').basename(bestMatch.dir);
        console.log(\\\`\\\${bestMatch.version}|\\\${dirName}\\\`);
      }
    " 2>/dev/null)
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%|*}"
      local WORKDIR_NAME="\${WORKDIR_INFO#*|}"
      echo "📁 检测到工作目录: \$WORKDIR_NAME"
    fi
  fi

  # 🔧 终极修复：使用trap确保版本恢复
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: \$PREVIOUS_VERSION -> \$TARGET_VERSION"
    source "${nvmPath}" >/dev/null 2>&1
    nvm use "$TARGET_VERSION" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "⚠️ 版本 $TARGET_VERSION 不存在，尝试安装..."
      nvm install "$TARGET_VERSION" >/dev/null 2>&1 && nvm use "$TARGET_VERSION" >/dev/null 2>&1
    fi
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '\$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; source '${nvmPath}' >/dev/null 2>&1; nvm use '\$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
  command npm "$@"
  local exit_code=$?
  
  # 正常完成时恢复版本（通过EXIT trap自动处理）
  return $exit_code
}
${HOOK_END_MARKER}
`;
  } else if (manager === 'n') {
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
    local WORKDIR_INFO=$(echo "$WORKDIRS" | node -e "
      const workdirs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const cwd = process.cwd();
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
        const dirName = require('path').basename(bestMatch.dir);
        console.log(\\\`\\\${bestMatch.version}|\\\${dirName}\\\`);
      }
    " 2>/dev/null)
    
    if [ -n "$WORKDIR_INFO" ]; then
      TARGET_VERSION="\${WORKDIR_INFO%|*}"
      local WORKDIR_NAME="\${WORKDIR_INFO#*|}"
      echo "📁 检测到工作目录: \$WORKDIR_NAME"
    fi
  fi

  # 🔧 终极修复：使用trap确保版本恢复
  local NEED_RESTORE=0
  
  if [ -n "$TARGET_VERSION" ] && [ "$TARGET_VERSION" != "$PREVIOUS_VERSION" ]; then
    echo "🔄 切换 Node 版本: \$PREVIOUS_VERSION -> \$TARGET_VERSION"
    n "$TARGET_VERSION" >/dev/null 2>&1
    
    # 🔧 终极修复：移除exit避免终端闪退
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; n '\$PREVIOUS_VERSION' >/dev/null 2>&1" INT
    trap "echo '📦 执行完成，恢复到之前的 Node.js 版本...'; echo '↩️ 恢复 Node 版本: \$TARGET_VERSION -> \$PREVIOUS_VERSION'; n '\$PREVIOUS_VERSION' >/dev/null 2>&1" EXIT
  fi

  # 🔧 最终修复：直接执行npm，避免作业控制复杂性
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

function generateReliableFishHook(manager, workdirs) {
  const dirsJson = JSON.stringify(workdirs);
  const escapedDirsJson = Security.escapeShellString(dirsJson);
  
  if (manager === 'nvm') {
    const nvmPaths = [
      path.join(HOME, '.nvm/nvm.sh'),
      '/usr/local/share/nvm/nvm.sh',
      '/opt/homebrew/share/nvm/nvm.sh'
    ];
    const nvmPath = nvmPaths.find(p => fs.existsSync(p)) || path.join(HOME, '.nvm/nvm.sh');
    
    return `${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""
    
    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end
    
    # 检查是否在工作目录中
    if test -n "$WORKDIRS"
        set WORKDIR_INFO (echo "$WORKDIRS" | node -e "
            const workdirs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
            const cwd = process.cwd();
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
              const dirName = require('path').basename(bestMatch.dir);
              console.log(\\\`\\\${bestMatch.version}|\\\${dirName}\\\`);
            }
        " 2>/dev/null)
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo "$WORKDIR_INFO" | cut -d'|' -f1)
            set WORKDIR_NAME (echo "$WORKDIR_INFO" | cut -d'|' -f2)
            echo "📁 检测到工作目录: $WORKDIR_NAME"
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
        
        # 🔧 Fish shell 修复：版本切换成功后设置恢复机制
        function _restore_nvm_version --on-signal INT --on-signal TERM
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            nvm use "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    end
    
    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    # 🔧 Fish shell 修复：正常完成时恢复版本
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION" -a -n "$PREVIOUS_VERSION"
        echo "📦 执行完成，恢复到之前的 Node.js 版本..."
        echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
        nvm use "$PREVIOUS_VERSION" >/dev/null 2>&1
    end
    
    return $exit_code
end
${HOOK_END_MARKER}
`;
  } else if (manager === 'n') {
    return `${HOOK_MARKER}
function npm
    set WORKDIRS '${escapedDirsJson}'
    set TARGET_VERSION ""
    set PREVIOUS_VERSION ""
    
    # 获取当前 Node 版本
    if command -v node >/dev/null 2>&1
        set PREVIOUS_VERSION (node -v 2>/dev/null | sed 's/^v//')
    end
    
    # 检查是否在工作目录中
    if test -n "$WORKDIRS"
        set WORKDIR_INFO (echo "$WORKDIRS" | node -e "
            const workdirs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
            const cwd = process.cwd();
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
              const dirName = require('path').basename(bestMatch.dir);
              console.log(\\\`\\\${bestMatch.version}|\\\${dirName}\\\`);
            }
        " 2>/dev/null)
        
        if test -n "$WORKDIR_INFO"
            set TARGET_VERSION (echo "$WORKDIR_INFO" | cut -d'|' -f1)
            set WORKDIR_NAME (echo "$WORKDIR_INFO" | cut -d'|' -f2)
            echo "📁 检测到工作目录: $WORKDIR_NAME"
        end
    end
    
    # 🔧 Fish shell 修复：版本切换和恢复机制
    if test -n "$TARGET_VERSION" -a "$TARGET_VERSION" != "$PREVIOUS_VERSION"
        echo "🔄 切换 Node 版本: $PREVIOUS_VERSION -> $TARGET_VERSION"
        n "$TARGET_VERSION" >/dev/null 2>&1
        
        # 🔧 Fish shell 修复：版本切换成功后设置恢复机制
        function _restore_n_version --on-signal INT --on-signal TERM
            echo "📦 执行完成，恢复到之前的 Node.js 版本..."
            echo "↩️ 恢复 Node 版本: $TARGET_VERSION -> $PREVIOUS_VERSION"
            n "$PREVIOUS_VERSION" >/dev/null 2>&1
        end
    end
    
    # 执行 npm 命令
    command npm $argv
    set exit_code $status
    
    # 🔧 Fish shell 修复：正常完成时恢复版本
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

/*--------------- Hook 管理 ---------------*/
function addHook(shellRcPath, manager, workdirs) {
  try {
    // 确保文件存在
    if (!fs.existsSync(shellRcPath)) {
      fs.writeFileSync(shellRcPath, '', 'utf8');
    }
    
    let content = fs.readFileSync(shellRcPath, 'utf8');
    
    // 移除现有 hook
    const regex = new RegExp(`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`, 'g');
    content = content.replace(regex, '');
    
    // 生成新 hook
    let hook = '';
    const isFishShell = shellRcPath.includes('config.fish');
    
    if (isFishShell) {
      hook = generateReliableFishHook(manager, workdirs);
    } else {
      hook = generateReliableBashHook(manager, workdirs);
    }
    
    // 添加 hook
    const separator = content.endsWith('\n') ? '' : '\n';
    content += `${separator}${hook}`;
    
    fs.writeFileSync(shellRcPath, content, 'utf8');
    success(`已成功配置 ${path.basename(shellRcPath)}`);
    
  } catch (e) {
    error(`更新 ${shellRcPath} 失败: ${e.message}`);
  }
}

function removeHook(shellRcPath) {
  try {
    if (!fs.existsSync(shellRcPath)) {
      warning(`文件不存在: ${shellRcPath}`);
      return;
    }
    
    const content = fs.readFileSync(shellRcPath, 'utf8');
    const regex = new RegExp(`${HOOK_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`, 'g');
    const newContent = content.replace(regex, '');
    
    if (newContent !== content) {
      fs.writeFileSync(shellRcPath, newContent, 'utf8');
      success(`已清理 ${path.basename(shellRcPath)} 中的 hook`);
    } else {
      info(`${path.basename(shellRcPath)} 中没有找到 hook`);
    }
    
  } catch (e) {
    error(`清理 ${shellRcPath} 失败: ${e.message}`);
  }
}

/*--------------- 配置管理 ---------------*/
function loadConfig() {
  return configCache.getConfig();
}

function saveConfig(config) {
  configCache.saveConfig(config);
}

function validateVersion(version) {
  try {
    Security.validateVersion(version);
    return true;
  } catch (e) {
    return false;
  }
}

function checkDuplicateDir(workdirs, newDir) {
  if (!Array.isArray(workdirs) || !newDir) return null;
  
  try {
    // 使用安全的路径验证
    const resolvedNewDir = Security.validatePath(newDir);
    
    for (const workdir of workdirs) {
      const existingDir = path.resolve(workdir.dir);
      if (existingDir === resolvedNewDir) {
        return workdir; // 返回已存在的配置
      }
    }
    
    return null; // 没有找到重复
  } catch (e) {
    ErrorHandler.handle(e);
    return null;
  }
}

/*--------------- 配置管理功能 ---------------*/
async function showConfigMenu(config) {
  while (true) {
    console.clear();
    printHeader('配置管理中心');
    
    log('📋 当前配置状态：', 'brightCyan');
    log(`   终端类型: ${config.shell || '未设置'}`, 'reset');
    log(`   版本管理器: ${config.manager || '未设置'}`, 'reset');
    log(`   项目配置数量: ${config.workdirs ? config.workdirs.length : 0}`, 'reset');
    
    log('\n🛠️ 管理选项：', 'brightBlue');
    log('   1) 查看详细配置');
    log('   2) 添加项目配置');
    log('   3) 删除项目配置');
    log('   4) 编辑项目配置');
    log('   5) 清理所有Hook配置');
    log('   6) 重新生成Hook');
    log('   0) 返回主菜单');
    
    const choice = await askQuestion('\n请选择操作 [0-6]: ');
    
    switch (choice) {
      case '1':
        await viewDetailedConfig(config);
        break;
      case '2':
        await addProjectConfig(config);
        break;
      case '3':
        await deleteProjectConfig(config);
        break;
      case '4':
        await editProjectConfig(config);
        break;
      case '5':
        await clearAllHooks(config);
        break;
      case '6':
        await regenerateHooks(config);
        break;
      case '0':
        return;
      default:
        warning('无效选择，请重新输入');
        await askQuestion('按回车键继续...');
    }
  }
}

async function viewDetailedConfig(config) {
  console.clear();
  printHeader('详细配置信息');
  
  log('🔧 基本配置：', 'brightCyan');
  log(`   终端类型: ${config.shell || '未设置'}`, 'reset');
  log(`   版本管理器: ${config.manager || '未设置'}`, 'reset');
  log(`   最后更新: ${config.lastUpdated ? new Date(config.lastUpdated).toLocaleString() : '未知'}`, 'dim');
  
  if (config.workdirs && config.workdirs.length > 0) {
    log('\n📁 项目配置：', 'brightYellow');
    config.workdirs.forEach((workdir, index) => {
      log(`   ${index + 1}. ${workdir.dir}`, 'reset');
      log(`      Node版本: ${workdir.version}`, 'dim');
      
      // 检查 .nvmrc 文件
      const nvmrcPath = path.join(workdir.dir, '.nvmrc');
      const nvmrcExists = fs.existsSync(nvmrcPath);
      log(`      .nvmrc文件: ${nvmrcExists ? '✅ 存在' : '❌ 不存在'}`, 'dim');
    });
  } else {
    log('\n📁 项目配置：', 'brightYellow');
    log('   暂无项目配置', 'dim');
  }
  
  // 检查shell配置文件中的hook状态
  if (config.shell) {
    log('\n🔗 Hook状态：', 'brightBlue');
    const shellRcFiles = getShellConfigFiles(config.shell);
    shellRcFiles.forEach(rcFile => {
      if (fs.existsSync(rcFile)) {
        const content = fs.readFileSync(rcFile, 'utf8');
        const hasHook = content.includes(HOOK_MARKER);
        log(`   ${path.basename(rcFile)}: ${hasHook ? '✅ 已安装' : '❌ 未安装'}`, 'reset');
      } else {
        log(`   ${path.basename(rcFile)}: ❌ 文件不存在`, 'reset');
      }
    });
  }
  
  await askQuestion('\n按回车键返回...');
}

async function addProjectConfig(config) {
  console.clear();
  printHeader('添加项目配置');
  
  log('📁 添加新的项目配置', 'brightBlue');
  log('   💡 提示：可以使用绝对路径或相对路径', 'dim');
  log('   示例：/Users/username/my-project 或 ~/projects/my-app', 'dim');
  const dir = await askQuestion('\n📁 请输入项目目录路径: ');
  
  let resolvedDir, validatedVersion;
  
  try {
    resolvedDir = Security.validatePath(dir);
  } catch (e) {
    ErrorHandler.handle(e);
    await askQuestion('按回车键返回...');
    return;
  }
  
  log('\n   💡 提示：请输入该项目需要的Node.js版本', 'dim');
  log('   支持格式：18.17.1 或 v18.17.1 或 18 或 lts/*', 'dim');
  const version = await askQuestion('🏷️ 请输入Node版本: ');
  
  try {
    validatedVersion = Security.validateVersion(version);
  } catch (e) {
    ErrorHandler.handle(e);
    await askQuestion('按回车键返回...');
    return;
  }
  
  config.workdirs = config.workdirs || [];
  
  // 检查重复路径
  const existingConfig = checkDuplicateDir(config.workdirs, resolvedDir);
  if (existingConfig) {
    warning(`⚠️ 该目录已经配置过了！`);
    info(`   目录: ${existingConfig.dir}`);
    info(`   当前配置的Node版本: ${existingConfig.version}`);
    
    const updateChoice = await askQuestion('\n是否要更新现有配置的Node版本？ (y/N): ');
    if (updateChoice.toLowerCase() === 'y') {
      existingConfig.version = validatedVersion;
      success(`✅ 已更新项目 ${path.basename(resolvedDir)} 的Node版本为 ${validatedVersion}`);
    } else {
      info('💡 保持原有配置不变');
      await askQuestion('按回车键返回...');
      return;
    }
  } else {
    config.workdirs.push({ dir: resolvedDir, version: validatedVersion });
    success(`✅ 已为项目 ${path.basename(resolvedDir)} 配置Node版本 ${validatedVersion}`);
  }
  
  // 创建 .nvmrc
  try {
    fs.mkdirSync(resolvedDir, { recursive: true });
    fs.writeFileSync(path.join(resolvedDir, '.nvmrc'), validatedVersion, 'utf8');
    info(`   同时已创建 .nvmrc 文件以确保版本一致性`);
  } catch (e) {
    warning(`创建 .nvmrc 失败: ${e.message}`);
  }
  
  saveConfig(config);
  await askQuestion('\n按回车键返回...');
}

async function deleteProjectConfig(config) {
  console.clear();
  printHeader('删除项目配置');
  
  if (!config.workdirs || config.workdirs.length === 0) {
    warning('暂无项目配置可以删除');
    await askQuestion('按回车键返回...');
    return;
  }
  
  log('📁 当前项目配置：', 'brightYellow');
  config.workdirs.forEach((workdir, index) => {
    log(`   ${index + 1}. ${workdir.dir} → Node ${workdir.version}`, 'reset');
  });
  
  const choice = await askQuestion('\n请输入要删除的项目编号 (输入 0 取消): ');
  const index = parseInt(choice) - 1;
  
  if (choice === '0') {
    info('已取消删除操作');
    await askQuestion('按回车键返回...');
    return;
  }
  
  if (isNaN(index) || index < 0 || index >= config.workdirs.length) {
    warning('无效的项目编号');
    await askQuestion('按回车键返回...');
    return;
  }
  
  const projectToDelete = config.workdirs[index];
  warning(`确认要删除以下项目配置吗？`);
  log(`   目录: ${projectToDelete.dir}`, 'dim');
  log(`   Node版本: ${projectToDelete.version}`, 'dim');
  
  const confirm = await askQuestion('\n确认删除？(y/N): ');
  if (confirm.toLowerCase() === 'y') {
    config.workdirs.splice(index, 1);
    success(`✅ 已删除项目配置: ${path.basename(projectToDelete.dir)}`);
    
    // 询问是否删除 .nvmrc 文件
    const nvmrcPath = path.join(projectToDelete.dir, '.nvmrc');
    if (fs.existsSync(nvmrcPath)) {
      const deleteNvmrc = await askQuestion('是否同时删除该项目的 .nvmrc 文件？ (y/N): ');
      if (deleteNvmrc.toLowerCase() === 'y') {
        try {
          fs.unlinkSync(nvmrcPath);
          success('✅ 已删除 .nvmrc 文件');
        } catch (e) {
          warning(`删除 .nvmrc 文件失败: ${e.message}`);
        }
      }
    }
    
    saveConfig(config);
  } else {
    info('已取消删除操作');
  }
  
  await askQuestion('\n按回车键返回...');
}

async function editProjectConfig(config) {
  console.clear();
  printHeader('编辑项目配置');
  
  if (!config.workdirs || config.workdirs.length === 0) {
    warning('暂无项目配置可以编辑');
    await askQuestion('按回车键返回...');
    return;
  }
  
  log('📁 当前项目配置：', 'brightYellow');
  config.workdirs.forEach((workdir, index) => {
    log(`   ${index + 1}. ${workdir.dir} → Node ${workdir.version}`, 'reset');
  });
  
  const choice = await askQuestion('\n请输入要编辑的项目编号 (输入 0 取消): ');
  const index = parseInt(choice) - 1;
  
  if (choice === '0') {
    info('已取消编辑操作');
    await askQuestion('按回车键返回...');
    return;
  }
  
  if (isNaN(index) || index < 0 || index >= config.workdirs.length) {
    warning('无效的项目编号');
    await askQuestion('按回车键返回...');
    return;
  }
  
  const projectToEdit = config.workdirs[index];
  log(`\n📝 编辑项目: ${path.basename(projectToEdit.dir)}`, 'brightBlue');
  log(`   当前路径: ${projectToEdit.dir}`, 'dim');
  log(`   当前Node版本: ${projectToEdit.version}`, 'dim');
  
  log('\n🔧 编辑选项：', 'brightCyan');
  log('   1) 更新Node版本');
  log('   2) 更改项目路径');
  log('   0) 返回');
  
  const editChoice = await askQuestion('\n请选择要编辑的内容 [0-2]: ');
  
  if (editChoice === '1') {
    log('\n   💡 提示：请输入新的Node.js版本', 'dim');
    log('   支持格式：18.17.1 或 v18.17.1 或 18 或 lts/*', 'dim');
    const newVersion = await askQuestion(`🏷️ 请输入新的Node版本 (当前: ${projectToEdit.version}): `);
    
    if (validateVersion(newVersion)) {
      projectToEdit.version = newVersion.replace(/^v/, '');
      success(`✅ 已更新Node版本为: ${newVersion}`);
      
      // 更新 .nvmrc 文件
      try {
        const nvmrcPath = path.join(projectToEdit.dir, '.nvmrc');
        fs.writeFileSync(nvmrcPath, projectToEdit.version, 'utf8');
        info('   已同步更新 .nvmrc 文件');
      } catch (e) {
        warning(`更新 .nvmrc 文件失败: ${e.message}`);
      }
      
      saveConfig(config);
    } else {
      warning('版本格式不正确，未进行更改');
    }
  } else if (editChoice === '2') {
    log('\n   💡 提示：请输入新的项目路径', 'dim');
    const newDir = await askQuestion(`📁 请输入新的项目路径 (当前: ${projectToEdit.dir}): `);
    
    if (newDir.trim()) {
      // 展开路径
      let resolvedNewDir = newDir;
      if (newDir.startsWith('~/')) {
        resolvedNewDir = path.join(os.homedir(), newDir.slice(2));
      } else if (newDir === '~') {
        resolvedNewDir = os.homedir();
      }
      resolvedNewDir = path.resolve(resolvedNewDir);
      
      // 检查是否与其他配置重复
      const existingConfig = checkDuplicateDir(config.workdirs.filter((_, i) => i !== index), newDir);
      if (existingConfig) {
        warning('⚠️ 新路径与现有配置重复');
      } else {
        projectToEdit.dir = resolvedNewDir;
        success(`✅ 已更新项目路径为: ${resolvedNewDir}`);
        saveConfig(config);
      }
    } else {
      warning('路径不能为空，未进行更改');
    }
  }
  
  await askQuestion('\n按回车键返回...');
}

async function clearAllHooks(config) {
  console.clear();
  printHeader('清理Hook配置');
  
  if (!config.shell) {
    warning('未设置终端类型，无法清理Hook');
    await askQuestion('按回车键返回...');
    return;
  }
  
  const shellRcFiles = getShellConfigFiles(config.shell);
  
  log('🗑️ 即将清理以下文件中的Hook配置：', 'brightYellow');
  shellRcFiles.forEach(rcFile => {
    log(`   ${rcFile}`, 'dim');
  });
  
  warning('\n⚠️ 注意：此操作将删除所有相关的Hook代码，项目版本自动切换功能将失效');
  
  const confirm = await askQuestion('确认要清理所有Hook配置吗？ (y/N): ');
  if (confirm.toLowerCase() === 'y') {
    let cleanedCount = 0;
    
    shellRcFiles.forEach(rcFile => {
      try {
        removeHook(rcFile);
        cleanedCount++;
      } catch (e) {
        warning(`清理 ${rcFile} 失败: ${e.message}`);
      }
    });
    
    if (cleanedCount > 0) {
      success(`✅ 已清理 ${cleanedCount} 个配置文件中的Hook`);
      log('\n💡 提示：', 'brightBlue');
      log('  • Hook已被清理，npm命令将恢复原始行为', 'reset');
      log('  • 项目配置仍然保留，可以重新生成Hook', 'reset');
      log('  • 请重新打开终端使更改生效', 'reset');
    } else {
      info('没有找到需要清理的Hook配置');
    }
  } else {
    info('已取消清理操作');
  }
  
  await askQuestion('\n按回车键返回...');
}

async function regenerateHooks(config) {
  console.clear();
  printHeader('重新生成Hook');
  
  if (!config.shell || !config.manager) {
    warning('终端类型或版本管理器未设置，无法生成Hook');
    await askQuestion('按回车键返回...');
    return;
  }
  
  if (!config.workdirs || config.workdirs.length === 0) {
    warning('暂无项目配置，无需生成Hook');
    await askQuestion('按回车键返回...');
    return;
  }
  
  const shellRcFiles = getShellConfigFiles(config.shell);
  
  log('🔄 即将重新生成Hook配置：', 'brightBlue');
  log(`   终端类型: ${config.shell}`, 'dim');
  log(`   版本管理器: ${config.manager}`, 'dim');
  log(`   项目数量: ${config.workdirs.length}`, 'dim');
  
  const confirm = await askQuestion('\n确认重新生成Hook配置吗？ (y/N): ');
  if (confirm.toLowerCase() === 'y') {
    let generatedCount = 0;
    
    shellRcFiles.forEach(rcFile => {
      try {
        addHook(rcFile, config.manager, config.workdirs);
        generatedCount++;
      } catch (e) {
        warning(`生成 ${rcFile} Hook失败: ${e.message}`);
      }
    });
    
    if (generatedCount > 0) {
      success(`✅ 已重新生成 ${generatedCount} 个Hook配置`);
      log('\n💡 提示：', 'brightBlue');
      log('  • Hook已重新生成，项目版本自动切换功能已启用', 'reset');
      log('  • 请重新打开终端或执行 source 命令使更改生效', 'reset');
      
      log('\n📋 执行以下命令使配置立即生效：', 'brightYellow');
      shellRcFiles.forEach(rcFile => {
        log(`  source ${rcFile}`, 'dim');
      });
    } else {
      warning('Hook生成失败');
    }
  } else {
    info('已取消生成操作');
  }
  
  await askQuestion('\n按回车键返回...');
}

/*--------------- 命令行接口支持 ---------------*/
class CLI {
  static showHelp() {
    console.log(`
🔧 Node.js 工作目录环境配置工具 - 命令行接口

用法:
  ${path.basename(__filename)} [命令] [参数]

命令:
  add <路径> <版本>     添加项目配置
  remove <路径>        删除项目配置  
  list                 列出所有配置
  info                 显示配置文件信息
  regenerate          重新生成Hook
  clean               清理所有Hook
  help                显示帮助信息

示例:
  ${path.basename(__filename)} add ~/my-project 18.17.1
  ${path.basename(__filename)} remove ~/my-project
  ${path.basename(__filename)} list
  ${path.basename(__filename)} regenerate

交互模式:
  ${path.basename(__filename)}
    `);
  }

  static async handleCommand(args) {
    const command = args[0];
    
    try {
      switch (command) {
        case 'add':
          await CLI.addProject(args[1], args[2]);
          break;
        case 'remove':
          await CLI.removeProject(args[1]);
          break;
        case 'list':
          CLI.listProjects();
          break;
        case 'info':
          CLI.showConfigInfo();
          break;
        case 'regenerate':
          await CLI.regenerateHooks();
          break;
        case 'clean':
          await CLI.cleanHooks();
          break;
        case 'help':
        case '--help':
        case '-h':
          CLI.showHelp();
          break;
        default:
          error(`未知命令: ${command}`);
          CLI.showHelp();
          process.exit(1);
      }
    } catch (error) {
      ErrorHandler.handle(error);
      process.exit(1);
    }
  }

  static async addProject(projectPath, version) {
    if (!projectPath || !version) {
      error('添加项目需要指定路径和版本');
      console.log('用法: add <路径> <版本>');
      process.exit(1);
    }

    try {
      const validatedPath = Security.validatePath(projectPath);
      const validatedVersion = Security.validateVersion(version);
      
      const config = loadConfig();
      config.workdirs = config.workdirs || [];
      
      // 检查重复
      const existingConfig = checkDuplicateDir(config.workdirs, validatedPath);
      if (existingConfig) {
        warning(`项目 ${path.basename(validatedPath)} 已存在，更新版本为 ${validatedVersion}`);
        existingConfig.version = validatedVersion;
      } else {
        config.workdirs.push({ dir: validatedPath, version: validatedVersion });
        success(`已添加项目 ${path.basename(validatedPath)} → Node ${validatedVersion}`);
      }
      
      // 创建 .nvmrc 文件
      try {
        fs.mkdirSync(validatedPath, { recursive: true });
        fs.writeFileSync(path.join(validatedPath, '.nvmrc'), validatedVersion, 'utf8');
        info('已创建 .nvmrc 文件');
      } catch (e) {
        warning(`创建 .nvmrc 失败: ${e.message}`);
      }
      
      saveConfig(config);
      
      // 如果有基本配置，重新生成Hook
      if (config.shell && config.manager) {
        await CLI.regenerateHooks();
      } else {
        warning('尚未配置终端类型和版本管理器，请运行交互模式进行初始设置');
      }
      
    } catch (error) {
      ErrorHandler.handle(error);
      process.exit(1);
    }
  }

  static async removeProject(projectPath) {
    if (!projectPath) {
      error('删除项目需要指定路径');
      console.log('用法: remove <路径>');
      process.exit(1);
    }

    try {
      const validatedPath = Security.validatePath(projectPath);
      const config = loadConfig();
      
      const initialLength = config.workdirs.length;
      config.workdirs = config.workdirs.filter(w => path.resolve(w.dir) !== validatedPath);
      
      if (config.workdirs.length < initialLength) {
        success(`已删除项目配置: ${path.basename(validatedPath)}`);
        saveConfig(config);
        
        if (config.shell && config.manager) {
          await CLI.regenerateHooks();
        }
      } else {
        warning(`未找到项目配置: ${path.basename(validatedPath)}`);
      }
      
    } catch (error) {
      ErrorHandler.handle(error);
      process.exit(1);
    }
  }

  static listProjects() {
    const config = loadConfig();
    
    if (!config.workdirs || config.workdirs.length === 0) {
      info('暂无项目配置');
      return;
    }

    log('📁 项目配置列表：', 'brightCyan');
    config.workdirs.forEach((workdir, index) => {
      log(`   ${index + 1}. ${workdir.dir} → Node ${workdir.version}`, 'reset');
    });
    
    log(`\n🔧 基本配置：`, 'brightBlue');
    log(`   终端类型: ${config.shell || '未设置'}`, 'reset');
    log(`   版本管理器: ${config.manager || '未设置'}`, 'reset');
  }

  static showConfigInfo() {
    log('📋 配置文件信息：', 'brightCyan');
    
    log('\n📂 配置路径：', 'brightBlue');
    log(`   当前使用: ${CONFIG_FILE}`, 'reset');
    log(`   现代路径: ${ConfigPaths.modernConfigFile}`, 'dim');
    log(`   旧版路径: ${ConfigPaths.legacyConfigFile}`, 'dim');
    log(`   备份目录: ${ConfigPaths.backupDir}`, 'dim');
    
    // 显示文件状态
    log('\n📄 文件状态：', 'brightBlue');
    
    if (fs.existsSync(ConfigPaths.modernConfigFile)) {
      const stat = fs.statSync(ConfigPaths.modernConfigFile);
      log(`   现代配置: ✅ 存在 (${(stat.size / 1024).toFixed(2)} KB, 修改时间: ${stat.mtime.toLocaleString()})`, 'green');
    } else {
      log('   现代配置: ❌ 不存在', 'dim');
    }
    
    if (fs.existsSync(ConfigPaths.legacyConfigFile)) {
      const stat = fs.statSync(ConfigPaths.legacyConfigFile);
      log(`   旧版配置: ✅ 存在 (${(stat.size / 1024).toFixed(2)} KB, 修改时间: ${stat.mtime.toLocaleString()})`, 'yellow');
    } else {
      log('   旧版配置: ❌ 不存在', 'dim');
    }
    
    // 显示备份信息
    try {
      if (fs.existsSync(ConfigPaths.backupDir)) {
        const backups = fs.readdirSync(ConfigPaths.backupDir)
          .filter(file => file.endsWith('.bak'))
          .length;
        log(`   备份数量: ${backups} 个`, backups > 0 ? 'green' : 'dim');
      } else {
        log('   备份数量: 0 个', 'dim');
      }
    } catch (e) {
      log('   备份数量: 读取失败', 'red');
    }
    
    // 显示权限信息
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const stat = fs.statSync(CONFIG_FILE);
        const mode = (stat.mode & parseInt('777', 8)).toString(8);
        log(`   文件权限: ${mode} ${mode === '600' ? '✅' : '⚠️ (建议设为 600)'}`, mode === '600' ? 'green' : 'yellow');
      }
    } catch (e) {
      log('   文件权限: 读取失败', 'red');
    }
    
    log('\n💡 说明：', 'brightYellow');
    log('   • 现代路径符合 XDG 基础目录规范', 'reset');
    log('   • 工具会自动从旧路径迁移配置到现代路径', 'reset');
    log('   • 每次保存配置时会自动创建备份', 'reset');
    log('   • 建议文件权限设为 600 (仅用户可读写)', 'reset');
  }

  static async regenerateHooks() {
    const config = loadConfig();
    
    if (!config.shell || !config.manager) {
      error('终端类型或版本管理器未设置');
      console.log('请先运行交互模式进行初始设置');
      process.exit(1);
    }
    
    if (!config.workdirs || config.workdirs.length === 0) {
      warning('暂无项目配置，无需生成Hook');
      return;
    }
    
    const shellRcFiles = getShellConfigFiles(config.shell);
    let generatedCount = 0;
    
    shellRcFiles.forEach(rcFile => {
      try {
        addHook(rcFile, config.manager, config.workdirs);
        generatedCount++;
      } catch (e) {
        warning(`生成 ${rcFile} Hook失败: ${e.message}`);
      }
    });
    
    if (generatedCount > 0) {
      success(`已重新生成 ${generatedCount} 个Hook配置`);
      log('\n💡 执行以下命令使配置立即生效：', 'brightYellow');
      shellRcFiles.forEach(rcFile => {
        log(`  source ${rcFile}`, 'dim');
      });
    }
  }

  static async cleanHooks() {
    const config = loadConfig();
    
    if (!config.shell) {
      error('未设置终端类型');
      process.exit(1);
    }
    
    const shellRcFiles = getShellConfigFiles(config.shell);
    let cleanedCount = 0;
    
    shellRcFiles.forEach(rcFile => {
      try {
        removeHook(rcFile);
        cleanedCount++;
      } catch (e) {
        warning(`清理 ${rcFile} 失败: ${e.message}`);
      }
    });
    
    if (cleanedCount > 0) {
      success(`已清理 ${cleanedCount} 个Hook配置`);
      info('请重新打开终端使更改生效');
    }
  }
}

/*--------------- 简化的主程序 ---------------*/
async function main() {
  // 检查命令行参数
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // 命令行模式
    await CLI.handleCommand(args);
    return;
  }
  
  // 交互模式
  printHeader('Node.js 智能版本管理工具');
  
  log('🚀 欢迎使用 Node.js 智能版本管理工具！', 'brightGreen');
  log('', 'reset');
  log('📖 功能介绍：', 'brightCyan');
  log('   • 为不同项目自动切换对应的 Node.js 版本', 'reset');
  log('   • 进入项目目录时自动切换，离开时自动恢复', 'reset');
  log('   • 支持 npm run dev 等命令的智能版本管理', 'reset');
  log('   • 一键 Ctrl+C 停止服务并恢复版本', 'reset');
  log('', 'reset');
  log('🎯 使用场景：', 'brightYellow');
  log('   • 项目A需要 Node 14，项目B需要 Node 18', 'reset');
  log('   • 避免手动切换版本的繁琐操作', 'reset');
  log('   • 确保每个项目使用正确的 Node 版本', 'reset');
  
  // 检测环境
  const shellInfo = await detectShell();
  
  log('\n🔍 环境检测', 'brightCyan');
  log(`操作系统: ${detectOS()}`, 'reset');
  log(`当前Shell: ${shellInfo.name}`, 'reset');
  
  // 加载配置
  let config = loadConfig();
  
  // 检查是否已有基本配置
  const hasBasicConfig = config.shell && config.manager;
  
  if (hasBasicConfig) {
    log('\n🎛️ 选择操作模式：', 'brightCyan');
    log('   1) 配置管理 - 查看、编辑、删除项目配置');
    log('   2) 快速配置 - 添加新项目配置');
    log('   3) 初始配置 - 重新设置基本配置');
    
    const mode = await askQuestion('\n请选择操作模式 [1-3]: ');
    
    if (mode === '1') {
      await showConfigMenu(config);
      return;
    } else if (mode === '2') {
      log('\n⚡ 快速添加项目配置', 'brightBlue');
      printSeparator('-', 50);
      await addProjectConfig(config);
      
      // 如果有配置，重新生成Hook
      if (config.workdirs && config.workdirs.length > 0) {
        const shellRcFiles = getShellConfigFiles(config.shell);
        shellRcFiles.forEach(rcFile => {
          addHook(rcFile, config.manager, config.workdirs);
        });
        
        success('\n✅ 配置已更新并生效！');
        log('\n📋 执行以下命令使配置立即生效：', 'brightYellow');
        shellRcFiles.forEach(rcFile => {
          log(`  source ${rcFile}`, 'dim');
        });
      }
      return;
    }
    // mode === '3' 继续执行初始配置流程
  }
  
  log('\n⚙️ 现在开始简单的三步配置', 'brightCyan');
  printSeparator('-', 50);
  
  // 1. 选择Shell
  if (!config.shell) {
    log('\n📋 第一步：确认您的终端类型', 'brightBlue');
    log('   (帮助我们为您生成合适的配置文件)', 'dim');
    log('\n   💡 不确定用的是哪个？大部分 macOS 用户选择第1个就对了', 'yellow');
    log('\n   1) zsh    - macOS 默认终端 (推荐)');
    log('   2) bash   - 传统终端类型');
    log('   3) fish   - 现代化终端类型');
    
    const shellChoice = await askQuestion('\n请选择您的终端类型 [1-3]: ');
    const shells = { '1': 'zsh', '2': 'bash', '3': 'fish' };
    config.shell = shells[shellChoice] || 'zsh';
    success(`✅ 好的！将为 ${config.shell} 终端生成配置`);
  }
  
  // 2. 选择版本管理器
  if (!config.manager) {
    log('\n🔧 第二步：选择Node.js版本管理工具', 'brightBlue');
    log('   (用来在不同项目间自动切换Node.js版本)', 'dim');
    log('\n   💡 如果不确定，推荐选择 nvm (第1个选项)', 'yellow');
    log('\n   1) nvm - 最流行的版本管理器 (推荐)');
    log('   2) n   - 轻量级版本管理器');
    
    const managerChoice = await askQuestion('\n请选择版本管理器 [1-2]: ');
    const managers = { '1': 'nvm', '2': 'n' };
    config.manager = managers[managerChoice] || 'nvm';
    success(`✅ 将使用 ${config.manager} 来管理Node.js版本`);
  }
  
  // 3. 添加工作目录
  log('\n📁 第三步：配置项目目录', 'brightBlue');
  
  // 显示现有配置
  if (config.workdirs && config.workdirs.length > 0) {
    log('\n📋 当前已配置的项目：', 'brightYellow');
    config.workdirs.forEach((workdir, index) => {
      log(`   ${index + 1}. ${workdir.dir} → Node ${workdir.version}`, 'dim');
    });
    log('\n   告诉我们新项目的路径和Node.js版本，或更新现有项目配置', 'dim');
  } else {
    log('   告诉我们一个项目的路径和它需要的Node.js版本', 'dim');
    log('   之后在该项目中运行 npm 命令时，会自动切换到正确版本', 'dim');
  }
  
  log('\n   💡 示例：项目路径 /Users/username/my-project → 使用Node 18.17.1', 'yellow');
  
  const addMore = await askQuestion('\n现在添加或更新一个项目配置吗？ (推荐选择 y) [y/N]: ');
  if (addMore.toLowerCase() === 'y') {
    log('\n   💡 提示：可以使用绝对路径或相对路径', 'dim');
    log('   示例：/Users/username/my-project 或 ~/projects/my-app', 'dim');
    const dir = await askQuestion('\n📁 请输入项目目录路径: ');
    
    log('\n   💡 提示：请输入该项目需要的Node.js版本', 'dim');
    log('   支持格式：18.17.1 或 v18.17.1 或 18 或 lts/*', 'dim');
    const version = await askQuestion('🏷️ 请输入Node版本: ');
    
    if (dir && version && validateVersion(version)) {
      // 展开 ~ 符号到用户主目录
      let resolvedDir = dir;
      if (dir.startsWith('~/')) {
        resolvedDir = path.join(os.homedir(), dir.slice(2));
      } else if (dir === '~') {
        resolvedDir = os.homedir();
      }
      resolvedDir = path.resolve(resolvedDir);
      
      config.workdirs = config.workdirs || [];
      
      // 🔧 检查重复路径
      const existingConfig = checkDuplicateDir(config.workdirs, dir);
      if (existingConfig) {
        warning(`⚠️ 该目录已经配置过了！`);
        info(`   目录: ${existingConfig.dir}`);
        info(`   当前配置的Node版本: ${existingConfig.version}`);
        log('', 'reset');
        
        const updateChoice = await askQuestion('是否要更新现有配置的Node版本？ (y/N): ');
        if (updateChoice.toLowerCase() === 'y') {
          // 更新现有配置
          existingConfig.version = version.replace(/^v/, '');
          success(`✅ 已更新项目 ${path.basename(resolvedDir)} 的Node版本为 ${version}`);
        } else {
          info('💡 保持原有配置不变');
        }
      } else {
        // 添加新配置
        config.workdirs.push({ dir: resolvedDir, version: version.replace(/^v/, '') });
        success(`✅ 已为项目 ${path.basename(resolvedDir)} 配置Node版本 ${version}`);
      }
      
      // 创建 .nvmrc
      try {
        fs.mkdirSync(resolvedDir, { recursive: true });
        fs.writeFileSync(path.join(resolvedDir, '.nvmrc'), version.replace(/^v/, ''), 'utf8');
        info(`   同时已创建 .nvmrc 文件以确保版本一致性`);
      } catch (e) {
        warning(`创建 .nvmrc 失败: ${e.message}`);
      }
    } else if (!validateVersion(version)) {
      warning('版本格式不正确，请重新运行脚本并输入正确的版本号');
    }
  }
  
  // 4. 安装Hook
  if (config.workdirs && config.workdirs.length > 0) {
    const shellRcFiles = getShellConfigFiles(config.shell);
    shellRcFiles.forEach(rcFile => {
      addHook(rcFile, config.manager, config.workdirs);
    });
    
    saveConfig(config);
    
    log('\n🏆 恭喜！配置已成功完成', 'brightGreen');
    log('\n🎉 现在您可以享受以下便利功能：', 'brightCyan');
    log('  • 🚀 在不同项目间自动切换Node.js版本', 'reset');
    log('  • 📁 进入项目目录时版本自动适配', 'reset');
    log('  • ⚡ 使用 npm run dev 等命令无需担心版本问题', 'reset');
    log('  • 🛑 按一次 Ctrl+C 就能优雅地停止服务', 'reset');
    log('  • 🔄 服务停止后Node版本自动恢复', 'reset');
    
    log('\n📋 下一步操作：', 'brightYellow');
    log('请重新打开终端，或者执行以下命令让配置立即生效：', 'reset');
    shellRcFiles.forEach(rcFile => {
      log(`  source ${rcFile}`, 'dim');
    });
    log('\n💡 小贴士：', 'brightBlue');
    log('  • 现在可以直接进入您配置的项目目录尝试 npm 命令', 'reset');
    log('  • 如需添加更多项目配置，再次运行此脚本即可', 'reset');
    
  } else {
    log('\n📝 暂时跳过项目配置', 'cyan');
    log('💡 您可以随时重新运行此脚本来添加项目配置', 'cyan');
    log('💡 或者在需要的时候再来设置具体的项目和版本', 'cyan');
  }
}

// 错误处理
process.on('unhandledRejection', (reason) => {
  error(`未处理的Promise拒绝: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  error(`未捕获的异常: ${err.message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  log('\n👋 用户中断操作', 'yellow');
  process.exit(0);
});

// 启动程序
main().catch(err => {
  error(`程序启动失败: ${err.message}`);
  process.exit(1);
});