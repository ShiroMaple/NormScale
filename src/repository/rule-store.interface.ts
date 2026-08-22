import { SpecificationSlice, StandardMeta, StandardRuleSet } from '../schemas/standard.schema';

export interface StandardOverview {
  standard_id: string;
  standard_name: string;
  version?: string;
  status: 'CURRENT' | 'SUPERSEDED' | 'WITHDRAWN';
  slice_count: number;
  available_slices: string[];
}

export interface IRuleStore {
  /**
   * 根据标准代号与规格特征键（主牌号、统一代号、别名、性能等级等）解析具体规则切片
   * @param standardId 标准标识，如 'GB/T 13296-2023' 或 'GB_T_13296_2023'
   * @param routingKey 路由特征键，如 '06Cr19Ni10', 'S30408', 'SUS304', 'Class_8.8'
   */
  resolveRuleSlice(standardId: string, routingKey: string): Promise<SpecificationSlice | undefined>;

  /**
   * 获取标准的元信息及尺寸公差表
   */
  getStandardMeta(standardId: string): Promise<StandardMeta | undefined>;

  /**
   * 组装完整的标准规则集（包含所有切片及向后兼容的 grade_rules）
   */
  getCompleteStandard(standardId: string): Promise<StandardRuleSet | undefined>;

  /**
   * 列出库中当前已收录的所有标准与切片概览清单
   */
  listAvailableStandards(): Promise<StandardOverview[]>;

  /**
   * 重新加载或刷新规则库内存索引
   */
  reload(): Promise<void>;
}
