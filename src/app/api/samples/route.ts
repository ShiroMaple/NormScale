import { NextResponse } from 'next/server';
import {
  SCENARIO_FIXTURES_META,
  isTestFixturesEnabled,
} from '../../../../tests/fixtures/scenarios/index.ts';

/**
 * ============================================================================
 * GET /api/samples: 获取系统样本列表（支持独立测试归档与环境变量受控加载）
 * ============================================================================
 */
export async function GET() {
  const samples: any[] = [];

  // 若启用了测试用例资产（可通过 NEXT_PUBLIC_ENABLE_TEST_FIXTURES=false 全局卸载）
  if (isTestFixturesEnabled()) {
    for (const sc of SCENARIO_FIXTURES_META) {
      samples.push({
        id: sc.id,
        md5: sc.md5,
        filename: sc.filename,
        title: sc.name,
        category: '分层核验典型场景 (专用测试数据)',
        tier_flow: sc.flow_title,
        declared_grade: sc.grade,
        expected_outcome: sc.tier_flow === 'tier1_to_tier2_pass' ? 'PASS' : sc.tier_flow === 'tier1_to_tier2_fail' ? 'FAIL' : 'AWAITING_HUMAN_REVIEW',
        download_url: sc.download_url,
        description: sc.description,
        tags: [...sc.tags, '专用测试数据'],
        is_test_fixture: true,
      });
    }
  }

  // 常规工业现场综合样本
  samples.push(
    {
      id: 's30408_messy_sample',
      title: 'S30408 奥氏体不锈钢管 (GB/T 13296-2023)',
      category: '工业现场综合样本',
      declared_grade: 'SUS 304',
      expected_outcome: 'PASS',
      description: '工业现场典型质保书：包含 15 项化学成分与力学性能实测值，触发牌号别名自动消歧 (SUS 304 -> 06Cr19Ni10) 与数值修约比对。',
      tags: ['标准管材', '牌号消歧', '全项合格'],
    },
    {
      id: 's31603_kgf_sample',
      title: '316L 换热管 (工程制单位换算与强制漏检一票否决)',
      category: '工业现场综合样本',
      declared_grade: 'TP-316L',
      expected_outcome: 'FAIL',
      description: '实测力学性能采用工程制单位 (58.5 kgf/mm²)，系统自动无损换算为 573.68 MPa；未报送压扁、扩口及晶间腐蚀试验，触发国家标准强制项漏检一票否决。',
      tags: ['单位换算', '漏检扫描', '一票否决'],
    },
    {
      id: 'unknown_grade_sample',
      title: '未知材料牌号样本 (触发 HITL 人机协同挂起)',
      category: '工业现场综合样本',
      declared_grade: 'SUS 304H-Special',
      expected_outcome: 'AWAITING_HUMAN_REVIEW',
      description: '声明未收录的非标牌号，触发 LangGraph interrupt() 状态断点，等待质检工程师在人机协同抽屉中指定等效国家标准牌号并恢复流转。',
      tags: ['人机协同', '断点挂起', '人工修正'],
    }
  );

  return NextResponse.json({
    success: true,
    data: samples,
  });
}
