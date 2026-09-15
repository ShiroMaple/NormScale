import { describe, it, expect } from 'vitest';
import { classifyBlock, countGradeRows, inheritAncestorBlockType, isGarbledText, segmentText } from '@/ingestion/segmenter';
import type { TextBlock } from '@/ingestion/types';

/* 小型合成标准文本：覆盖前言/范围/公差表/化学成分表/力学表/工艺条款/乱码行 */
const FIXTURE_TEXT = `
GB/T 99999-2024
前 言
本文件按照 GB/T 1.1—2020 的规定起草。
1 范围
本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。
本文件适用于锅炉、热交换器用不锈钢无缝钢管。
2 规范性引用文件
下列文件中的内容通过文中的规范性引用而构成本文件必不可少的条款。
5 尺寸
5.1 外径和壁厚
表1 钢管公称外径的允许偏差
单位为毫米
钢管公称尺寸 允许偏差
6~38 ±0.40
7 技术要求
7.1 钢的牌号和化学成分
7.1.1 钢的牌号和化学成分(熔炼分析)应符合表2的规定。
表2 钢的牌号和化学成分
组织
类型
序号 牌号 统一数字代号 化学成分（质量分数） C Si Mn P S Ni Cr
不大于
奥氏体型
1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~
11.00
18.00~
20.00
— —
2 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~
12.00
18.00~
20.00
— —
7.4 力学性能
7.4.1 热处理状态钢管的室温纵向拉伸性能应符合表3的规定。
表3 室温力学性能
组织类型 序号 牌号 统一数字代号 抗拉强度Rm/MPa 规定塑性延伸强度Rp0.2/MPa 断后伸长率A/%
奥氏体型
1 06Cr19Ni10 S30408 520 205 35
2 022Cr19Ni10 S30403 480 175 35
7.5 液压试验
7.5.1 钢管应逐根进行液压试验，试验压力按式 P=2SR/D 计算。最大试验压力不超过 20 MPa，稳压时间不少于 10s。
`.trim();

