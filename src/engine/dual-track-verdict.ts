/**
 * ============================================================================
 * 双轨制判定与放行仲裁矩阵 (Auditable Dual-Track Verdict & Release Arbitration Matrix)
 * ============================================================================
 * 
 * 规范依据：cairn/dual-track-verdict.md
 * 核心铁律：
 * 1. 系统客观计算判定（System Verdict）基于算法与国家标准切片，绝对不可被覆盖或篡改；
 * 2. 质检工程师人工复核（Human Verdict）作为终审特批或复验把关层独立并行；
 * 3. 最终流转处置（Final Disposition）由两者的笛卡尔乘积通过放行仲裁矩阵严格推导。
 * ============================================================================
 */

export type SystemVerdict = 'PASS' | 'FAIL' | 'MANUAL_REVIEW';

export type HumanVerdict = 'PASS' | 'REJECT' | 'WAIVED' | null | undefined;

export type FinalDisposition =
  | 'RELEASE'              // PASS + null: 默认采纳系统合格结论，无缝流转放行
  | 'RELEASE_VERIFIED'     // PASS + PASS: 算法与人工双重背书的放行
  | 'REJECTED_BY_HUMAN'    // PASS + REJECT: 质检员基于现场实物/包装一票否决
  | 'REJECTED_BY_SYSTEM'   // FAIL + null: 系统一票否决，自动拦截
  | 'REJECT_CONFIRMED'     // FAIL + REJECT: 人机双重确认不合格
  | 'CONCESSION_RELEASE'   // FAIL + PASS/WAIVED: 附带特批批注的让步放行
  | 'PENDING_REVIEW';      // MANUAL_REVIEW: 待人工协同仲裁

export interface ArbitrationDecision {
  /** 最终流转处置代号 */
  disposition: FinalDisposition;
  /** 状态展示文案 (如 "准予放行", "特批让步放行", "系统自动拦截") */
  statusLabel: string;
  /** 详细审计与流转说明 */
  auditExplanation: string;
  /** 是否准予下游生产放行或出具合格报告 */
  isReleasePermitted: boolean;
  /** 是否属于让步特批放行 (Concession) */
  isConcession: boolean;
  /** 兼容老版本统一 verdict 映射 ('PASS' | 'FAIL' | 'MANUAL_REVIEW') */
  effectiveVerdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
}

/**
 * 终审放行仲裁核心推导函数 (Release Arbitration Matrix Resolver)
 * 
 * 严格按照 cairn/dual-track-verdict.md 仲裁表执行决策推导
 */
