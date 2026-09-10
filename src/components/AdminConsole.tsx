'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LlmConfigItem, AppConfig } from '@/extractor/openai-compatible-extractor.ts';
import { LearnedAliasEntry } from '@/normalizer/property-key-normalizer.ts';
import { SystemLogViewer } from '@/components/SystemLogViewer';

export interface AdminConsoleProps {
  isActive?: boolean;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ isActive = true }) => {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 控制台子面板切换: 系统运行日志 vs 参数设置 vs 自学习别名白盒知识库
  const [consoleTab, setConsoleTab] = useState<'system_logs' | 'params' | 'learned_aliases'>('system_logs');
  const [aliases, setAliases] = useState<LearnedAliasEntry[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState<boolean>(false);
  const [aliasSearch, setAliasSearch] = useState<string>('');
  const [aliasCategoryFilter, setAliasCategoryFilter] = useState<string>('ALL');

  // 拉取自学习别名白盒数据
  const fetchAliases = useCallback(async () => {
    setAliasesLoading(true);
    try {
      const res = await fetch('/api/admin/learned-aliases');
      const data = await res.json();
      if (data.success && data.data?.aliases) {
        setAliases(data.data.aliases);
      }
    } catch (err: any) {
      console.error('拉取自学习别名失败:', err);
    } finally {
      setAliasesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (consoleTab === 'learned_aliases') {
      fetchAliases();
    }
  }, [consoleTab, fetchAliases]);

  // 执行自学习别名操作 (撤销、恢复、删除)
  const handleAliasAction = async (action: 'revoke' | 'restore' | 'delete', id?: string) => {
    if (!id) return;
    try {
      const res = await fetch('/api/admin/learned-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const data = await res.json();
      if (data.success) {
        const actionLabel = action === 'revoke' ? '撤销' : action === 'restore' ? '恢复' : '物理删除';
        setFeedback({ message: `条目已成功${actionLabel}，内存与磁盘已同步更新`, type: 'success' });
        setTimeout(() => setFeedback(null), 3000);
        fetchAliases();
      } else {
        setFeedback({ message: data.error || '操作失败', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: `操作异常: ${err.message}`, type: 'error' });
    }
  };

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
    <div className="h-full flex flex-col overflow-hidden p-6 select-none gap-4">
      {/* 控制台顶栏：Tab 切换与全局操作/状态提示 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/40 pb-3 shrink-0">
        {/* 左侧 Tab 栏 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConsoleTab('system_logs')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              consoleTab === 'system_logs'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
            }`}
          >
            <span className="material-symbols-outlined text-base">terminal</span>
            <span>系统运行日志</span>
          </button>

          <button
            type="button"
            onClick={() => setConsoleTab('params')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              consoleTab === 'params'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
            }`}
          >
            <span className="material-symbols-outlined text-base">settings</span>
            <span>参数设置</span>
          </button>

          <button
            type="button"
            onClick={() => setConsoleTab('learned_aliases')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              consoleTab === 'learned_aliases'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
            }`}
          >
            <span className="material-symbols-outlined text-base">auto_fix</span>
            <span>动态别名白盒知识库</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans tabular-nums ${
              consoleTab === 'learned_aliases' ? 'bg-white/20 text-white' : 'bg-surface-container-highest dark:bg-surface-dark-highest text-on-surface-variant'
            }`}>
              {aliases.length}
            </span>
          </button>
        </div>

        {/* 右侧操作栏与反馈 */}
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

          {consoleTab === 'params' && (
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving || isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary-container text-on-primary rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">
                {isSaving ? 'hourglass_top' : 'save'}
              </span>
              <span>{isSaving ? '正在保存...' : '保存系统配置'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 主体自适应面板内容 */}
      <div className="flex-1 min-h-0 flex flex-col">

      {consoleTab === 'learned_aliases' ? (
        /* 白盒自学习别名知识库面板 */
        <div className="h-full overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {/* 指标与过滤检索条 */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-3.5 shadow-xs">
              <span className="text-[11px] text-on-surface-variant font-medium">已沉淀映射总数</span>
              <div className="text-xl font-bold text-on-surface dark:text-surface-bright font-sans tabular-nums mt-0.5">{aliases.length}</div>
            </div>
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-3.5 shadow-xs">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">当前活跃生效中</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-sans tabular-nums mt-0.5">
                {aliases.filter(a => a.status !== 'revoked').length}
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-3.5 shadow-xs">
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">人工已撤销失效</span>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 font-sans tabular-nums mt-0.5">
                {aliases.filter(a => a.status === 'revoked').length}
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-3.5 shadow-xs">
              <span className="text-[11px] text-primary dark:text-primary-fixed-dim font-medium">知识沉淀效率</span>
              <div className="text-xl font-bold text-primary dark:text-primary-fixed-dim font-sans tabular-nums mt-0.5">
                {aliases.length > 0 ? 'Tier 1 直通' : '0 项'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined text-base absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  search
                </span>
                <input
                  type="text"
                  value={aliasSearch}
                  onChange={e => setAliasSearch(e.target.value)}
                  placeholder="搜索 OCR 原始未对齐术语或标准系统属性键..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant font-medium">分类过滤:</span>
                <select
                  value={aliasCategoryFilter}
                  onChange={e => setAliasCategoryFilter(e.target.value)}
                  className="text-xs border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
                >
                  <option value="ALL">全部分类</option>
                  <option value="chemical">化学成分 (chemical)</option>
                  <option value="mechanical">力学指标 (mechanical)</option>
                  <option value="process_ndt">工艺探伤 (process_ndt)</option>
                  <option value="formula_misc">长尾参数 (formula_misc)</option>
                </select>

                <button
                  type="button"
                  onClick={fetchAliases}
                  disabled={aliasesLoading}
                  className="p-1.5 rounded-lg border border-outline-variant/60 hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
                  title="刷新数据"
                >
                  <span className={`material-symbols-outlined text-sm ${aliasesLoading ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                </button>
              </div>
            </div>

            {/* 别名条目白盒数据表 */}
            <div className="overflow-x-auto rounded-lg border border-outline-variant/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b border-outline-variant/40 font-sans text-[11px]">
                  <tr>
                    <th className="px-3.5 py-2.5">OCR 原始文本 (长尾别名)</th>
                    <th className="px-3.5 py-2.5">对齐标准属性键 (property_key)</th>
                    <th className="px-3.5 py-2.5">领域分类</th>
                    <th className="px-3.5 py-2.5">来源质保书编号</th>
                    <th className="px-3.5 py-2.5">自学习时间</th>
                    <th className="px-3.5 py-2.5">生效状态</th>
                    <th className="px-3.5 py-2.5 text-right">人工治理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {aliasesLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-2xl animate-spin text-primary">progress_activity</span>
                        <div className="mt-1 text-xs">正在拉取自学习白盒知识库...</div>
                      </td>
                    </tr>
                  ) : aliases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                        暂无已学习的别名映射条目。在质检工作台中进行人工确认 (HITL) 后将自动沉淀至此。
                      </td>
                    </tr>
                  ) : (
                    aliases
                      .filter(item => {
                        const kw = aliasSearch.trim().toLowerCase();
                        const matchKw = !kw ||
                          item.raw_alias.toLowerCase().includes(kw) ||
                          item.property_key.toLowerCase().includes(kw) ||
                          (item.display_name && item.display_name.toLowerCase().includes(kw)) ||
                          (item.source_cert_no && item.source_cert_no.toLowerCase().includes(kw));
                        const matchCat = aliasCategoryFilter === 'ALL' || item.category === aliasCategoryFilter;
                        return matchKw && matchCat;
                      })
                      .map((item, idx) => {
                        const isRevoked = item.status === 'revoked';
                        return (
                          <tr
                            key={item.id || idx}
                            className={`hover:bg-surface-container-low/50 dark:hover:bg-surface-dark-low/50 transition-colors ${
                              isRevoked ? 'opacity-50 bg-surface-container-lowest' : ''
                            }`}
                          >
                            <td className="px-3.5 py-2.5 font-bold text-on-surface dark:text-surface-bright font-sans">
                              {item.raw_alias}
                            </td>
                            <td className="px-3.5 py-2.5 font-sans text-primary dark:text-primary-fixed-dim">
                              {item.property_key}
                              {item.display_name && item.display_name !== item.property_key && (
                                <span className="text-[10px] text-on-surface-variant ml-1">({item.display_name})</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high font-sans">
                                {item.category}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-on-surface-variant font-sans text-[11px]">
                              {item.source_cert_no || '质检员人工确认'}
                            </td>
                            <td className="px-3.5 py-2.5 text-on-surface-variant text-[11px] font-sans tabular-nums">
                              {item.learned_at ? new Date(item.learned_at).toLocaleString() : '-'}
                            </td>
                            <td className="px-3.5 py-2.5">
                              {isRevoked ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                                  已撤销 (失效)
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                  生效中 (Tier 1)
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-right space-x-2">
                              {isRevoked ? (
                                <button
                                  type="button"
                                  onClick={() => handleAliasAction('restore', item.id)}
                                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                                >
                                  恢复生效
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAliasAction('revoke', item.id)}
                                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold cursor-pointer"
                                  title="撤销后该别名不再参与 Tier 1 自动判定"
                                >
                                  撤销映射
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`确定彻底删除别名 [${item.raw_alias}] 吗？`)) {
                                    handleAliasAction('delete', item.id);
                                  }
                                }}
                                className="text-xs text-red-500 hover:underline cursor-pointer"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : consoleTab === 'system_logs' ? (
        /* 系统运行日志专页 (SSE 流式、输出级别动态控制、多维过滤) */
        <SystemLogViewer isActive={isActive && consoleTab === 'system_logs'} />
      ) : isLoading ? (
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
        /* 主体分栏：五五开对称布局 (左侧 50% 模型配置，右侧 50% 全局参数与版本控制) */
        <div className="h-full overflow-y-auto custom-scrollbar space-y-5 pr-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          
          {/* 左侧 50%：大模型配置卡片列表 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/30">
              <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-base">neurology</span>
                <span>OpenAI 兼容协议模型路由列表 ({appConfig.llm.configs.length})</span>
              </h3>

              <button
                type="button"
                onClick={handleAddConfigItem}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary/10 hover:bg-primary/20 text-primary dark:text-primary-fixed-dim font-bold transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>新增模型配置</span>
              </button>
            </div>

            {/* 模型卡片列表 (工业级微服务容器视觉) */}
            <div className="space-y-4">
              {appConfig.llm.configs.map((configItem, idx) => {
                const isDefault = Boolean(configItem.isDefault);
                return (
                  <div
                    key={configItem.id || idx}
                    className={`relative rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${
                      isDefault
                        ? 'border-primary/50 dark:border-primary-fixed-dim/60 ring-1 ring-primary/20 bg-surface-container-lowest dark:bg-surface-dark before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-primary'
                        : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark hover:border-outline-variant'
                    }`}
                  >
                    {/* 卡片头部 */}
                    <div className="px-4 py-3 bg-surface-container-low/60 dark:bg-surface-dark-low/60 border-b border-outline-variant/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1 rounded-md bg-primary/10 text-primary dark:text-primary-fixed-dim material-symbols-outlined text-base shrink-0">
                          {isDefault ? 'memory' : 'tune'}
                        </span>
                        <input
                          type="text"
                          value={configItem.name}
                          onChange={e => handleUpdateConfigItem(idx, 'name', e.target.value)}
                          className="font-bold text-xs text-on-surface dark:text-surface-bright bg-transparent border-b border-dashed border-outline-variant/50 focus:border-primary focus:outline-none px-1 py-0.5 truncate"
                          placeholder="配置名称"
                        />
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant font-sans shrink-0">
                          ID: {configItem.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDefault ? (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary text-on-primary flex items-center gap-1 shadow-2xs">
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>默认推理模型</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(idx)}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                          >
                            设为默认
                          </button>
                        )}

                        {appConfig.llm.configs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteConfigItem(idx)}
                            title="删除该模型配置"
                            className="text-on-surface-variant hover:text-red-600 hover:bg-red-500/10 transition-colors p-1.5 rounded-lg cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 卡片表单字段 */}
                    <div className="p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                            服务商 (Provider)
                          </label>
                          <input
                            type="text"
                            value={configItem.provider}
                            onChange={e => handleUpdateConfigItem(idx, 'provider', e.target.value)}
                            className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                            模型名称 (Model Identifier)
                          </label>
                          <input
                            type="text"
                            value={configItem.model}
                            onChange={e => handleUpdateConfigItem(idx, 'model', e.target.value)}
                            className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-sans"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                          API Base URL (OpenAI 兼容端点)
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined text-sm absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                            link
                          </span>
                          <input
                            type="text"
                            value={configItem.baseUrl}
                            onChange={e => handleUpdateConfigItem(idx, 'baseUrl', e.target.value)}
                            className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 pl-8 pr-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-sans"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                            API Key 环境变量名
                          </label>
                          <div className="relative">
                            <span className="font-sans text-xs font-bold absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                              $
                            </span>
                            <input
                              type="text"
                              value={configItem.apiKey}
                              onChange={e => handleUpdateConfigItem(idx, 'apiKey', e.target.value)}
                              placeholder="例如 KIMI_API_KEY 或 OPENAI_API_KEY"
                              className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 pl-7 pr-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs font-sans"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                            思考深度 (Thinking Effort)
                          </label>
                          <select
                            value={configItem.thinkingEffort || 'medium'}
                            onChange={e => handleUpdateConfigItem(idx, 'thinkingEffort', e.target.value)}
                            className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-2.5 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs cursor-pointer"
                          >
                            <option value="none">关闭思考 (None / Direct Output)</option>
                            <option value="low">低消耗快速思考 (Low)</option>
                            <option value="medium">标准工业深度思考 (Medium)</option>
                            <option value="high">深度多轮校验思考 (High)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右侧 50%：全局调用参数、抽取版本与安全指引 */}
          <div className="space-y-4">
            
            {/* 抽取配置项与 Prompt 版本管理卡片 */}
            <div className="rounded-2xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">rule_settings</span>
                  <span>抽取 Schema 与 Prompt 配置项版本</span>
                </h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-sans font-bold">
                  v{appConfig.parser?.version || '1.0.0'}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-on-surface-variant text-[11px] mb-1">
                    当前配置项版本号 (修改并保存后，旧版本解析缓存将自动安全失效)
                  </label>
                  <input
                    type="text"
                    value={appConfig.parser?.version || '1.0.0'}
                    onChange={e => setAppConfig({
                      ...appConfig,
                      parser: {
                        version: e.target.value,
                        description: appConfig.parser?.description || '工业 MTC 质保书通用提取 Schema 与双模态 Prompt V1',
                      },
                    })}
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary font-sans text-xs"
                    placeholder="如 1.0.0"
                  />
                </div>
                <div>
                  <label className="block text-on-surface-variant text-[11px] mb-1">
                    配置项描述 / 变更说明 (与 certificate.schema.ts 结构与 Prompt 绑定)
                  </label>
                  <input
                    type="text"
                    value={appConfig.parser?.description || ''}
                    onChange={e => setAppConfig({
                      ...appConfig,
                      parser: {
                        version: appConfig.parser?.version || '1.0.0',
                        description: e.target.value,
                      },
                    })}
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary text-xs"
                    placeholder="如：工业 MTC 质保书通用提取 Schema 与双模态 Prompt V1"
                  />
                </div>
              </div>
            </div>

            {/* 全局调用控制参数 */}
            <div className="rounded-2xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">timer</span>
                  <span>全局调用控制参数</span>
                </h3>
              </div>

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
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary font-sans text-xs"
                  />
                </div>

                <div>
                  <label className="block text-on-surface-variant text-[11px] mb-1 font-medium">
                    接口异常最大重试次数
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={appConfig.llm.maxRetries}
                    onChange={e => setAppConfig({
                      ...appConfig,
                      llm: { ...appConfig.llm, maxRetries: Number(e.target.value) },
                    })}
                    className="w-full border border-outline-variant/60 dark:border-border-dark rounded-xl bg-surface-container-low dark:bg-surface-dark-low py-1.5 px-3 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary font-sans text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 生产级安全凭证隔离与智能调度规范卡片 */}
            <div className="rounded-2xl border border-outline-variant/40 dark:border-border-dark bg-surface-container-low/40 dark:bg-surface-dark-low/40 p-4 shadow-xs space-y-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-primary dark:text-primary-fixed-dim font-bold">
                <span className="material-symbols-outlined text-base">verified_user</span>
                <span>生产级凭证隔离与智能路由规范</span>
              </div>
              <ul className="text-on-surface-variant text-[11px] space-y-1.5 leading-relaxed list-disc list-inside">
                <li>系统严禁在配置文件或代码中硬编码明文 API Key，仅持久化环境变量名称；真实密钥通过生产环境容器环境变量安全注入。</li>
                <li>标记为“默认推理模型”的路由将作为质保书 OCR 结构化提取与 Tier 2 语义消歧的第一执行引擎。</li>
                <li>抽取 Schema 版本号提升后，历史解析缓存将自动退避，促使系统基于最新 Prompt 重新生成规范化结果。</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  </div>
);
};
