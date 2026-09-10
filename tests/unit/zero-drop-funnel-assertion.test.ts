import { describe, it, expect } from 'vitest';

/**
 * 模拟步骤 2 实测项向步骤 3 合规比对矩阵映射的纯函数契约
 */
interface ExtractItem {
  key: string;
  name: string;
  category: string;
  value: string;
}

interface ComplianceMatrixItem {
  id: string;
  property_key: string;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'INFO';
  isMissing?: boolean;
  isTraceMeta?: boolean;
  ruleBasis: string;
}

/**
 * 契约评估器：验证数据漏斗零丢失与数量差额平衡恒等式
 */
function evaluateDataFunnelAssertions(params: {
  step2Items: ExtractItem[];
  step3Items: ComplianceMatrixItem[];
}) {
  const { step2Items, step3Items } = params;

  // 1. 零丢失检验：步骤 2 的每个实测项，在步骤 3 中必须有对应匹配
  const missingInStep3: ExtractItem[] = [];
  for (const extract of step2Items) {
    const matched = step3Items.find(
      c => c.property_key === extract.key || c.name === extract.name || c.id.includes(extract.key)
    );
    if (!matched) {
      missingInStep3.push(extract);
    }
  }

  // 2. 数量差额平衡计算
  const missingCount = step3Items.filter(i => i.isMissing).length;
  const traceCount = step3Items.filter(i => i.isTraceMeta).length;
  const alignedCount = step3Items.filter(i => !i.isMissing && !i.isTraceMeta).length;

  const totalStep3Count = step3Items.length;
  const isEquationBalanced = totalStep3Count === (alignedCount + missingCount + traceCount);

  return {
    isZeroDrop: missingInStep3.length === 0,
    missingInStep3,
    missingCount,
    traceCount,
    alignedCount,
    totalStep3Count,
    isEquationBalanced,
  };
}

describe('数据流转漏斗契约测试：零丢失断言与差额平衡恒等式 (Zero-Drop Funnel Assertion)', () => {
  it('断言 1: 实测项零丢弃测试 —— 步骤 2 提取的所有化学、力学、工艺与长尾项，在步骤 3 均有明确归宿', () => {
    // 模拟测试质保书 1 的步骤 2 实测项 (18 项)
    const step2Extracts: ExtractItem[] = [
      { key: 'C', name: 'C', category: 'chemical', value: '0.018' },
      { key: 'Si', name: 'Si', category: 'chemical', value: '0.44' },
      { key: 'Mn', name: 'Mn', category: 'chemical', value: '1.16' },
      { key: 'P', name: 'P', category: 'chemical', value: '0.035' },
      { key: 'S', name: 'S', category: 'chemical', value: '0.005' },
      { key: 'Cr', name: 'Cr', category: 'chemical', value: '17.41' },
      { key: 'Ni', name: 'Ni', category: 'chemical', value: '9.08' },
      { key: 'Ti', name: 'Ti', category: 'chemical', value: '0.14' },
      { key: 'N', name: 'N', category: 'chemical', value: '<0.01' },
      { key: 'tensile_rm', name: '抗拉强度 Rm', category: 'mechanical', value: '621' },
      { key: 'yield_rp02', name: '规定塑性延伸强度 Rp0.2', category: 'mechanical', value: '268' },
      { key: 'elongation_a', name: '断后伸长率 A', category: 'mechanical', value: '57.5' },
      { key: 'hardness', name: '硬度', category: 'mechanical', value: '143' },
      { key: 'grain_size', name: '晶粒度', category: 'metallographic', value: '6.5' },
      { key: 'flaring', name: '扩口试验', category: 'process', value: '合格' },
      { key: 'flattening', name: '压扁试验', category: 'process', value: '合格' },
      { key: 'ndt_et', name: '涡流探伤', category: 'ndt', value: '合格' },
      { key: 'ndt_ut', name: '超声探伤', category: 'ndt', value: '合格' },
    ];

    // 模拟步骤 3 比对矩阵 (包含 18 项实测对齐 + 1 项标准强制缺漏检 + 2 项工程元数据追溯 = 共 21 项)
    const step3Matrix: ComplianceMatrixItem[] = [
      ...step2Extracts.map(e => ({
        id: `rule_${e.key}`,
        property_key: e.key,
        name: e.name,
        category: e.category,
        status: 'PASS' as const,
        ruleBasis: '实测符合标准要求',
      })),
      // 场景 1：标准要求但原单未检的缺项
      {
        id: 'rule_intergranular_corrosion',
        property_key: 'intergranular_corrosion',
        name: '晶间腐蚀试验',
        category: 'corrosion',
        status: 'FAIL' as const,
        isMissing: true,
        ruleBasis: '标准强制要求，质保书未申报 (缺项漏检)',
      },
      // 场景 2：工程施工号与炉号追溯
      {
        id: 'custom_construction_no',
        property_key: 'construction_no',
        name: '施工工程号',
        category: 'additional',
        status: 'INFO' as const,
        isTraceMeta: true,
        ruleBasis: '原材料工程追踪',
      },
      {
        id: 'custom_heat_no',
        property_key: 'heat_no',
        name: '熔炼炉号',
        category: 'additional',
        status: 'INFO' as const,
        isTraceMeta: true,
        ruleBasis: '熔炼炉次追溯',
      },
    ];

    const result = evaluateDataFunnelAssertions({
      step2Items: step2Extracts,
      step3Items: step3Matrix,
    });

    // 必须满足：零丢失
    expect(result.isZeroDrop).toBe(true);
    expect(result.missingInStep3).toHaveLength(0);

    // 必须满足：差额平衡恒等式 (21 = 18 + 1 + 2)
    expect(result.totalStep3Count).toBe(21);
    expect(result.alignedCount).toBe(18);
    expect(result.missingCount).toBe(1);
    expect(result.traceCount).toBe(2);
    expect(result.isEquationBalanced).toBe(true);
  });

  it('断言 2: 若有步骤 2 实测数据在步骤 3 意外丢失，断言必须能够精准报错捕获', () => {
    const step2Extracts: ExtractItem[] = [
      { key: 'C', name: 'C', category: 'chemical', value: '0.018' },
      { key: 'surface_quality', name: '表面质量', category: 'process', value: '合格' }, // 步骤3意外丢失该项
    ];

    const step3Matrix: ComplianceMatrixItem[] = [
      {
        id: 'rule_C',
        property_key: 'C',
        name: 'C',
        category: 'chemical',
        status: 'PASS',
        ruleBasis: '达标',
      },
    ];

    const result = evaluateDataFunnelAssertions({
      step2Items: step2Extracts,
      step3Items: step3Matrix,
    });

    expect(result.isZeroDrop).toBe(false);
    expect(result.missingInStep3).toHaveLength(1);
    expect(result.missingInStep3[0]?.name).toBe('表面质量');
  });
});
