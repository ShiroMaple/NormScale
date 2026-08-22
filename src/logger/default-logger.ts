import { ILogger, IModuleLogger, ITraceCollector, LogLevel, LogModuleTag } from './logger.interface';
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
 * 支持分级控制、模块隔离、子日志器绑定与内存审计轨迹关联。
 * ============================================================================
 */
export class DefaultDomainLogger implements ILogger {
  private currentLevel: LogLevel;
  private enableColors: boolean;

  constructor(options?: { level?: LogLevel; enableColors?: boolean }) {
    // 默认从环境变量 LOG_LEVEL 读取，单测环境下默认为 warn 避免测试刷屏
    const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
    const isTestEnv = process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined';
    
    this.currentLevel = options?.level || envLevel || (isTestEnv ? 'silent' : 'info');
    this.enableColors = options?.enableColors ?? (typeof process !== 'undefined' && !process.env.NO_COLOR);
  }

  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  public getLevel(): LogLevel {
    return this.currentLevel;
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
