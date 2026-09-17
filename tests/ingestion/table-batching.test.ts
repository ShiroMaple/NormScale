import { describe, it, expect } from 'vitest';
import { extractAll, GRADE_TABLE_BATCH_SIZE, splitGradeTableBlock } from '@/ingestion/llm-extract';
import { EN_ASME_PROFILE, ZH_CN_PROFILE } from '@/ingestion/standard-profile';
import type { ChatClient, TextBlock } from '@/ingestion/types';

/* v1.7.1 大表行级拆批测试：ASME TABLE2 真实超时案例形态（en 档，TP 牌号大表）。
   断言：批数正确、每批携带表头/表注、行不截断、合并不丢牌号、不足阈值不拆。严禁真实 LLM。 */

// SA-213 TABLE 2 形态：表题行 + 列头 + 25 个 TP 牌号行 + 表注（上标折行形态取自真实文本）
function enTableBlock(rowCount: number): TextBlock {
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const grades = ['TP201', 'TP202', 'TP304', 'TP304L', 'TP304H', 'TP304N', 'TP309S', 'TP309H', 'TP310S', 'TP310H', 'TP316', 'TP316L', 'TP316H', 'TP321', 'TP321H', 'TP347', 'TP347H', 'TP348', 'TP348H', 'TPXM15', 'TP405', 'TP410', 'TP430', 'TP439', 'S44400'];
    const g = grades[i % grades.length] + (i >= grades.length ? `-${Math.floor(i / grades.length) + 1}` : '');
    const uns = `S${String(30000 + i * 7).padStart(5, '0')}`;
    return `${g} ${uns} 0.08 2.00 0.045 0.030 1.00 18.0–20.0 8.0–11.0 ... ... ... ... ...`;
  });
  return {
    blockType: 'chemistry_table',
    clauseRef: 'TABLE2',
    text: [
      '283TABLE 2 Chemical Composition Limits, %A , for Austenitic and Ferritic Stainless Steel',
      'Grade UNS',
      'Designation Composition, %',
      'Carbon Manga-',
      'nese',
      ...rows,
      'A Maximum, unless a range or minimum is indicated. Where ellipses (...) appear in this table, there is no minimum.',
    ].join('\n'),
  };
}

/** 提取块内的牌号行（行首 ASME 牌号 + UNS） */
function gradeLinesOf(text: string): string[] {
  return text.split('\n').filter((l) => /^\s*[A-Z][A-Za-z0-9-]{0,12}\s+(?:Type\s+\d+\s+(?:Heat\s+)?)?[KS]\d{5}\b/.test(l));
}

