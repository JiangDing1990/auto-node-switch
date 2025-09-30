#!/bin/bash

# =============================================================================
# Auto Node Switch - 综合功能测试脚本
# 版本: v0.1.3
#
# 该脚本对 auto-node-switch 工具进行全面的功能测试，包括：
# 1. 配置管理模块测试
# 2. 安全验证模块测试
# 3. Hook管理器测试
# 4. Shell配置模板测试
# 5. 多包管理器拦截测试
# 6. 重复配置检测测试
# 7. 边界条件测试
# 8. 端到端集成测试
# =============================================================================

set -uo pipefail
# 注意：移除 -e 选项，我们需要手动处理错误以避免测试失败时脚本立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_PATH="${PROJECT_ROOT}/dist/cli.js"

# 测试临时目录
TEST_TMP_DIR="/tmp/auto-node-switch-test-$$"
BACKUP_CONFIG_DIR=""

# 日志函数
log_info() {
    echo -e "${CYAN}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_section() {
    echo -e "\n${BLUE}=== $* ===${NC}"
}

# 测试断言函数
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-}"

    ((TOTAL_TESTS++))

    if [[ "$expected" == "$actual" ]]; then
        log_success "${message:-Assertion passed}: expected='$expected', actual='$actual'"
        return 0
    else
        log_error "${message:-Assertion failed}: expected='$expected', actual='$actual'"
        return 1
    fi
}

assert_contains() {
    local text="$1"
    local pattern="$2"
    local message="${3:-}"

    ((TOTAL_TESTS++))

    if echo "$text" | grep -q "$pattern"; then
        log_success "${message:-Contains assertion passed}: found '$pattern' in text"
        return 0
    else
        log_error "${message:-Contains assertion failed}: '$pattern' not found in text"
        echo "实际输出内容："
        echo "$text" | head -5
        echo "---"
        return 1
    fi
}

assert_file_exists() {
    local file_path="$1"
    local message="${2:-}"

    ((TOTAL_TESTS++))

    if [[ -f "$file_path" ]]; then
        log_success "${message:-File exists}: $file_path"
        return 0
    else
        log_error "${message:-File not exists}: $file_path"
        return 1
    fi
}

assert_command_success() {
    local command="$1"
    local message="${2:-}"

    ((TOTAL_TESTS++))

    if eval "$command" &>/dev/null; then
        log_success "${message:-Command succeeded}: $command"
        return 0
    else
        log_error "${message:-Command failed}: $command"
        return 1
    fi
}

