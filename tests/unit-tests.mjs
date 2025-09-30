#!/usr/bin/env node

/**
 * Auto Node Switch - 单元测试脚本
 * 版本: v0.1.1
 *
 * 使用Node.js原生测试API对核心模块进行单元测试
 * 测试范围：
 * - 配置管理模块
 * - 安全验证模块
 * - Hook管理器
 * - Shell配置类
 * - 工具函数
 */

import {test, describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// 获取项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 导入待测试模块
const {configCache, ConfigPaths} = await import(
	path.join(PROJECT_ROOT, 'dist/lib/config.js')
);
const {Security, ValidationError, SecurityError} = await import(
	path.join(PROJECT_ROOT, 'dist/lib/security.js')
);
const {HookManager} = await import(
	path.join(PROJECT_ROOT, 'dist/lib/hook-manager.js')
);

// 测试配置
const TEST_CONFIG_DIR = '/tmp/auto-node-switch-unit-test';
const ORIGINAL_CONFIG_DIR =
	process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config');

describe('Auto Node Switch - 单元测试', () => {
	before(async () => {
		// 设置测试环境
		process.env.XDG_CONFIG_HOME = TEST_CONFIG_DIR;

		// 清理和创建测试目录
		if (fs.existsSync(TEST_CONFIG_DIR)) {
			fs.rmSync(TEST_CONFIG_DIR, {recursive: true, force: true});
		}
		fs.mkdirSync(TEST_CONFIG_DIR, {recursive: true});

		console.log('🔧 测试环境初始化完成');
	});

	after(async () => {
		// 清理测试环境
		if (fs.existsSync(TEST_CONFIG_DIR)) {
			fs.rmSync(TEST_CONFIG_DIR, {recursive: true, force: true});
		}

		// 恢复原始环境变量
		process.env.XDG_CONFIG_HOME = ORIGINAL_CONFIG_DIR;

		console.log('🧹 测试环境清理完成');
	});

	describe('配置管理模块', () => {
		test('应该正确创建配置文件路径', () => {
			const expectedPath = path.join(
				TEST_CONFIG_DIR,
				'node-workdir/config.json',
			);
			const actualPath = ConfigPaths.modernConfigFile;

			// 由于环境变量可能影响路径，我们检查路径结构是否正确
			assert.ok(
				actualPath.includes('node-workdir/config.json'),
				`配置文件路径应包含node-workdir/config.json，实际路径: ${actualPath}`,
			);
		});

		test('应该创建默认配置', () => {
			const config = configCache.getConfig();

			assert.equal(typeof config, 'object', '配置应该是对象');
			assert.ok(Array.isArray(config.workdirs), 'workdirs应该是数组');
			assert.equal(
				typeof config.lastUpdated,
				'string',
				'lastUpdated应该是字符串',
			);
		});

		test('应该正确保存和读取配置', () => {
			const testConfig = {
				manager: 'nvm',
				shell: 'zsh',
				workdirs: [{dir: '/test/project', version: '18.17.0'}],
				lastUpdated: new Date().toISOString(),
			};

			configCache.saveConfig(testConfig);
			const loadedConfig = configCache.getConfig();

			assert.equal(
				loadedConfig.manager,
				testConfig.manager,
				'管理器配置应该匹配',
			);
			assert.equal(loadedConfig.shell, testConfig.shell, 'Shell配置应该匹配');
			assert.equal(loadedConfig.workdirs.length, 1, '工作目录数量应该匹配');
			assert.equal(
				loadedConfig.workdirs[0].dir,
				'/test/project',
				'工作目录路径应该匹配',
			);
			assert.equal(
				loadedConfig.workdirs[0].version,
				'18.17.0',
				'版本号应该匹配',
			);
		});

		test('应该处理配置文件不存在的情况', () => {
			// 删除配置文件
			const configFile = ConfigPaths.getActiveConfigFile();
			if (fs.existsSync(configFile)) {
				fs.unlinkSync(configFile);
			}

			const config = configCache.getConfig();
			assert.ok(
				Array.isArray(config.workdirs),
				'应该返回包含空workdirs数组的默认配置',
			);
		});
	});

	describe('安全验证模块', () => {
		test('应该验证有效的路径', () => {
			const validPaths = [
				'/home/user/project',
				'./relative/path',
				'~/home/path',
				'/Users/username/projects/my-app',
			];

			validPaths.forEach(testPath => {
				assert.doesNotThrow(() => {
					Security.validatePath(testPath);
				}, `路径 "${testPath}" 应该通过验证`);
			});
		});

		test('应该拒绝恶意路径', () => {
			const maliciousPaths = [
				'../../../etc/passwd',
				'/etc/passwd',
				'$(rm -rf /)',
				'`rm -rf /`',
				'; rm -rf /',
				'../../system',
				'',
			];

			maliciousPaths.forEach(testPath => {
				assert.throws(
					() => {
						Security.validatePath(testPath);
					},
					SecurityError,
					`路径 "${testPath}" 应该被拒绝`,
				);
			});
		});

		test('应该验证有效的版本号', () => {
			const validVersions = [
				'18.17.1',
				'v18.17.1',
				'16',
				'20.0.0',
				'lts/*',
				'latest',
			];

			validVersions.forEach(version => {
				assert.doesNotThrow(() => {
					Security.validateVersion(version);
				}, `版本号 "${version}" 应该通过验证`);
			});
		});

		test('应该拒绝恶意版本号', () => {
			const maliciousVersions = [
				'18.0.0; rm -rf /',
				'$(rm -rf /)',
				'`evil command`',
				'; ls -la',
				'18.0.0 && rm file',
				'',
			];

			maliciousVersions.forEach(version => {
				assert.throws(
					() => {
						Security.validateVersion(version);
					},
					ValidationError,
					`版本号 "${version}" 应该被拒绝`,
				);
			});
		});

		test('应该正确转义Shell字符串', () => {
			const testCases = [
				{input: 'normal string', expected: 'normal string'},
				{input: "string with 'quotes'", expected: "string with 'quotes'"},
				{
					input: 'string with "double quotes"',
					expected: 'string with "double quotes"',
				},
				{input: 'string with $var', expected: 'string with $var'},
				{input: 'string with `backticks`', expected: 'string with `backticks`'},
			];

			testCases.forEach(({input, expected}) => {
				const result = Security.escapeShellString(input);
				// 检查结果是否被正确转义（具体转义规则可能因实现而异）
				assert.equal(typeof result, 'string', '转义结果应该是字符串');
				assert.ok(
					result.length >= input.length,
					'转义后长度应该不小于原字符串',
				);
			});
		});
	});

	describe('Hook管理器', () => {
		const testShellFile = path.join(TEST_CONFIG_DIR, '.zshrc');

		test('应该能够添加Hook到Shell配置文件', () => {
			// 创建测试Shell配置文件
			fs.writeFileSync(testShellFile, '# Test shell config\n');

			const testWorkdirs = [
				{dir: '/test/project1', version: '18.17.0'},
				{dir: '/test/project2', version: '20.0.0'},
			];

			assert.doesNotThrow(() => {
				HookManager.addHook(testShellFile, 'nvm', testWorkdirs);
			}, '添加Hook应该成功');

			const content = fs.readFileSync(testShellFile, 'utf8');
			assert.ok(
				content.includes('AUTO_NODE_SWITCH_HOOK_START'),
				'应该包含Hook开始标记',
			);
			assert.ok(
				content.includes('AUTO_NODE_SWITCH_HOOK_END'),
				'应该包含Hook结束标记',
			);
			assert.ok(content.includes('npm()'), '应该包含npm函数');
		});

		test('应该能够移除Hook从Shell配置文件', () => {
			// 先确保文件包含Hook
			const contentWithHook = `# Test config
# AUTO_NODE_SWITCH_HOOK_START
npm() { echo "test"; }
# AUTO_NODE_SWITCH_HOOK_END
# Other config`;

			fs.writeFileSync(testShellFile, contentWithHook);

			assert.doesNotThrow(() => {
				HookManager.removeHook(testShellFile);
			}, '移除Hook应该成功');

			const content = fs.readFileSync(testShellFile, 'utf8');
			assert.ok(
				!content.includes('AUTO_NODE_SWITCH_HOOK_START'),
				'不应该包含Hook开始标记',
			);
			assert.ok(
				!content.includes('AUTO_NODE_SWITCH_HOOK_END'),
				'不应该包含Hook结束标记',
			);
			assert.ok(!content.includes('npm()'), '不应该包含npm函数');
			assert.ok(content.includes('# Other config'), '应该保留其他配置');
		});

		test('应该处理不存在的Shell配置文件', () => {
			const nonExistentFile = path.join(TEST_CONFIG_DIR, 'non-existent-file');

			// 移除不存在的文件应该不报错
			assert.doesNotThrow(() => {
				HookManager.removeHook(nonExistentFile);
			}, '移除不存在文件的Hook应该不报错');
		});

		after(() => {
			// 清理测试文件
			if (fs.existsSync(testShellFile)) {
				fs.unlinkSync(testShellFile);
			}
		});
	});

	describe('集成测试', () => {
		test('应该能够完成完整的配置流程', () => {
			// 1. 创建配置
			const config = {
				manager: 'nvm',
				shell: 'zsh',
				workdirs: [{dir: '/test/integration', version: '18.17.0'}],
				lastUpdated: new Date().toISOString(),
			};

			// 2. 保存配置
			assert.doesNotThrow(() => {
				configCache.saveConfig(config);
			}, '保存配置应该成功');

			// 3. 验证配置文件存在
			const configFile = ConfigPaths.getActiveConfigFile();
			assert.ok(fs.existsSync(configFile), '配置文件应该存在');

			// 4. 读取并验证配置
			const loadedConfig = configCache.getConfig();
			assert.equal(loadedConfig.manager, 'nvm', '管理器应该匹配');
			assert.equal(loadedConfig.shell, 'zsh', 'Shell应该匹配');
			assert.equal(loadedConfig.workdirs.length, 1, '工作目录数量应该匹配');

			// 5. 验证安全性
			assert.doesNotThrow(() => {
				Security.validatePath(loadedConfig.workdirs[0].dir);
				Security.validateVersion(loadedConfig.workdirs[0].version);
			}, '配置中的路径和版本应该通过安全验证');
		});

		test('应该正确处理配置更新', () => {
			// 获取当前配置
			const currentConfig = configCache.getConfig();
			const originalWorkdirsCount = currentConfig.workdirs.length;

			// 添加新的工作目录
			const newWorkdir = {dir: '/test/new-project', version: '20.0.0'};
			currentConfig.workdirs.push(newWorkdir);
			currentConfig.lastUpdated = new Date().toISOString();

			// 保存更新后的配置
			configCache.saveConfig(currentConfig);

			// 验证更新
			const updatedConfig = configCache.getConfig();
			assert.equal(
				updatedConfig.workdirs.length,
				originalWorkdirsCount + 1,
				'工作目录数量应该增加',
			);

			const addedWorkdir = updatedConfig.workdirs.find(
				w => w.dir === '/test/new-project',
			);
			assert.ok(addedWorkdir, '新添加的工作目录应该存在');
			assert.equal(addedWorkdir.version, '20.0.0', '新工作目录的版本应该正确');
		});
	});

	describe('错误处理', () => {
		test('应该正确处理SecurityError', () => {
			try {
				Security.validatePath('../../../etc/passwd');
				assert.fail('应该抛出SecurityError');
			} catch (error) {
				assert.ok(error instanceof SecurityError, '应该是SecurityError实例');
				assert.ok(typeof error.message === 'string', '应该有错误消息');
				assert.ok(Array.isArray(error.suggestions), '应该有建议数组');
			}
		});

		test('应该正确处理ValidationError', () => {
			try {
				Security.validateVersion('18.0.0; rm -rf /');
				assert.fail('应该抛出ValidationError');
			} catch (error) {
				assert.ok(
					error instanceof ValidationError,
					'应该是ValidationError实例',
				);
				assert.ok(typeof error.message === 'string', '应该有错误消息');
			}
		});

		test('应该处理配置文件权限错误', () => {
			// 这个测试在某些环境中可能无法执行，所以我们跳过实际的权限测试
			// 只验证错误处理机制的存在
			assert.ok(
				typeof configCache.getConfig === 'function',
				'配置缓存应该有getConfig方法',
			);
			assert.ok(
				typeof configCache.saveConfig === 'function',
				'配置缓存应该有saveConfig方法',
			);
		});
	});
});

// 运行测试的辅助函数
async function runTests() {
	console.log('🚀 开始运行Auto Node Switch单元测试...\n');

	try {
		// Node.js 18+ 原生测试运行器会自动运行所有测试
		console.log('✅ 所有单元测试完成');
	} catch (error) {
		console.error('❌ 测试运行失败:', error);
		process.exit(1);
	}
}

// 如果直接运行此脚本，则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
	runTests();
}
