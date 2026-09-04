import { describe, it, expect } from 'vitest';
import {
  resolveFinalDisposition,
  getDispositionBadgeMeta,
} from '@/engine/dual-track-verdict';

describe('DualTrackVerdict 双轨制放行仲裁矩阵测试', () => {
  it('PASS + null: 默认采纳系统合格结论，无缝流转放行 (RELEASE)', () => {
    const decision = resolveFinalDisposition('PASS', null);
    expect(decision.disposition).toBe('RELEASE');
    expect(decision.isReleasePermitted).toBe(true);
    expect(decision.isConcession).toBe(false);
    expect(decision.effectiveVerdict).toBe('PASS');
    expect(decision.statusLabel).toContain('系统算法放行');
  });

  it('PASS + PASS: 人机双重背书核准放行 (RELEASE_VERIFIED)', () => {
    const decision = resolveFinalDisposition('PASS', 'PASS');
    expect(decision.disposition).toBe('RELEASE_VERIFIED');
    expect(decision.isReleasePermitted).toBe(true);
    expect(decision.isConcession).toBe(false);
    expect(decision.effectiveVerdict).toBe('PASS');
    expect(decision.statusLabel).toContain('人机双重核准');
  });

  it('PASS + REJECT: 质检员一票否决拒收 (REJECTED_BY_HUMAN)', () => {
    const decision = resolveFinalDisposition('PASS', 'REJECT', '现场实物端部存在机械划痕磕碰');
    expect(decision.disposition).toBe('REJECTED_BY_HUMAN');
    expect(decision.isReleasePermitted).toBe(false);
    expect(decision.effectiveVerdict).toBe('FAIL');
    expect(decision.auditExplanation).toContain('机械划痕磕碰');
  });

  it('FAIL + null: 系统一票否决，自动阻断拦截 (REJECTED_BY_SYSTEM)', () => {
    const decision = resolveFinalDisposition('FAIL', null);
    expect(decision.disposition).toBe('REJECTED_BY_SYSTEM');
    expect(decision.isReleasePermitted).toBe(false);
    expect(decision.effectiveVerdict).toBe('FAIL');
    expect(decision.statusLabel).toContain('系统一票否决拦截');
  });

  it('FAIL + REJECT: 人机双重确认不合格 (REJECTED_BY_SYSTEM / REJECT_CONFIRMED)', () => {
    const decision = resolveFinalDisposition('FAIL', 'REJECT', '理化指标超标且复检不合格');
    expect(decision.isReleasePermitted).toBe(false);
    expect(decision.effectiveVerdict).toBe('FAIL');
    expect(decision.statusLabel).toContain('人机双重确认拒收');
  });

  it('FAIL + PASS: 特批让步放行 (CONCESSION_RELEASE，附带特批放行编号/依据)', () => {
    const decision = resolveFinalDisposition('FAIL', 'PASS', '依据采购部《特批让步接收备忘录 2026-088》放行');
    expect(decision.disposition).toBe('CONCESSION_RELEASE');
    expect(decision.isReleasePermitted).toBe(true);
    expect(decision.isConcession).toBe(true);
    expect(decision.effectiveVerdict).toBe('PASS');
    expect(decision.statusLabel).toContain('特批让步放行');
    expect(decision.auditExplanation).toContain('特批让步接收备忘录 2026-088');
  });

  it('MANUAL_REVIEW: 无论人工是否签认，均处于待人机协同态 (PENDING_REVIEW)', () => {
    const decision1 = resolveFinalDisposition('MANUAL_REVIEW', null);
    expect(decision1.disposition).toBe('PENDING_REVIEW');
    expect(decision1.isReleasePermitted).toBe(false);

    const decision2 = resolveFinalDisposition('MANUAL_REVIEW', 'PASS');
    expect(decision2.disposition).toBe('PENDING_REVIEW');
    expect(decision2.isReleasePermitted).toBe(false);
  });

  it('getDispositionBadgeMeta: 返回符合规范的 UI 徽章元数据', () => {
    const b1 = getDispositionBadgeMeta('RELEASE_VERIFIED');
    expect(b1.badgeClass).toContain('emerald');
    expect(b1.icon).toBe('verified');

    const b2 = getDispositionBadgeMeta('CONCESSION_RELEASE');
    expect(b2.badgeClass).toContain('purple');
    expect(b2.icon).toBe('assignment_turned_in');

    const b3 = getDispositionBadgeMeta('REJECTED_BY_HUMAN');
    expect(b3.badgeClass).toContain('rose');
    expect(b3.icon).toBe('gavel');
  });
});
