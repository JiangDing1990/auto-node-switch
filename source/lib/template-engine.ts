/**
 * 简单高效的模板引擎
 * 使用插值语法 {{variable}} 进行变量替换
 */

import type {TemplateData, TemplateRenderer} from './shell-configs/types.js';

/**
 * 模板引擎实现
 */
export class TemplateEngine implements TemplateRenderer {
	/**
	 * 渲染模板
	 * @param template 模板字符串
	 * @param data 数据对象
	 * @returns 渲染后的字符串
	 */
	render(template: string, data: TemplateData): string {
		return template.replace(/{{(\w+)}}/g, (match, key) => {
			const value = data[key as keyof TemplateData];

			return value !== undefined ? String(value) : match;
		});
	}

	/**
	 * 渲染多行模板（保持缩进）
	 */
	renderMultiline(template: string, data: TemplateData): string {
		return this.render(template, data);
	}
}

/**
 * 默认模板引擎实例
 */
export const templateEngine = new TemplateEngine();
