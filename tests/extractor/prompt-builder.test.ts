import { describe, it, expect } from 'vitest';
import {
  getValidBBoxIdWhitelist,
  buildSchemaStructureTemplate,
  buildBBoxPromptExtension,
  buildDynamicExtractionPrompt,
  EXTRACTION_SYSTEM_INSTRUCTIONS,
} from '../../src/extractor/prompt-builder.ts';

describe('PromptBuilder (Schema-Driven Prompt & Whitelist Reflection)', () => {
  it('应能从 CertificateHeaderSchema 与物理定义中自动反射提取完整的 BBox ID 白名单', () => {
    const whitelist = getValidBBoxIdWhitelist();
    expect(whitelist).toBeInstanceOf(Array);
    expect(whitelist.length).toBeGreaterThan(20);

    // 验证核心元数据 ID
    expect(whitelist).toContain('meta_certificateNo');
    expect(whitelist).toContain('meta_standard');
    expect(whitelist).toContain('meta_grade');
    expect(whitelist).toContain('meta_supplier');
    expect(whitelist).toContain('meta_heatNo');
    expect(whitelist).toContain('meta_packNo');
    expect(whitelist).toContain('meta_deliveryState');
    expect(whitelist).toContain('meta_dimensions');

    // 验证核心化学元素 ID
    expect(whitelist).toContain('chem_C');
    expect(whitelist).toContain('chem_Si');
    expect(whitelist).toContain('chem_Mn');
    expect(whitelist).toContain('chem_Cr');
    expect(whitelist).toContain('chem_Ni');
    expect(whitelist).toContain('chem_Ti');

    // 验证核心力学与工艺无损 ID
    expect(whitelist).toContain('mech_tensile');
    expect(whitelist).toContain('mech_yield');
    expect(whitelist).toContain('mech_elongation');
    expect(whitelist).toContain('mech_hardness');
    expect(whitelist).toContain('proc_flattening');
    expect(whitelist).toContain('proc_flaring');
    expect(whitelist).toContain('metallo_grain');
    expect(whitelist).toContain('corrosion_intergranular');
    expect(whitelist).toContain('ndt_et');
  });

  it('buildSchemaStructureTemplate 应输出结构完整的业务抽取 JSON 模板', () => {
    const template = buildSchemaStructureTemplate();
    expect(template).toContain('"header": {');
    expect(template).toContain('"certificateNo":');
    expect(template).toContain('"declaredStandard":');
    expect(template).toContain('"declaredGrade":');
    expect(template).toContain('"batches": [');
    expect(template).toContain('"chemical": [');
    expect(template).toContain('"mechanical": {');
    expect(template).toContain('"process": {');
  });

  it('当 includeBbox 为 false 时（文本型 PDF/已过 OCR），Prompt 不应包含 bboxes 块以节省 Token', () => {
    const prompt = buildDynamicExtractionPrompt({ includeBbox: false });
    expect(prompt).toContain(EXTRACTION_SYSTEM_INSTRUCTIONS);
    expect(prompt).toContain('"header": {');
    expect(prompt).toContain('"batches": [');
    expect(prompt).not.toContain('"bboxes": [');
    expect(prompt).not.toContain('bboxes 中的 x, y, w, h');
  });

  it('buildBBoxPromptExtension 应输出带白名单的独立 BBox 插件文本', () => {
    const extension = buildBBoxPromptExtension();
    expect(extension).toContain('"bboxes": [');
    expect(extension).toContain('必须严格从以下有效 ID 中精确选择');
    expect(extension).toContain('meta_certificateNo');
  });

  it('当 includeBbox 为 true 时（扫描件/图片且未过 OCR），Prompt 应包含带严格白名单约束的 bboxes 块', () => {
    const prompt = buildDynamicExtractionPrompt({ includeBbox: true });
    expect(prompt).toContain(EXTRACTION_SYSTEM_INSTRUCTIONS);
    expect(prompt).toContain('"header": {');
    expect(prompt).toContain('"bboxes": [');
    expect(prompt).toContain('必须严格从以下有效 ID 中精确选择');
    expect(prompt).toContain('meta_certificateNo');
    expect(prompt).toContain('chem_C');
    expect(prompt).toContain('mech_tensile');
    expect(prompt).toContain('bboxes 中的 x, y, w, h 均采用百分比数值');
  });
});
