#!/bin/bash

# =============================================================================
# Auto Node Switch - 测试运行脚本
# 版本: v0.1.1
#
# 该脚本提供统一的测试运行入口，支持：
# - 单元测试
# - 综合功能测试
# - 性能测试
# - 并行测试执行
# =============================================================================

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS_DIR="$PROJECT_ROOT/tests"

# 日志函数
log_info() {
    echo -e "${CYAN}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_section() {
    echo -e "\n${BLUE}=== $* ===${NC}"
}

# 显示帮助信息
show_help() {
    cat << EOF
Auto Node Switch 测试运行脚本

用法: $0 [选项] [测试类型]

测试类型:
  unit          运行单元测试
  comprehensive 运行综合功能测试
  all           运行所有测试 (默认)
  performance   只运行性能测试

选项:
  -h, --help    显示此帮助信息
  -v, --verbose 显示详细输出
  -q, --quiet   静默模式
  --no-build    跳过构建步骤
  --parallel    并行运行测试

示例:
  $0                    # 运行所有测试
  $0 unit              # 只运行单元测试
  $0 comprehensive -v  # 运行综合测试并显示详细输出
  $0 all --parallel    # 并行运行所有测试

EOF
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查Node.js版本
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi

    local node_version
    node_version=$(node --version | sed 's/v//')
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)

    if (( major_version < 16 )); then
        log_error "需要 Node.js >= 16，当前版本: $node_version"
        exit 1
    fi

    log_success "Node.js 版本检查通过: $node_version"

    # 检查bc命令（性能测试需要）
    if ! command -v bc &> /dev/null; then
        log_warning "bc 命令未找到，性能测试可能无法正常运行"
    fi
}

# 构建项目
build_project() {
    if [[ "${SKIP_BUILD:-false}" == "true" ]]; then
        log_info "跳过构建步骤"
        return 0
    fi

    log_section "构建项目"
    cd "$PROJECT_ROOT"

    if [[ "${VERBOSE:-false}" == "true" ]]; then
        npm run build
    else
        npm run build > /dev/null 2>&1
    fi

    log_success "项目构建完成"
}

# 运行单元测试
run_unit_tests() {
    log_section "运行单元测试"

    local unit_test_file="$TESTS_DIR/unit-tests.mjs"
    if [[ ! -f "$unit_test_file" ]]; then
        log_error "单元测试文件不存在: $unit_test_file"
        return 1
    fi

    # 使用Node.js原生测试运行器
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        node --test "$unit_test_file"
    else
        node --test "$unit_test_file" 2>/dev/null
    fi

    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_success "单元测试通过"
    else
        log_error "单元测试失败"
    fi

    return $exit_code
}

# 运行综合功能测试
run_comprehensive_tests() {
    log_section "运行综合功能测试"

    local comprehensive_test_file="$TESTS_DIR/comprehensive-test.sh"
    if [[ ! -f "$comprehensive_test_file" ]]; then
        log_error "综合测试文件不存在: $comprehensive_test_file"
        return 1
    fi

    # 确保测试脚本可执行
    chmod +x "$comprehensive_test_file"

    # 运行综合测试
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        "$comprehensive_test_file"
    else
        "$comprehensive_test_file" 2>/dev/null
    fi

    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_success "综合功能测试通过"
    else
        log_error "综合功能测试失败"
    fi

    return $exit_code
}

# 运行性能测试
run_performance_tests() {
    log_section "运行性能测试"

    # 性能测试是综合测试的一部分，这里单独运行性能相关测试
    log_info "性能测试包含在综合测试中"
    log_info "如需单独性能测试，请使用: ./tests/comprehensive-test.sh"

    return 0
}

# 并行运行测试
run_tests_parallel() {
    log_section "并行运行测试"

    local pids=()
    local results=()

    # 启动单元测试
    run_unit_tests &
    pids[0]=$!

    # 启动综合测试
    run_comprehensive_tests &
    pids[1]=$!

    # 等待所有测试完成
    log_info "等待测试完成..."

    for i in "${!pids[@]}"; do
        wait "${pids[$i]}"
        results[$i]=$?
    done

    # 检查结果
    local overall_result=0
    local test_names=("单元测试" "综合测试")

    for i in "${!results[@]}"; do
        if [[ ${results[$i]} -eq 0 ]]; then
            log_success "${test_names[$i]} 完成"
        else
            log_error "${test_names[$i]} 失败"
            overall_result=1
        fi
    done

    return $overall_result
}

# 生成测试报告
generate_test_summary() {
    local start_time="$1"
    local end_time="$2"
    local exit_code="$3"

    local duration
    duration=$(echo "$end_time - $start_time" | bc)

    echo
    echo "=================================="
    echo "         测试运行总结             "
    echo "=================================="
    echo "运行时间: ${duration}秒"
    echo "测试时间: $(date)"

    if [[ $exit_code -eq 0 ]]; then
        echo -e "测试结果: ${GREEN}通过${NC} ✅"
    else
        echo -e "测试结果: ${RED}失败${NC} ❌"
    fi

    echo "=================================="
}

# 主函数
main() {
    local test_type="all"
    local run_parallel=false

    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                export VERBOSE=true
                shift
                ;;
            -q|--quiet)
                export QUIET=true
                shift
                ;;
            --no-build)
                export SKIP_BUILD=true
                shift
                ;;
            --parallel)
                run_parallel=true
                shift
                ;;
            unit|comprehensive|all|performance)
                test_type="$1"
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 显示开始信息
    echo -e "${CYAN}"
    echo "=============================================="
    echo "     Auto Node Switch 测试运行器 v0.1.1     "
    echo "=============================================="
    echo -e "${NC}"

    local start_time
    start_time=$(date +%s.%N)

    # 检查依赖和构建项目
    check_dependencies
    build_project

    local exit_code=0

    # 根据参数运行相应测试
    if [[ "$run_parallel" == "true" && "$test_type" == "all" ]]; then
        run_tests_parallel
        exit_code=$?
    else
        case "$test_type" in
            unit)
                run_unit_tests
                exit_code=$?
                ;;
            comprehensive)
                run_comprehensive_tests
                exit_code=$?
                ;;
            performance)
                run_performance_tests
                exit_code=$?
                ;;
            all)
                run_unit_tests
                local unit_result=$?

                run_comprehensive_tests
                local comprehensive_result=$?

                if [[ $unit_result -ne 0 || $comprehensive_result -ne 0 ]]; then
                    exit_code=1
                fi
                ;;
            *)
                log_error "未知测试类型: $test_type"
                exit 1
                ;;
        esac
    fi

    local end_time
    end_time=$(date +%s.%N)

    # 生成测试报告
    generate_test_summary "$start_time" "$end_time" "$exit_code"

    exit $exit_code
}

# 运行主函数
main "$@"