import { describe, it, expect, vi } from 'vitest';
import { DefaultDomainLogger } from '@/logger/default-logger';

describe('DefaultDomainLogger 领域日志器测试', () => {
  it('支持日志级别过滤与动态调整', () => {
    const logger = new DefaultDomainLogger({ level: 'warn', enableColors: false });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 在 warn 级别下，debug 和 info 不应输出
    logger.debug('ENGINE', '这是一条调试信息');
    logger.info('ENGINE', '这是一条普通业务信息');
    expect(logSpy).not.toHaveBeenCalled();

    // warn 级别应输出
    logger.warn('ENGINE', '这是一条警告信息');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 动态调整为 debug 级别
    logger.setLevel('debug');
    logger.debug('ENGINE', '现在可以输出调试信息');
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('支持模块子日志器 forTag 绑定与调用', () => {
    const logger = new DefaultDomainLogger({ level: 'info', enableColors: false });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const engineLogger = logger.forTag('ENGINE');
    expect(engineLogger.tag).toBe('ENGINE');

    engineLogger.info('规则核验已启动');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[ENGINE]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('规则核验已启动'));

    logSpy.mockRestore();
  });

  it('支持异常错误与附加元数据序列化', () => {
    const logger = new DefaultDomainLogger({ level: 'error', enableColors: false });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const testError = new Error('网络超时');
    logger.error('EXTRACTOR', '远程提取失败', testError, { retryCount: 3 });

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('网络超时'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('"retryCount":3'));

    errSpy.mockRestore();
  });
});
