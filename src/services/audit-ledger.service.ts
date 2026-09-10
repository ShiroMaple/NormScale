import fs from 'fs';
import path from 'path';
import { InspectionSession } from '@/types/session.ts';
import { logger } from '@/logger/index.ts';

export interface AuditBatchSummary {
  batchKey: string;
  batchNo: string;
  heatNo?: string;
  subBatchIndex: number;
  certificateNo?: string;
  grade: string;
  standard: string;
  supplier?: string;
  dimensions?: string;
  verdict: string;
  systemVerdict?: string;
  humanVerdict?: string | null;
  humanVerdictSummary?: string;
  humanVerifiedAt?: string;
  reportNo?: string;
  sha256Hash?: string;
  inspector?: string;
  hasHitlCorrection?: boolean;
  hitlReason?: string;
  summaryStats?: {
    passCount: number;
    failCount: number;
    missingCount: number;
    totalRules: number;
  };
}

export interface AuditDocSummary {
  docId: string;
  filename: string;
  fileSize: string;
  pageCount: number;
  uploadTime?: string;
  ocrStatus?: string;
  batches: AuditBatchSummary[];
}

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
  grades: string[];
  standards: string[];
  suppliers: string[];
  documents: AuditDocSummary[];
}

import { parseStandards } from '@/utils/standard-parser';
export { parseStandards };

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
   * 包含两层轻量骨架：Session ➔ Document ➔ Batch，并聚合牌号、标准与供货厂家集合
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
              const gradeSet = new Set<string>();
              const standardSet = new Set<string>();
              const supplierSet = new Set<string>();

              const docSummaries: AuditDocSummary[] = (data.documents || []).map((doc: any, dIdx: number) => {
                const docId = doc.docId || `doc_${dIdx + 1}`;
                const batchSummaries: AuditBatchSummary[] = (doc.batches || []).map((b: any, bIdx: number) => {
                  const bNo = b.batchNo || '';
                  const hNo = b.heatNo || '';
                  const subIdx = typeof b.subBatchIndex === 'number' ? b.subBatchIndex : (bIdx + 1);
                  const batchKey = `${docId}_${bNo || hNo || 'SPECIMEN'}_${subIdx}`;

                  if (b.grade && b.grade.trim()) gradeSet.add(b.grade.trim());
                  if (b.standard) {
                    parseStandards(b.standard).forEach(std => standardSet.add(std));
                  }
                  if (b.supplier && b.supplier.trim()) supplierSet.add(b.supplier.trim());

                  const reportSummary = b.auditReport?.summary;
                  const summaryStats = reportSummary ? {
                    passCount: reportSummary.pass_count ?? 0,
                    failCount: reportSummary.fail_count ?? 0,
                    missingCount: reportSummary.missing_count ?? 0,
                    totalRules: reportSummary.total_rules_evaluated ?? 0,
                  } : undefined;

                  const hasHitl = Boolean(b.hitlFieldCorrection || b.hitlCorrection || b.hitlReason);

                  return {
                    batchKey,
                    batchNo: bNo,
                    heatNo: hNo || undefined,
                    subBatchIndex: subIdx,
                    certificateNo: b.certificateNo || undefined,
                    grade: b.grade || '未识别牌号',
                    standard: b.standard || '未指定标准',
                    supplier: b.supplier || undefined,
                    dimensions: b.dimensions || undefined,
                    verdict: b.verdict || 'UNAUDITED',
                    systemVerdict: b.systemVerdict || b.verdict || 'UNAUDITED',
                    humanVerdict: b.humanVerdict ?? null,
                    humanVerdictSummary: b.humanVerdictSummary || undefined,
                    humanVerifiedAt: b.humanVerifiedAt || undefined,
                    reportNo: b.reportNo || undefined,
                    sha256Hash: b.sha256Hash || undefined,
                    inspector: b.inspector || undefined,
                    hasHitlCorrection: hasHitl,
                    hitlReason: b.hitlReason || undefined,
                    summaryStats,
                  };
                });

                return {
                  docId,
                  filename: doc.filename || `未命名文档_${dIdx + 1}.pdf`,
                  fileSize: doc.fileSize || '--',
                  pageCount: doc.pageCount || 1,
                  uploadTime: doc.uploadTime || undefined,
                  ocrStatus: doc.ocrStatus || 'DONE',
                  batches: batchSummaries,
                };
              });

              summaries.push({
                sessionId: data.sessionId,
                createdAt: data.createdAt || new Date().toISOString(),
                title: data.title || `检验会话 ${data.sessionId}`,
                totalDocuments: data.totalDocuments || docSummaries.length || 0,
                totalBatches: data.totalBatches || docSummaries.reduce((sum, d) => sum + d.batches.length, 0),
                passedBatches: data.passedBatches ?? docSummaries.reduce((sum, d) => sum + d.batches.filter(b => b.verdict === 'PASS').length, 0),
                failedBatches: data.failedBatches ?? docSummaries.reduce((sum, d) => sum + d.batches.filter(b => b.verdict === 'FAIL').length, 0),
                hitlBatches: data.hitlBatches ?? docSummaries.reduce((sum, d) => sum + d.batches.filter(b => b.hasHitlCorrection || b.verdict === 'MANUAL_REVIEW').length, 0),
                savedAt: data.savedAt || data.createdAt || new Date().toISOString(),
                grades: Array.from(gradeSet),
                standards: Array.from(standardSet),
                suppliers: Array.from(supplierSet),
                documents: docSummaries,
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
