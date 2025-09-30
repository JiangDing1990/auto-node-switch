import process from 'node:process';
import path from 'node:path';
import {execSync} from 'node:child_process';
import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
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
import {getColoredBanner} from './lib/ascii-art.js';

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

	const saveConfig = useCallback((newConfig: AppConfig) => {
		try {
			configCache.saveConfig(newConfig);
			setConfig(newConfig);
		} catch (error) {
			handleError(error as Error);
		}
	}, []);

	// 缓存回调函数以避免组件不必要的重新渲染
	const handleConfigManagement = useCallback(
		() => setAppMode('config-management'),
		[],
	);
	const handleAddProject = useCallback(() => setAppMode('add-project'), []);
	const handleInitialSetup = useCallback(() => setAppMode('initial-setup'), []);
	const handleExit = useCallback(() => setAppMode('exit'), []);
	const handleBackToMainMenu = useCallback(() => setAppMode('main-menu'), []);

	if (appMode === 'loading') {
		return (
			<Box flexDirection="column">
				<Text color="cyan">{getColoredBanner('mini')}</Text>
				<Box marginTop={1}>
					<Spinner type="dots" />
					<Text color="yellow"> 🔍 正在检测运行环境...</Text>
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
				{/* 使用适合终端的紧凑横幅 */}
				<Text color="cyan">{getColoredBanner('mini')}</Text>
				<Box marginTop={1}>
					<Text color="green">🙏 感谢使用 auto-node-switch，下次再见! 👋</Text>
				</Box>
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
				onBack={handleBackToMainMenu}
			/>
		);
	}

	if (appMode === 'main-menu') {
		return (
			<MainMenu
				config={config}
				onConfigManagement={handleConfigManagement}
				onAddProject={handleAddProject}
				onInitialSetup={handleInitialSetup}
				onExit={handleExit}
			/>
		);
	}

	if (appMode === 'config-management') {
		return (
			<ConfigManagement
				config={config}
				onConfigChange={saveConfig}
				onBack={handleBackToMainMenu}
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
				onBack={handleBackToMainMenu}
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
	onBack,
}: {
	config: AppConfig;
	shellInfo: any;
	availableManagers: any[];
	onComplete: (config: AppConfig) => void;
	onBack?: () => void;
}) {
	const [step, setStep] = useState(0);
	const [setupConfig, setSetupConfig] = useState<AppConfig>({...config});

	const steps = [
		{
			title: '☑️ 选择终端类型',
			description: '(⚙️ 帮助我们为您生成合适的配置文件)',
			items: (() => {
				const currentOS = process.platform;
				const baseItems =
					currentOS === 'win32'
						? [
								{
									label: 'powershell - Windows PowerShell (推荐)',
									value: 'powershell',
								},
								{label: 'bash - Git Bash/WSL', value: 'bash'},
								{label: 'cmd - 命令提示符 (基础支持)', value: 'cmd'},
						  ]
						: [
								{label: 'zsh - macOS 默认终端 (推荐)', value: 'zsh'},
								{label: 'bash - 传统终端类型', value: 'bash'},
								{label: 'fish - 现代化终端类型', value: 'fish'},
						  ];

				return [...baseItems, {label: '↩️ 返回主菜单', value: 'back'}];
			})(),
		},
		{
			title: '☑️ 选择版本管理工具',
			description: '(🔄 用来在不同项目间自动切换Node.js版本)',
			items: [
				...availableManagers.map(m => ({
					label: `${m.name} ${m.available ? '✅' : '❌ (未安装)'}`,
					value: m.name,
					disabled: !m.available,
				})),
				{label: '↩️ 返回主菜单', value: 'back'},
			],
		},
	];

	const handleSelect = (item: any) => {
		// 处理返回主菜单
		if (item.value === 'back') {
			onBack?.();
			return;
		}

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
	const terminalHeight = process.stdout.rows || 24;
	const shouldShowDetails = terminalHeight >= 25;

	return (
		<Box flexDirection="column">
			{/* ASCII 艺术字横幅 */}
			<Text color="cyan">{getColoredBanner('mini')}</Text>
			<Box marginBottom={1} marginTop={1}>
				<Text bold color="yellow">
					🚀 初始配置向导 (第{step + 1}步)
				</Text>
			</Box>

			{/* 仅在高度足够时显示详细介绍 */}
			{shouldShowDetails && (
				<>
					{/* 介绍 */}
					<Box flexDirection="column" marginBottom={1}>
						<Text color="green">📖 功能介绍：</Text>
						<Text>
							{' '}
							• 🔄 自动切换Node.js版本 • 🤖 智能目录监听 • 🧠 npm命令支持
						</Text>
					</Box>

					{/* 环境检测 */}
					<Box flexDirection="column" marginBottom={1}>
						<Text color="cyan">
							🔍 环境检测: 💻 {process.platform} | 📦{' '}
							{shellInfo?.name || '未知'}
						</Text>
					</Box>
				</>
			)}

			{/* 当前步骤 - 始终显示 */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold color="blue">
					{currentStep.title}
				</Text>
				<Text color="gray">{currentStep.description}</Text>
				{step === 0 && shouldShowDetails && (
					<Text color="yellow">
						💡 不确定用的是哪个？大部分 macOS 用户选择第1个就对了
					</Text>
				)}
				{step === 1 && shouldShowDetails && (
					<Text color="yellow">💡 如果不确定，推荐选择 nvm (如果已安装)</Text>
				)}
			</Box>

			{/* 选择列表 - 使用固定空间 */}
			<Box minHeight={shouldShowDetails ? 6 : 4}>
				<SelectInput items={currentStep.items} onSelect={handleSelect} />
			</Box>

			{/* 操作提示 */}
			<Box marginTop={1}>
				<Text color="gray">💡 使用 ↑↓ 键选择，回车确认</Text>
			</Box>
		</Box>
	);
}

// 主菜单组件
const MainMenu = React.memo(function MainMenu({
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
	// 缓存菜单项，避免每次重新创建
	const items = useMemo(
		() => [
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
				label: '👋 退出应用',
				value: 'exit',
			},
		],
		[],
	);

	// 使用 useCallback 避免函数重新创建
	const handleSelect = useCallback(
		(item: any) => {
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

				default: {
					break;
				}
			}
		},
		[onConfigManagement, onAddProject, onInitialSetup, onExit],
	);

	// 缓存横幅内容
	const banner = useMemo(() => getColoredBanner('stylish'), []);

	// 检测终端高度，决定是否显示详细信息
	const terminalHeight = process.stdout.rows || 24;
	const shouldShowDetails = terminalHeight >= 25; // 需要至少25行来显示完整内容

	return (
		<Box flexDirection="column">
			{/* ASCII 艺术字横幅 - 使用更紧凑的版本 */}
			<Text color="cyan">
				{shouldShowDetails ? banner : getColoredBanner('mini')}
			</Text>

			{/* 仅在高度足够时显示详细信息 */}
			{shouldShowDetails && (
				<>
					{/* 项目信息 */}
					{config.workdirs && config.workdirs.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text color="blue">📂 项目信息</Text>
							{config.workdirs.slice(0, 2).map(workdir => (
								<Text key={`${workdir.dir}::${workdir.version}`} color="gray">
									• {workdir.dir.split('/').pop()} → Node {workdir.version}
								</Text>
							))}
							{config.workdirs.length > 2 && (
								<Text color="gray">
									... 还有 {config.workdirs.length - 2} 个项目
								</Text>
							)}
						</Box>
					)}

					{/* 当前配置 */}
					<Box flexDirection="column" marginBottom={1}>
						<Text color="cyan">🛠️ 当前配置</Text>
						<Text>
							{' '}
							🖥️ 终端: {config.shell || '未设置'} | 📦 管理器:{' '}
							{config.manager || '未设置'} | 📂 项目:{' '}
							{config.workdirs?.length || 0}
						</Text>
					</Box>
				</>
			)}

			{/* 在高度不足时显示简化状态 */}
			{!shouldShowDetails && (
				<Box marginBottom={1}>
					<Text color="cyan">
						🛠️ {config.shell || '未设置'} | 📦 {config.manager || '未设置'} | 📂{' '}
						{config.workdirs?.length || 0} 个项目
					</Text>
				</Box>
			)}

			{/* 操作菜单标题 */}
			<Box marginBottom={1}>
				<Text color="blue">🎛️ 操作菜单</Text>
			</Box>

			{/* 菜单选择 - 使用固定空间 */}
			<Box minHeight={4}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>

			{/* 操作提示 */}
			<Box marginTop={1}>
				<Text color="gray">💡 使用 ↑↓ 键选择，回车确认</Text>
			</Box>
		</Box>
	);
});

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

			default: {
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

	// 检测终端高度，决定显示方式
	const terminalHeight = process.stdout.rows || 24;
	const shouldShowDetails = terminalHeight >= 20;

	return (
		<Box flexDirection="column">
			{/* ASCII 艺术字横幅 */}
			<Text color="cyan">{getColoredBanner('mini')}</Text>

			<Box marginBottom={1} marginTop={1}>
				<Text bold color="cyan">
					📋 配置管理中心
				</Text>
			</Box>

			{/* 配置概览 - 根据终端高度调整显示方式 */}
			{shouldShowDetails ? (
				<Box flexDirection="column" marginBottom={2}>
					<Text color="cyan">🛠️ 配置概览：</Text>
					<Text> 🖥️ 终端类型: {config.shell}</Text>
					<Text> 📦 版本管理器: {config.manager}</Text>
					<Text> 📂 项目数量: {config.workdirs?.length || 0}</Text>
				</Box>
			) : (
				<Box marginBottom={1}>
					<Text color="cyan">
						🛠️ {config.shell} | 📦 {config.manager} | 📂{' '}
						{config.workdirs?.length || 0} 个项目
					</Text>
				</Box>
			)}

			{/* 使用固定空间避免闪烁 */}
			<Box minHeight={shouldShowDetails ? 6 : 4}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>

			{/* 操作提示 */}
			<Box marginTop={1}>
				<Text color="gray">💡 使用 ↑↓ 键选择，回车确认</Text>
			</Box>
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
	}, []);

	if (!showList) {
		return null;
	}

	return (
		<Box flexDirection="column">
			{/* ASCII 艺术字横幅 */}
			<Text color="cyan">{getColoredBanner('mini')}</Text>

			<Box marginBottom={1} marginTop={1}>
				<Text bold color="cyan">
					📁 项目配置列表
				</Text>
			</Box>

			{config.workdirs && config.workdirs.length > 0 ? (
				<Box flexDirection="column" marginBottom={1}>
					{config.workdirs.map((workdir, _index) => {
						const itemKey = `${workdir.dir}::${workdir.version}`;
						return (
							<Box key={`${itemKey}`} marginBottom={1}>
								<Text>
									{figures.pointer} 📂 {workdir.dir}
								</Text>
								<Text color="green"> 🏷 Node.js {workdir.version} </Text>
								<Text color="gray">
									{' '}
									📝 版本文件:{' '}
									{(() => {
										if (config.manager === 'n') return '.node-version';
										if (
											config.manager === 'nvm-windows' ||
											config.manager === 'nvs' ||
											config.manager === 'fnm'
										)
											return '.nvmrc';
										return '.nvmrc'; // 默认
									})()}
								</Text>
							</Box>
						);
					})}
					<Box marginTop={1}>
						<Text color="cyan">
							💡 共配置了 {config.workdirs.length} 个项目
						</Text>
					</Box>
				</Box>
			) : (
				<Box marginBottom={2}>
					<Text color="gray">🗒️ 暂无项目配置</Text>
					<Text color="gray">💡 请选择 快速配置 来添加第一个项目</Text>
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

	const handleVersionSubmit = async (version: string) => {
		try {
			const validatedVersion = Security.validateVersion(version);
			setProjectVersion(validatedVersion);
			setProcessing(true);

			// 更新配置
			const newConfig = {...config};
			newConfig.workdirs = newConfig.workdirs || [];

			// 检查是否已存在
			const existingIndex = newConfig.workdirs.findIndex(
				w => path.resolve(w.dir) === projectDir,
			);

			if (existingIndex >= 0) {
				const existingConfig = newConfig.workdirs[existingIndex]!;
				const projectName = path.basename(projectDir);

				if (existingConfig.version === validatedVersion) {
					// 相同路径和版本，显示提示信息
					console.log(`ℹ️ 项目 ${projectName} 已配置相同版本 Node ${validatedVersion}`);
					console.log(`📂 路径: ${projectDir}`);
					console.log(`💡 提示: 配置未发生变化，跳过重复添加`);
				} else {
					// 相同路径，不同版本，显示覆盖信息
					console.log(`🔄 检测到重复配置:`);
					console.log(`📂 项目: ${projectName}`);
					console.log(`📍 路径: ${projectDir}`);
					console.log(`🏷️ 原版本: Node ${existingConfig.version}`);
					console.log(`🏷️ 新版本: Node ${validatedVersion}`);
					console.log(`✅ 已覆盖原配置，更新版本为 Node ${validatedVersion}`);

					newConfig.workdirs[existingIndex]!.version = validatedVersion;
				}
			} else {
				// 新项目配置
				newConfig.workdirs.push({dir: projectDir, version: validatedVersion});
				console.log(`✅ 已添加项目 ${path.basename(projectDir)} → Node ${validatedVersion}`);
			}

			onConfigChange(newConfig);

			// 自动重新生成Hook
			if (
				newConfig.shell &&
				newConfig.manager &&
				newConfig.workdirs.length > 0
			) {
				try {
					const shellRcFiles = getShellConfigFiles(newConfig.shell);
					let generatedCount = 0;

					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.addHook(
								rcFile,
								newConfig.manager,
								newConfig.workdirs,
							);
							generatedCount++;
						} catch (error) {
							console.warn(
								`⚠️ 生成 ${rcFile} Hook失败: ${(error as Error).message}`,
							);
						}
					});

					if (generatedCount > 0) {
						console.log(`✅ 已自动重新生成 ${generatedCount} 个Hook配置`);
						console.log('🎉 配置完成！现在可以进入项目目录自动切换Node版本了');
					}
				} catch {
					console.warn('⚠️ 自动重新生成Hook失败，请手动执行重新生成操作');
				}
			}

			setStep('complete');
		} catch (error) {
			onError(error as Error);
			setProcessing(false);
		}
	};

	// 处理键盘输入 - 必须在条件语句外面
	useInput((_input, key) => {
		if (key.escape) {
			onBack?.();
		} else if ((processing || step === 'complete') && key.return) {
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

		// eslint-disable-next-line @typescript-eslint/no-empty-function
		return () => {}; // 默认返回空的清理函数
	}, [step]);

	if (processing || step === 'complete') {
		return (
			<Box flexDirection="column">
				<Text color="green">✅ 项目配置添加成功！</Text>
				<Text>📂 项目路径: {projectDir}</Text>
				<Text>🏷 Node.js 版本: {projectVersion}</Text>
				<Text>
					📝 版本文件:{' '}
					{(() => {
						if (config.manager === 'n') return '.node-version';
						if (
							config.manager === 'nvm-windows' ||
							config.manager === 'nvs' ||
							config.manager === 'fnm'
						)
							return '.nvmrc';
						return '.nvmrc'; // 默认
					})()}
				</Text>
				<Box marginTop={1}>
					<Text color="cyan">
						💡 进入该目录时将自动切换到 Node {projectVersion}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="green">🎉 Hook配置已自动更新，立即生效！</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="yellow">⌨️ 按任意键返回... (3秒后自动返回)</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'dir') {
		return (
			<Box flexDirection="column">
				{/* ASCII 艺术字横幅 */}
				<Text color="cyan">{getColoredBanner('mini')}</Text>

				<Box marginBottom={1} marginTop={1}>
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

				<Box marginTop={2}>
					<Text color="gray">💡 输入完成后按回车确认 | ESC 键返回主菜单</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'version') {
		return (
			<Box flexDirection="column">
				{/* ASCII 艺术字横幅 */}
				<Text color="cyan">{getColoredBanner('mini')}</Text>

				<Box marginBottom={1} marginTop={1}>
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

				<Box marginTop={2}>
					<Text color="gray">💡 输入完成后按回车确认 | ESC 键返回主菜单</Text>
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
	const [deletedProject, setDeletedProject] = useState<string>('');

	// 处理键盘输入 - 必须在条件语句外面
	useInput((_input, key) => {
		if ((hasNoConfig || deletedProject) && (key.return || key.escape)) {
			onBack();
		}
	});

	// 3秒后自动返回 - 必须在条件语句外面
	useEffect(() => {
		if (hasNoConfig || deletedProject) {
			const timer = setTimeout(() => {
				onBack();
			}, 3000);

			return () => clearTimeout(timer);
		}

		// eslint-disable-next-line @typescript-eslint/no-empty-function
		return () => {};
	}, [hasNoConfig, deletedProject]);

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

	// 显示删除成功提示
	if (deletedProject) {
		return (
			<Box flexDirection="column">
				<Text color="green">✅ 项目配置删除成功！</Text>
				<Text>📂 已删除: {deletedProject}</Text>
				<Box marginTop={1}>
					<Text color="cyan">🔄 Hook配置已自动更新，修改立即生效！</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="yellow">⌨️ 按任意键返回... (3秒后自动返回)</Text>
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

	const handleSelect = async (item: any) => {
		if (item.value === 'back') {
			onBack();
			return;
		}

		// 获取要删除的项目路径
		const projectToDelete = config.workdirs[item.value as number];
		const projectName = projectToDelete?.dir ?? '';

		const newConfig = {...config};
		newConfig.workdirs = newConfig.workdirs.filter((_, i) => i !== item.value);
		onConfigChange(newConfig);

		// 自动重新生成Hook
		if (newConfig.shell && newConfig.manager) {
			try {
				const shellRcFiles = getShellConfigFiles(newConfig.shell);
				let generatedCount = 0;

				if (newConfig.workdirs.length === 0) {
					// 如果没有项目配置了，移除所有Hook
					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.removeHook(rcFile);
							generatedCount++;
						} catch (error) {
							console.warn(
								`⚠️ 清理 ${rcFile} Hook失败: ${(error as Error).message}`,
							);
						}
					});
					if (generatedCount > 0) {
						console.log(`✅ 已自动清理 ${generatedCount} 个Hook配置`);
						console.log('ℹ️ 已移除所有项目配置，Hook已清理完毕');
					}
				} else {
					// 重新生成Hook
					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.addHook(
								rcFile,
								newConfig.manager,
								newConfig.workdirs,
							);
							generatedCount++;
						} catch (error) {
							console.warn(
								`⚠️ 生成 ${rcFile} Hook失败: ${(error as Error).message}`,
							);
						}
					});
					if (generatedCount > 0) {
						console.log(`✅ 已自动重新生成 ${generatedCount} 个Hook配置`);
						console.log('🔄 Hook已更新，项目配置修改已生效');
					}
				}
			} catch {
				console.warn('⚠️ 自动更新Hook失败，请手动执行重新生成或清理操作');
			}
		}

		// 设置删除成功状态，显示提示信息
		setDeletedProject(projectName);
	};

	return (
		<Box flexDirection="column">
			{/* ASCII 艺术字横幅 */}
			<Text color="cyan">{getColoredBanner('mini')}</Text>

			<Box marginBottom={1} marginTop={1}>
				<Text bold color="cyan">
					🗑️ 删除项目配置
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color="red">⚠️ 请选择要删除的项目配置：</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} />

			{/* 操作提示 */}
			<Box marginTop={2}>
				<Text color="gray">💡 使用 ↑↓ 键选择，回车确认</Text>
			</Box>
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

					// 自动执行source命令刷新Shell配置
					let sourcedCount = 0;
					shellRcFiles.forEach(rcFile => {
						try {
							execSync(`source ${rcFile}`, {
								shell: process.env['SHELL'] ?? '/bin/bash',
								stdio: 'pipe',
							});
							sourcedCount++;
						} catch {
							// 静默失败，在结果消息中会提示用户手动执行
						}
					});

					const baseMessage = `🔄✅ 已重新生成 ${processedCount} 个Hook配置`;
					const sourceMessage =
						sourcedCount > 0
							? `\n🎉 配置已自动生效！`
							: `\n⚠️ 请手动刷新Shell配置`;

					setResult({
						success: true,
						message: baseMessage + sourceMessage,
					});
				} else if (type === 'clean') {
					shellRcFiles.forEach(rcFile => {
						try {
							HookManager.removeHook(rcFile);
							processedCount++;
						} catch (error) {
							console.warn(
								`🧹❌ 清理 ${rcFile} 失败: ${(error as Error).message}`,
							);
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

		// eslint-disable-next-line @typescript-eslint/no-empty-function
		return () => {};
	}, [isProcessing, result.success]);

	if (isProcessing) {
		return (
			<Box flexDirection="column">
				<Box>
					<Spinner type="dots" />
					<Text>
						{type === 'regenerate'
							? '⏳ 正在重新生成Hook...'
							: '⏳ 正在清理Hook...'}
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
				<>
					{type === 'regenerate' && result.message?.includes('请手动刷新') && (
						<Box marginTop={1}>
							<Text color="cyan">💡 请运行以下命令使配置立即生效：</Text>
							<Text color="gray"> source ~/.{config.shell}rc</Text>
						</Box>
					)}
					{type === 'clean' && (
						<Box marginTop={1}>
							<Text color="cyan">💡 请重新打开终端使更改生效</Text>
						</Box>
					)}
					<Box marginTop={1}>
						<Text color="yellow">⌨️ 按任意键返回... (3秒后自动返回)</Text>
					</Box>
				</>
			)}
		</Box>
	);
}
