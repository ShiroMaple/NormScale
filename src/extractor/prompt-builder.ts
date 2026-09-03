import {
  META_FIELD_ID_MAP,
  STANDARD_CHEMICAL_ELEMENTS,
  getValidBBoxIdWhitelist,
  buildDynamicSchemaStructureTemplate,
} from '../schemas/certificate.schema';

export {
  META_FIELD_ID_MAP,
  STANDARD_CHEMICAL_ELEMENTS,
  getValidBBoxIdWhitelist,
};

/**
 * 通用系统角色指令
 */
export const EXTRACTION_SYSTEM_INSTRUCTIONS = `
你是一个专业的工业材料质量证明书 (MTC / Mill Test Certificate) 结构化抽取专家。
请仔细分析用户传入的质保书图文内容（结合提取的文本层与页面切图），准确提取全部字段信息，严格输出符合以下规范的纯 JSON 数据格式（不要包裹除 JSON 以外的任何说明文本）：
`.trim();

/**
 * 提取准则与边界约束
 */
export const EXTRACTION_CONSTRAINTS = `
注意与准则：
1. 保持数据绝对真实客观，若单据中未提及某字段则对应置为空字符串 "" 或 null，严禁伪造不存在的数据；
2. 原始单位（如 MPa, HV, wt%, mm）若原件存在请保留，对于多组试样值或范围值请完整保留；
3. 对于化学成分，严格按元素符号提取对应的实测含量；
4. 对于无损探伤检验，若单据中分别列出涡流检测 (ET) 和超声波检测 (UT)，必须分别独立提取至 ndt_et 与 ndt_ut，严禁合并在单字段中；
5. 对于水压试验、渗透检验等非标长尾检验项目，请规范提取至 additional_tests 数组中，推荐遵循 proc_hydraulic, ndt_pt, ndt_mt 等规范 key。
`.trim();

/**
 * 基于 Schema 动态构建紧凑且带注释的结构化抽取 JSON 模板（统一由 certificate.schema.ts 反射派生）
 */
export function buildSchemaStructureTemplate(): string {
  return buildDynamicSchemaStructureTemplate();
}

/**
 * 组装 BBox 动态插件提示词块（携带严格白名单闭集约束）
 */
export function buildBBoxPromptExtension(): string {
  const validIds = getValidBBoxIdWhitelist();

  return `  "bboxes": [
    {
      "id": "必须严格从以下有效 ID 中精确选择（严禁自行创造）：[${validIds.join(', ')}]",
      "page": 1,
      "x": 74.0,
      "y": 13.5,
      "w": 16.0,
      "h": 2.2,
      "label": "字段名称 (如 质保书编号)"
    }
  ]`;
}

export interface PromptBuilderOptions {
  /**
   * 是否在 Prompt 中注入 BBox 视觉坐标提取要求
   * - true (默认)：动态注入 bboxes 要求与严格白名单，由多模态大模型直接定位并输出坐标；
   * - false：Prompt 不包含 bboxes，用于纯离线/测试等无坐标需求场景。
   */
  includeBbox?: boolean;
}

/**
 * 动态生成完整的质保书提取 System Prompt
 */
export function buildDynamicExtractionPrompt(options: PromptBuilderOptions = {}): string {
  const includeBbox = options.includeBbox ?? true;

  let structure = buildSchemaStructureTemplate();

  if (includeBbox) {
    // 注入 bboxes 块
    const bboxBlock = buildBBoxPromptExtension();
    structure = structure.replace(/\n\}$/, `,\n${bboxBlock}\n}`);
  }

  let prompt = `${EXTRACTION_SYSTEM_INSTRUCTIONS}\n\n${structure}\n\n${EXTRACTION_CONSTRAINTS}`;

  if (includeBbox) {
    prompt += `\n4. bboxes 中的 x, y, w, h 均采用百分比数值 (0.0 ~ 100.0)，page 从 1 开始编号。`;
  }

  return prompt;
}