describe('S1 切块器：锚点切块与类型路由', () => {
  const blocks = segmentText(FIXTURE_TEXT);
  const byRef = (ref: string) => blocks.find((b) => b.clauseRef === ref);

  it('前言与范围路由为 scope_text', () => {
    expect(byRef('前言')?.blockType).toBe('scope_text');
    expect(byRef('1')?.blockType).toBe('scope_text');
    expect(byRef('1')?.text).toContain('本文件适用于');
  });

  it('规范性引用文件不被化学成分关键词误路由', () => {
    expect(byRef('2')?.blockType).toBe('other');
  });

  it('公差表路由为 tolerance_table', () => {
    expect(byRef('表1')?.blockType).toBe('tolerance_table');
    expect(byRef('表1')?.text).toContain('允许偏差');
  });

  it('化学成分表路由为 chemistry_table 且牌号行数正确', () => {
    const chem = byRef('表2');
    expect(chem?.blockType).toBe('chemistry_table');
    expect(countGradeRows(chem?.text || '')).toBe(2);
  });

  it('力学性能表路由为 mechanical_table 且表格行不破坏切块', () => {
    const mech = byRef('表3');
    expect(mech?.blockType).toBe('mechanical_table');
    expect(mech?.text).toContain('520');
    expect(countGradeRows(mech?.text || '')).toBe(2);
  });

  it('牌号行计数容忍组织类型列前缀（如 "体型 22 06Cr13"）', () => {
    const text = [
      '1 022Cr19Ni10 S30403 0.030 1.00',
      '体型 22 06Cr13 S11306 0.06 1.00',
    ].join('\n');
    expect(countGradeRows(text)).toBe(2);
  });

  it('工艺/无损检测条款路由为 process_ndt_clauses（含公式正文行不切块，由 gates 内嵌索引覆盖）', () => {
    const clause = byRef('7.5');
    expect(clause?.blockType).toBe('process_ndt_clauses');
    expect(clause?.text).toContain('液压试验');
    expect(clause?.text).toContain('7.5.1');
  });

  it('子章节号正确切块（7.1 独立成块，含数字引用的正文行归入块内）', () => {
    expect(byRef('7.1')?.blockType).toBe('other');
    expect(byRef('7.1')?.text).toContain('钢的牌号和化学成分');
    // "7.1.1 ……应符合表2的规定。" 因含数字引用不作为标题切块，归入 7.1 块
    expect(byRef('7.1')?.text).toContain('熔炼分析');
    // 表1 块不得吞并后续章节（7.1 独立成块）
    expect(byRef('表1')?.text).not.toContain('7.1');
  });

  it('乱码行独立成 garbled 块，不混入正常块', () => {
    const garbledLine = ', #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3 .2.,3 02..!,.2.. ,42..!,12.. $ $ $ $';
    const withGarble = segmentText(`${FIXTURE_TEXT}\n${garbledLine}`);
    const garbledBlocks = withGarble.filter((b) => b.blockType === 'garbled');
    expect(garbledBlocks.length).toBe(1);
    expect(garbledBlocks[0]?.text).toContain('#-.');
    // 正常块总数与无乱码时一致（乱码行独立成块而非吞并）
    expect(withGarble.filter((b) => b.blockType !== 'garbled').length).toBe(blocks.length);
  });

  it('isGarbledText：英文标题与纯数字行不误判，乱码行必判', () => {
    expect(isGarbledText('Purchase technical specification for boiler and heat exchanger tubes')).toBe(false);
    expect(isGarbledText('1 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~ 11.00')).toBe(false);
    expect(isGarbledText('目 次 前言 ············································································· 80')).toBe(false);
    expect(isGarbledText(', #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3 .2.,3 02..!,.2.. ,42..!,12..')).toBe(true);
  });

  it('classifyBlock：无牌号行的化学成分关键词块不误路由', () => {
    expect(classifyBlock('前言', '本文件更改了化学成分中的相关规定')).toBe('scope_text');
    expect(classifyBlock('7.1', '钢的牌号和化学成分应符合表2的规定')).toBe('other');
    expect(classifyBlock('表A.1', '表 A.1 优级不锈钢的牌号和化学成分 1 015Cr21Ni26Mo5Cu2 S39042 0.020 1.00')).toBe('chemistry_table');
  });

  it('classifyBlock：v2 族条款（晶粒度/表面质量/粗糙度）路由为 process_ndt_clauses', () => {
    // v2 提取范围扩充：金相/表面族条款须进入 process_rules 任务通道
    expect(classifyBlock('6.9', '6.9 晶粒度\n牌号管子的晶粒度级别应为 4 级～7 级。')).toBe('process_ndt_clauses');
    expect(classifyBlock('6.11', '6.11 表面质量\n钢管的内外表面不应有裂缝、折叠、轧折。')).toBe('process_ndt_clauses');
    expect(classifyBlock('6.12', '6.12 表面粗糙度\n管子内外表面粗糙度 Ra 应不大于 0.8μm。')).toBe('process_ndt_clauses');
  });

  it('子孙条款类型继承：误判为标题的正文块（6.11.1/6.11.2）回到 process_rules 通道', () => {
    // 真实 E2E 场景：纯 CJK 正文行被 CLAUSE_HEADING_RE 误判为标题独立成块，
    // 正文不含路由关键词被归为 other——类型继承使其回到祖先（6.11 表面质量）的通道
    const text = [
      '6.11 表面质量',
      '6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。',
      '6.11.2 焊接管的内外表面应光滑，不应有裂纹、折叠、扭曲、咬边、未焊透、焊缝内凹。',
    ].join('\n');
    const blocks = segmentText(text);
    const byRef = (ref: string) => blocks.find((b) => b.clauseRef === ref);
    expect(byRef('6.11')?.blockType).toBe('process_ndt_clauses');
    expect(byRef('6.11.1')?.blockType).toBe('process_ndt_clauses');
    expect(byRef('6.11.2')?.blockType).toBe('process_ndt_clauses');
  });

  it('inheritAncestorBlockType：继承最近非 other 祖先；边界情形不继承', () => {
    const blocks: TextBlock[] = [
      { blockType: 'process_ndt_clauses', clauseRef: '6.11', text: '6.11 表面质量' },
      { blockType: 'other', clauseRef: '6.11.1', text: '6.11.1 无缝管的内外表面不应有裂缝、折叠。' },
      { blockType: 'process_ndt_clauses', clauseRef: '6.10', text: '6.10 无损检测' },
      { blockType: 'other', clauseRef: '6.10.9.9', text: '6.10.9.9 中间级祖先缺失，向上继承祖父类型。' },
      { blockType: 'other', clauseRef: '6.5', text: '6.5 工艺性能' },
      { blockType: 'other', clauseRef: '6.5.4', text: '6.5.4 焊接接头反向弯曲试验。' },
      { blockType: 'other', clauseRef: '8.2', text: '8.2 二级条款不参与继承。' },
      { blockType: 'other', clauseRef: '9.9.9', text: '9.9.9 无任何祖先块。' },
      { blockType: 'process_ndt_clauses', clauseRef: '6.10.1.1', text: '6.10.1.1 自身已带类型，不继承也不变。' },
    ];
    const inherited = inheritAncestorBlockType(blocks);
    const typeOf = (ref: string) => inherited.find((b) => b.clauseRef === ref)?.blockType;
    expect(typeOf('6.11.1')).toBe('process_ndt_clauses'); // 最近祖先 6.11 -> 继承
    expect(typeOf('6.10.9.9')).toBe('process_ndt_clauses'); // 6.10.9 缺失 -> 向上继承 6.10
    expect(typeOf('6.5.4')).toBe('other'); // 最近祖先 6.5 为 other -> 不继承
    expect(typeOf('8.2')).toBe('other'); // 二级条款不匹配 X.Y.Z
    expect(typeOf('9.9.9')).toBe('other'); // 无祖先块
    expect(typeOf('6.10.1.1')).toBe('process_ndt_clauses'); // 自身非 other 不变
    // 纯函数：不修改入参
    expect(blocks.find((b) => b.clauseRef === '6.11.1')?.blockType).toBe('other');
  });
});
