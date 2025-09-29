# Auto Node Switch

🚀 **Node.js 智能版本管理工具** - 为不同项目自动切换对应的 Node.js 版本

[![npm version](https://badge.fury.io/js/auto-node-switch.svg)](https://badge.fury.io/js/auto-node-switch)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 🔄 **自动版本切换**：进入项目目录时自动切换到指定的 Node.js 版本，离开时自动恢复
- 🎯 **智能版本管理**：支持 `npm run dev` 等命令的智能版本管理
- ⚡ **一键停止**：Ctrl+C 停止服务并自动恢复版本
- 🛡️ **安全可靠**：内置安全验证，防止路径注入和恶意操作
- 🔧 **多工具支持**：兼容 nvm、n、fnm、nvm-windows、nvs 等主流版本管理器
- 🐚 **多终端支持**：支持 zsh、bash、fish、PowerShell 等主流 shell
- 📁 **配置管理**：符合 XDG 规范的配置文件管理
- 🖥️ **交互界面**：美观的终端交互界面和命令行操作
- 🌍 **跨平台支持**：支持 macOS、Linux、Windows 系统

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

- Node.js >= 16
- 已安装的版本管理器：
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

# 示例
auto-node-switch add ~/projects/my-app 18.17.1
auto-node-switch add /Users/username/work/api-server v20.10.0
auto-node-switch add ./frontend 16
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

- **zsh**: `~/.zshrc`
- **bash**: `~/.bashrc`, `~/.bash_profile`, `~/.profile`
- **fish**: `~/.config/fish/config.fish`

Hook 会在以下时机触发：

- 进入配置的项目目录时自动切换版本
- 离开项目目录时恢复到之前的版本
- 运行 npm/yarn/pnpm 命令时确保版本正确

### 配置文件管理

配置文件位置（符合 XDG 规范）：

- **现代路径**: `~/.config/auto-node-switch/config.json`
- **旧版路径**: `~/.auto-node-switch-config.json`（兼容）
- **备份目录**: `~/.config/auto-node-switch/backups/`

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

**2. 版本切换失败**

- 确保版本管理器已正确安装
- 检查指定的 Node.js 版本是否已安装
- 查看终端输出的错误信息

**3. 配置文件问题**

```bash
# 查看配置文件信息
auto-node-switch info

# 如需要，可以删除配置文件重新设置
rm ~/.config/auto-node-switch/config.json
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

## 🏗️ 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 运行测试
npm test

# 代码检查
npm run test
```
