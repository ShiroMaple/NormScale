import { Dimensions } from '../schemas/certificate.schema';
import { UnitNormalizer } from './unit-normalizer';

/**
 * ============================================================================
 * 几何尺寸规格表达式解构归一化器 (Dimension Normalizer)
 * ============================================================================
 * 
 * 工业管材质保书中，规格往往写作一行复合字符串（如 'Φ25.0×2.0×6000mm' 或 '25*2.0*6000'），
 * 或者分散在不同的零散字段中。本类负责将其精准解构为外径、壁厚与长度，并统一换算为毫米 (mm)。
 * ============================================================================
 */
export class DimensionNormalizer {
  /** 复合尺寸匹配正则 (如 Φ25×2.0×6000, 25*2*6000, 25 x 2.0) */
  private static readonly COMPOSITE_DIM_REGEX =
    /[Φφ\s]*([0-9]+(?:\.[0-9]+)?)[\s]*[×*xX/\][\s]*([0-9]+(?:\.[0-9]+)?)(?:[\s]*[×*xX/\][\s]*([0-9]+(?:\.[0-9]+)?))?/i;

  public static normalize(
    rawDimensions?: Record<string, unknown>,
    rawSpecString?: string
  ): Dimensions | undefined {
    if (!rawDimensions && !rawSpecString) return undefined;

    let outer_diameter_mm: number | undefined;
    let wall_thickness_mm: number | undefined;
    let length_mm: number | undefined;
    let delivery_mode: 'nominal_wall' | 'min_wall' | undefined;

    // 1. 尝试从复合规格字符串中解析 (如 Φ25×2.0×6000)
    const specStr = String(
      rawSpecString || rawDimensions?.specification_raw || rawDimensions?.spec || ''
    ).trim();

    if (specStr) {
      const match = specStr.match(this.COMPOSITE_DIM_REGEX);
      if (match && match[1] && match[2]) {
        outer_diameter_mm = parseFloat(match[1]);
        wall_thickness_mm = parseFloat(match[2]);
        if (match[3]) {
          length_mm = parseFloat(match[3]);
        }
      }
    }

    // 2. 若有明确的独立字段，独立字段具有更高优先级或用于查漏补缺
    if (rawDimensions?.outer_diameter !== undefined && rawDimensions.outer_diameter !== null) {
      try {
        const norm = UnitNormalizer.normalizeDimension(rawDimensions.outer_diameter);
        outer_diameter_mm = norm.value;
      } catch {}
    }
    if (rawDimensions?.wall_thickness !== undefined && rawDimensions.wall_thickness !== null) {
      try {
        const norm = UnitNormalizer.normalizeDimension(rawDimensions.wall_thickness);
        wall_thickness_mm = norm.value;
      } catch {}
    }
    if (rawDimensions?.length !== undefined && rawDimensions.length !== null) {
      try {
        const norm = UnitNormalizer.normalizeDimension(rawDimensions.length);
        length_mm = norm.value;
      } catch {}
    }

    // 3. 交货方式解析 (最小壁厚 vs 公称壁厚)
    const delivStr = String(rawDimensions?.delivery_mode || '').trim();
    if (delivStr.includes('公称') || delivStr.includes('nominal')) {
      delivery_mode = 'nominal_wall';
    } else if (delivStr.includes('最小') || delivStr.includes('min') || delivStr.includes('W-C') || delivStr.includes('W-H')) {
      delivery_mode = 'min_wall';
    }

    return {
      outer_diameter_mm,
      wall_thickness_mm,
      length_mm,
      delivery_mode,
    };
  }
}
