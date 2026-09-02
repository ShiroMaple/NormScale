import fs from 'fs';
import path from 'path';
import { InspectionSession } from '@/types/session.ts';
import { logger } from '@/logger/index.ts';

export interface AuditSessionSummary {
  sessionId: string;
  createdAt: string;
  title: string;
  totalDocuments: number;
  totalBatches: number;
  passedBatches: number;
  failedBatches: number;
  hitlBatches: number;
  savedAt: string;
}

export class AuditLedgerService {
  private ledgerDir: string;

  constructor(customDir?: string) {
    this.ledgerDir = customDir || path.join(process.cwd(), '.cache', 'audit');
  }

  private ensureDirExists(): void {
    if (!fs.existsSync(this.ledgerDir)) {
      fs.mkdirSync(this.ledgerDir, { recursive: true });
    }
  }

  private getFilePath(sessionId: string): string {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.ledgerDir, `${safeId}.json`);
  }

  /**
   * 将质检作业会话持久化存入服务端正式台账 JSON 仓库
   * 严格要求：彻底剥离庞大的 Base64 切图，只保留纯结构化理化数据、人工复核判定结论与 MD5 指针
   */
  public saveSession(session: InspectionSession): { success: boolean; sessionId: string; filePath: string } {
    if (!session || !session.sessionId) {
      throw new Error('无效的会话数据：缺少 sessionId');
    }

    this.ensureDirExists();

    // 1. 深拷贝并剥离庞大的 Base64 客户端切图
    const sanitizedDocuments = session.documents.map(doc => {
      const { pages, samplePages, ...rest } = doc;
      // 若 pages 包含外部 HTTP 链接或服务器静态路径则保留，若为 data:image base64 则剥离
      const sanitizedPages = pages?.map((p, idx) => {
        if (p.startsWith('data:image')) {
          // 替换为服务端标准预处理资源指针
          return doc.md5 ? `/api/documents/preprocess?md5=${doc.md5}&page=${idx + 1}` : '';
        }
        return p;
      }).filter(Boolean);

      return {
        ...rest,
        pages: sanitizedPages && sanitizedPages.length > 0 ? sanitizedPages : undefined,
      };
    });

    const recordToSave = {
      ...session,
      savedAt: new Date().toISOString(),
      documents: sanitizedDocuments,
    };

    const filePath = this.getFilePath(session.sessionId);
    fs.writeFileSync(filePath, JSON.stringify(recordToSave, null, 2), 'utf-8');
    logger.info('REPOSITORY', `[AuditLedgerService] 成功持久化保存台账记录 [${session.sessionId}] 至 ${filePath}`);

    return {
      success: true,
      sessionId: session.sessionId,
      filePath,
    };
  }

  /**
   * 按 SessionId 检索单条台账完整记录
   */
  public getSession(sessionId: string): InspectionSession | null {
    if (!sessionId) return null;
    try {
      const filePath = this.getFilePath(sessionId);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as InspectionSession;
    } catch (err) {
      logger.error('REPOSITORY', `[AuditLedgerService] 读取台账记录失败 (${sessionId}): ${err}`);
      return null;
    }
  }

  /**
   * 列出所有已归档台账的轻量摘要列表（用于历史台账页面展示）
   */
  public listSessions(): AuditSessionSummary[] {
    if (!fs.existsSync(this.ledgerDir)) return [];
    try {
      const files = fs.readdirSync(this.ledgerDir);
      const summaries: AuditSessionSummary[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(this.ledgerDir, file), 'utf-8');
            const data = JSON.parse(raw);
            if (data && data.sessionId) {
              summaries.push({
                sessionId: data.sessionId,
                createdAt: data.createdAt || new Date().toISOString(),
                title: data.title || `检验会话 ${data.sessionId}`,
                totalDocuments: data.totalDocuments || data.documents?.length || 0,
                totalBatches: data.totalBatches || 0,
                passedBatches: data.passedBatches || 0,
                failedBatches: data.failedBatches || 0,
                hitlBatches: data.hitlBatches || 0,
                savedAt: data.savedAt || data.createdAt || new Date().toISOString(),
              });
            }
          } catch {
            // 忽略损坏文件
          }
        }
      }

      // 按保存时间倒序
      return summaries.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    } catch (err) {
      logger.error('REPOSITORY', `[AuditLedgerService] 读取台账列表失败: ${err}`);
      return [];
    }
  }

  /**
   * 删除指定的台账归档
   */
  public deleteSession(sessionId: string): boolean {
    if (!sessionId) return false;
    try {
      const filePath = this.getFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('REPOSITORY', `[AuditLedgerService] 成功删除台账 [${sessionId}]`);
        return true;
      }
      return false;
    } catch (err) {
      logger.error('REPOSITORY', `[AuditLedgerService] 删除台账异常 (${sessionId}): ${err}`);
      return false;
    }
  }
}

export const globalAuditLedgerService = new AuditLedgerService();
