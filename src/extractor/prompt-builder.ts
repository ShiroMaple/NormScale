import { CertificateHeaderSchema } from '../schemas/certificate.schema';

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
3. 对于化学成分，严格按元素符号提取对应的实测含量。
`.trim();

/**
 * 基础元数据标准 ID 映射表 (与 UI & BBoxAnchorMatcher 100% 保持一致)
 */
export const META_FIELD_ID_MAP: Record<string, string> = {
  certificate_no: 'meta_certificateNo',
  declared_standard: 'meta_standard',
  declared_grade: 'meta_grade',
  supplier_name: 'meta_supplier',
  construction_number: 'meta_constructionNo',
  material_product_name: 'meta_productName',
  heat_number: 'meta_heatNo',
  heat_treatment_lot_number: 'meta_packNo',
  delivery_state: 'meta_deliveryState',
  dimensions: 'meta_dimensions',
};

/**
 * 常用化学元素与理化检验白名单集合
 */
export const STANDARD_CHEMICAL_ELEMENTS = [
  'C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Ti', 'Cu', 'V', 'N', 'Al', 'Nb', 'W', 'B', 'Fe'
];

export const STANDARD_PHYSICAL_FIELDS = [
  'mech_tensile',
  'mech_yield',
  'mech_elongation',
  'mech_hardness',
  'mech_impact',
  'proc_flattening',
  'proc_flaring',
  'metallo_grain',
  'corrosion_intergranular',
  'ndt_et',
  'geo_dimensions',
];

/**
 * 从 Schema 动态反射聚合出所有合法的 BBox 字段 ID 白名单闭集
 */
export function getValidBBoxIdWhitelist(): string[] {
  const whitelist = new Set<string>();

  // 1. 从 CertificateHeaderSchema 反射元数据 ID
  const headerKeys = Object.keys(CertificateHeaderSchema.shape);
  for (const key of headerKeys) {
    if (META_FIELD_ID_MAP[key]) {
      whitelist.add(META_FIELD_ID_MAP[key]);
    }
  }

  // 2. 添加化学成分元素 ID
  for (const elem of STANDARD_CHEMICAL_ELEMENTS) {
    whitelist.add(`chem_${elem}`);
  }

  // 3. 添加力学与工艺无损检验 ID
  for (const field of STANDARD_PHYSICAL_FIELDS) {
    whitelist.add(field);
  }

  return Array.from(whitelist);
}

/**
 * 基于 Schema 动态构建紧凑且带注释的结构化抽取 JSON 模板
 */
export function buildSchemaStructureTemplate(): string {
  return `{
  "header": {
    "certificateNo": "质保书编号 / 材质单号",
    "productName": "产品品名 (如 锅炉、热交换器用不锈钢无缝钢管)",
    "declaredStandard": "执行标准 (如 GB/T 13296-2023, NB/T 47019.5-2021)",
    "declaredGrade": "材料牌号 (如 S32168, 06Cr18Ni11Ti, 022Cr17Ni12Mo2)",
    "supplierName": "供货/制造厂家名称",
    "constructionNo": "施工号/项目号",
    "heatNo": "冶炼炉号 (Heat No.)",
    "packNo": "热处理装炉号 (Pack No.)",
    "deliveryState": "交货状态 (如 固溶退火, 光亮退火)",
    "dimensions": "规格尺寸 (如 OD 15.0mm × WT 0.8mm × L 6000mm)"
  },
  "batches": [
    {
      "batchNo": "试样批号/炉批号 (如 Z26022C-DB7)",
      "chemical": [
        { "element": "C", "value": "0.018", "confidence": "99%" },
        { "element": "Si", "value": "0.44", "confidence": "98%" },
        { "element": "Mn", "value": "1.16", "confidence": "99%" },
        { "element": "P", "value": "0.035", "confidence": "97%" },
        { "element": "S", "value": "0.005", "confidence": "98%" },
        { "element": "Cr", "value": "17.41", "confidence": "99%" },
        { "element": "Ni", "value": "9.08", "confidence": "98%" },
        { "element": "Ti", "value": "0.14", "confidence": "95%" }
      ],
      "mechanical": {
        "tensile_rm": "抗拉强度实测值 (如 621 MPa)",
        "yield_rp02": "规定塑性延伸强度 Rp0.2 实测值 (如 268 MPa)",
        "elongation_a": "断后伸长率实测值 (如 57.5 %)",
        "hardness": "硬度实测值 (如 139.3 HV1)"
      },
      "process": {
        "flattening": "合格",
        "flaring": "合格",
        "intergranularCorrosion": "合格",
        "grainSize": "7.0 级",
        "ndt": "合格"
      },
      "dimensions": "规格尺寸 (如 OD 15.0mm × WT 0.8mm × L 6000mm)"
    }
  ]
}`.trim();
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
