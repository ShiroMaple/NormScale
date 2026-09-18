/**
 * 字段与源文档视觉 OCR 标注框 (BBox) 映射规范
 * 坐标系采用百分比 (0 ~ 100)，以适配不同视窗宽度与缩放级别
 */

export interface FieldBBox {
  id: string;          // 关联字段唯一标识，如 "meta_certificateNo", "chem_C", "mech_tensile"
  page: number;        // 所在页码 (1-indexed, 如 1, 2, 3)
  x: number;           // 左上角 X 百分比 (0 ~ 100)
  y: number;           // 左上角 Y 百分比 (0 ~ 100)
  w: number;           // 宽度百分比
  h: number;           // 高度百分比
  label: string;       // 悬浮标签提示
  category?: 'meta' | 'chemical' | 'mechanical' | 'process' | 'corrosion' | 'ndt' | 'metallographic';
}