describe('行级拆批：splitGradeTableBlock（en-asme 档，SA-213 TABLE2 形态）', () => {
  it('不足阈值不拆：≤12 行原样返回单批（同引用、同文本）', () => {
    const block = enTableBlock(GRADE_TABLE_BATCH_SIZE);
    const batches = splitGradeTableBlock(block, EN_ASME_PROFILE);
    expect(batches.length).toBe(1);
    expect(batches[0]).toBe(block);
  });

  it('25 行拆 3 批（12/12/1）：每批携带表头与表注，牌号行零截断、无重复无丢失', () => {
    const block = enTableBlock(25);
    const batches = splitGradeTableBlock(block, EN_ASME_PROFILE);
    expect(batches.length).toBe(3);

    const allGradeLines = gradeLinesOf(block.text);
    expect(allGradeLines.length).toBe(25);
    const collected: string[] = [];
    for (const batch of batches) {
      expect(batch.clauseRef).toBe('TABLE2');
      expect(batch.blockType).toBe('chemistry_table');
      // 表头（表题 + 列头行）与表注每批都携带
      expect(batch.text).toContain('TABLE 2 Chemical Composition Limits');
      expect(batch.text).toContain('Grade UNS');
      expect(batch.text).toContain('A Maximum, unless a range');
      collected.push(...gradeLinesOf(batch.text));
    }
    // 行不截断、无重复、无丢失（批内拼接 ≡ 原块牌号行序列）
    expect(collected).toEqual(allGradeLines);
    // 批大小分布
    expect(batches.map((b) => gradeLinesOf(b.text).length)).toEqual([12, 12, 1]);
  });

  it('zh 档断行表（NB 表1 形态，数值折行）续行随行走，不截断', () => {
    const zhRows = Array.from({ length: 13 }, (_, i) =>
      [
        `${i + 1} 06Cr${18 + (i % 5)}Ni${10 + (i % 3)} S${30408 + i} 0.08 1.00 2.00 0.035 0.015 8.00～`,
        '11.00',
        '18.00～',
        '20.00 — —',
      ].join('\n'),
    );
    const block: TextBlock = {
      blockType: 'chemistry_table',
      clauseRef: '表1',
      text: ['表 1 钢的牌号和化学成分', '序 号 牌号 统一数字代号 C Si Mn P S Ni Cr', ...zhRows, '注 2：表中所列成分除标明范围外，其余均为最大值。'].join('\n'),
    };
    const batches = splitGradeTableBlock(block, ZH_CN_PROFILE);
    expect(batches.length).toBe(2); // 13 行 -> 12 + 1
    const collected = batches.flatMap((b) =>
      b.text.split('\n').filter((l) => /^\s*\d{1,2}\s+(?:\d{2,3}Cr[0-9A-Za-z]+|S\d{5})\b/.test(l)),
    );
    expect(collected.length).toBe(13);
    // 续行 "11.00" 与所属牌号行同批（批内牌号行后紧跟其折行）
    for (const batch of batches) {
      const lines = batch.text.split('\n');
      const idx = lines.findIndex((l) => /^1\s+06Cr/.test(l));
      if (idx >= 0) expect(lines[idx + 1]).toBe('11.00');
    }
    // 表注每批携带
    for (const batch of batches) expect(batch.text).toContain('注 2：');
  });
});

describe('行级拆批：extractAll 接线', () => {
  it('13 行表拆 2 批逐批调用：两次 slices_chemical、prompt 均含表头、合并后 13 牌号齐、progress 记录拆批', async () => {
    const block = enTableBlock(13);
    const calls: string[] = [];
    const messages: string[] = [];
    const chat: ChatClient = async (msgs, opts) => {
      if (opts.task === 'slices_chemical') {
        calls.push(msgs[1]?.content as string);
        // 按批内牌号行回应该批切片（spec_key 取行内 UNS）
        const grades = msgs[1]!.content as string;
        const slices = gradeLinesOf(grades).map((l) => {
          const uns = /[KS]\d{5}/.exec(l)![0];
          const grade = l.trim().split(/\s+/)[0]!;
          return {
            spec_key: grade,
            primary_grade: grade,
            unified_code: uns,
            structure_type: 'austenitic',
            display_name: `${grade} (${uns})`,
            aliases: [],
            chemical_rules: [{ rule_id: `CHEM_${grade}_C`, category: 'chemical', property_key: 'C', display_name: 'Carbon (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: 'TABLE2' }],
          };
        });
        return JSON.stringify({ slices });
      }
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'SA-213/SA-213M', standard_name: 'Seamless Alloy-Steel Tubes', version: '2023', description: 'Covers seamless tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
    const drafts = await extractAll([block], chat, (m) => messages.push(m), undefined, EN_ASME_PROFILE);
    expect(calls.length).toBe(2);
    for (const prompt of calls) expect(prompt).toContain('TABLE 2 Chemical Composition Limits');
    expect(messages.some((m) => m.includes('表块 TABLE2 拆为 2 批提取'))).toBe(true);
    // 合并后 13 个牌号齐全（mergeSliceDrafts 按 spec_key 归并）
    expect(drafts.slices.length).toBe(13);
    const keys = drafts.slices.map((s) => s.spec_key).sort();
    expect(new Set(keys).size).toBe(13);
  });
});
