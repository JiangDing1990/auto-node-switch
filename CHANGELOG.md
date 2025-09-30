# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-09-30

### 🔄 Enhanced - 增强功能

#### 智能重复配置检测

- **重复路径检测**: 增强了重复项目路径的检测逻辑，使用 `path.resolve()` 确保路径比较准确性
- **智能提示系统**: 针对不同场景提供详细的用户反馈
  - 相同路径+相同版本：提示配置未变化，无需重复添加
  - 相同路径+不同版本：显示版本对比信息，确认覆盖操作
  - 新路径配置：正常添加并提供成功反馈
- **统一检测逻辑**: CLI 模式和交互模式使用相同的重复检测算法

### 📚 Documentation - 文档更新

#### 文档体系完善

- **CHANGELOG.md**: 创建详细的版本更新日志，遵循 Keep a Changelog 标准
- **README.md**: 全面更新功能特性描述和系统要求
  - 增加多包管理器支持的徽章显示
  - 完善 Shell 支持和兼容性说明
  - 优化系统要求和故障排除部分
- **文档清理**: 移除过时的 PACKAGE_MANAGER_SUPPORT.md 设计文档

### 🛠️ Technical - 技术改进

#### 代码质量提升

- **TypeScript 类型安全**: 修复了重复配置检测中的类型检查问题
- **模块导入优化**: 在 app.tsx 中正确导入 path 模块
- **路径处理改进**: 使用标准化路径解析，提高配置匹配准确性

### 🎨 User Experience - 用户体验

#### 交互体验优化

- **信息透明化**: 用户能清楚了解每次配置操作的具体结果
- **操作确认**: 重复配置时显示原版本和新版本的对比信息
- **避免困惑**: 不再静默处理重复操作，而是明确告知用户当前状态

---

## [0.1.0] - 2025-09-30

### 🎉 重大版本发布 - 全面重构

这是一个重大的版本更新，带来了全面的架构重构和功能增强。

### ✨ Added

#### 🔄 Hook 管理器重构优化

- **模块化架构**: 全新的模块化 Hook 管理系统，支持更灵活的配置
- **多 Shell 配置支持**: 新增 `FishShellConfig` 和 `PowerShellConfig` 类
- **完整包管理器覆盖**: Fish 和 PowerShell 现在完整支持 npm、yarn、pnpm 三大包管理器
- **模板引擎系统**: 引入专用的模板引擎，支持变量替换和 Shell 特定转义

#### 🛡️ 安全性大幅提升

- **增强的输入验证**: 更严格的路径和版本号验证机制
- **Shell 注入防护**: 针对不同 Shell 的专用转义算法
- **权限安全检查**: 文件操作前的权限预检和安全验证
- **SecurityError 和 ValidationError**: 专用的安全异常类型

#### 🎨 界面体验优化

- **自适应显示**: 根据终端高度动态调整界面元素
- **美化的 ASCII 横幅**: 支持 mini 和 stylish 两种显示模式
- **实时状态反馈**: 操作过程中的实时进度和状态显示
- **错误提示优化**: 更友好的错误信息和解决建议
- **键盘导航**: 完整的键盘操作支持，包括 ESC 返回功能

#### 🔧 架构改进

- **配置缓存机制**: 智能配置缓存，提升响应速度
- **XDG 规范兼容**: 完全符合 XDG Base Directory 规范
- **自动配置迁移**: 旧版配置文件自动迁移到新位置
- **备份策略优化**: 带时间戳的自动备份机制
- **TypeScript 重写**: 完整的 TypeScript 类型支持

### 🔧 Changed

#### Shell 配置模板

- **Bash/Zsh**: 优化了版本切换逻辑，改进了 trap 处理机制
- **Fish**: 完全重写，新增 yarn 和 pnpm 函数支持
- **PowerShell**: 完全重写，支持 nvm-windows、fnm、nvs 三种版本管理器

#### 配置文件管理

- **配置路径**: 从 `~/.auto-node-switch-config.json` 迁移到 `~/.config/node-workdir/config.json`
- **备份机制**: 从简单备份升级到带时间戳的版本化备份
- **配置结构**: 增加了 `lastUpdated` 字段用于追踪修改时间

#### 命令行界面

- **交互模式**: 完全重新设计的交互界面，支持多步骤向导
- **命令行参数**: 优化了所有 CLI 命令的参数处理和错误提示
- **帮助信息**: 更详细和友好的帮助文档

### 🐛 Fixed

#### 关键 Bug 修复

- **多包管理器支持**: 修复了 Fish 和 PowerShell 配置中缺失 yarn/pnpm 支持的重大缺陷
- **JSON 解析**: 改进了多工作目录的 JSON 解析逻辑
- **版本恢复**: 修复了某些情况下版本无法正确恢复的问题
- **文件权限**: 修复了配置文件权限检查的边界条件问题

#### Shell 兼容性修复

- **PowerShell Core**: 修复了在 PowerShell Core 中的兼容性问题
- **Fish Shell**: 修复了 Fish 特有的语法问题和命令替换
- **Windows 路径**: 修复了 Windows 路径分隔符的处理问题

### 🧪 Quality Assurance

#### 全面测试覆盖

- **8 个核心模块测试**: 系统性检查所有功能模块
- **安全验证测试**: 全面的安全漏洞和注入攻击测试
- **边界条件测试**: 异常输入和错误情况的处理测试
- **跨平台测试**: 在 macOS、Linux、Windows 的全面验证

#### 代码质量

- **TypeScript 编译**: 零错误的 TypeScript 编译
- **模块化设计**: 清晰的模块分离和接口定义
- **错误处理**: 完善的错误处理和恢复机制

### 💔 Breaking Changes

- **配置文件位置**: 配置文件从旧位置迁移到 XDG 标准位置（自动迁移）
- **Hook 函数结构**: Shell Hook 函数的内部实现发生变化（向后兼容）
- **API 接口**: 内部 API 接口有所调整（不影响用户使用）

### 🔄 Migration Guide

#### 自动迁移

大部分用户无需手动操作，系统会自动处理：

- 配置文件自动从旧位置迁移到新位置
- Hook 函数自动更新到新版本
- 旧配置格式自动转换为新格式

#### 手动操作（可选）

如需手动清理旧配置：

```bash
# 查看配置状态
auto-node-switch info

# 重新生成Hook（推荐）
auto-node-switch regenerate

# 如有问题，清理并重新设置
auto-node-switch clean
```

---

## [0.0.3] - 2025-09-22

### Fixed

- 修复 Hook 中 Node.js 依赖问题
- 修复 PowerShell 函数返回值问题
- 修复 package.json 版本解析问题
- 优化错误处理和用户体验
- 修复代码 eslint 问题

### Changed

- 移除.claude/目录的版本管理

---

## [0.0.2] - 2025-09-20

### Added

- 基础的多包管理器支持
- Shell Hook 生成功能
- 配置文件管理

### Fixed

- 初始版本的基础 Bug 修复

---

## [0.0.1] - 2025-09-18

### Added

- 项目初始化
- 基础的 Node.js 版本切换功能
- 简单的配置管理
