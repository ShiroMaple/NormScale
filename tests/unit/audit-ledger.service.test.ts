import { describe, it, expect } from 'vitest';
import { globalAuditLedgerService } from '@/services/audit-ledger.service';

describe('AuditLedgerService - 历史检验台账仓储服务', () => {
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
