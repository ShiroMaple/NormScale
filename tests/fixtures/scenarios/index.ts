import { RawCertificatePayload } from '@/extractor/extractor.interface.ts';

/**
 * 是否启用测试用例资产 (可通过环境变量 NEXT_PUBLIC_ENABLE_TEST_FIXTURES 进行全局开关控制)
 * 缺省在开发/测试环境下开启，生产部署或测试数据下线时设为 'false' 即可零残留卸载
 */
export function isTestFixturesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES !== 'false';
}

export interface ScenarioFixtureMeta {
  id: string;
  name: string;
  filename: string;
  size: string;
  date: string;
  status: string;
  description: string;
  standard: string;
  grade: string;
  md5: string;
  tier_flow: 'tier1_hitl' | 'tier1_to_tier2_pass' | 'tier1_to_tier2_fail' | 'tier1_to_tier2_hitl';
  flow_title: string;
  flow_desc: string;
  tags: string[];
  download_url: string;
  is_test_fixture: boolean;
}

/**
 * 四维分层核验场景矩阵元数据定义 (专用测试归档)
 */
export const SCENARIO_FIXTURES_META: ScenarioFixtureMeta[] = [
  {
    id: 'case1_tier1_hitl_unknown_grade',
    name: 'Case 1: Tier 1 - HITL 人机协同 (未收录非标牌号)',
    filename: 'case1_tier1_hitl_unknown_grade.pdf',
    size: '15 KB',
    date: '2026-09-07',
    status: '专用测试数据',
    description: '声明未收录的特种非标牌号 SUS 304H-SpecialX，触发 Tier 1 阻断性挂起，右侧滑出抽屉等待质检员指定国家标准牌号并恢复流转。',
    standard: 'GB/T 13296-2023',
    grade: 'SUS 304H-SpecialX',
    md5: '6a508c6c31e05081fb3b594fd882e354',
    tier_flow: 'tier1_hitl',
    flow_title: 'Tier 1 ➔ HITL 阻断挂起',
    flow_desc: '未收录非标牌号触发 Tier 1 LangGraph interrupt() 阻断性挂起，右侧 480px 抽屉引导人工指定国标牌号后恢复流转',
    tags: ['Tier 1', '牌号未知名录', '阻断性挂起', '480px抽屉'],
    download_url: '/samples/case1_tier1_hitl_unknown_grade.pdf',
    is_test_fixture: true,
  },
  {
    id: 'case2_tier1_to_tier2_pass',
    name: 'Case 2: Tier 1 ➔ Tier 2 - 语义对齐通过 (全绿流转)',
    filename: 'case2_tier1_to_tier2_pass.pdf',
    size: '15 KB',
    date: '2026-09-07',
    status: '专用测试数据',
    description: '常规项确定性达标；携带非标长尾表述“表面光洁度: 0.33 μm”，Tier 1 标记 PENDING，Tier 2 语义对齐至标准“粗糙度 Ra <= 0.8 μm”达标，全绿通过。',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    md5: '8f64aff4099035363ac96539b96551ba',
    tier_flow: 'tier1_to_tier2_pass',
    flow_title: 'Tier 1 ➔ Tier 2 ➔ PASS',
    flow_desc: '常规理化指标确定性达标；携带非标长尾表述“表面光洁度: 0.33 μm”，Tier 1 标记 PENDING，Tier 2 语义对齐至标准“粗糙度 Ra <= 0.8 μm”后判定达标，全绿流转',
    tags: ['Tier 2', '语义对齐', '长尾项对齐', '全项合格'],
    download_url: '/samples/case2_tier1_to_tier2_pass.pdf',
    is_test_fixture: true,
  },
  {
    id: 'case3_tier1_to_tier2_fail',
    name: 'Case 3: Tier 1 ➔ Tier 2 - 语义对齐否定 (超标告警)',
    filename: 'case3_tier1_to_tier2_fail.pdf',
    size: '15 KB',
    date: '2026-09-07',
    status: '专用测试数据',
    description: '基础理化指标达标；实测“表面光洁度: 1.50 μm”，Tier 2 对齐至标准“粗糙度 Ra <= 0.8 μm”后判定 1.50 > 0.8 超差超标，输出红灯 FAIL 否定结论。',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    md5: '546c8372ab1c068111efd3b2190b941d',
    tier_flow: 'tier1_to_tier2_fail',
    flow_title: 'Tier 1 ➔ Tier 2 ➔ FAIL',
    flow_desc: '基础理化指标达标；实测“表面光洁度: 1.50 μm”，Tier 2 对齐至标准“粗糙度 Ra <= 0.8 μm”后判定 1.50 > 0.8 超差超标，输出红灯 FAIL 否定结论',
    tags: ['Tier 2', '超差超标', '一票否决', 'FAIL 告警'],
    download_url: '/samples/case3_tier1_to_tier2_fail.pdf',
    is_test_fixture: true,
  },
  {
    id: 'case4_tier1_to_tier2_hitl',
    name: 'Case 4: Tier 1 ➔ Tier 2 - 行内 HITL 歧义待定',
    filename: 'case4_tier1_to_tier2_hitl.pdf',
    size: '15 KB',
    date: '2026-09-07',
    status: '专用测试数据',
    description: '包含高特异性非标测试项“特种非标微区抗剪切断裂韧度K1C: 85”，Tier 2 置信度不足触发属性歧义挂起，矩阵行内就地展开 HITL 确认卡片。',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    md5: 'd40757c9cc2fb3856ece3c7857a3c511',
    tier_flow: 'tier1_to_tier2_hitl',
    flow_title: 'Tier 1 ➔ Tier 2 ➔ 行内 HITL',
    flow_desc: '包含高特异性非标测试项“特种非标微区抗剪切断裂韧度K1C: 85”，Tier 2 置信度不足，触发属性级歧义挂起，矩阵行内就地展开 HITL 确认卡片',
    tags: ['Tier 2', '行内 HITL', '特异性非标', '置信度不足'],
    download_url: '/samples/case4_tier1_to_tier2_hitl.pdf',
    is_test_fixture: true,
  },
];

