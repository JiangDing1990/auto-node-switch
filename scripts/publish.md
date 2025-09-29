# 发布指南

## 发布到 npm 的完整步骤

### 1. 准备工作

确保您有 npm 账户：

- 访问 https://www.npmjs.com/signup 注册账户
- 验证邮箱地址
- 启用双因素认证（推荐）

### 2. 登录 npm

```bash
npm login
```

输入您的：

- Username
- Password
- Email
- 双因素认证代码（如果启用）

验证登录状态：

```bash
npm whoami
```

### 3. 检查包名可用性

```bash
npm view auto-node-switch
```

如果显示 404，说明包名可用。如果已存在，需要：

- 选择新的包名
- 或使用作用域包名：`@your-username/auto-node-switch`

### 4. 最终检查

```bash
# 确保所有文件都已构建
npm run build

# 检查将要发布的文件
npm pack --dry-run

# 检查包信息
npm publish --dry-run
```

### 5. 发布包

首次发布：

```bash
npm publish
```

如果使用作用域包：

```bash
npm publish --access public
```

### 6. 验证发布

```bash
# 检查包是否可以安装
npm view auto-node-switch

# 在其他位置测试安装
npm install -g auto-node-switch
auto-node-switch --help
```

### 7. 后续版本发布

更新版本号：

```bash
# 补丁版本 (1.0.0 -> 1.0.1)
npm version patch

# 小版本 (1.0.0 -> 1.1.0)
npm version minor

# 大版本 (1.0.0 -> 2.0.0)
npm version major
```

然后重新发布：

```bash
npm publish
```

## 常见问题解决

### 包名冲突

如果包名被占用，可以：

1. 使用作用域包名：`@your-username/auto-node-switch`
2. 选择其他包名，如：`auto-node-switcher`、`smart-node-switch`

### 权限问题

确保您有发布权限：

```bash
npm owner ls auto-node-switch
npm owner add <username> auto-node-switch
```

### 文件大小问题

如果包太大，检查 .npmignore 文件，确保不包含不必要的文件。

## Git 标签（推荐）

发布后创建 Git 标签：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 自动化发布

可以考虑使用 GitHub Actions 进行自动化发布：

- 在 Git tag 时自动发布
- 运行测试后再发布
- 自动更新版本号
