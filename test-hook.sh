#!/bin/zsh
# 测试Hook是否正常工作

echo "=== 测试Hook功能 ==="
echo "当前Node版本: $(node -v)"

# 模拟进入工作目录并运行npm命令
echo "切换到工作目录: /Users/jiangding/ke_git"
cd /Users/jiangding/ke_git

echo "运行npm --version测试Hook..."
npm --version

echo "当前Node版本: $(node -v)"