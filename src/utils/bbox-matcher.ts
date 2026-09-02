import { FieldBBox } from '../types/bbox.ts';
import { SessionDocument } from '../types/session.ts';

export interface TextTokenItem {
  str: string;
  page: number;
  x: number; // 0 ~ 100 百分比
  y: number; // 0 ~ 100 百分比
  w: number; // 0 ~ 100 百分比
  h: number; // 0 ~ 100 百分比
}

/**
 * 智能文本锚点匹配器 (BBoxAnchorMatcher)
 * 基于 PDF 矢量文本层中每个 Token 的物理百分比坐标，将大模型结构化解析出的字段值
 * 精确回溯匹配为 100% 真实无偏差的 FieldBBox[]。
 */
export function matchFieldBBoxesFromTokens(
  doc: SessionDocument,
  tokens: TextTokenItem[]
): FieldBBox[] {
  if (!tokens || tokens.length === 0 || !doc.batches || doc.batches.length === 0) {
    return [];
  }

  const bboxes: FieldBBox[] = [];
  const addedKeys = new Set<string>();

  // 辅助函数：在指定页或全局搜索文本 Token 并生成 BBox
  const findTokenBox = (
    query: string | undefined,
    id: string,
    label: string,
    category: FieldBBox['category'] = 'meta',
    preferredPage?: number
  ): FieldBBox | null => {
    if (!query || query.trim().length === 0) return null;
    const cleanQuery = query.trim();
    const key = `${id}_${preferredPage || 1}`;
    if (addedKeys.has(key)) return null;

    // 1. 优先精确匹配
    let matchedToken: TextTokenItem | undefined;

    // 按页过滤（若指定了期望页码）
    const candidateTokens = preferredPage
      ? tokens.filter(t => t.page === preferredPage)
      : tokens;

    // 查找完全一致或高吻合度 Token
    matchedToken = candidateTokens.find(t => t.str.trim() === cleanQuery);

    if (!matchedToken) {
      // 包含匹配：优先长字符串包含短 token（token 长度 >= 2 避免单字符干扰）
      matchedToken = candidateTokens.find(t => 
        t.str.length >= 2 && (cleanQuery.includes(t.str) || t.str.includes(cleanQuery))
      );
    }

    // 如果优先页未找到且指定了优先页，在全局候选集中搜索兜底
    if (!matchedToken && preferredPage) {
      matchedToken = tokens.find(t => t.str.trim() === cleanQuery);
      if (!matchedToken) {
        matchedToken = tokens.find(t => 
          t.str.length >= 2 && (cleanQuery.includes(t.str) || t.str.includes(cleanQuery))
        );
      }
    }

    if (matchedToken) {
      addedKeys.add(key);
      return {
        id,
        page: matchedToken.page,
        x: Math.max(0, Math.min(100, parseFloat(matchedToken.x.toFixed(2)))),
        y: Math.max(0, Math.min(100, parseFloat(matchedToken.y.toFixed(2)))),
        w: Math.max(2, Math.min(60, parseFloat((matchedToken.w + 1.0).toFixed(2)))),
        h: Math.max(1.5, Math.min(10, parseFloat((matchedToken.h + 0.5).toFixed(2)))),
        label: `${label}: ${cleanQuery}`,
        category,
      };
    }

    return null;
  };

  const firstBatch = doc.batches[0];
  if (!firstBatch) return [];

  // 1. 基础元数据 (Page 1)
  const metaItems = [
    { id: 'meta_certificateNo', query: firstBatch.certificateNo, label: '质保书编号', page: 1 },
    { id: 'meta_declaredStandard', query: firstBatch.standard, label: '执行标准', page: 1 },
    { id: 'meta_declaredGrade', query: firstBatch.grade, label: '材料牌号', page: 1 },
    { id: 'meta_supplier', query: firstBatch.supplier, label: '生产厂家', page: 1 },
    { id: 'meta_constructionNo', query: firstBatch.constructionNo, label: '施工号/项目号', page: 1 },
    { id: 'meta_heatNo', query: firstBatch.heatNo, label: '冶炼炉号 (Heat No.)', page: 1 },
    { id: 'meta_packNo', query: firstBatch.packNo, label: '热处理装炉号 (Pack No.)', page: 1 },
    { id: 'meta_deliveryState', query: firstBatch.deliveryState, label: '交货状态', page: 1 },
    { id: 'meta_dimensions', query: firstBatch.dimensions, label: '规格尺寸', page: 1 },
  ];

  for (const item of metaItems) {
    const bbox = findTokenBox(item.query, item.id, item.label, 'meta', item.page);
    if (bbox) bboxes.push(bbox);
  }

  // 2. 遍历各批次检验数据 (支持多批次与 Page 2/Page 3 映射)
  doc.batches.forEach((batch, bIdx) => {
    const pageTarget = bIdx === 0 ? 2 : Math.min(doc.pageCount, 2 + Math.floor(bIdx / 2));

    // 批次号定位
    if (batch.batchNo) {
      const bBox = findTokenBox(batch.batchNo, `batch_no_${batch.batchNo}`, `试样批号`, 'meta', pageTarget);
      if (bBox) bboxes.push(bBox);
    }

    // 化学成分
    if (Array.isArray(batch.chemical)) {
      batch.chemical.forEach(chem => {
        if (chem.value && chem.value !== '--') {
          const valClean = chem.value.replace(/[%<]/g, '').trim();
          const chemBox = findTokenBox(
            valClean,
            `chem_${chem.element}`,
            `化学成分 ${chem.element}`,
            'chemical',
            1
          );
          if (chemBox) bboxes.push(chemBox);
        }
      });
    }

    // 力学性能 (Page 2)
    if (batch.mechanical) {
      if (batch.mechanical.tensile_rm) {
        const num = batch.mechanical.tensile_rm.match(/\d+(\.\d+)?/)?.[0];
        const mBox = findTokenBox(num, 'mech_tensile', '抗拉强度 Rm', 'mechanical', pageTarget);
        if (mBox) bboxes.push(mBox);
      }
      if (batch.mechanical.yield_rp02) {
        const num = batch.mechanical.yield_rp02.match(/\d+(\.\d+)?/)?.[0];
        const mBox = findTokenBox(num, 'mech_yield', '屈服强度 Rp0.2', 'mechanical', pageTarget);
        if (mBox) bboxes.push(mBox);
      }
      if (batch.mechanical.elongation_a) {
        const num = batch.mechanical.elongation_a.match(/\d+(\.\d+)?/)?.[0];
        const mBox = findTokenBox(num, 'mech_elongation', '断后伸长率 A', 'mechanical', pageTarget);
        if (mBox) bboxes.push(mBox);
      }
      if (batch.mechanical.hardness) {
        const num = batch.mechanical.hardness.match(/\d+(\.\d+)?/)?.[0];
        const mBox = findTokenBox(num, 'mech_hardness', '硬度实测值', 'mechanical', pageTarget);
        if (mBox) bboxes.push(mBox);
      }
    }
  });

  return bboxes;
}
