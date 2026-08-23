import { NextResponse } from 'next/server';

/**
 * ============================================================================
 * GET /api/samples: 获取系统内置的质保书典型测试样本列表
 * ============================================================================
 */
export async function GET() {
  const samples = [
    {
      id: 's30408_messy_sample',
      title: 'S30408 奥氏体不锈钢管 (GB/T 13296-2023)',
      category: '奥氏体不锈钢',
      declared_grade: 'SUS 304',
      expected_outcome: 'PASS',
      description: '工业现场典型质保书：包含 15 项化学成分与力学性能实测值，触发牌号别名自动消歧 (SUS 304 -> 06Cr19Ni10) 与数值修约比对。',
      tags: ['标准管材', '牌号消歧', '全项合格'],
    },
    {
      id: 's31603_kgf_sample',
      title: '316L 换热管 (工程制单位换算与强制漏检一票否决)',
      category: '耐蚀合金管',
      declared_grade: 'TP-316L',
      expected_outcome: 'FAIL',
      description: '实测力学性能采用工程制单位 (58.5 kgf/mm²)，系统自动无损换算为 573.68 MPa；未报送压扁、扩口及晶间腐蚀试验，触发国家标准强制项漏检一票否决。',
      tags: ['单位换算', '漏检扫描', '一票否决'],
    },
    {
      id: 'unknown_grade_sample',
      title: '未知材料牌号样本 (触发 HITL 人机协同挂起)',
      category: '异常测试件',
      declared_grade: 'SUS 304H-Special',
      expected_outcome: 'AWAITING_HUMAN_REVIEW',
      description: '声明未收录的非标牌号，触发 LangGraph interrupt() 状态断点，等待质检工程师在人机协同抽屉中指定等效国家标准牌号并恢复流转。',
      tags: ['人机协同', '断点挂起', '人工修正'],
    },
  ];

  return NextResponse.json({
    success: true,
    data: samples,
  });
}
