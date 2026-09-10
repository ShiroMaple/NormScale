'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LogEvent, LogLevel, LogModuleTag } from '@/logger/logger.interface';

const ALL_TAGS: Array<LogModuleTag | 'ALL'> = [
  'ALL',
  'WORKFLOW',
  'EXTRACTOR',
  'NORMALIZER',
  'REPOSITORY',
  'ENGINE',
  'PERF',
  'SYSTEM',
];

const ALL_LEVELS: Array<{ label: string; value: LogLevel | 'ALL'; color: string }> = [
  { label: '全部级别', value: 'ALL', color: 'text-on-surface' },
  { label: 'DEBUG', value: 'debug', color: 'text-slate-500 dark:text-slate-400' },
  { label: 'INFO', value: 'info', color: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'WARN', value: 'warn', color: 'text-amber-600 dark:text-amber-400' },
  { label: 'ERROR', value: 'error', color: 'text-rose-600 dark:text-rose-400' },
];

/**
 * 模块标签颜色映射
 */
const TAG_BADGE_STYLE: Record<LogModuleTag, string> = {
  WORKFLOW: 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20',
  EXTRACTOR: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-500/20',
  NORMALIZER: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20',
  REPOSITORY: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20',
  ENGINE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
  PERF: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
  SYSTEM: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

/**
 * 级别标签样式
 */
const LEVEL_BADGE_STYLE: Record<LogLevel, string> = {
  debug: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
  info: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-bold',
  silent: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

/**
 * 格式化 ISO 时间为时分秒毫秒 (HH:mm:ss.SSS)
 */
function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  } catch {
    return isoStr;
  }
}

