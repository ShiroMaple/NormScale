'use client';

import React, { useState } from 'react';

interface LogEntry {
  id: string;
  time: string;
  tag: 'EXTRACTOR' | 'NORMALIZER' | 'ENGINE' | 'HITL' | 'PERF';
  message: string;
  duration?: number;
}

const SAMPLE_LOGS: LogEntry[] = [
  { id: '1', time: '12:00:01.102', tag: 'EXTRACTOR', message: '解析引擎已加载，提取原始键值对 24 项' },
  { id: '2', time: '12:00:01.215', tag: 'NORMALIZER', message: '牌号消歧: TP-316L 成功映射至 022Cr17Ni12Mo2 (S31603)' },
  { id: '3', time: '12:00:01.320', tag: 'NORMALIZER', message: '物理单位换算: 58.5 kgf/mm² -> 573.68 MPa (精确度 0.01%)' },
  { id: '4', time: '12:00:01.450', tag: 'ENGINE', message: '锁定规格切片: GB/T 13296-2023 / S31603，加载 15 条评定规则' },
  { id: '5', time: '12:00:01.580', tag: 'ENGINE', message: '扫描发现 3 项强制出厂检验项目缺失 (压扁/承压/晶腐)，判定一票否决 FAIL' },
  { id: '6', time: '12:00:01.602', tag: 'PERF', message: '全流程决策总耗时: 1.2ms (切片加载 0.3ms, 比对 0.9ms)', duration: 1.2 },
];

/**
 * ============================================================================
 * 系统管理与运维配置控制台组件 (Admin Console - MD3 规范)
 * ============================================================================
 */
export const AdminConsole: React.FC = () => {
  const [parserBackend, setParserBackend] = useState<'native' | 'docex' | 'llm'>('native');
  const [llmModel, setLlmModel] = useState<string>('gemini-3.1-pro');
  const [activeLogFilter, setActiveLogFilter] = useState<string>('ALL');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const handleSaveConfig = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const filteredLogs = SAMPLE_LOGS.filter(
    log => activeLogFilter === 'ALL' || log.tag === activeLogFilter
  );

  return (
    <div className="space-y-5 h-[calc(100vh-4rem-2rem)] overflow-y-auto custom-scrollbar p-6 select-none">
      
      {/* 顶部配置概览 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">tune</span>
            <span>系统管理与运行参数配置</span>
          </h2>
          <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-0.5">
            配置文档解析引擎后端、推理大模型、微秒级可观测性日志与质检员权限
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveConfig}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
        >
          <span className="material-symbols-outlined text-base">
            {isSaved ? 'check' : 'save'}
          </span>
          <span>{isSaved ? '配置已保存生效' : '保存系统配置'}</span>
        </button>
      </div>

      {/* 主体分栏：左侧 45% 模型与解析配置，右侧 55% 实时日志终端与权限 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 左侧：模型与解析源配置 */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-base">memory</span>
              <span>质保书解析引擎与模型路由 (Parser & Model Engine)</span>
            </h3>

            {/* 解析源选择 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-on-surface dark:text-surface-bright block">
                文档版面分析与 OCR 解析源
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'native', label: 'NormScale 内建专用解析', desc: '支持像素级 BBox' },
                  { id: 'docex', label: 'DocEx 跨项目服务', desc: 'REST API 桥接' },
                  { id: 'llm', label: 'Direct LLM 多模态', desc: '纯视觉抽取' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setParserBackend(item.id as typeof parserBackend)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      parserBackend === item.id
                        ? 'border-primary dark:border-primary-fixed-dim bg-primary/10 text-primary dark:text-primary-fixed-dim font-bold'
                        : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="block text-xs">{item.label}</span>
                    <span className="text-[10px] opacity-75 block mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 大模型选择与 API 密钥掩码 */}
            <div className="space-y-3 pt-2 border-t border-outline-variant/40 text-xs">
              <div>
                <label className="block text-on-surface-variant mb-1">主推理大模型 (Primary LLM)</label>
                <select
                  value={llmModel}
                  onChange={e => setLlmModel(e.target.value)}
                  className="w-full border border-outline-variant dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-2 px-3 text-on-surface dark:text-surface-bright focus:outline-none font-mono"
                >
                  <option value="gemini-3.1-pro">Gemini 3.1 Pro (推荐 · 工业级高精度)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (极速响应)</option>
                  <option value="claude-3.7-sonnet">Claude 3.7 Sonnet (备用通道)</option>
                </select>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">API Key 凭据配置 (环境变量已注入)</label>
                <input
                  type="password"
                  value="sk-proj-normscale-industrial-20260823-masked"
                  disabled
                  className="w-full border border-outline-variant/40 rounded-lg bg-surface-container-low/50 py-2 px-3 text-on-surface-variant font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：实时日志流监视器与权限 */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* 日志流监视器 */}
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark overflow-hidden shadow-xs">
            <div className="px-4 py-3 border-b border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">terminal</span>
                <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider">
                  领域引擎实时执行轨迹日志 (Microsecond Log Stream)
                </h3>
              </div>

              {/* 标签过滤 */}
              <div className="flex items-center gap-1 text-xs">
                {['ALL', 'EXTRACTOR', 'NORMALIZER', 'ENGINE', 'PERF'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveLogFilter(tag)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
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

            {/* 模拟终端视窗 */}
            <div className="p-4 bg-[#090d16] text-slate-200 font-mono text-[11px] space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
              {filteredLogs.map(log => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-slate-500 shrink-0">{log.time}</span>
                  <span className={`px-1.5 py-0.2 rounded font-bold shrink-0 text-[10px] ${
                    log.tag === 'EXTRACTOR' ? 'bg-cyan-950 text-cyan-300' :
                    log.tag === 'NORMALIZER' ? 'bg-blue-950 text-blue-300' :
                    log.tag === 'ENGINE' ? 'bg-amber-950 text-amber-300' :
                    log.tag === 'PERF' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-300'
                  }`}>
                    [{log.tag}]
                  </span>
                  <span className="text-slate-300 font-sans">{log.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 质检员权限与 CA 证书 */}
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-base">verified_user</span>
                <span>质检员数字签名与 CA 证书权限</span>
              </h3>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-primary font-bold hover:underline"
              >
                <span className="material-symbols-outlined text-xs">add</span>
                <span>新增质检员</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b border-outline-variant/40 font-mono">
                  <tr>
                    <th className="px-3 py-2">姓名 / 员工号</th>
                    <th className="px-3 py-2">岗位角色</th>
                    <th className="px-3 py-2">授权标准品类</th>
                    <th className="px-3 py-2">CA 证书状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 text-[11px]">
                  <tr>
                    <td className="px-3 py-2 font-medium text-on-surface dark:text-surface-bright">张建华 (QA-8821)</td>
                    <td className="px-3 py-2 text-on-surface-variant">主检工程师</td>
                    <td className="px-3 py-2 font-mono">GB/T 13296 (不锈钢管)</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">
                        有效至 2027-12
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
