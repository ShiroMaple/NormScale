import { describe, it, expect } from 'vitest';
import { getZPJEBBoxes } from '@/types/bbox';
import { DEFAULT_INSPECTION_SESSION } from '../fixtures/demo-session';
import fs from 'node:fs';
import path from 'node:path';

describe('ZPJE S32168 真实质保书多页 BBox 与 Mock Session 校验', () => {
  it('DEFAULT_INSPECTION_SESSION 首位包含 ZPJE S32168 真实文档与 3 个炉批', () => {
    const firstDoc = DEFAULT_INSPECTION_SESSION.documents[0]!;
    expect(firstDoc).toBeDefined();
    expect(firstDoc.docId).toBe('doc_zpje_01');
    expect(firstDoc.filename).toBe('ZPJE_S32168_HeatExchangeTube_MTC.pdf');
    expect(firstDoc.pageCount).toBe(3);
    expect(firstDoc.samplePages).toHaveLength(3);

    // 验证 public 目录下的真实 2x Retina 高清切图物理文件均存在且体积非空
    firstDoc.samplePages?.forEach((pageRelPath) => {
      const fullPath = path.join(process.cwd(), 'public', pageRelPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(100 * 1024); // > 100 KB
    });

    // 验证 3 个批次号
    expect(firstDoc.batches).toHaveLength(3);
    const batchNos = firstDoc.batches.map(b => b.batchNo);
    expect(batchNos).toEqual(['Z26022C-DB7', 'Z26022C-DB8', 'Z26022C-E1']);
  });

  it('getZPJEBBoxes 为各炉批生成精确的百分比坐标与跨页 BBox 映射', () => {
    const batches = ['Z26022C-DB7', 'Z26022C-DB8', 'Z26022C-E1'];

    batches.forEach((batchNo, idx) => {
      const bboxes = getZPJEBBoxes(batchNo);
      expect(bboxes.length).toBeGreaterThanOrEqual(18);

      // 验证坐标全部合法 (0 <= x, y, w, h <= 100)
      bboxes.forEach((box) => {
        expect(box.page).toBeGreaterThanOrEqual(1);
        expect(box.page).toBeLessThanOrEqual(3);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x).toBeLessThanOrEqual(100);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeLessThanOrEqual(100);
        expect(box.w).toBeGreaterThan(0);
        expect(box.h).toBeGreaterThan(0);
        expect(box.label.length).toBeGreaterThan(0);
      });

      // 验证第 1 页元数据与化学成分 BBox
      const chemC = bboxes.find(b => b.id === 'chem_C');
      expect(chemC).toBeDefined();
      expect(chemC?.page).toBe(1);

      // 验证第 2 页力学性能 BBox 及多炉批垂直行偏移递增
      const tensile = bboxes.find(b => b.id === 'mech_tensile');
      expect(tensile).toBeDefined();
      expect(tensile?.page).toBe(2);
      // DB7 在第 1 行 (22.8%)，DB8 在第 2 行 (24.8%)，E1 在第 3 行 (26.8%)
      const expectedTensileY = 22.8 + idx * 2.0;
      expect(Math.abs(tensile!.y - expectedTensileY)).toBeLessThan(0.01);

      // 验证第 1 页检验项目 BBox (含尺寸检验与表面质量)
      const geo = bboxes.find(b => b.id === 'geo_dimensions');
      expect(geo).toBeDefined();
      expect(geo?.page).toBe(1);

      // 验证第 3 页施工号与产品规格明细 BBox
      const constr = bboxes.find(b => b.id === 'meta_constructionNo');
      expect(constr).toBeDefined();
      expect(constr?.page).toBe(3);

      const inventory = bboxes.find(b => b.id === 'meta_inventoryQuantity');
      expect(inventory).toBeDefined();
      expect(inventory?.page).toBe(3);
    });
  });

  it('工作台提取项 fieldId 均能在 BBox 字典中找到对应映射', () => {
    const bboxes = getZPJEBBoxes('Z26022C-DB7');
    const bboxIdSet = new Set(bboxes.map(b => b.id));

    // 核心元数据
    ['meta_batchNo', 'meta_certificateNo', 'meta_constructionNo', 'meta_supplier', 'meta_grade', 'meta_standard', 'meta_heatNo', 'meta_packNo', 'meta_dimensions', 'meta_deliveryState'].forEach(id => {
      expect(bboxIdSet.has(id)).toBe(true);
    });

    // 化学成分 9 元素
    ['chem_C', 'chem_Si', 'chem_Mn', 'chem_P', 'chem_S', 'chem_Cr', 'chem_Ni', 'chem_Ti', 'chem_N'].forEach(id => {
      expect(bboxIdSet.has(id)).toBe(true);
    });

    // 力学性能
    ['mech_tensile', 'mech_yield', 'mech_elongation', 'mech_hardness'].forEach(id => {
      expect(bboxIdSet.has(id)).toBe(true);
    });

    // 工艺与金相实测结果
    ['proc_flattening', 'proc_flaring', 'metallo_grain', 'corrosion_intergranular', 'ndt_et'].forEach(id => {
      expect(bboxIdSet.has(id)).toBe(true);
    });

    // 独立试验依据方法/标准 BBox
    [
      'method_tensile',
      'method_hardness',
      'method_grain',
      'method_proc_flattening',
      'method_proc_flaring',
      'method_ndt_et',
      'method_ndt_ut',
      'method_corrosion_intergranular',
      'method_geo_dimensions',
      'method_surface_quality'
    ].forEach(id => {
      expect(bboxIdSet.has(id)).toBe(true);
    });
  });
});
