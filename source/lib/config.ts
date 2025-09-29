import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';

const HOME = os.homedir();

/**
 * 项目配置接口
 */
export interface WorkdirConfig {
	dir: string;
	version: string;
}

/**
 * 应用配置接口
 */
export interface AppConfig {
	manager: string;
	shell: string;
	workdirs: WorkdirConfig[];
	lastUpdated: string | undefined;
}

/**
 * 配置文件路径管理 - 支持 XDG 基础目录规范
 */
export class ConfigPaths {
	/**
	 * XDG 标准配置目录
	 */
	static get xdgConfigHome(): string {
		return process.env['XDG_CONFIG_HOME'] ?? path.join(HOME, '.config');
	}

	/**
	 * 新的标准配置路径
	 */
	static get modernConfigDir(): string {
		return path.join(this.xdgConfigHome, 'node-workdir');
	}

	static get modernConfigFile(): string {
		return path.join(this.modernConfigDir, 'config.json');
	}

	/**
	 * 旧的配置文件路径（向后兼容）
	 */
	static get legacyConfigFile(): string {
		return path.join(HOME, '.node_workdir_config.json');
	}

	/**
	 * 备份目录
	 */
	static get backupDir(): string {
		return path.join(this.modernConfigDir, 'backups');
	}

	/**
	 * 获取实际使用的配置文件路径
	 */
	static getActiveConfigFile(): string {
		// 优先使用现代路径，如果不存在则检查旧路径
		if (fs.existsSync(this.modernConfigFile)) {
			return this.modernConfigFile;
		}

		if (fs.existsSync(this.legacyConfigFile)) {
			return this.legacyConfigFile;
		}

		// 都不存在则使用现代路径
		return this.modernConfigFile;
	}

	/**
	 * 确保配置目录存在
	 */
	static ensureConfigDir(): void {
		try {
			fs.mkdirSync(this.modernConfigDir, {recursive: true, mode: 0o700});
			fs.mkdirSync(this.backupDir, {recursive: true, mode: 0o700});
		} catch {
			// 忽略目录已存在的错误
		}
	}
}

/**
 * 配置缓存管理类
 */
export class ConfigCache {
	private data: AppConfig | undefined = undefined;
	private lastModified = 0;

	/**
	 * 获取配置数据，带缓存机制
	 */
	getConfig(): AppConfig {
		try {
			// 检查并执行配置迁移
			this.migrateConfigIfNeeded();

			const configFile = ConfigPaths.getActiveConfigFile();

			if (!fs.existsSync(configFile)) {
				return this.getDefaultConfig();
			}

			const stat = fs.statSync(configFile);
			if (!this.data || stat.mtime.getTime() > this.lastModified) {
				const rawData = fs.readFileSync(configFile, 'utf8');
				this.data = JSON.parse(rawData);
				this.lastModified = stat.mtime.getTime();

				// 验证配置数据完整性
				this.data = this.validateConfig(this.data);
			}

			return {...this.data}; // 返回副本防止意外修改
		} catch (error) {
			console.warn(`配置文件读取失败: ${(error as Error).message}`);
			return this.getDefaultConfig();
		}
	}

