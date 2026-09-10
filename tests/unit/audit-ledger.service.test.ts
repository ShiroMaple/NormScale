import { describe, it, expect, beforeAll } from 'vitest';
import { globalAuditLedgerService } from '@/services/audit-ledger.service';
import type { InspectionSession } from '@/types/session.ts';

describe('AuditLedgerService - 历史检验台账仓储服务', () => {
  beforeAll(() => {
    const list = globalAuditLedgerService.listSessions();
    if (list.length === 0) {
      const fixtureSession: InspectionSession = {
        sessionId: 'SESS-FIXTURE-CI-INIT',
        createdAt: '2026-09-08 12:00:00',
        title: 'CI环境预热会话 · 共 1 份文档检验',
        totalDocuments: 1,
        totalBatches: 1,
        passedBatches: 1,
        failedBatches: 0,
        hitlBatches: 0,
        documents: [
          {
            docId: 'doc_fixture_01',
            md5: '8d566b296d4110c544e8bd1b6b6136d5',
            filename: '测试质保书1.pdf',
            fileSize: '0.17 MB',
            uploadTime: '2026-09-08 12:00:00',
            ocrStatus: 'DONE',
            pageCount: 1,
            batches: [
              {
                batchNo: 'Z26022C-DB7',
                subBatchIndex: 1,
                grade: 'S32168',
                standard: 'NB/T47019.5-2021',
                supplier: '镇海石化建安工程股份有限公司制管厂',
                dimensions: 'OD 15.0mm × WT 0.8mm',
                heatNo: 'YX2602-2207',
                verdict: 'PASS',
                verdictSummary: '全景规则比对 22 项全项合规',
                ocrConfidence: 95,
                gradeMatchConfidence: 99,
                chemical: [
                  { element: 'C', value: '0.018', confidence: '99%', status: 'ok' },
                ],
                mechanical: { tensile_rm: '621', yield_rp02: '289', elongation_a: '48.5' },
                process: { flattening: 'PASS', intergranularCorrosion: 'PASS', ndt: 'PASS' },
                reportNo: 'QA-20260902-001',
                sha256Hash: 'test_hash_123',
                inspector: 'QC-Engineer',
              },
            ],
          },
        ],
      };
      globalAuditLedgerService.saveSession(fixtureSession);
    }
  });

  it('应当能正常扫描真实归档目录并提取轻量树状摘要列表', () => {
    const list = globalAuditLedgerService.listSessions();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const first = list[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(first.sessionId).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.createdAt).toBeDefined();
    expect(Array.isArray(first.documents)).toBe(true);
    expect(Array.isArray(first.grades)).toBe(true);
    expect(Array.isArray(first.standards)).toBe(true);

    if (first.documents.length > 0) {
      const firstDoc = first.documents[0];
      expect(firstDoc).toBeDefined();
      if (!firstDoc) return;

      expect(firstDoc.docId).toBeDefined();
      expect(firstDoc.filename).toBeDefined();
      expect(Array.isArray(firstDoc.batches)).toBe(true);

      if (firstDoc.batches.length > 0) {
        const firstBatch = firstDoc.batches[0];
        expect(firstBatch).toBeDefined();
        if (!firstBatch) return;

        expect(firstBatch.batchKey).toBeDefined();
        expect(firstBatch.grade).toBeDefined();
        expect(firstBatch.standard).toBeDefined();
      }
    }
  });

  it('应当能根据存在的 SessionId 检索出完整的一级会话对象', () => {
    const list = globalAuditLedgerService.listSessions();
    expect(list.length).toBeGreaterThan(0);

    const targetId = list[0]?.sessionId;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    const fullSession = globalAuditLedgerService.getSession(targetId);

    expect(fullSession).not.toBeNull();
    expect(fullSession?.sessionId).toBe(targetId);
    expect(fullSession?.documents).toBeDefined();
  });
});