# 环境准备
setup_test_environment() {
    log_section "环境准备"

    # 创建测试临时目录
    mkdir -p "$TEST_TMP_DIR"
    log_info "创建测试目录: $TEST_TMP_DIR"

    # 备份现有配置
    if [[ -f ~/.config/node-workdir/config.json ]]; then
        BACKUP_CONFIG_DIR="$TEST_TMP_DIR/config-backup"
        mkdir -p "$BACKUP_CONFIG_DIR"
        cp -r ~/.config/node-workdir/* "$BACKUP_CONFIG_DIR/" 2>/dev/null || true
        log_info "备份现有配置到: $BACKUP_CONFIG_DIR"
    fi

    # 创建测试项目目录
    mkdir -p "$TEST_TMP_DIR/test-projects"/{npm-project,yarn-project,pnpm-project}

    # 创建测试项目的package.json
    echo '{"name": "npm-test-project", "version": "1.0.0"}' > "$TEST_TMP_DIR/test-projects/npm-project/package.json"
    echo '{"name": "yarn-test-project", "version": "1.0.0"}' > "$TEST_TMP_DIR/test-projects/yarn-project/package.json"
    echo '{"name": "pnpm-test-project", "version": "1.0.0"}' > "$TEST_TMP_DIR/test-projects/pnpm-project/package.json"

    # 创建对应的lock文件
    touch "$TEST_TMP_DIR/test-projects/npm-project/package-lock.json"
    touch "$TEST_TMP_DIR/test-projects/yarn-project/yarn.lock"
    touch "$TEST_TMP_DIR/test-projects/pnpm-project/pnpm-lock.yaml"

    log_info "测试环境准备完成"
}

# 环境清理
cleanup_test_environment() {
    log_section "环境清理"

    # 恢复原始配置
    if [[ -n "$BACKUP_CONFIG_DIR" && -d "$BACKUP_CONFIG_DIR" ]]; then
        rm -rf ~/.config/node-workdir/* 2>/dev/null || true
        cp -r "$BACKUP_CONFIG_DIR"/* ~/.config/node-workdir/ 2>/dev/null || true
        log_info "恢复原始配置"
    fi

    # 清理测试目录
    rm -rf "$TEST_TMP_DIR"
    log_info "清理测试目录: $TEST_TMP_DIR"
}

# 1. 配置管理模块测试
test_config_management() {
    log_section "1. 配置管理模块测试"

    # 测试配置文件创建
    local output
    if output=$(node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/npm-project" "16.20.0" 2>&1); then
        assert_contains "$output" "已添加项目" "配置文件创建测试" || true
    else
        log_error "配置文件创建测试: CLI命令执行失败"
        echo "错误输出: $output"
        ((FAILED_TESTS++))
        ((TOTAL_TESTS++))
    fi

    # 测试配置列表显示
    if output=$(node "$CLI_PATH" list 2>&1); then
        assert_contains "$output" "npm-project" "配置列表显示测试" || true
        assert_contains "$output" "16.20.0" "版本信息显示测试" || true
    else
        log_error "配置列表显示测试: CLI命令执行失败"
        echo "错误输出: $output"
        ((FAILED_TESTS += 2))
        ((TOTAL_TESTS += 2))
    fi

    # 测试配置文件信息
    if output=$(node "$CLI_PATH" info 2>&1); then
        assert_contains "$output" "配置文件信息" "配置信息显示测试" || true
        assert_contains "$output" "现代配置.*存在" "现代配置文件存在性测试" || true
    else
        log_error "配置信息显示测试: CLI命令执行失败"
        echo "错误输出: $output"
        ((FAILED_TESTS += 2))
        ((TOTAL_TESTS += 2))
    fi

    # 验证配置文件存在
    assert_file_exists ~/.config/node-workdir/config.json "XDG规范配置文件存在性测试" || true

    # 验证版本文件创建
    assert_file_exists "$TEST_TMP_DIR/test-projects/npm-project/.nvmrc" "版本文件创建测试" || true

    # 验证版本文件内容
    if [[ -f "$TEST_TMP_DIR/test-projects/npm-project/.nvmrc" ]]; then
        local nvmrc_content
        nvmrc_content=$(cat "$TEST_TMP_DIR/test-projects/npm-project/.nvmrc")
        assert_equals "16.20.0" "$nvmrc_content" "版本文件内容正确性测试" || true
    else
        log_error "版本文件内容正确性测试: .nvmrc文件不存在"
        ((FAILED_TESTS++))
        ((TOTAL_TESTS++))
    fi
}

# 2. 安全验证模块测试
test_security_validation() {
    log_section "2. 安全验证模块测试"

    # 测试路径注入防护
    local output
    output=$(node "$CLI_PATH" add "../../../etc/passwd" "18.0.0" 2>&1 || true)
    assert_contains "$output" "路径验证失败\|安全错误\|❌" "路径注入防护测试"

    # 测试恶意版本号防护
    output=$(node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/npm-project" "18.0.0; rm -rf /" 2>&1 || true)
    assert_contains "$output" "版本验证失败\|安全错误\|❌" "恶意版本号防护测试"

    # 测试空值处理
    output=$(node "$CLI_PATH" add "" "" 2>&1 || true)
    assert_contains "$output" "需要指定路径和版本\|❌" "空值处理测试"

    # 测试无效路径处理
    output=$(node "$CLI_PATH" add "/non/existent/deep/path" "18.0.0" 2>&1 || true)
    # 这个测试可能会成功创建目录，所以检查是否有适当的处理
    log_info "无效路径处理测试完成: $output"
}

# 3. Hook管理器测试
test_hook_manager() {
    log_section "3. Hook管理器测试"

    # 添加测试配置以触发Hook生成
    node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/yarn-project" "18.17.0" &>/dev/null

    # 测试Hook生成
    local output
    output=$(node "$CLI_PATH" regenerate 2>&1)
    assert_contains "$output" "已重新生成.*Hook配置\|✅" "Hook生成测试"

    # 验证Shell配置文件中是否包含Hook函数
    if [[ -f ~/.zshrc ]]; then
        assert_contains "$(cat ~/.zshrc)" "npm()" "Zsh Hook函数存在性测试"
        assert_contains "$(cat ~/.zshrc)" "yarn()" "Yarn Hook函数存在性测试"
        assert_contains "$(cat ~/.zshrc)" "pnpm()" "Pnpm Hook函数存在性测试"
    fi

    # 测试Hook清理
    output=$(node "$CLI_PATH" clean 2>&1)
    assert_contains "$output" "已清理.*Hook配置\|✅" "Hook清理测试"
}

# 4. 重复配置检测测试
test_duplicate_detection() {
    log_section "4. 重复配置检测测试"

    local test_path="$TEST_TMP_DIR/test-projects/pnpm-project"

    # 首次添加配置
    local output
    output=$(node "$CLI_PATH" add "$test_path" "20.0.0" 2>&1)
    assert_contains "$output" "已添加项目" "首次配置添加测试"

    # 测试相同路径和版本的重复检测
    output=$(node "$CLI_PATH" add "$test_path" "20.0.0" 2>&1)
    assert_contains "$output" "已配置相同版本\|配置未发生变化" "相同配置重复检测测试"

    # 测试相同路径不同版本的覆盖
    output=$(node "$CLI_PATH" add "$test_path" "18.19.0" 2>&1)
    assert_contains "$output" "检测到重复配置\|已覆盖原配置" "版本覆盖测试"
    assert_contains "$output" "原版本.*20.0.0" "原版本显示测试"
    assert_contains "$output" "新版本.*18.19.0" "新版本显示测试"

    # 验证版本确实被更新
    output=$(node "$CLI_PATH" list 2>&1)
    assert_contains "$output" "18.19.0" "版本更新验证测试"
}

# 5. 多包管理器支持测试
test_package_manager_support() {
    log_section "5. 多包管理器支持测试"

    # 添加不同类型的项目配置
    node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/npm-project" "16.20.0" &>/dev/null
    node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/yarn-project" "18.17.0" &>/dev/null
    node "$CLI_PATH" add "$TEST_TMP_DIR/test-projects/pnpm-project" "20.0.0" &>/dev/null

    # 重新生成Hook
    node "$CLI_PATH" regenerate &>/dev/null

    # 验证多包管理器Hook函数存在
    if [[ -f ~/.zshrc ]]; then
        local zshrc_content
        zshrc_content=$(cat ~/.zshrc)

        # 统计包管理器函数数量（只计算实际的函数定义，不包括注释）
        local npm_count yarn_count pnpm_count
        npm_count=$(echo "$zshrc_content" | grep -c "^npm()" || echo "0")
        yarn_count=$(echo "$zshrc_content" | grep -c "^yarn()" || echo "0")
        pnpm_count=$(echo "$zshrc_content" | grep -c "^pnpm()" || echo "0")

        assert_equals "1" "$npm_count" "npm函数唯一性测试"
        assert_equals "1" "$yarn_count" "yarn函数唯一性测试"
        assert_equals "1" "$pnpm_count" "pnpm函数唯一性测试"

        # 验证Hook函数包含工作目录配置
        assert_contains "$zshrc_content" "npm-project" "npm项目配置包含测试"
        assert_contains "$zshrc_content" "yarn-project" "yarn项目配置包含测试"
        assert_contains "$zshrc_content" "pnpm-project" "pnpm项目配置包含测试"
    fi
}

# 6. 边界条件测试
test_edge_cases() {
    log_section "6. 边界条件测试"

    # 测试删除不存在的配置
    local output
    output=$(node "$CLI_PATH" remove "/non/existent/path" 2>&1)
    assert_contains "$output" "未找到项目配置\|⚠️" "删除不存在配置测试"

    # 测试在没有配置时执行regenerate
    node "$CLI_PATH" clean &>/dev/null
    # 清空项目配置但保留基本设置
    echo '{"manager":"nvm","shell":"zsh","workdirs":[],"lastUpdated":"'$(date -Iseconds)'"}' > ~/.config/node-workdir/config.json
    output=$(node "$CLI_PATH" regenerate 2>&1)
    assert_contains "$output" "暂无项目配置\|⚠️" "空配置regenerate测试"

    # 测试空格路径处理（安全的特殊字符）
    local special_path="$TEST_TMP_DIR/test with spaces"
    mkdir -p "$special_path"
    echo '{"name": "special-test", "version": "1.0.0"}' > "$special_path/package.json"

    if output=$(node "$CLI_PATH" add "$special_path" "16.0.0" 2>&1); then
        assert_contains "$output" "已添加项目\|✅" "空格路径处理测试" || true
    else
        log_error "空格路径处理测试: CLI命令执行失败"
        echo "错误输出: $output"
        ((FAILED_TESTS++))
        ((TOTAL_TESTS++))
    fi

    # 测试危险字符路径被正确拒绝
    local dangerous_path="$TEST_TMP_DIR/test & dangerous"
    mkdir -p "$dangerous_path" 2>/dev/null || true
    if output=$(node "$CLI_PATH" add "$dangerous_path" "16.0.0" 2>&1); then
        log_error "危险字符路径拒绝测试: 应该被拒绝但未被拒绝"
        ((FAILED_TESTS++))
        ((TOTAL_TESTS++))
    else
        assert_contains "$output" "路径包含不安全字符\|❌" "危险字符路径拒绝测试" || true
    fi
}

# 7. CLI命令完整性测试
test_cli_commands() {
    log_section "7. CLI命令完整性测试"

    # 测试help命令
    local output
    output=$(node "$CLI_PATH" help 2>&1)
    assert_contains "$output" "用法\|命令行接口" "help命令测试"

    # 测试未知命令处理
    output=$(node "$CLI_PATH" unknown-command 2>&1 || true)
    assert_contains "$output" "未知命令\|❌" "未知命令处理测试"

    # 测试不完整参数处理
    output=$(node "$CLI_PATH" add 2>&1 || true)
    assert_contains "$output" "需要指定路径和版本\|❌" "不完整参数处理测试"

    output=$(node "$CLI_PATH" remove 2>&1 || true)
    assert_contains "$output" "需要指定路径\|❌" "remove命令参数检查测试"

    # 测试交互模式Raw mode错误处理
    # 在非TTY环境中运行，应该会输出错误信息
    if [[ -t 0 ]]; then
        # 在TTY环境中，需要使用超时机制避免卡住
        output=$(timeout 5s node "$CLI_PATH" 2>&1 || true)
    else
        # 在非TTY环境中直接运行
        output=$(node "$CLI_PATH" 2>&1 || true)
    fi
    assert_contains "$output" "交互模式需要在支持TTY的终端中运行\|❌" "交互模式TTY检查测试"
}

# 8. 构建和环境测试
test_build_and_environment() {
    log_section "8. 构建和环境测试"

    # 测试TypeScript编译
    cd "$PROJECT_ROOT"
    assert_command_success "npm run build" "TypeScript编译测试"

    # 验证构建产物
    assert_file_exists "$PROJECT_ROOT/dist/cli.js" "CLI构建产物存在性测试"
    assert_file_exists "$PROJECT_ROOT/dist/app.js" "App构建产物存在性测试"

    # 测试CLI可执行性
    assert_command_success "node $CLI_PATH --help" "CLI可执行性测试"
}

# 性能测试
test_performance() {
    log_section "9. 性能测试"

    # 测试大量配置的处理性能
    local start_time end_time duration
    start_time=$(date +%s.%N)

    # 添加多个配置项
    for i in {1..10}; do
        local test_dir="$TEST_TMP_DIR/perf-test-$i"
        mkdir -p "$test_dir"
        echo '{"name": "perf-test-'$i'", "version": "1.0.0"}' > "$test_dir/package.json"
        node "$CLI_PATH" add "$test_dir" "18.$i.0" &>/dev/null
    done

    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)

    log_info "添加10个配置耗时: ${duration}秒"

    # 测试列表显示性能
    start_time=$(date +%s.%N)
    node "$CLI_PATH" list &>/dev/null
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)

    log_info "列表显示耗时: ${duration}秒"

    # 性能断言（配置列表显示应该在1秒内完成）
    if (( $(echo "$duration < 1.0" | bc -l) )); then
        log_success "性能测试: 列表显示性能符合预期"
        ((PASSED_TESTS++))
    else
        log_error "性能测试: 列表显示性能超出预期（${duration}秒）"
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# 生成测试报告
generate_test_report() {
    log_section "测试报告"

    local success_rate
    if (( TOTAL_TESTS > 0 )); then
        success_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    else
        success_rate="0"
    fi

    echo
    echo "=============================="
    echo "   Auto Node Switch 测试报告   "
    echo "=============================="
    echo "总测试数量: $TOTAL_TESTS"
    echo "通过测试: $PASSED_TESTS"
    echo "失败测试: $FAILED_TESTS"
    echo "成功率: ${success_rate}%"
    echo "=============================="

    if (( FAILED_TESTS == 0 )); then
        echo -e "${GREEN}🎉 所有测试通过！${NC}"
        return 0
    else
        echo -e "${RED}❌ 有 $FAILED_TESTS 个测试失败${NC}"
        return 1
    fi
}

# 主函数
main() {
    echo -e "${CYAN}"
    echo "=============================================="
    echo "  Auto Node Switch 综合功能测试脚本 v0.1.3  "
    echo "=============================================="
    echo -e "${NC}"

    # 检查项目环境
    if [[ ! -f "$CLI_PATH" ]]; then
        log_error "CLI文件不存在: $CLI_PATH"
        log_info "请先运行 'npm run build' 构建项目"
        exit 1
    fi

    # 设置错误处理
    trap cleanup_test_environment EXIT

    # 执行测试套件
    setup_test_environment

    test_config_management
    test_security_validation
    test_hook_manager
    test_duplicate_detection
    test_package_manager_support
    test_edge_cases
    test_cli_commands
    test_build_and_environment
    test_performance

    # 生成测试报告
    generate_test_report
}

# 运行主函数
main "$@"