	/**
	 * 保存配置数据
	 */
	saveConfig(config: AppConfig): void {
		try {
			ConfigPaths.ensureConfigDir();

			const validatedConfig = this.validateConfig(config);
			validatedConfig.lastUpdated = new Date().toISOString();

			// 创建备份（如果配置文件已存在）
			this.createBackup();

			const configJson = JSON.stringify(validatedConfig, null, 2);

			// 确保使用现代配置文件路径
			const targetFile = ConfigPaths.modernConfigFile;
			fs.writeFileSync(targetFile, configJson, 'utf8');

			// 设置安全权限
			fs.chmodSync(targetFile, 0o600);

			// 更新缓存
			this.data = validatedConfig;
			this.lastModified = Date.now();

			console.log('✅ 配置已保存');
		} catch (error) {
			throw new Error(`保存配置失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.data = undefined;
		this.lastModified = 0;
	}

	/**
	 * 验证配置数据格式
	 */
	private validateConfig(config: any): AppConfig {
		const validated: AppConfig = {
			manager: '',
			shell: '',
			workdirs: [],
			lastUpdated: undefined,
			...config,
		};

		// 验证 workdirs 数组
		if (Array.isArray(validated.workdirs)) {
			validated.workdirs = validated.workdirs.filter(
				workdir =>
					workdir &&
					typeof workdir.dir === 'string' &&
					typeof workdir.version === 'string' &&
					workdir.dir.length > 0 &&
					workdir.version.length > 0,
			);
		} else {
			validated.workdirs = [];
		}

		return validated;
	}

	/**
	 * 获取默认配置
	 */
	private getDefaultConfig(): AppConfig {
		return {
			manager: '',
			shell: '',
			workdirs: [],
			lastUpdated: undefined,
		};
	}

	/**
	 * 检查并执行配置迁移
	 */
	private migrateConfigIfNeeded(): void {
		const legacyFile = ConfigPaths.legacyConfigFile;
		const modernFile = ConfigPaths.modernConfigFile;

		// 如果现代配置文件已存在，无需迁移
		if (fs.existsSync(modernFile)) {
			return;
		}

		// 如果旧配置文件存在，执行迁移
		if (fs.existsSync(legacyFile)) {
			try {
				ConfigPaths.ensureConfigDir();

				// 读取旧配置
				const legacyData = fs.readFileSync(legacyFile, 'utf8');

				// 写入新位置
				fs.writeFileSync(modernFile, legacyData, 'utf8');
				fs.chmodSync(modernFile, 0o600);

				// 备份旧文件而不是直接删除
				const backupName = `legacy-config-${Date.now()}.json.bak`;
				const backupPath = path.join(ConfigPaths.backupDir, backupName);
				fs.copyFileSync(legacyFile, backupPath);

				console.log(`✅ 配置已迁移到新位置: ${modernFile}`);
				console.log(`ℹ️ 旧配置已备份到: ${backupPath}`);
			} catch (error) {
				console.warn(`配置迁移失败: ${(error as Error).message}`);
			}
		}
	}

	/**
	 * 创建配置备份
	 */
	private createBackup(): void {
		const currentFile = ConfigPaths.getActiveConfigFile();

		if (!fs.existsSync(currentFile)) {
			return; // 没有现有配置文件，无需备份
		}

		try {
			ConfigPaths.ensureConfigDir();

			const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
			const backupName = `config-${timestamp}.json.bak`;
			const backupPath = path.join(ConfigPaths.backupDir, backupName);

			fs.copyFileSync(currentFile, backupPath);

			// 只保留最近的 5 个备份
			this.cleanupOldBackups();
		} catch (error) {
			console.warn(`创建备份失败: ${(error as Error).message}`);
		}
	}

	/**
	 * 清理旧备份文件
	 */
	private cleanupOldBackups(): void {
		try {
			const {backupDir} = ConfigPaths;
			if (!fs.existsSync(backupDir)) return;

			const backups = fs
				.readdirSync(backupDir)
				.filter(file => file.endsWith('.bak'))
				.map(file => ({
					name: file,
					path: path.join(backupDir, file),
					mtime: fs.statSync(path.join(backupDir, file)).mtime,
				}))
				.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

			// 保留最新的 5 个备份
			const maxBackups = 5;
			if (backups.length > maxBackups) {
				const toDelete = backups.slice(maxBackups);
				for (const backup of toDelete) {
					try {
						fs.unlinkSync(backup.path);
					} catch {
						// 忽略删除失败
					}
				}
			}
		} catch {
			// 忽略清理失败
		}
	}
}

// 全局缓存实例
export const configCache = new ConfigCache();
