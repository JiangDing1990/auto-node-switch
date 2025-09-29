import React, {useState, useEffect} from 'react';
import {Box, Text, Newline, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import figures from 'figures';
import {configCache, type AppConfig} from './lib/config.js';
import {
	detectShell,
	detectAvailableManagers,
	getShellConfigFiles,
} from './lib/version-detector.js';
import {HookManager} from './lib/hook-manager.js';
import {Security, ValidationError, SecurityError} from './lib/security.js';

type AppMode =
	| 'loading'
	| 'main-menu'
	| 'initial-setup'
	| 'config-management'
	| 'add-project'
	| 'exit';

interface AppProps {
	mode?: string;
}

export default function App(_props: AppProps = {}) {
	const [appMode, setAppMode] = useState<AppMode>('loading');
	const [config, setConfig] = useState<AppConfig>({
		manager: '',
		shell: '',
		workdirs: [],
		lastUpdated: undefined,
	});
	const [shellInfo, setShellInfo] = useState<any>(null);
	const [availableManagers, setAvailableManagers] = useState<any[]>([]);
	const [error, setError] = useState<string>('');

	// 初始化
	useEffect(() => {
		const initialize = async () => {
			try {
				// 检测 shell 和可用的版本管理器
				const [shell, managers] = await Promise.all([
					detectShell(),
					detectAvailableManagers(),
				]);

				setShellInfo(shell);
				setAvailableManagers(managers);

				// 加载配置
				const loadedConfig = configCache.getConfig();
				setConfig(loadedConfig);

				// 根据配置状态决定初始界面
				if (loadedConfig.shell && loadedConfig.manager) {
					setAppMode('main-menu');
				} else {
					setAppMode('initial-setup');
				}
			} catch (error) {
				setError((error as Error).message);
				setAppMode('exit');
			}
		};

		initialize();
	}, []);

	const handleError = (error: Error) => {
		if (error instanceof SecurityError || error instanceof ValidationError) {
			let message = `❌ ${error.message}`;
			if (error.suggestions && error.suggestions.length > 0) {
				message += '\n\n💡 建议解决方案：';
				error.suggestions.forEach(suggestion => {
					message += `\n   • ${suggestion}`;
				});
			}

			setError(message);
		} else {
			setError(`❌ 发生错误: ${error.message}`);
		}
	};

	const saveConfig = (newConfig: AppConfig) => {
		try {
			configCache.saveConfig(newConfig);
			setConfig(newConfig);
		} catch (error) {
			handleError(error as Error);
		}
	};

	if (appMode === 'loading') {
		return (
			<Box flexDirection="column">
				<Box>
					<Spinner type="dots" />
					<Text>♻️ 初始化环境检测中...</Text>
				</Box>
			</Box>
		);
	}

	if (appMode === 'exit') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box flexDirection="column" marginBottom={1}>
						<Text color="red">{error}</Text>
					</Box>
				)}
				<Text color="green">👋感谢使用 Node.js 智能版本管理工具！</Text>
			</Box>
		);
	}

	if (appMode === 'initial-setup') {
		return (
			<InitialSetup
				config={config}
				shellInfo={shellInfo}
				availableManagers={availableManagers}
				onComplete={newConfig => {
					saveConfig(newConfig);
					setAppMode('main-menu');
				}}
			/>
		);
	}

	if (appMode === 'main-menu') {
		return (
			<MainMenu
				config={config}
				onConfigManagement={() => setAppMode('config-management')}
				onAddProject={() => setAppMode('add-project')}
				onInitialSetup={() => setAppMode('initial-setup')}
				onExit={() => setAppMode('exit')}
			/>
		);
	}

	if (appMode === 'config-management') {
		return (
			<ConfigManagement
				config={config}
				onConfigChange={saveConfig}
				onBack={() => setAppMode('main-menu')}
				onError={handleError}
			/>
		);
	}

	if (appMode === 'add-project') {
		return (
			<AddProject
				config={config}
				onConfigChange={saveConfig}
				onError={handleError}
				onBack={() => setAppMode('main-menu')}
			/>
		);
	}

	return null;
}