export function resolveFinalDisposition(
  systemVerdict: SystemVerdict,
  humanVerdict?: HumanVerdict,
  humanVerdictSummary?: string
): ArbitrationDecision {
  // 1. 系统判定为 MANUAL_REVIEW (HITL 待定)，无论人工是否签认，均处于 PENDING_REVIEW 待仲裁态
  if (systemVerdict === 'MANUAL_REVIEW') {
    return {
      disposition: 'PENDING_REVIEW',
      statusLabel: '待人机协同消歧',
      auditExplanation: '系统指标存在语义歧义或条件待核实，须在人机协同抽屉中完成仲裁',
      isReleasePermitted: false,
      isConcession: false,
      effectiveVerdict: 'MANUAL_REVIEW',
    };
  }

  // 2. 系统判定为 PASS (全项指标合规)
  if (systemVerdict === 'PASS') {
    if (!humanVerdict) {
      // 2.1 未人工签认：默认采纳客观合格结论放行
      return {
        disposition: 'RELEASE',
        statusLabel: '系统算法放行',
        auditExplanation: '系统算法判定全项合规，质检工程师未签认异议，采纳系统合格结论自动放行',
        isReleasePermitted: true,
        isConcession: false,
        effectiveVerdict: 'PASS',
      };
    }

    if (humanVerdict === 'PASS') {
      // 2.2 人机双重通过
      return {
        disposition: 'RELEASE_VERIFIED',
        statusLabel: '人机双重核准放行',
        auditExplanation: '系统算法判定全项指标合格，且经质检工程师人工终审复核签认通过',
        isReleasePermitted: true,
        isConcession: false,
        effectiveVerdict: 'PASS',
      };
    }

    if (humanVerdict === 'REJECT') {
      // 2.3 人工一票否决 (如现场破损、包装受潮等非标项拒收)
      return {
        disposition: 'REJECTED_BY_HUMAN',
        statusLabel: '质检员人工拒收',
        auditExplanation: humanVerdictSummary
          ? `系统指标合格，但质检工程师因现场非标原因一票否决拒收：${humanVerdictSummary}`
          : '系统指标合格，但质检工程师在终审环节予以一票否决拒收',
        isReleasePermitted: false,
        isConcession: false,
        effectiveVerdict: 'FAIL',
      };
    }

    // WAIVED 容错处理
    return {
      disposition: 'RELEASE_VERIFIED',
      statusLabel: '人机双重核准放行',
      auditExplanation: '质检工程师签认豁免通过',
      isReleasePermitted: true,
      isConcession: false,
      effectiveVerdict: 'PASS',
    };
  }

  // 3. 系统判定为 FAIL (存在指标超标或强制项漏检)
  if (systemVerdict === 'FAIL') {
    if (!humanVerdict) {
      // 3.1 未人工特批：系统一票否决，坚决阻断
      return {
        disposition: 'REJECTED_BY_SYSTEM',
        statusLabel: '系统一票否决拦截',
        auditExplanation: '系统算法客观计算发现存在指标不合规或强制项漏检，系统拦截阻断放行',
        isReleasePermitted: false,
        isConcession: false,
        effectiveVerdict: 'FAIL',
      };
    }

    if (humanVerdict === 'REJECT') {
      // 3.2 人机双重确认不合格
      return {
        disposition: 'REJECTED_BY_SYSTEM', // 或 REJECT_CONFIRMED
        statusLabel: '人机双重确认拒收',
        auditExplanation: humanVerdictSummary
          ? `系统与质检工程师一致确认不合格，出具拒收说明：${humanVerdictSummary}`
          : '系统与质检工程师一致确认不合格，予以拒收',
        isReleasePermitted: false,
        isConcession: false,
        effectiveVerdict: 'FAIL',
      };
    }

    if (humanVerdict === 'PASS' || humanVerdict === 'WAIVED') {
      // 3.3 质检工程师特批放行 (让步接收 Concession Release)
      const reason = humanVerdictSummary || '质检工程师依实物复验或让步协议签署特批放行';
      return {
        disposition: 'CONCESSION_RELEASE',
        statusLabel: '特批让步放行',
        auditExplanation: `【重要特批审计】系统算法判定不达标，质检工程师依据让步协议或复验予以特批放行。特批依据：${reason}`,
        isReleasePermitted: true,
        isConcession: true,
        effectiveVerdict: 'PASS',
      };
    }
  }

  // 兜底防御
  return {
    disposition: 'REJECTED_BY_SYSTEM',
    statusLabel: '不合格拦截',
    auditExplanation: '未知判定组合，系统出于特种设备安全要求默认拦截',
    isReleasePermitted: false,
    isConcession: false,
    effectiveVerdict: 'FAIL',
  };
}

/**
 * 获取流转处置徽章样式元数据 (适用于工作台、报告预览与审批流)
 */
export function getDispositionBadgeMeta(disposition: FinalDisposition): {
  label: string;
  badgeClass: string;
  icon: string;
} {
  switch (disposition) {
    case 'RELEASE_VERIFIED':
      return {
        label: '双重核准放行',
        badgeClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        icon: 'verified',
      };
    case 'RELEASE':
      return {
        label: '准予放行 (PASS)',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        icon: 'check_circle',
      };
    case 'CONCESSION_RELEASE':
      return {
        label: '特批让步放行',
        badgeClass: 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700 font-black',
        icon: 'assignment_turned_in',
      };
    case 'REJECTED_BY_HUMAN':
      return {
        label: '质检员拒收 (REJECT)',
        badgeClass: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-black',
        icon: 'gavel',
      };
    case 'REJECT_CONFIRMED':
    case 'REJECTED_BY_SYSTEM':
      return {
        label: '不合格拒收 (FAIL)',
        badgeClass: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800 font-bold',
        icon: 'cancel',
      };
    case 'PENDING_REVIEW':
    default:
      return {
        label: '待人工协同消歧',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        icon: 'pending',
      };
  }
}
