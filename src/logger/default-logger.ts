import fs from 'fs';
import path from 'path';
import { ILogger, IModuleLogger, ITraceCollector, LogEvent, LogLevel, LogModuleTag } from './logger.interface';
import { MemoryTraceCollector } from './trace-collector';

/** 日志级别严重度数值 (数值越小级别越低) */
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

/** ANSI 终端彩色转义码 */
const ANSI_COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  // 级别色彩
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

/** 模块标签专属高亮色彩映射 */
const TAG_COLORS: Record<LogModuleTag, string> = {
  EXTRACTOR: ANSI_COLORS.magenta,
  NORMALIZER: ANSI_COLORS.cyan,
  REPOSITORY: ANSI_COLORS.blue,
  ENGINE: ANSI_COLORS.green,
  WORKFLOW: ANSI_COLORS.bold + ANSI_COLORS.magenta,
  PERF: ANSI_COLORS.yellow,
  SYSTEM: ANSI_COLORS.gray,
};

/**
 * ============================================================================
 * NormScale 默认轻量领域日志器 (Default Domain Logger)
 * ============================================================================
 * 
 * 专注于工业质检场景的结构化自然语言输出与多色终端呈现。
 * 支持分级控制、模块隔离、子日志器绑定、内存审计轨迹关联与全局环形缓冲/实时广播。
 * ============================================================================
 */
export class DefaultDomainLogger implements ILogger {
  private currentLevel: LogLevel;
  private enableColors: boolean;

  /** 内存环形缓冲区固定上限 (保留最近 1000 条事件) */
  private static readonly MAX_BUFFER_SIZE = 1000;
  private ringBuffer: LogEvent[] = [];
  private listeners: Set<(event: LogEvent) => void> = new Set();

