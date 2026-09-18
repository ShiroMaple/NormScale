import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Step3ComplianceEvaluationPanel } from '@/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';

describe('Step3ComplianceEvaluationPanel 单元测试 (阶段 4)', () => {
  const mockBatch: BatchSpecimen = {
    batchNo: 'BATCH-2026-X1',
    subBatchIndex: 1,
    grade: '022Cr17Ni12Mo2',
    standard: 'GB/T 13296-2023',
    supplier: '某特钢股份有限公司',
    dimensions: 'OD 25.0mm × WT 2.0mm',
    heatNo: 'HEAT-9901',
    verdict: 'PASS',
    verdictSummary: '全项合规',
    ocrConfidence: 96,
    gradeMatchConfidence: 98,
    reportNo: 'QA-20260917-001',
    sha256Hash: 'hash-abc',
    inspector: 'QA-01',
    chemical: [
      { element: 'C', value: '0.02', confidence: '98%', status: 'ok' },
      { element: 'Cr', value: '17.2', confidence: '99%', status: 'ok' },
    ],
    mechanical: {
      tensile_rm: '580',
      yield_rp02: '240',
      elongation_a: '42',
      hardness: '170 HV',
      impact_kv2_1: '',
      impact_kv2_2: '',
      impact_kv2_3: '',
      impact_kv2_avg: '',
    },
    process: {
      flattening: 'PASS',
      flaring: 'PASS',
      grainSize: '7.5',
      intergranularCorrosion: 'PASS',
      ndt_et: 'PASS',
      ndt_ut: '',
    },
    additionalTests: [],
    humanVerdict: null,
    auditReport: {
      report_id: 'rep-001',
      specimen_id: 'BATCH-2026-X1',
      standard_id: 'GB/T 13296-2023',
      standard_name: '锅炉热交换器用不锈钢无缝钢管',
      grade: '022Cr17Ni12Mo2',
      overall_verdict: 'PASS',
      overall_explanation: '各项实测指标满足 GB/T 13296-2023 规范要求',
      evaluated_at: '2026-09-17 12:00:00',
      item_results: [
        {
          rule_id: 'rule-chem-cr',
          property_key: 'Cr',
          display_name: 'Cr (铬含量)',
          category: 'chemical',
          measured_value_raw: '17.2',
          measured_value_num: 17.2,
          rounded_value: 17.2,
          standard_min: 16.5,
          standard_max: 18.5,
          status: 'PASS',
          message: 'Cr含量满足 16.5 ~ 18.5 要求',
          standard_requirement_text: '16.5 ~ 18.5',
        },
        {
          rule_id: 'rule-mech-tensile',
          property_key: 'tensile_rm',
          display_name: '抗拉强度 Rm',
          category: 'mechanical',
          measured_value_raw: '580',
          measured_value_num: 580,
          rounded_value: 580,
          standard_min: 480,
          status: 'PASS',
          message: '抗拉强度 Rm ≥ 480 MPa',
          standard_requirement_text: '≥ 480 MPa',
        },
      ],
    } as any,
  };

  const mockDoc: SessionDocument = {
    docId: 'doc-101',
    filename: '测试质保书1.pdf',
    fileSize: '1.2 MB',
    uploadTime: '2026-09-17 12:00',
    ocrStatus: 'DONE',
    pageCount: 1,
    batches: [mockBatch],
  };

  const mockSession: InspectionSession = {
    sessionId: 'session-step3-test',
    createdAt: '2026-09-17 12:00:00',
    title: '步骤3测试会话',
    totalDocuments: 1,
    totalBatches: 1,
    passedBatches: 1,
    failedBatches: 0,
    hitlBatches: 0,
    documents: [mockDoc],
  };

  const defaultProps = {
    session: mockSession,
    selectedDocId: 'doc-101',
    selectedBatchNo: 'BATCH-2026-X1',
    onSelectDoc: vi.fn(),
    onSelectBatch: vi.fn(),
    isEvaluatingBatch: false,
    onEvaluateBatch: vi.fn(),
    onResetGrade: vi.fn(),
    dynamicStandardsCatalog: [
      {
        id: 'GB/T 13296-2023',
        shortCode: 'GB/T 13296',
        name: '锅炉热交换器用不锈钢无缝钢管',
        category: '产品制造通用标准' as const,
        badgeColor: 'text-blue-700 bg-blue-50',
        grades: [],
      },
    ],
    selectedStandardIds: ['GB/T 13296-2023'],
    onToggleStandard: vi.fn(),
    batchPresentationMap: {},
    onInlineAdoptHitl: vi.fn(),
    onTriggerHitl: vi.fn(),
    onSetHumanVerdict: vi.fn(),
    onGoToStep: vi.fn(),
    totalCombinedMetrics: {
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalDurationSeconds: 2.0,
      parseInputTokens: 800,
      parseOutputTokens: 400,
      parseDurationSeconds: 1.5,
      auditInputTokens: 200,
      auditOutputTokens: 100,
      auditDurationSeconds: 0.5,
      activeConcurrency: 1,
      readyDocsCount: 1,
      totalDocsCount: 1,
    },
  };

  it('异常边界：传入空文档或空批次时，渲染空状态并提示返回步骤 1', () => {
    const emptySession: InspectionSession = {
      ...mockSession,
      documents: [],
    };

    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, {
        ...defaultProps,
        session: emptySession,
        selectedDocId: '',
        selectedBatchNo: '',
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('暂无待比对批次');
    expect(html).toContain('前往步骤 1 上传文档');
  });

  it('正常流：传入合规报告与有效批次时，完整渲染全景比对表与 PASS 判定看板', () => {
    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, defaultProps)
    );

    expect(html).toBeTruthy();
    expect(html).toContain('全景合规比对矩阵');
    expect(html).toContain('质保书信息');
    expect(html).toContain('BATCH-2026-X1');
    expect(html).toContain('Cr (铬含量)');
    expect(html).toContain('抗拉强度 Rm');
    expect(html).toContain('系统判定: PASS 全项合规');
    expect(html).toContain('审批通过');
    expect(html).toContain('拒收');
  });

  it('人机协同 (HITL) 边界：批次处于 MANUAL_REVIEW 时渲染待介入状态与处理按钮', () => {
    const hitlBatch: BatchSpecimen = {
      ...mockBatch,
      verdict: 'MANUAL_REVIEW',
      hitlReason: 'UNKNOWN_GRADE',
      verdictSummary: '检测到非标牌号，需人工确认',
    };
    const hitlDoc: SessionDocument = {
      ...mockDoc,
      batches: [hitlBatch],
    };
    const hitlSession: InspectionSession = {
      ...mockSession,
      documents: [hitlDoc],
    };

    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, {
        ...defaultProps,
        session: hitlSession,
        batchPresentationMap: {
          'BATCH-2026-X1': {
            batchNo: 'BATCH-2026-X1',
            stage: 'hitl_pending',
            hitlContext: {
              reason: 'UNKNOWN_GRADE',
              prompt_message: '检测到非标牌号，请确认真实牌号',
              candidate_grades: [{ code: '06Cr19Ni10', match: '95%' }],
            } as any,
          },
        },
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('HITL 系统判定: 待人工复核确认');
    expect(html).toContain('待介入');
    expect(html).toContain('处理');
    expect(html).toContain('采纳推荐项');
  });

  it('多标准剪刀差边界：包含加严剪刀差失效项时，渲染加严剪刀差失效提示与FAIL判定', () => {
    const scissorsBatch: BatchSpecimen = {
      ...mockBatch,
      verdict: 'FAIL',
      auditReport: {
        ...mockBatch.auditReport!,
        overall_verdict: 'FAIL',
        item_results: [
          {
            rule_id: 'rule-scissors-cr',
            property_key: 'Cr',
            display_name: 'Cr (铬含量)',
            category: 'chemical',
            measured_value_raw: '17.2',
            measured_value_num: 17.2,
            rounded_value: 17.2,
            standard_min: 17.5,
            status: 'FAIL',
            is_scissors_difference: true,
            strict_standard_id: 'NB/T 47019.5-2021',
            scissors_attribution: '满足基础国标但未达特种承压订货加严标要求',
            standard_requirement_text: '≥ 17.5',
          },
        ],
      } as any,
    };
    const scissorsDoc: SessionDocument = {
      ...mockDoc,
      batches: [scissorsBatch],
    };
    const scissorsSession: InspectionSession = {
      ...mockSession,
      documents: [scissorsDoc],
    };

    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, {
        ...defaultProps,
        session: scissorsSession,
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('剪刀差未达标');
    expect(html).toContain('满足基础国标但未达特种承压订货加严标要求');
    expect(html).toContain('系统判定: FAIL 一票否决');
  });

  it('当批次处于初始待核验状态 (UNAUDITED) 时，综合看板应呈现灰色待核验态，绝不误报 FAIL 一票否决', () => {
    const unauditedBatch: BatchSpecimen = {
      ...mockBatch,
      verdict: 'UNAUDITED',
      verdictSummary: '未核验',
      auditReport: undefined,
    };
    const unauditedDoc: SessionDocument = {
      ...mockDoc,
      batches: [unauditedBatch],
    };
    const unauditedSession: InspectionSession = {
      ...mockSession,
      documents: [unauditedDoc],
    };

    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, {
        ...defaultProps,
        session: unauditedSession,
        currentBatch: unauditedBatch,
      })
    );

    expect(html).toBeTruthy();
    // 必须包含待核验提示与灰色流转标识
    expect(html).toContain('系统判定: 待核验');
    expect(html).toContain('流转: 待比对');
    expect(html).toContain('bg-slate-100/90');
    expect(html).toContain('开始核验');
    // 绝不能在未比对前误判为 FAIL 一票否决
    expect(html).not.toContain('系统判定: FAIL 一票否决');
    expect(html).not.toContain('系统一票否决拦截');
  });

  it('Tier 2 AI意图对齐项目：ruleBasis 前缀说明与判定结论之间应包含换行符，且渲染容器具备 whitespace-pre-line', () => {
    const html = renderToString(
      React.createElement(Step3ComplianceEvaluationPanel, {
        ...defaultProps,
        batchPresentationMap: {
          'BATCH-2026-X1': {
            batchNo: 'BATCH-2026-X1',
            stage: 'completed',
            resolvedProperties: [
              {
                raw_name: '表面光洁度',
                raw_value: '1.50 um',
                resolved_key: 'Cr',
                confidence: 0.98,
                reasoning: '表面光洁度为粗糙度同义表述',
                model_name: 'kimi-k2.7',
                source_tier: 'tier2',
              },
            ],
          },
        },
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain('[kimi-k2.7] 表面光洁度为粗糙度同义表述；\n');
  });
});