// 初始设置组件
function InitialSetup({
	config,
	shellInfo,
	availableManagers,
	onComplete,
}: {
	config: AppConfig;
	shellInfo: any;
	availableManagers: any[];
	onComplete: (config: AppConfig) => void;
}) {
	const [step, setStep] = useState(0);
	const [setupConfig, setSetupConfig] = useState<AppConfig>({...config});

	const steps = [
		{
			title: '☑️ 选择终端类型',
			description: '(⚙️ 帮助我们为您生成合适的配置文件)',
			items: (() => {
				const currentOS = process.platform;
				if (currentOS === 'win32') {
					return [
						{
							label: 'powershell - Windows PowerShell (推荐)',
							value: 'powershell',
						},
						{label: 'bash - Git Bash/WSL', value: 'bash'},
						{label: 'cmd - 命令提示符 (基础支持)', value: 'cmd'},
					];
				}

				return [
					{label: 'zsh - macOS 默认终端 (推荐)', value: 'zsh'},
					{label: 'bash - 传统终端类型', value: 'bash'},
					{label: 'fish - 现代化终端类型', value: 'fish'},
				];
			})(),
		},
		{
			title: '☑️ 选择版本管理工具',
			description: '(🔄 用来在不同项目间自动切换Node.js版本)',
			items: availableManagers.map(m => ({
				label: `${m.name} ${m.available ? '✅' : '❌ (未安装)'}`,
				value: m.name,
				disabled: !m.available,
			})),
		},
	];

	const handleSelect = (item: any) => {
		const newConfig = {...setupConfig};

		if (step === 0) {
			newConfig.shell = item.value;
		} else if (step === 1) {
			newConfig.manager = item.value;
		}

		setSetupConfig(newConfig);

		if (step < steps.length - 1) {
			setStep(step + 1);
		} else {
			onComplete(newConfig);
		}
	};

	const currentStep = steps[step]!;

	return (
		<Box flexDirection="column">
			{/* 标题 */}
			<Box marginBottom={1}>
				<Text bold color="cyan">
					🚀 Node.js 智能版本管理工具 - 初始配置
				</Text>
			</Box>

			{/* 介绍 */}
			<Box flexDirection="column" marginBottom={2}>
				<Text color="green">📖 功能介绍：</Text>
				<Text> • 🔄 为不同项目自动切换对应的 Node.js 版本</Text>
				<Text> • 🤖 进入项目目录时自动切换，离开时自动恢复</Text>
				<Text> • 🧠 支持 npm run dev 等命令的智能版本管理</Text>
				<Text> • ⌨️ 一键 Ctrl+C 停止服务并恢复版本</Text>
			</Box>

			{/* 环境检测 */}
			<Box flexDirection="column" marginBottom={2}>
				<Text color="cyan">🔍 环境检测</Text>
				<Text>💻 操作系统: {process.platform}</Text>
				<Text>📦 当前Shell: {shellInfo?.name || '未知'}</Text>
			</Box>

			{/* 当前步骤 */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold color="blue">
					📋 第{step + 1}步：{currentStep.title}
				</Text>
				<Text color="gray">{currentStep.description}</Text>
				{step === 0 && (
					<Text color="yellow">
						💡 不确定用的是哪个？大部分 macOS 用户选择第1个就对了
					</Text>
				)}
				{step === 1 && (
					<Text color="yellow">💡 如果不确定，推荐选择 nvm (如果已安装)</Text>
				)}
			</Box>

			{/* 选择列表 */}
			<SelectInput items={currentStep.items} onSelect={handleSelect} />
		</Box>
	);
}

// 主菜单组件
function MainMenu({
	config,
	onConfigManagement,
	onAddProject,
	onInitialSetup,
	onExit,
}: {
	config: AppConfig;
	onConfigManagement: () => void;
	onAddProject: () => void;
	onInitialSetup: () => void;
	onExit: () => void;
}) {
	const items = [
		{
			label: '📋 配置管理 - 查看、编辑、删除项目配置',
			value: 'config-management',
		},
		{
			label: '⚡️ 快速配置 - 添加新项目配置',
			value: 'add-project',
		},
		{
			label: '⚙️ 初始配置 - 重新设置基本配置',
			value: 'initial-setup',
		},
		{
			label: '👋 退出',
			value: 'exit',
		},
	];

	const handleSelect = (item: any) => {
		switch (item.value) {
			case 'config-management': {
				onConfigManagement();
				break;
			}

			case 'add-project': {
				onAddProject();
				break;
			}

			case 'initial-setup': {
				onInitialSetup();
				break;
			}

			case 'exit': {
				onExit();
				break;
			}
		}
	};

	return (
		<Box flexDirection="column">
			{/* 标题 */}
			<Box marginBottom={1}>
				<Text bold color="cyan">
					🛠️ Node.js 智能版本管理工具
				</Text>
			</Box>

			{/* 当前配置状态 */}
			<Box flexDirection="column" marginBottom={2}>
				<Text color="cyan">🛠️ 当前配置状态：</Text>
				<Text> 🖥️ 终端类型: {config.shell || '未设置'}</Text>
				<Text> 📦 版本管理器: {config.manager || '未设置'}</Text>
				<Text> 📂 项目配置数量: {config.workdirs?.length || 0}</Text>
			</Box>

			{/* 操作选项 */}
			<Box marginBottom={1}>
				<Text color="blue">🎛️ 选择操作模式：</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} />
		</Box>
	);
}