  constructor(options?: { level?: LogLevel; enableColors?: boolean }) {
    // 默认优先级: options.level > LOG_LEVEL 环境变量 > config.json 声明 > 默认 (info/silent)
    const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
    const isTestEnv = process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined';
    
    let configLevel: LogLevel | undefined;
    if (!isTestEnv && typeof window === 'undefined') {
      try {
        if (typeof fs !== 'undefined' && fs?.existsSync && typeof path !== 'undefined' && path?.join) {
          const configPath = path.join(process.cwd(), 'config.json');
          if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.logging?.level) {
              configLevel = parsed.logging.level;
            }
          }
        }
      } catch {
        // 容错不阻塞
      }
    }

    this.currentLevel = options?.level || envLevel || configLevel || (isTestEnv ? 'silent' : 'info');
    this.enableColors = options?.enableColors ?? (typeof process !== 'undefined' && !process.env.NO_COLOR);

    // 预填历史日志至环形缓冲 (仅在 Node 服务端环境)
    if (typeof window === 'undefined') {
      this.prefillBufferFromDisk();
    }
  }

  /** 从本地磁盘历史日志预填至内存环形缓冲 */
  private prefillBufferFromDisk(): void {
    if (typeof window !== 'undefined') return;
    if (process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined') return;
    try {
      if (typeof fs === 'undefined' || !fs?.existsSync || typeof path === 'undefined' || !path?.join) return;
      const logFile = path.join(process.cwd(), '.cache', 'logs', 'system.log');
      if (!fs.existsSync(logFile)) return;
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const recentLines = lines.slice(-200);
      for (const line of recentLines) {
        try {
          const parsed: LogEvent = JSON.parse(line);
          this.ringBuffer.push(parsed);
        } catch {
          // 忽略格式损坏的单行
        }
      }
    } catch {
      // 容错不阻塞
    }
  }

  /** 将日志事件持久追加至本地日志文件 (.cache/logs/system.log) */
  private appendLogToDisk(event: LogEvent): void {
    if (typeof window !== 'undefined') return;
    if (process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined') return;
    try {
      if (typeof fs === 'undefined' || !fs?.appendFileSync || typeof path === 'undefined' || !path?.join) return;
      const logDir = path.join(process.cwd(), '.cache', 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, 'system.log');
      fs.appendFileSync(logFile, JSON.stringify(event) + '\n', 'utf-8');
    } catch {
      // 容错处理，杜绝磁盘 IO 异常阻断业务流程
    }
  }

  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  /** 获取当前内存缓冲的所有历史日志 */
  public getBufferedLogs(): LogEvent[] {
    return [...this.ringBuffer];
  }

  /** 清空内存日志缓冲区 */
  public clearBufferedLogs(): void {
    this.ringBuffer = [];
  }

  /** 订阅实时日志事件广播 (用于 SSE 流式推送) */
  public subscribe(listener: (event: LogEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public debug(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    this.print('debug', tag, message, undefined, metadata);
  }

  public info(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    this.print('info', tag, message, undefined, metadata);
  }

  public warn(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    this.print('warn', tag, message, undefined, metadata);
  }

  public error(tag: LogModuleTag, message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    let errMsg = message;
    if (error instanceof Error) {
      errMsg += ' [错误详情: ' + error.message + ']';
    } else if (error) {
      errMsg += ' [错误: ' + String(error) + ']';
    }
    this.print('error', tag, errMsg, undefined, metadata);
  }

  public perf(tag: LogModuleTag, name: string, duration_ms: number, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const msg = name + ' 耗时 ' + duration_ms.toFixed(2) + 'ms';
    this.print('info', tag, msg, duration_ms, metadata);
  }

  public forTag(tag: LogModuleTag): IModuleLogger {
    return {
      tag,
      debug: (msg, meta) => this.debug(tag, msg, meta),
      info: (msg, meta) => this.info(tag, msg, meta),
      warn: (msg, meta) => this.warn(tag, msg, meta),
      error: (msg, err, meta) => this.error(tag, msg, err, meta),
      perf: (name, dur, meta) => this.perf(tag, name, dur, meta),
    };
  }

  public createTraceCollector(contextId?: string): ITraceCollector {
    return new MemoryTraceCollector(contextId);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.currentLevel];
  }

  private print(
    level: LogLevel,
    tag: LogModuleTag,
    message: string,
    duration_ms?: number,
    metadata?: Record<string, unknown>
  ): void {
    const isoTimestamp = new Date().toISOString();

    // 1. 构造结构化日志事件并存入环形缓冲区 (保留最近 1000 条)
    const logEvent: LogEvent = {
      timestamp: isoTimestamp,
      level,
      tag,
      message,
      duration_ms,
      metadata,
    };
    this.ringBuffer.push(logEvent);
    if (this.ringBuffer.length > DefaultDomainLogger.MAX_BUFFER_SIZE) {
      this.ringBuffer.shift();
    }

    // 追加写入本地磁盘持久日志文件
    this.appendLogToDisk(logEvent);

    // 2. 向所有活跃订阅监听器广播日志事件 (SSE)
    for (const listener of this.listeners) {
      try {
        listener(logEvent);
      } catch {
        // 捕获个别客户端监听器异常，避免影响核心日志流程
      }
    }

    // 3. 终端打印输出
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const levelUpper = level.toUpperCase().padEnd(5, ' ');
    const tagStr = '[' + tag + ']'.padEnd(12, ' ');

    let output = '';
    if (this.enableColors) {
      const tagColor = TAG_COLORS[tag] || ANSI_COLORS.cyan;
      let levelColor = ANSI_COLORS.green;
      if (level === 'warn') levelColor = ANSI_COLORS.yellow;
      if (level === 'error') levelColor = ANSI_COLORS.red;
      if (level === 'debug') levelColor = ANSI_COLORS.gray;

      output =
        ANSI_COLORS.gray + timeStr + ANSI_COLORS.reset + ' ' +
        levelColor + levelUpper + ANSI_COLORS.reset + ' ' +
        tagColor + tagStr + ANSI_COLORS.reset + ' ' +
        message;
    } else {
      output = timeStr + ' ' + levelUpper + ' ' + tagStr + ' ' + message;
    }

    if (duration_ms !== undefined) {
      output += ' (' + duration_ms.toFixed(2) + 'ms)';
    }
    if (metadata && Object.keys(metadata).length > 0) {
      output += ' ' + JSON.stringify(metadata);
    }

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}