export const SystemLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [serverLevel, setServerLevel] = useState<LogLevel>('info');
  const [isChangingLevel, setIsChangingLevel] = useState(false);
  
  // 筛选与控制项
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [filterTag, setFilterTag] = useState<LogModuleTag | 'ALL'>('ALL');
  const [keyword, setKeyword] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 1. 初始化拉取历史缓冲并同步级别
  useEffect(() => {
    let isMounted = true;

    async function fetchInitialLogs() {
      try {
        const res = await fetch('/api/admin/logs?limit=500');
        const data = await res.json();
        if (isMounted && data.success) {
          if (data.currentLevel) setServerLevel(data.currentLevel);
          if (Array.isArray(data.logs)) setLogs(data.logs);
        }
      } catch (err) {
        console.error('初始化拉取历史日志失败', err);
      }
    }

    fetchInitialLogs();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. 建立 SSE 实时流连接
  useEffect(() => {
    setConnectionStatus('connecting');
    const es = new EventSource('/api/admin/logs/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionStatus('connected');
    };

    es.addEventListener('connected', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.level) setServerLevel(payload.level);
        setConnectionStatus('connected');
      } catch {
        // 忽略非 JSON 数据
      }
    });

    es.onmessage = (e: MessageEvent) => {
      try {
        const event: LogEvent = JSON.parse(e.data);
        if (!isPaused) {
          setLogs(prev => {
            const next = [...prev, event];
            // 保持前端最多 1500 条避免内存膨胀
            if (next.length > 1500) return next.slice(-1000);
            return next;
          });
        }
      } catch {
        // 忽略格式不合法数据
      }
    };

    es.onerror = () => {
      setConnectionStatus('disconnected');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isPaused]);

  // 3. 自动滚屏到底部 (严格限制在终端容器内部，杜绝影响外层页面滚动条)
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 4. 动态调整服务端全局输出级别
  const handleServerLevelChange = async (newLevel: LogLevel) => {
    if (isChangingLevel || newLevel === serverLevel) return;
    setIsChangingLevel(true);
    try {
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: newLevel }),
      });
      const data = await res.json();
      if (data.success) {
        setServerLevel(data.currentLevel);
      }
    } catch (err) {
      console.error('切换服务端日志级别失败', err);
    } finally {
      setIsChangingLevel(false);
    }
  };

  // 5. 客户端组合多维筛选
  const filteredLogs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return logs.filter(log => {
      // 级别过滤
      if (filterLevel !== 'ALL' && log.level.toLowerCase() !== filterLevel.toLowerCase()) {
        return false;
      }
      // 模块标签过滤
      if (filterTag !== 'ALL' && log.tag !== filterTag) {
        return false;
      }
      // 关键字搜索
      if (kw) {
        const inMsg = log.message.toLowerCase().includes(kw);
        const inTag = log.tag.toLowerCase().includes(kw);
        const inMeta = log.metadata ? JSON.stringify(log.metadata).toLowerCase().includes(kw) : false;
        if (!inMsg && !inTag && !inMeta) return false;
      }
      return true;
    });
  }, [logs, filterLevel, filterTag, keyword]);

  // 6. 清屏
  const handleClearLogs = () => {
    setLogs([]);
    setExpandedLogIdx(null);
  };

  // 7. 导出日志为文件
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) return;
    const content = filteredLogs.map(l => {
      const metaStr = l.metadata ? ` | Meta: ${JSON.stringify(l.metadata)}` : '';
      const durStr = l.duration_ms !== undefined ? ` (${l.duration_ms.toFixed(2)}ms)` : '';
      return `[${l.timestamp}] [${l.level.toUpperCase().padEnd(5)}] [${l.tag.padEnd(10)}] ${l.message}${durStr}${metaStr}`;
    }).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `normscale_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 顶部控制与工具操作栏 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3.5">
        
        {/* 第一行：状态指示灯、服务端日志级别动态切换与通用操作 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
          <div className="flex items-center gap-3">
            {/* 实时连接状态呼吸灯 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : connectionStatus === 'connecting'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[11px] font-medium text-on-surface-variant">
                {connectionStatus === 'connected'
                  ? 'SSE 实时流在线'
                  : connectionStatus === 'connecting'
                  ? '正在建立连接...'
                  : '连接已断开 (重连中)'}
              </span>
            </div>

            {/* 服务端全局输出级别配置 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">服务端输出级别:</span>
              <select
                value={serverLevel}
                disabled={isChangingLevel}
                onChange={e => handleServerLevelChange(e.target.value as LogLevel)}
                className="text-xs font-bold border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1 px-2 text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary cursor-pointer disabled:opacity-50"
                title="动态切换后端日志捕获与输出严重度门限"
              >
                <option value="debug">DEBUG (全量调试细节)</option>
                <option value="info">INFO (业务与性能耗时)</option>
                <option value="warn">WARN (仅告警与异常)</option>
                <option value="error">ERROR (仅严重错误)</option>
                <option value="silent">SILENT (静音休眠)</option>
              </select>
              {isChangingLevel && (
                <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>
              )}
            </div>
          </div>

          {/* 右侧动作按钮组 */}
          <div className="flex items-center gap-2">
            {/* 暂停/恢复流 */}
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isPaused
                  ? 'bg-amber-500/10 border-amber-300 text-amber-700 dark:text-amber-400'
                  : 'border-outline-variant/60 hover:bg-surface-container-high text-on-surface-variant'
              }`}
              title={isPaused ? '已暂停日志实时接收，点击恢复' : '点击暂停实时刷屏'}
            >
              <span className="material-symbols-outlined text-sm">
                {isPaused ? 'play_arrow' : 'pause'}
              </span>
              <span>{isPaused ? '恢复流' : '暂停流'}</span>
            </button>

            {/* 自动滚屏开关 */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                autoScroll
                  ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary-fixed-dim'
                  : 'border-outline-variant/60 hover:bg-surface-container-high text-on-surface-variant'
              }`}
              title="切换新日志到达时是否自动滚屏到底部"
            >
              <span className="material-symbols-outlined text-sm">
                {autoScroll ? 'vertical_align_bottom' : 'pan_tool'}
              </span>
              <span>自动滚动</span>
            </button>

            {/* 清屏 */}
            <button
              type="button"
              onClick={handleClearLogs}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-outline-variant/60 hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
              title="清空当前控制台中的显示日志"
            >
              <span className="material-symbols-outlined text-sm">mop</span>
              <span>清屏</span>
            </button>

            {/* 导出 */}
            <button
              type="button"
              onClick={handleExportLogs}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-container shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="导出当前筛选日志为文本文件"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>导出日志</span>
            </button>
          </div>
        </div>

        {/* 第二行：多维筛选器 (级别、模块标签、关键字搜索) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* 快速级别过滤器胶囊 */}
          <div className="md:col-span-4 flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {ALL_LEVELS.map(lvl => (
              <button
                key={lvl.value}
                type="button"
                onClick={() => setFilterLevel(lvl.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  filterLevel === lvl.value
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          {/* 模块标签下拉/过滤器 */}
          <div className="md:col-span-3 flex items-center gap-1.5">
            <span className="text-xs text-on-surface-variant whitespace-nowrap">模块:</span>
            <select
              value={filterTag}
              onChange={e => setFilterTag(e.target.value as LogModuleTag | 'ALL')}
              className="w-full border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low py-1 px-2 text-on-surface dark:text-surface-bright text-xs focus:outline-none focus:border-primary cursor-pointer font-sans"
            >
              {ALL_TAGS.map(tag => (
                <option key={tag} value={tag}>
                  {tag === 'ALL' ? '全部模块 (ALL)' : `[${tag}]`}
                </option>
              ))}
            </select>
          </div>

          {/* 关键词模糊搜索框 */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined text-base absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索日志描述、模块标签或元数据..."
              className="w-full pl-8 pr-7 py-1 text-xs border border-outline-variant/60 dark:border-border-dark rounded-lg bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="material-symbols-outlined text-sm absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 终端展示主视窗 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-slate-950 dark:bg-[#0b0f17] text-slate-200 overflow-hidden shadow-sm flex flex-col h-[560px]">
        
        {/* 视窗 Header 栏 */}
        <div className="px-4 py-2 bg-slate-900/90 dark:bg-[#111622] border-b border-slate-800 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">terminal</span>
            <span className="font-bold text-slate-100 tracking-wide">SYSTEM RUNTIME LOG STREAM</span>
            <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-sans tabular-nums">
              当前呈现: {filteredLogs.length} / 缓冲池: {logs.length} 条
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {isPaused && (
              <span className="text-amber-400 flex items-center gap-1 font-bold">
                <span className="material-symbols-outlined text-xs">pause_circle</span>
                <span>接收已挂起</span>
              </span>
            )}
            <span>点击每行右侧展开 JSON</span>
          </div>
        </div>

        {/* 日志内容滚动列表 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 font-sans text-[11px] leading-relaxed space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 select-none">
              <span className="material-symbols-outlined text-3xl opacity-50">data_array</span>
              <span>暂无匹配的运行日志</span>
              <span className="text-[10px] text-slate-600">
                可尝试调整筛选条件，或在工作台执行质检以激发领域流水线
              </span>
            </div>
          ) : (
            filteredLogs.map((log, idx) => {
              const levelUpper = log.level.toUpperCase();
              const levelStyle = LEVEL_BADGE_STYLE[log.level] || LEVEL_BADGE_STYLE.info;
              const tagStyle = TAG_BADGE_STYLE[log.tag] || TAG_BADGE_STYLE.SYSTEM;
              const isExpanded = expandedLogIdx === idx;
              const hasMetadata = Boolean(log.metadata && Object.keys(log.metadata).length > 0);

              return (
                <div
                  key={idx}
                  className={`group rounded p-1 transition-colors flex flex-col ${
                    isExpanded ? 'bg-slate-900/90 border border-slate-700' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {/* 行号 */}
                    <span className="text-slate-600 select-none w-8 text-right shrink-0">
                      {idx + 1}
                    </span>

                    {/* 时间戳 */}
                    <span className="text-slate-500 select-none shrink-0">
                      {formatTime(log.timestamp)}
                    </span>

                    {/* 级别标签 */}
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0 ${levelStyle}`}
                    >
                      {levelUpper}
                    </span>

                    {/* 模块标签 */}
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border shrink-0 ${tagStyle}`}
                    >
                      [{log.tag}]
                    </span>

                    {/* 耗时 (如果有) */}
                    {log.duration_ms !== undefined && (
                      <span className="text-amber-400/90 shrink-0 text-[10px] select-none">
                        ⏱ {log.duration_ms.toFixed(1)}ms
                      </span>
                    )}

                    {/* 日志消息正文 */}
                    <span className="text-slate-200 flex-1 break-all select-text font-sans text-xs">
                      {log.message}
                    </span>

                    {/* Metadata 展开/收起按钮 */}
                    {hasMetadata && (
                      <button
                        type="button"
                        onClick={() => setExpandedLogIdx(isExpanded ? null : idx)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0 ml-auto flex items-center gap-1 cursor-pointer"
                        title="展开/收起结构化上下文"
                      >
                        <span className="material-symbols-outlined text-xs">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                        <span>{isExpanded ? '收起详情' : '上下文'}</span>
                      </button>
                    )}
                  </div>

                  {/* 展开的结构化元数据 JSON 面板 */}
                  {isExpanded && log.metadata && (
                    <div className="mt-2 ml-10 p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] overflow-x-auto">
                      <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                        <span>结构化上下文元数据 (JSON)</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(log.metadata, null, 2))}
                          className="hover:text-primary transition-colors text-[9px]"
                        >
                          复制 JSON
                        </button>
                      </div>
                      <pre className="text-slate-300 font-sans text-[10px] whitespace-pre-wrap">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