// 配置管理组件
function ConfigManagement({
	config,
	onConfigChange,
	onBack,
	onError,
}: {
	config: AppConfig;
	onConfigChange: (config: AppConfig) => void;
	onBack: () => void;
	onError: (error: Error) => void;
}) {
	const [mode, setMode] = useState<string>('menu');

	const items = [
		{label: '📁 查看项目配置列表', value: 'list'},
		{label: '➕ 添加项目配置', value: 'add'},
		{label: '🗑️ 删除项目配置', value: 'delete'},
		{label: '🔄 重新生成Hook', value: 'regenerate'},
		{label: '🧹 清理所有Hook', value: 'clean'},
		{label: '↩️ 返回主菜单', value: 'back'},
	];

	const handleSelect = (item: any) => {
		switch (item.value) {
			case 'list': {
				setMode('list');
				break;
			}

			case 'add': {
				setMode('add');
				break;
			}

			case 'delete': {
				setMode('delete');
				break;
			}

			case 'regenerate': {
				handleRegenerateHooks();
				break;
			}

			case 'clean': {
				handleCleanHooks();
				break;
			}

			case 'back': {
				onBack();
				break;
			}
		}
	};

	const handleRegenerateHooks = () => {
		setMode('regenerating');
	};

	const handleCleanHooks = () => {
		setMode('cleaning');
	};

	if (mode === 'list') {
		return <ProjectList config={config} onBack={() => setMode('menu')} />;
	}

	if (mode === 'add') {
		return (
			<AddProject
				config={config}
				onConfigChange={onConfigChange}
				onError={onError}
				onBack={() => setMode('menu')}
			/>
		);
	}

	if (mode === 'delete') {
		return (
			<DeleteProject
				config={config}
				onConfigChange={onConfigChange}
				onBack={() => setMode('menu')}
			/>
		);
	}

	if (mode === 'regenerating') {
		return (
			<HookOperationStatus
				type="regenerate"
				config={config}
				onComplete={() => setMode('menu')}
				onError={onError}
			/>
		);
	}

	if (mode === 'cleaning') {
		return (
			<HookOperationStatus
				type="clean"
				config={config}
				onComplete={() => setMode('menu')}
				onError={onError}
			/>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={2} marginTop={4}>
				<Text bold color="cyan">
					📋 配置管理中心
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={2}>
				<Text color="cyan">🛠️ 配置概览：</Text>
				<Text> 🖥️ 终端类型: {config.shell}</Text>
				<Text> 📦 版本管理器: {config.manager}</Text>
				<Text> 📂 项目数量: {config.workdirs?.length || 0}</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} />
		</Box>
	);
}

// 项目列表组件
function ProjectList({
	config,
	onBack,
}: {
	config: AppConfig;
	onBack: () => void;
}) {
	const [showList, setShowList] = useState(true);

	// 处理键盘输入
	useInput((_input, key) => {
		if (key.return || key.escape || key.ctrl) {
			onBack();
		}
	});

	// 3秒后自动返回
	useEffect(() => {
		const timer = setTimeout(() => {
			setShowList(false);
			onBack();
		}, 5000);

		return () => clearTimeout(timer);
	}, [onBack]);

	if (!showList) {
		return null;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1} marginTop={4}>
				<Text bold color="cyan">
					📁 项目配置列表
				</Text>
			</Box>

			{config.workdirs && config.workdirs.length > 0 ? (
				<Box flexDirection="column" marginBottom={2}>
					{config.workdirs.map((workdir, index) => (
						<Box key={index} marginBottom={1}>
							<Text>
								{figures.pointer} {workdir.dir}
							</Text>
							<Newline />
							<Text color="green"> → Node {workdir.version}</Text>
						</Box>
					))}
				</Box>
			) : (
				<Box marginBottom={2}>
					<Text color="gray">🗒️ 暂无项目配置～</Text>
				</Box>
			)}

			<Box>
				<Text color="yellow">⌨️ 按任意键返回... (5秒后自动返回)</Text>
			</Box>
		</Box>
	);
}

