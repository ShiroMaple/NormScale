'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LlmConfigItem, AppConfig } from '@/extractor/openai-compatible-extractor.ts';

export const AdminConsole: React.FC = () => {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeLogFilter, setActiveLogFilter] = useState<string>('ALL');

  // 拉取服务端 config.json
  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      if (data.success && data.config) {
        setAppConfig(data.config);
      } else {
        setFeedback({ message: data.error || '拉取配置失败', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: `网络请求失败: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // 保存配置至服务端 config.json
  const handleSaveConfig = async () => {
    if (!appConfig) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appConfig),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ message: '配置已成功保存并即刻生效', type: 'success' });
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback({ message: data.error || '保存失败', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: `保存失败: ${err.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 切换默认模型配置
  const handleSetDefault = (index: number) => {
    if (!appConfig) return;
    const updated = { ...appConfig };
    updated.llm.configs.forEach((c, idx) => {
      c.isDefault = idx === index;
    });
    setAppConfig(updated);
  };

  // 修改具体模型字段
  const handleUpdateConfigItem = (index: number, field: keyof LlmConfigItem, value: any) => {
    if (!appConfig) return;
    const updated = { ...appConfig };
    updated.llm.configs[index] = {
      ...updated.llm.configs[index]!,
      [field]: value,
    };
    setAppConfig(updated);
  };

  // 新增模型配置
  const handleAddConfigItem = () => {
    if (!appConfig) return;
    const newId = `custom-model-${Date.now().toString().slice(-4)}`;
    const newItem: LlmConfigItem = {
      id: newId,
      name: '自定义 OpenAI 兼容模型',
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: 'OPENAI_API_KEY',
      isDefault: false,
    };
    setAppConfig({
      ...appConfig,
      llm: {
        ...appConfig.llm,
        configs: [...appConfig.llm.configs, newItem],
      },
    });
  };

  // 删除模型配置
  const handleDeleteConfigItem = (index: number) => {
    if (!appConfig || appConfig.llm.configs.length <= 1) return;
    const isDeletingDefault = appConfig.llm.configs[index]?.isDefault;
    const filtered = appConfig.llm.configs.filter((_, idx) => idx !== index);
    if (isDeletingDefault && filtered.length > 0) {
      filtered[0]!.isDefault = true;
    }
    setAppConfig({
      ...appConfig,
      llm: {
        ...appConfig.llm,
        configs: filtered,
      },
    });
  };

  return (
    <div className="space-y-5 h-[calc(100vh-4rem-2rem)] overflow-y-auto custom-scrollbar p-6 select-none">
      
      {/* 顶部配置概览与操作栏 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-2xl">tune</span>
            <span>系统管理与运行参数配置</span>
          </h2>
          <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-0.5">
            实时管理 config.json 大模型配置、API 路由、执行超时与质检员授权
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {feedback && (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              feedback.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
            }`}>
              <span className="material-symbols-outlined text-base">
                {feedback.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{feedback.message}</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={isSaving || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">
              {isSaving ? 'hourglass_top' : 'save'}
            </span>
            <span>{isSaving ? '正在保存...' : '保存系统配置'}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-on-surface-variant gap-2 text-xs">
          <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
          <span>正在拉取系统配置...</span>
        </div>
      ) : !appConfig ? (
        <div className="h-64 flex flex-col items-center justify-center text-red-500 gap-2 text-xs">
          <span className="material-symbols-outlined text-3xl">error</span>
          <span>无法加载 config.json 配置文件</span>
        </div>
      ) : (
        /* 主体分栏：左侧 65% 模型配置卡片，右侧 35% 全局参数与审计日志 */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* 左侧：大模型配置卡片列表 */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-base">neurology</span>
                <span>OpenAI 兼容协议模型路由列表 ({appConfig.llm.configs.length})</span>
              </h3>

              <button
                type="button"
                onClick={handleAddConfigItem}
                className="flex items-center gap-1 text-xs text-primary dark:text-primary-fixed-dim font-bold hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>新增模型配置</span>
              </button>
            </div>

            {/* 模型卡片列表 */}
            <div className="space-y-3.5">
              {appConfig.llm.configs.map((configItem, idx) => {
                const isDefault = Boolean(configItem.isDefault);
                return (
                  <div
                    key={configItem.id || idx}
                    className={`rounded-xl border p-4.5 transition-all space-y-3.5 ${
                      isDefault
                        ? 'border-primary dark:border-primary-fixed-dim ring-2 ring-primary/20 bg-surface-container-lowest dark:bg-surface-dark shadow-xs'
                        : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                  >
                    {/* 卡片头部 */}
                    <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg">
                          {isDefault ? 'verified' : 'tune'}
                        </span>
                        <input
                          type="text"
                          value={configItem.name}
                          onChange={e => handleUpdateConfigItem(idx, 'name', e.target.value)}
                          className="font-bold text-xs text-on-surface dark:text-surface-bright bg-transparent border-b border-dashed border-outline-variant/50 focus:border-primary focus:outline-none px-1 py-0.5"
                          placeholder="配置名称"
                        />
                        <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant font-medium">
                          ID: {configItem.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isDefault ? (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary text-on-primary flex items-center gap-1 shadow-2xs">
                            <span className="material-symbols-outlined text-xs">check</span>
                            <span>默认推理模型</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(idx)}
                            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                          >
                            设为默认
                          </button>
                        )}

                        {appConfig.llm.configs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteConfigItem(idx)}
                            title="删除该模型配置"
                            className="text-on-surface-variant hover:text-red-600 transition-colors p-1"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 表单字段 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">服务商 (Provider)</label>
                        <input
                          type="text"
                          value={configItem.provider}
                          onChange={e => handleUpdateConfigItem(idx, 'provider', e.target.value)}
                          className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">模型名称 (Model Identifier)</label>
                        <input
                          type="text"
                          value={configItem.model}
                          onChange={e => handleUpdateConfigItem(idx, 'model', e.target.value)}
                          className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-mono"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">API Base URL (OpenAI 兼容端点)</label>
                        <input
                          type="text"
                          value={configItem.baseUrl}
                          onChange={e => handleUpdateConfigItem(idx, 'baseUrl', e.target.value)}
                          className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">API Key 环境变量名</label>
                        <input
                          type="text"
                          value={configItem.apiKey}
                          onChange={e => handleUpdateConfigItem(idx, 'apiKey', e.target.value)}
                          placeholder="例如 KIMI_API_KEY 或 OPENAI_API_KEY"
                          className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">思考深度 (Thinking Effort)</label>
                        <select
                          value={configItem.thinkingEffort || 'medium'}
                          onChange={e => handleUpdateConfigItem(idx, 'thinkingEffort', e.target.value)}
                          className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs"
                        >
                          <option value="none">关闭思考 (None / Direct Output)</option>
                          <option value="low">低消耗快速思考 (Low)</option>
                          <option value="medium">标准工业深度思考 (Medium)</option>
                          <option value="high">深度多轮校验思考 (High)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右侧：全局调用参数、计费单价与系统日志 */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* 全局参数 */}
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-base">timer</span>
                <span>全局调用控制参数</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-on-surface-variant text-[11px] mb-1">单次推理超时阈值 (ms)</label>
                  <input
                    type="number"
                    step={1000}
                    value={appConfig.llm.timeoutMs}
                    onChange={e => setAppConfig({
                      ...appConfig,
                      llm: { ...appConfig.llm, timeoutMs: Number(e.target.value) },
                    })}
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-on-surface-variant text-[11px] mb-1">接口异常最大重试次数</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={appConfig.llm.maxRetries}
                    onChange={e => setAppConfig({
                      ...appConfig,
                      llm: { ...appConfig.llm, maxRetries: Number(e.target.value) },
                    })}
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 定价参考 */}
            {appConfig.llm.pricing && (
              <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-2.5">
                <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-600 text-base">payments</span>
                  <span>模型推理计费单价参考 (每 1M Tokens / ¥)</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b border-outline-variant/40 font-mono text-[10px]">
                      <tr>
                        <th className="px-2.5 py-1.5">模型</th>
                        <th className="px-2.5 py-1.5 text-right">输入 / 1M</th>
                        <th className="px-2.5 py-1.5 text-right">输出 / 1M</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20 text-[11px] font-mono">
                      {Object.entries(appConfig.llm.pricing).map(([mName, price]) => (
                        <tr key={mName}>
                          <td className="px-2.5 py-1.5 font-medium text-on-surface dark:text-surface-bright">{mName}</td>
                          <td className="px-2.5 py-1.5 text-right">¥{price.inputPer1M.toFixed(2)}</td>
                          <td className="px-2.5 py-1.5 text-right">¥{price.outputPer1M.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 系统执行轨迹日志视窗 */}
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 border-b border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">terminal</span>
                  <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider">
                    领域引擎运行状态
                  </h3>
                </div>

                <div className="flex items-center gap-1 text-[10px]">
                  {['ALL', 'EXTRACTOR', 'ENGINE', 'PERF'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveLogFilter(tag)}
                      className={`px-1.5 py-0.5 rounded transition-all ${
                        activeLogFilter === tag
                          ? 'bg-primary text-on-primary font-bold'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-surface-container-lowest dark:bg-surface-dark text-on-surface-variant text-xs flex flex-col items-center justify-center min-h-[140px] text-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-2xl">check_circle</span>
                <span className="font-bold text-on-surface dark:text-surface-bright">系统各模块就绪待命</span>
                <span className="text-[11px] text-on-surface-variant/80">工作台执行质检解析与规则比对时将在此实时输出性能日志</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