/**
 * 四维场景高保真测试原始载荷数据 (按场景 ID 索引)
 */
export const SCENARIO_PRESET_PAYLOADS: Record<string, RawCertificatePayload> = {
  case1_tier1_hitl_unknown_grade: {
    source_provider: 'test-fixture',
    overall_confidence: 0.98,
    header: {
      certificate_no: 'MTC-2026-CASE1-UNK',
      supplier_name: '无锡某特种不锈钢管件制造厂',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: 'SUS 304H-SpecialX',
      heat_number: 'H-CASE1-991',
      lot_number: 'BATCH-2026-01-UNK',
      material_form: '无缝钢管',
      delivery_state: '固溶酸洗',
    },
    test_records: [
      { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.052, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.50, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.20, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.026, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.002, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 8.45, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 18.25, raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '570', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '屈服强度 ReH', raw_value: '250', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '45.0', raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '80', raw_unit: 'HRB' },
      { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格 (未见裂纹)', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '扩口试验', raw_value: '合格 (未见裂纹)', raw_unit: '' },
      { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '合格', raw_unit: '' },
      { raw_category: '无损探伤', raw_property_name: '超声检测 UT', raw_value: '合格 (U2 等级)', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '液压试验', raw_value: '合格 (无渗漏)', raw_unit: '' },
    ],
  },
  case2_tier1_to_tier2_pass: {
    source_provider: 'test-fixture',
    overall_confidence: 0.98,
    header: {
      certificate_no: 'MTC-2026-CASE2-PASS',
      supplier_name: '浙江某特种承压合金管业有限公司',
      declared_standard: 'NB/T 47019.5-2021',
      declared_grade: '06Cr18Ni11Ti',
      heat_number: 'H-CASE2-401',
      lot_number: 'BATCH-2026-02-PASS',
      material_form: '无缝钢管',
      delivery_state: '固溶酸洗',
    },
    test_records: [
      { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.045, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.55, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.30, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.028, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.003, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 17.80, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 10.20, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ti', raw_value: 0.350, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'N', raw_value: 0.010, raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '560', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '规定塑性延伸强度 Rp0.2', raw_value: '240', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '42.0', raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '82', raw_unit: 'HRB' },
      { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '扩口试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '金相组织', raw_property_name: '晶粒度评级', raw_value: '7.5级 (合格)', raw_unit: '级' },
      { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '无晶间腐蚀倾向 (合格)', raw_unit: '' },
      { raw_category: '无损探伤', raw_property_name: '超声检测 UT', raw_value: 'U2 验收合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '液压试验', raw_value: '20 MPa 稳压 10s 无渗漏合格', raw_unit: '' },
      { raw_category: '外观质量', raw_property_name: '表面外观质量', raw_value: '内外表面光洁平整合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '表面光洁度', raw_value: '0.33', raw_unit: 'μm' },
    ],
  },
  case3_tier1_to_tier2_fail: {
    source_provider: 'test-fixture',
    overall_confidence: 0.98,
    header: {
      certificate_no: 'MTC-2026-CASE3-FAIL',
      supplier_name: '江苏某换热系统承压管件实业公司',
      declared_standard: 'NB/T 47019.5-2021',
      declared_grade: '06Cr18Ni11Ti',
      heat_number: 'H-CASE3-772',
      lot_number: 'BATCH-2026-03-FAIL',
      material_form: '无缝钢管',
      delivery_state: '固溶酸洗',
    },
    test_records: [
      { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.045, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.55, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.30, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.028, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.003, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 17.80, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 10.20, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ti', raw_value: 0.350, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'N', raw_value: 0.010, raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '560', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '规定塑性延伸强度 Rp0.2', raw_value: '240', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '42.0', raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '82', raw_unit: 'HRB' },
      { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '扩口试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '金相组织', raw_property_name: '晶粒度评级', raw_value: '7.5级 (合格)', raw_unit: '级' },
      { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '无晶间腐蚀倾向 (合格)', raw_unit: '' },
      { raw_category: '无损探伤', raw_property_name: '超声检测 UT', raw_value: 'U2 验收合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '液压试验', raw_value: '20 MPa 稳压 10s 无渗漏合格', raw_unit: '' },
      { raw_category: '外观质量', raw_property_name: '表面外观质量', raw_value: '内外表面光洁平整合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '表面光洁度', raw_value: '1.50', raw_unit: 'μm' },
    ],
  },
  case4_tier1_to_tier2_hitl: {
    source_provider: 'test-fixture',
    overall_confidence: 0.98,
    header: {
      certificate_no: 'MTC-2026-CASE4-AMB',
      supplier_name: '苏州某特种核电承压装备厂',
      declared_standard: 'NB/T 47019.5-2021',
      declared_grade: '06Cr18Ni11Ti',
      heat_number: 'H-CASE4-338',
      lot_number: 'BATCH-2026-04-AMB',
      material_form: '无缝钢管',
      delivery_state: '固溶酸洗',
    },
    test_records: [
      { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.045, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.55, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.30, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.028, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.003, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 17.80, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 10.20, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'Ti', raw_value: 0.350, raw_unit: '%' },
      { raw_category: '化学成分', raw_property_name: 'N', raw_value: 0.010, raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '560', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '规定塑性延伸强度 Rp0.2', raw_value: '240', raw_unit: 'MPa' },
      { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '42.0', raw_unit: '%' },
      { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '82', raw_unit: 'HRB' },
      { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '扩口试验', raw_value: '合格', raw_unit: '' },
      { raw_category: '金相组织', raw_property_name: '晶粒度评级', raw_value: '7.5级 (合格)', raw_unit: '级' },
      { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '无晶间腐蚀倾向 (合格)', raw_unit: '' },
      { raw_category: '无损探伤', raw_property_name: '超声检测 UT', raw_value: 'U2 验收合格', raw_unit: '' },
      { raw_category: '工艺性能', raw_property_name: '液压试验', raw_value: '20 MPa 稳压 10s 无渗漏合格', raw_unit: '' },
      { raw_category: '外观质量', raw_property_name: '表面外观质量', raw_value: '内外表面光洁平整合格', raw_unit: '' },
      { raw_category: '力学性能', raw_property_name: '特种非标微区抗剪切断裂韧度K1C', raw_value: '85', raw_unit: 'MPa·m^1/2' },
    ],
  },
};

/**
 * 获取归档的测试场景载荷数据
 */
export function getScenarioFixture(key: string): RawCertificatePayload | undefined {
  if (!isTestFixturesEnabled()) {
    return undefined;
  }
  return SCENARIO_PRESET_PAYLOADS[key];
}

/**
 * 根据 MD5 获取预置场景的权威解析缓存（当本地 .cache/parses 缺失时用于自动补齐，确保离线与无 API Key 场景立即可用）
 */
export function getScenarioCachedParseResult(md5: string): any | null {
  if (!md5) return null;
  const targetMd5 = md5.trim().toLowerCase();

  // 1. Case 1: 未知名录牌号 (触发 Tier 1 HITL 挂起)
  if (targetMd5 === '6a508c6c31e05081fb3b594fd882e354') {
    return {
      md5: '6a508c6c31e05081fb3b594fd882e354',
      filename: 'case1_tier1_hitl_unknown_grade.pdf',
      fileSize: '15 KB',
      parserConfigVersion: '1.1.0',
      model: 'kimi-k2.7-code-highspeed',
      provider: 'Moonshot',
      parsedAt: '2026-09-08T09:42:34.797Z',
      tokenStats: { inputTokens: 5976, outputTokens: 2773, durationSeconds: 1.2, isFromCache: true },
      sessionDocument: {
        docId: 'doc_6a508c6c',
        filename: 'case1_tier1_hitl_unknown_grade.pdf',
        fileSize: '15 KB',
        uploadTime: '2026-09-08 09:42:34',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [
          {
            batchNo: 'BATCH-2026-01-UNK',
            subBatchIndex: 1,
            certificateNo: 'MTC-2026-CASE1-UNK',
            productName: '不锈钢无缝钢管',
            grade: 'SUS 304H-SpecialX',
            standard: 'GB/T 13296-2023',
            supplier: '无锡某特种不锈钢管件制造厂',
            dimensions: 'OD 25.0mm × WT 2.0mm × L 6000mm',
            heatNo: 'H-CASE1-991',
            deliveryState: '固溶酸洗',
            verdict: 'UNAUDITED',
            verdictSummary: '大模型结构化提取完成，待合规比对',
            ocrConfidence: 98,
            gradeMatchConfidence: 50,
            chemical: [
              { element: 'C', value: '0.052', confidence: '99%' },
              { element: 'Si', value: '0.50', confidence: '99%' },
              { element: 'Mn', value: '1.20', confidence: '99%' },
              { element: 'P', value: '0.026', confidence: '99%' },
              { element: 'S', value: '0.002', confidence: '99%' },
              { element: 'Cr', value: '18.25', confidence: '99%' },
              { element: 'Ni', value: '8.45', confidence: '99%' },
            ],
            mechanical: { tensile_rm: '570 MPa', yield_rp02: '250 MPa', elongation_a: '45.0 %', hardness: '80 HRB' },
            process: { flattening: '合格 (未见裂纹)', flaring: '合格 (未见裂纹)', intergranularCorrosion: '合格', ndt: '合格 (U2 等级)' },
            additionalTests: [{ key: 'hyd_press', name: '液压试验', category: 'process', standard: 'GB/T 241', result: '合格 (无渗漏)', conclusion: 'PASS' }],
            surfaceQuality: '内外表面光洁无裂纹缺陷',
            reportNo: 'QA-CASE1-01',
            sha256Hash: 'SHA256-CASE1-001',
            inspector: 'Auto-AI-Inspector',
          },
        ],
      },
      bboxes: [],
    };
  }

  // 2. Case 2: 表面光洁度 0.33 μm (全绿通过)
  if (targetMd5 === '8f64aff4099035363ac96539b96551ba') {
    return {
      md5: '8f64aff4099035363ac96539b96551ba',
      filename: 'case2_tier1_to_tier2_pass.pdf',
      fileSize: '15 KB',
      parserConfigVersion: '1.1.0',
      model: 'kimi-k2.7-code-highspeed',
      provider: 'Moonshot',
      parsedAt: '2026-09-08T09:42:34.797Z',
      tokenStats: { inputTokens: 5850, outputTokens: 2800, durationSeconds: 1.2, isFromCache: true },
      sessionDocument: {
        docId: 'doc_8f64aff4',
        filename: 'case2_tier1_to_tier2_pass.pdf',
        fileSize: '15 KB',
        uploadTime: '2026-09-08 09:42:34',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [
          {
            batchNo: 'BATCH-2026-02-PASS',
            subBatchIndex: 1,
            certificateNo: 'MTC-2026-CASE2-PASS',
            productName: '锅炉用无缝钢管',
            grade: '06Cr18Ni11Ti',
            standard: 'NB/T 47019.5-2021',
            supplier: '浙江某特种承压合金管业有限公司',
            dimensions: 'Φ25×2.5×6000mm',
            heatNo: 'H-CASE2-401',
            deliveryState: '固溶酸洗',
            verdict: 'UNAUDITED',
            verdictSummary: '大模型结构化提取完成，待合规比对',
            ocrConfidence: 98,
            gradeMatchConfidence: 99,
            chemical: [
              { element: 'C', value: '0.045', confidence: '99%' },
              { element: 'Si', value: '0.55', confidence: '99%' },
              { element: 'Mn', value: '1.30', confidence: '99%' },
              { element: 'P', value: '0.028', confidence: '99%' },
              { element: 'S', value: '0.003', confidence: '99%' },
              { element: 'Cr', value: '17.80', confidence: '99%' },
              { element: 'Ni', value: '10.20', confidence: '99%' },
              { element: 'Ti', value: '0.350', confidence: '99%' },
              { element: 'N', value: '0.010', confidence: '99%' },
            ],
            mechanical: { tensile_rm: '560 MPa', yield_rp02: '240 MPa', elongation_a: '42.0 %', hardness: '82 HRB' },
            process: { flattening: '合格', flaring: '合格', intergranularCorrosion: '无晶间腐蚀倾向 (合格)', grainSize: '7.5级 (合格)', ndt: 'U2 验收合格' },
            additionalTests: [
              { key: 'proc_surface_finish', name: '表面光洁度', category: 'process', standard: '', result: '0.33', value_num: 0.33, unit: 'μm', conclusion: 'PASS' },
              { key: 'proc_hydraulic', name: '液压试验', category: 'process', standard: 'GB/T 241', result: '20 MPa 稳压 10s 无渗漏合格', value_num: 20, unit: 'MPa', conclusion: 'PASS' },
            ],
            surfaceQuality: '内外表面光洁平整合格',
            reportNo: 'QA-CASE2-02',
            sha256Hash: 'SHA256-CASE2-002',
            inspector: 'Auto-AI-Inspector',
          },
        ],
      },
      bboxes: [],
    };
  }

  // 3. Case 3: 表面光洁度 1.50 μm (超标告警)
  if (targetMd5 === '546c8372ab1c068111efd3b2190b941d') {
    return {
      md5: '546c8372ab1c068111efd3b2190b941d',
      filename: 'case3_tier1_to_tier2_fail.pdf',
      fileSize: '15 KB',
      parserConfigVersion: '1.1.0',
      model: 'kimi-k2.7-code-highspeed',
      provider: 'Moonshot',
      parsedAt: '2026-09-08T09:42:34.797Z',
      tokenStats: { inputTokens: 5850, outputTokens: 2800, durationSeconds: 1.2, isFromCache: true },
      sessionDocument: {
        docId: 'doc_546c8372',
        filename: 'case3_tier1_to_tier2_fail.pdf',
        fileSize: '15 KB',
        uploadTime: '2026-09-08 09:42:34',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [
          {
            batchNo: 'BATCH-2026-03-FAIL',
            subBatchIndex: 1,
            certificateNo: 'MTC-2026-CASE3-FAIL',
            productName: '换热器用无缝钢管',
            grade: '06Cr18Ni11Ti',
            standard: 'NB/T 47019.5-2021',
            supplier: '江苏某换热系统承压管件实业公司',
            dimensions: 'Φ25×2.5×6000mm',
            heatNo: 'H-CASE3-772',
            deliveryState: '固溶酸洗',
            verdict: 'UNAUDITED',
            verdictSummary: '大模型结构化提取完成，待合规比对',
            ocrConfidence: 98,
            gradeMatchConfidence: 99,
            chemical: [
              { element: 'C', value: '0.045', confidence: '99%' },
              { element: 'Si', value: '0.55', confidence: '99%' },
              { element: 'Mn', value: '1.30', confidence: '99%' },
              { element: 'P', value: '0.028', confidence: '99%' },
              { element: 'S', value: '0.003', confidence: '99%' },
              { element: 'Cr', value: '17.80', confidence: '99%' },
              { element: 'Ni', value: '10.20', confidence: '99%' },
              { element: 'Ti', value: '0.350', confidence: '99%' },
              { element: 'N', value: '0.010', confidence: '99%' },
            ],
            mechanical: { tensile_rm: '560 MPa', yield_rp02: '240 MPa', elongation_a: '42.0 %', hardness: '82 HRB' },
            process: { flattening: '合格', flaring: '合格', intergranularCorrosion: '无晶间腐蚀倾向 (合格)', grainSize: '7.5级 (合格)', ndt: 'U2 验收合格' },
            additionalTests: [
              { key: 'proc_surface_finish', name: '表面光洁度', category: 'process', standard: '', result: '1.50', value_num: 1.5, unit: 'μm', conclusion: 'PASS' },
              { key: 'proc_hydraulic', name: '液压试验', category: 'process', standard: 'GB/T 241', result: '20 MPa 稳压 10s 无渗漏合格', value_num: 20, unit: 'MPa', conclusion: 'PASS' },
            ],
            surfaceQuality: '内外表面光洁平整合格',
            reportNo: 'QA-CASE3-03',
            sha256Hash: 'SHA256-CASE3-003',
            inspector: 'Auto-AI-Inspector',
          },
        ],
      },
      bboxes: [],
    };
  }

  // 4. Case 4: 特种非标微区抗剪切断裂韧度K1C (行内 HITL 歧义待定)
  if (targetMd5 === 'd40757c9cc2fb3856ece3c7857a3c511') {
    return {
      md5: 'd40757c9cc2fb3856ece3c7857a3c511',
      filename: 'case4_tier1_to_tier2_hitl.pdf',
      fileSize: '15 KB',
      parserConfigVersion: '1.1.0',
      model: 'kimi-k2.7-code-highspeed',
      provider: 'Moonshot',
      parsedAt: '2026-09-08T09:42:34.797Z',
      tokenStats: { inputTokens: 5850, outputTokens: 2800, durationSeconds: 1.2, isFromCache: true },
      sessionDocument: {
        docId: 'doc_d40757c9',
        filename: 'case4_tier1_to_tier2_hitl.pdf',
        fileSize: '15 KB',
        uploadTime: '2026-09-08 09:42:34',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [
          {
            batchNo: 'BATCH-2026-04-AMB',
            subBatchIndex: 1,
            certificateNo: 'MTC-2026-CASE4-AMB',
            productName: '特种核电无缝钢管',
            grade: '06Cr18Ni11Ti',
            standard: 'NB/T 47019.5-2021',
            supplier: '苏州某特种核电承压装备厂',
            dimensions: 'Φ25×2.5×6000mm',
            heatNo: 'H-CASE4-338',
            deliveryState: '固溶酸洗',
            verdict: 'UNAUDITED',
            verdictSummary: '大模型结构化提取完成，待合规比对',
            ocrConfidence: 98,
            gradeMatchConfidence: 99,
            chemical: [
              { element: 'C', value: '0.045', confidence: '99%' },
              { element: 'Si', value: '0.55', confidence: '99%' },
              { element: 'Mn', value: '1.30', confidence: '99%' },
              { element: 'P', value: '0.028', confidence: '99%' },
              { element: 'S', value: '0.003', confidence: '99%' },
              { element: 'Cr', value: '17.80', confidence: '99%' },
              { element: 'Ni', value: '10.20', confidence: '99%' },
              { element: 'Ti', value: '0.350', confidence: '99%' },
              { element: 'N', value: '0.010', confidence: '99%' },
            ],
            mechanical: { tensile_rm: '560 MPa', yield_rp02: '240 MPa', elongation_a: '42.0 %', hardness: '82 HRB' },
            process: { flattening: '合格', flaring: '合格', intergranularCorrosion: '无晶间腐蚀倾向 (合格)', grainSize: '7.5级 (合格)', ndt: 'U2 验收合格' },
            additionalTests: [
              { key: 'mech_shear_fracture_toughness_k1c', name: '特种非标微区抗剪切断裂韧度K1C', category: 'mechanical', standard: '', result: '85', value_num: 85, unit: 'MPa·m^1/2', conclusion: 'PASS' },
              { key: 'proc_hydraulic', name: '液压试验', category: 'process', standard: 'GB/T 241', result: '20 MPa 稳压 10s 无渗漏合格', value_num: 20, unit: 'MPa', conclusion: 'PASS' },
            ],
            surfaceQuality: '内外表面光洁平整合格',
            reportNo: 'QA-CASE4-04',
            sha256Hash: 'SHA256-CASE4-004',
            inspector: 'Auto-AI-Inspector',
          },
        ],
      },
      bboxes: [],
    };
  }

  return null;
}