// 添加项目组件
function AddProject({
	config,
	onConfigChange,
	onError,
	onBack,
}: {
	config: AppConfig;
	onConfigChange: (config: AppConfig) => void;
	onError: (error: Error) => void;
	onBack?: () => void;
}) {
	const [step, setStep] = useState<'dir' | 'version' | 'complete'>('dir');
	const [projectDir, setProjectDir] = useState('');
	const [projectVersion, setProjectVersion] = useState('');
	const [processing, setProcessing] = useState(false);

	const handleDirSubmit = (dir: string) => {
		try {
			const validatedDir = Security.validatePath(dir);
			setProjectDir(validatedDir);
			setStep('version');
		} catch (error) {
			onError(error as Error);
		}
	};

	const handleVersionSubmit = (version: string) => {
		try {
			const validatedVersion = Security.validateVersion(version);
			setProjectVersion(validatedVersion);
			setProcessing(true);

			// 更新配置
			const newConfig = {...config};
			newConfig.workdirs = newConfig.workdirs || [];

			// 检查是否已存在
			const existingIndex = newConfig.workdirs.findIndex(
				w => w.dir === projectDir,
			);
			if (existingIndex >= 0) {
				newConfig.workdirs[existingIndex]!.version = validatedVersion;
			} else {
				newConfig.workdirs.push({dir: projectDir, version: validatedVersion});
			}

			onConfigChange(newConfig);
			setStep('complete');
		} catch (error) {
			onError(error as Error);
			setProcessing(false);
		}
	};

	// 处理键盘输入 - 必须在条件语句外面
	useInput((_input, key) => {
		if ((processing || step === 'complete') && (key.return || key.escape)) {
			onBack?.();
		}
	});

	// 3秒后自动返回 - 必须在条件语句外面
	useEffect(() => {
		if (step === 'complete') {
			const timer = setTimeout(() => {
				onBack?.();
			}, 3000);
			return () => clearTimeout(timer);
		}

		return () => {}; // 默认返回空的清理函数
	}, [step, onBack]);

	if (processing || step === 'complete') {
		return (
			<Box flexDirection="column">
				<Text color="green">✅ 项目配置添加成功！</Text>
				<Text>📂 路径: {projectDir}</Text>
				<Text>🏷 版本: Node {projectVersion}</Text>
				<Box marginTop={1}>
					<Text color="yellow">⌨️ 按任意键返回... (3秒后自动返回)</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'dir') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1} marginTop={4}>
					<Text bold color="cyan">
						📁 添加项目配置
					</Text>
				</Box>

				<Box flexDirection="column" marginBottom={2}>
					<Text color="blue">📂 请输入项目目录路径：</Text>
					<Text color="gray">💡 可以使用绝对路径或相对路径</Text>
					<Text color="gray">
						示例：/Users/username/my-project 或 ~/projects/my-app
					</Text>
				</Box>

				<Box>
					<Text color="green">{figures.pointer} </Text>
					<TextInput
						value={projectDir}
						placeholder="输入项目路径..."
						onChange={setProjectDir}
						onSubmit={handleDirSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (step === 'version') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1} marginTop={4}>
					<Text bold color="cyan">
						🏷️ 设置 Node.js 版本
					</Text>
				</Box>

				<Box flexDirection="column" marginBottom={2}>
					<Text>📂 项目路径: {projectDir}</Text>
					<Text color="blue">🏷 请输入该项目需要的Node.js版本：</Text>
					<Text color="gray">
						💡 支持格式：18.17.1 或 v18.17.1 或 18 或 lts/*
					</Text>
				</Box>

				<Box>
					<Text color="green">{figures.pointer} </Text>
					<TextInput
						value={projectVersion}
						placeholder="输入 Node.js 版本..."
						onChange={setProjectVersion}
						onSubmit={handleVersionSubmit}
					/>
				</Box>
			</Box>
		);
	}

	return null;
}

// 删除项目组件
function DeleteProject({
	config,
	onConfigChange,
	onBack,
}: {
	config: AppConfig;
	onConfigChange: (config: AppConfig) => void;
	onBack: () => void;
}) {
	const hasNoConfig = !config.workdirs || config.workdirs.length === 0;

	// 处理键盘输入 - 必须在条件语句外面
	useInput((_input, key) => {
		if (hasNoConfig && (key.return || key.escape)) {
			onBack();
		}
	});

	// 3秒后自动返回 - 必须在条件语句外面
	useEffect(() => {
		if (hasNoConfig) {
			const timer = setTimeout(() => {
				onBack();
			}, 3000);
			return () => clearTimeout(timer);
		}
		return () => {};
	}, [hasNoConfig, onBack]);

	if (hasNoConfig) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">⚠️ 暂无项目配置可以删除</Text>
				<Box marginTop={1}>
					<Text color="gray">⌨️ 按任意键返回... (3秒后自动返回)</Text>
				</Box>
			</Box>
		);
	}

	const items: Array<{label: string; value: number | string}> = [
		...config.workdirs.map((workdir, index) => ({
			label: `${workdir.dir} → Node ${workdir.version}`,
			value: index,
		})),
		{label: '↩️ 返回', value: 'back'},
	];

	const handleSelect = (item: any) => {
		if (item.value === 'back') {
			onBack();
			return;
		}

		const newConfig = {...config};
		newConfig.workdirs = newConfig.workdirs.filter((_, i) => i !== item.value);
		onConfigChange(newConfig);
		onBack();
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1} marginTop={4}>
				<Text bold color="cyan">
					🗑️ 删除项目配置
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color="red">⚠️ 请选择要删除的项目配置：</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} />
		</Box>
	);
}

// Hook 操作状态组件
function HookOperationStatus({
	type,
	config,
	onComplete,
	onError,
}: {
	type: 'regenerate' | 'clean';
	config: AppConfig;
	onComplete: () => void;
	onError: (error: Error) => void;
}) {
	const [isProcessing, setIsProcessing] = useState(true);
	const [result, setResult] = useState<{success: boolean; message?: string}>({
		success: false,
	});

	useEffect(() => {
		const processHook = async () => {
			try {
				if (!config.shell) {
					throw new Error('🚫 终端类型未设置');
				}

				const shellRcFiles = getShellConfigFiles(config.shell);
				let processedCount = 0;

				if (type === 'regenerate') {
					if (!config.manager) {
						throw new Error('⚙️🚫 版本管理器未设置');
					}

					if (!config.workdirs || config.workdirs.length === 0) {
						throw new Error('🗒️ 暂无项目配置，无需生成Hook');
					}

					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.addHook(rcFile, config.manager, config.workdirs);
							processedCount++;
						} catch (error) {
							console.warn(
								`❌ 生成 ${rcFile} Hook失败: ${(error as Error).message}`,
							);
						}
					});

					setResult({
						success: true,
						message: `🔄✅ 已重新生成 ${processedCount} 个Hook配置`,
					});
				} else if (type === 'clean') {
					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.removeHook(rcFile);
							processedCount++;
						} catch (error) {
							console.warn(`🧹❌ 清理 ${rcFile} 失败: ${(error as Error).message}`);
						}
					});

					setResult({
						success: true,
						message: `🧹✅ 已清理 ${processedCount} 个Hook配置`,
					});
				}
			} catch (error) {
				setResult({success: false, message: (error as Error).message});
				onError(error as Error);
			} finally {
				setIsProcessing(false);
			}
		};

		processHook();
	}, [type, config, onError]);

	// 处理键盘输入
	useInput((_input, key) => {
		if (!isProcessing && (key.return || key.escape)) {
			onComplete();
		}
	});

	// 3秒后自动返回
	useEffect(() => {
		if (!isProcessing && result.success) {
			const timer = setTimeout(() => {
				onComplete();
			}, 3000);
			return () => clearTimeout(timer);
		}

		return () => {};
	}, [isProcessing, result.success, onComplete]);

	if (isProcessing) {
		return (
			<Box flexDirection="column">
				<Box>
					<Spinner type="dots" />
					<Text>
						{type === 'regenerate' ? '⏳ 正在重新生成Hook...' : '⏳ 正在清理Hook...'}
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color={result.success ? 'green' : 'red'}>
				{result.success ? '✅' : '❌'} {result.message}
			</Text>
			{result.success && (
				<Box marginTop={1}>
					<Text color="yellow">⌨️ 按任意键返回... (3秒后自动返回)</Text>
				</Box>
			)}
		</Box>
	);
}
