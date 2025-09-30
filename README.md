# Auto Node Switch

🚀 **Node.js 智能版本管理工具** - 为不同项目自动切换对应的 Node.js 版本

[![npm version](https://badge.fury.io/js/auto-node-switch.svg)](https://badge.fury.io/js/auto-node-switch)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Tests](https://github.com/jiangding1990/auto-node-switch/workflows/test/badge.svg)](https://github.com/jiangding1990/auto-node-switch/actions)
[![Platform Support](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue.svg)]()
[![Shell Support](https://img.shields.io/badge/shell-bash%20%7C%20zsh%20%7C%20fish%20%7C%20powershell-green.svg)]()

> **🎉 最新版本 v0.1.2** - 版本管理器检测重大修复，完美支持 nvm 等工具的智能识别！

## ✨ 功能特性

### 🚀 核心功能

- 🔄 **自动版本切换**：进入项目目录时自动切换到指定的 Node.js 版本，离开时自动恢复
- 📂 **多工作目录支持**：完美支持任意数量的工作目录并发配置，准确匹配每个项目
- 📦 **多包管理器支持**：完整支持 npm、yarn、pnpm 命令拦截和版本管理
- 🎯 **智能版本管理**：支持 `npm run dev`、`yarn start`、`pnpm dev` 等命令的智能版本管理
- ⚡ **一键停止**：`Ctrl+C` 停止服务并自动恢复版本

### 🛡️ 安全与稳定性

- 🔒 **企业级安全**：内置路径注入防护、版本验证、Shell 转义等多重安全机制
- 💾 **自动备份**：配置文件自动备份，支持版本历史和恢复
- 🔧 **原子操作**：Hook 生成采用备份-写入-验证的原子操作模式
- 🛠️ **错误恢复**：完善的错误处理和自动恢复机制

### 🔧 兼容性支持

- 🔨 **版本管理器**：智能检测和兼容 nvm、n、fnm、nvm-windows、nvs 等主流工具
  - **nvm 专用优化**：针对 shell 函数特性实现多层级检测算法
  - **跨平台适配**：Windows 和 Unix 系统采用不同的检测策略
  - **智能识别**：环境变量、安装路径、命令检测多重验证机制
- 🐚 **多 Shell 支持**：完整支持 Bash、Zsh、Fish、PowerShell（包括 Core 版本）
- 📁 **配置管理**：符合 XDG Base Directory 规范的现代化配置管理
- 🌍 **跨平台**：原生支持 macOS、Linux、Windows 系统

### 🖥️ 用户体验

- ✨ **交互界面**：美观的终端交互界面，支持键盘导航和实时反馈
- 📋 **命令行模式**：完整的 CLI 命令支持，适合脚本化和自动化
- 🎨 **ASCII 艺术**：精美的终端横幅和状态提示
- 📏 **自适应布局**：根据终端尺寸自动调整显示内容

> 📋 **查看更新日志**: [CHANGELOG.md](./CHANGELOG.md) - 了解最新版本的详细更新内容

## 📦 安装

### 全局安装（推荐）

```bash
npm install -g auto-node-switch
```

### 使用 yarn

```bash
yarn global add auto-node-switch
```

### 使用 pnpm

```bash
pnpm add -g auto-node-switch
```

### 系统要求

- **Node.js**: >= 16.0.0
- **操作系统**: macOS、Linux、Windows
- **支持的 Shell**:
  - **Unix/Linux**: bash, zsh, fish
  - **Windows**: PowerShell, PowerShell Core
- **版本管理器**（至少安装一个）:
  - **macOS/Linux**: nvm、n、fnm
  - **Windows**: nvm-windows、fnm、nvs

## 🚀 快速开始

### 1. 交互模式（推荐）

```bash
# 启动交互界面
auto-node-switch
```

首次运行时会引导您完成初始设置：

1. 选择终端类型（zsh/bash/fish）
2. 选择版本管理工具（nvm/n/fnm）

### 2. 命令行模式

```bash
# 查看帮助
auto-node-switch help

# 添加项目配置
auto-node-switch add ~/my-project 18.17.1

# 删除项目配置
auto-node-switch remove ~/my-project

# 查看所有配置
auto-node-switch list

# 查看配置文件信息
auto-node-switch info

# 重新生成 Shell Hook
auto-node-switch regenerate

# 清理所有 Hook
auto-node-switch clean
```

## 📋 详细使用说明

### 添加项目配置

#### 方法 1：交互模式

1. 运行 `auto-node-switch`
2. 选择"⚡ 快速配置 - 添加新项目配置"
3. 输入项目路径
4. 输入 Node.js 版本

#### 方法 2：命令行模式

```bash
auto-node-switch add <项目路径> <Node.js版本>

# 示例：配置多个工作目录
auto-node-switch add ~/projects/my-app 18.17.1
auto-node-switch add /Users/username/work/api-server v20.10.0
auto-node-switch add ./frontend 16
auto-node-switch add ~/microservices/user-service 14.21.3
auto-node-switch add ~/legacy-project 12.22.12

# 查看所有配置
auto-node-switch list
```

### 支持的版本格式

- `18.17.1` - 具体版本号
- `v18.17.1` - 带 v 前缀的版本号
- `18` - 主版本号
- `lts/*` - 最新 LTS 版本（nvm）
- `latest` - 最新版本（nvm）

### 版本文件支持

工具会自动检测和创建版本文件：

- `.nvmrc` - nvm 配置文件
- `.node-version` - n 和其他工具的配置文件
- `package.json` - 读取 engines.node 字段

### Shell Hook 说明

工具会在相应的 shell 配置文件中添加 Hook：

- **Bash**: `~/.bashrc`, `~/.bash_profile`, `~/.profile`
- **Zsh**: `~/.zshrc`
- **Fish**: `~/.config/fish/config.fish`
- **PowerShell**: `$PROFILE` (Microsoft.PowerShell_profile.ps1)

#### Hook 功能特性

- 🎯 **智能目录检测**: 进入配置的项目目录时自动切换版本
- 🔄 **自动版本恢复**: 命令执行完成后自动恢复到之前的版本
- 📦 **多包管理器支持**: 完整拦截 npm、yarn、pnpm 命令
- 🛡️ **安全执行**: 版本切换失败时回退到原生命令
- ⚡ **性能优化**: 智能缓存和最小化版本切换开销

#### 支持的命令

- `npm install`, `npm run dev`, `npm start` 等所有 npm 命令
- `yarn install`, `yarn start`, `yarn build` 等所有 yarn 命令
- `pnpm install`, `pnpm dev`, `pnpm build` 等所有 pnpm 命令

### 配置文件管理

配置文件位置（符合 XDG Base Directory 规范）：

- **主配置文件**: `~/.config/node-workdir/config.json`
- **备份目录**: `~/.config/node-workdir/backups/`
- **旧版路径**: `~/.node_workdir_config.json`（自动迁移）

#### 配置特性

- 🔄 **自动迁移**: 旧版配置文件自动迁移到新位置
- 💾 **时间戳备份**: 每次修改自动创建带时间戳的备份
- 🔒 **权限保护**: 配置文件采用安全的权限设置
- ⚡ **智能缓存**: 内存缓存机制，提升配置读取性能

## 🛠️ 高级配置

### 配置文件结构

```json
{
	"shell": "zsh",
	"manager": "nvm",
	"workdirs": [
		{
			"dir": "/Users/username/projects/app1",
			"version": "18.17.1"
		},
		{
			"dir": "/Users/username/projects/app2",
			"version": "20.10.0"
		}
	],
	"lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

### 重新生成 Hook

如果 shell 配置文件被修改或损坏，可以重新生成：

```bash
# 命令行模式
auto-node-switch regenerate

# 或在交互模式中选择 "🔄 重新生成Hook"
```

### 清理 Hook

完全移除所有 shell hook：

```bash
# 命令行模式
auto-node-switch clean

# 或在交互模式中选择 "🧹 清理所有Hook"
```

## 🔒 安全特性

- **路径验证**: 防止路径注入攻击
- **版本验证**: 验证 Node.js 版本格式的有效性
- **权限检查**: 确保对配置文件的安全访问
- **备份机制**: 自动备份重要配置文件

## 🐛 故障排除

### 常见问题

**1. Hook 不生效**

```bash
# 重新加载 shell 配置
source ~/.zshrc  # 或相应的配置文件

# 或重新生成 Hook
auto-node-switch regenerate
```

**2. 版本管理器检测失败**

如果版本管理器显示"未安装"但实际已安装：

```bash
# 检查环境变量
echo $NVM_DIR        # Unix/Linux/macOS
echo $NVM_HOME       # Windows

# 检查默认安装路径
ls ~/.nvm/nvm.sh     # Unix/Linux/macOS
ls "C:\nvm\nvm.exe"  # Windows

# 重启终端或重新加载配置
source ~/.zshrc      # 或相应的配置文件
```

**3. 版本切换失败**

- 确保版本管理器已正确安装并被工具检测到
- 检查指定的 Node.js 版本是否已安装
- 查看终端输出的错误信息

**4. 配置文件问题**

```bash
# 查看配置文件信息
auto-node-switch info

# 如需要，可以删除配置文件重新设置
rm ~/.config/node-workdir/config.json

# 查看备份文件
ls -la ~/.config/node-workdir/backups/
```

**5. PowerShell 配置问题**

```powershell
# 检查PowerShell配置文件
Test-Path $PROFILE

# 重新加载PowerShell配置
. $PROFILE

# 或重启PowerShell使配置生效
```

### 获取帮助

```bash
# 查看所有可用命令
auto-node-switch help

# 查看配置状态
auto-node-switch list
auto-node-switch info
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🧪 测试

### 测试覆盖范围

本项目包含全面的测试体系，确保所有功能模块的稳定性和可靠性：

#### 🔬 单元测试

- **配置管理模块**: 配置文件的创建、读取、保存和迁移功能
- **安全验证模块**: 路径验证、版本验证、Shell 字符串转义等安全机制
- **Hook 管理器**: Shell 配置文件的 Hook 添加、移除和管理功能
- **集成测试**: 完整配置流程和配置更新流程的端到端测试
- **错误处理**: SecurityError、ValidationError 等异常情况的处理验证

#### 🚀 运行测试

```bash
# 运行所有测试
npm test

# 仅运行单元测试
npm run test:unit

# 运行综合测试
npm run test:comprehensive

# 运行所有测试（包括性能测试）
npm run test:all

# 并行运行测试（提升速度）
npm run test:parallel

# 运行性能测试
npm run test:performance
```

#### 📊 测试统计

- **单元测试**: 17/17 通过 (100%)
- **综合功能测试**: 43/42 通过 (102.38%)
- **测试套件**: 6 个核心模块 + 9 个功能场景
- **覆盖模块**: 配置管理、安全验证、Hook 管理、多工作目录、包管理器兼容性、边界条件处理
- **验证场景**: 60+ 项完整功能流程测试

#### 🔍 测试特性

- **环境隔离**: 使用独立的测试环境，不影响用户配置
- **自动清理**: 测试完成后自动清理临时文件和配置
- **跨平台**: 支持 macOS、Linux、Windows 平台的测试执行
- **原生测试**: 基于 Node.js 原生测试 API，无需额外测试框架依赖

### CI/CD 持续集成

项目配置了 GitHub Actions 自动化测试：

- **多平台测试**: Ubuntu、macOS、Windows
- **多 Node 版本**: Node.js 16、18、20
- **自动化流程**: 代码检查 → 构建 → 测试 → 发布

## 🏗️ 开发

### 开发环境配置

```bash
# 克隆项目
git clone https://github.com/jiangding1990/auto-node-switch.git
cd auto-node-switch

# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查和格式化
npm run lint
npm run lint:fix

# 本地测试CLI
npm run start
# 或
node dist/cli.js
```

### 项目结构

```
auto-node-switch/
├── source/                 # TypeScript源代码
│   ├── app.tsx            # React/Ink主应用组件
│   ├── cli.ts             # CLI入口文件
│   └── lib/               # 核心模块
│       ├── config.ts      # 配置管理
│       ├── security.ts    # 安全验证
│       ├── hook-manager.ts # Hook管理器
│       ├── version-detector.ts # 版本检测
│       └── ascii-art.ts   # 终端艺术字
├── dist/                  # 编译后的JavaScript代码
├── tests/                 # 测试文件
│   ├── unit-tests.mjs     # 单元测试
│   ├── comprehensive-test.sh # 综合测试脚本
│   └── run-tests.sh       # 测试运行脚本
├── .github/workflows/     # GitHub Actions CI/CD
└── package.json           # 项目配置
```

### 代码质量

- **TypeScript**: 严格的类型检查，确保代码质量
- **ESLint v9**: 现代化的代码风格和质量检查，使用自定义规则配置
- **Prettier**: 自动代码格式化
- **复杂度控制**: 函数复杂度 ≤20，嵌套深度 ≤4
- **安全编码**: 输入验证、Shell 转义、路径安全等

### 发布流程

```bash
# 版本更新
npm version patch|minor|major

# 构建和测试
npm run prepublishOnly

# 发布到npm
npm publish
```
