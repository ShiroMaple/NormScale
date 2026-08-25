'use client';

import React, { useState } from 'react';

interface SteelGradeSlice {
  code: string;
  name: string;
  type: 'austenite' | 'duplex' | 'ferrite_martensite';
  typeName: string;
  aliases: string[];
  scope: string;
  chemical: {
    element: string;
    symbol: string;
    limit: string;
    rounding: string;
  }[];
  mechanical: {
    tensile_rm_min: number;
    yield_rp02_min: number;
    elongation_a_min: number;
    hardness_hrb_max?: number;
    hardness_hbw_max?: number;
  };
  process: {
    flattening: string;
    flaring: string;
    ndt: string;
    corrosion: string;
  };
  dynamic_formula?: {
    formula_name: string;
    expression: string;
    variables: string[];
    description: string;
  };
}

const PRESET_SLICES: SteelGradeSlice[] = [
  {
    code: 'S30408',
    name: '06Cr19Ni10',
    type: 'austenite',
    typeName: '通用奥氏体不锈钢',
    aliases: ['AISI 304', 'SUS 304', '1.4301', 'X5CrNi18-10', 'TP304'],
    scope: '适用于锅炉受热面、热交换器及化工介质耐腐蚀无缝钢管。',
    chemical: [
      { element: '碳', symbol: 'C', limit: '≤ 0.080 %', rounding: '修约至 3 位小数' },
      { element: '硅', symbol: 'Si', limit: '≤ 1.00 %', rounding: '修约至 2 位小数' },
      { element: '锰', symbol: 'Mn', limit: '≤ 2.00 %', rounding: '修约至 2 位小数' },
      { element: '磷', symbol: 'P', limit: '≤ 0.045 %', rounding: '修约至 3 位小数' },
      { element: '硫', symbol: 'S', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '镍', symbol: 'Ni', limit: '8.00 ~ 11.00 %', rounding: '修约至 2 位小数' },
      { element: '铬', symbol: 'Cr', limit: '18.00 ~ 20.00 %', rounding: '修约至 2 位小数' },
      { element: '氮', symbol: 'N', limit: '≤ 0.10 %', rounding: '修约至 2 位小数' },
    ],
    mechanical: {
      tensile_rm_min: 520,
      yield_rp02_min: 205,
      elongation_a_min: 35,
      hardness_hrb_max: 90,
      hardness_hbw_max: 187,
    },
    process: {
      flattening: '平板间距离 H = (1+e)s / (e + s/D)，其中变形系数 e = 0.09，压扁至指定板距表面无裂纹。',
      flaring: '顶心锥度 60°，管端外径扩口率 ≥ 10%，扩口处无肉眼可见裂纹。',
      ndt: '逐根进行水压试验（P = 2sR/D）或 GB/T 7735 规定的 E3H 级涡流探伤与超声探伤。',
      corrosion: '按 GB/T 4334 规定的 E 法（硫酸-硫酸铜法）进行检验，试样弯曲后无晶间腐蚀倾向裂纹。',
    },
  },
  {
    code: 'S30403',
    name: '022Cr19Ni10',
    type: 'austenite',
    typeName: '超低碳奥氏体不锈钢 (304L)',
    aliases: ['AISI 304L', 'SUS 304L', '1.4306', 'X2CrNi19-11', 'TP304L'],
    scope: '超低碳设计，专门用于焊后免热处理的耐腐蚀承压管线。',
    chemical: [
      { element: '碳', symbol: 'C', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '硅', symbol: 'Si', limit: '≤ 1.00 %', rounding: '修约至 2 位小数' },
      { element: '锰', symbol: 'Mn', limit: '≤ 2.00 %', rounding: '修约至 2 位小数' },
      { element: '磷', symbol: 'P', limit: '≤ 0.045 %', rounding: '修约至 3 位小数' },
      { element: '硫', symbol: 'S', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '镍', symbol: 'Ni', limit: '9.00 ~ 13.00 %', rounding: '修约至 2 位小数' },
      { element: '铬', symbol: 'Cr', limit: '18.00 ~ 20.00 %', rounding: '修约至 2 位小数' },
    ],
    mechanical: {
      tensile_rm_min: 485,
      yield_rp02_min: 175,
      elongation_a_min: 35,
      hardness_hrb_max: 90,
      hardness_hbw_max: 187,
    },
    process: {
      flattening: '按标准系数 e = 0.09 压至板距 H，表面不得产生肉眼可见裂口。',
      flaring: '扩口率 ≥ 10%，顶心锥度 60° 完好。',
      ndt: '逐根水压或 E3H 级无损探伤合格。',
      corrosion: 'GB/T 4334 E 法检验合格。',
    },
  },
  {
    code: 'S31603',
    name: '022Cr17Ni12Mo2',
    type: 'austenite',
    typeName: '含钼耐酸超低碳不锈钢 (316L)',
    aliases: ['AISI 316L', 'SUS 316L', '1.4404', 'X2CrNiMo17-12-2', 'TP316L'],
    scope: '含钼 2.0%~3.0%，具备优良的抗点蚀与耐酸腐蚀性能，用于换热管关键承压部件。',
    chemical: [
      { element: '碳', symbol: 'C', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '硅', symbol: 'Si', limit: '≤ 1.00 %', rounding: '修约至 2 位小数' },
      { element: '锰', symbol: 'Mn', limit: '≤ 2.00 %', rounding: '修约至 2 位小数' },
      { element: '磷', symbol: 'P', limit: '≤ 0.045 %', rounding: '修约至 3 位小数' },
      { element: '硫', symbol: 'S', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '镍', symbol: 'Ni', limit: '10.00 ~ 14.00 %', rounding: '修约至 2 位小数' },
      { element: '铬', symbol: 'Cr', limit: '16.00 ~ 18.00 %', rounding: '修约至 2 位小数' },
      { element: '钼', symbol: 'Mo', limit: '2.00 ~ 3.00 %', rounding: '修约至 2 位小数' },
    ],
    mechanical: {
      tensile_rm_min: 485,
      yield_rp02_min: 175,
      elongation_a_min: 35,
      hardness_hrb_max: 90,
      hardness_hbw_max: 187,
    },
    process: {
      flattening: '压扁系数 e = 0.09，至 H 板距完好。',
      flaring: '扩口率 ≥ 10% 完好。',
      ndt: '逐根探伤合格。',
      corrosion: 'GB/T 4334 E 法合格。',
    },
  },
  {
    code: 'S32168',
    name: '06Cr18Ni11Ti',
    type: 'austenite',
    typeName: '含钛稳定化耐热不锈钢 (321)',
    aliases: ['AISI 321', 'SUS 321', '1.4541', 'X6CrNiTi18-10', 'TP321'],
    scope: '添加钛（Ti）稳定化元素，抗高温晶间腐蚀，最高工作温度可达 800℃。',
    chemical: [
      { element: '碳', symbol: 'C', limit: '≤ 0.080 %', rounding: '修约至 3 位小数' },
      { element: '钛', symbol: 'Ti', limit: '≥ 5×C 且 ≤ 0.70 %', rounding: '跨元素动态计算' },
      { element: '镍', symbol: 'Ni', limit: '9.00 ~ 12.00 %', rounding: '修约至 2 位小数' },
      { element: '铬', symbol: 'Cr', limit: '17.00 ~ 19.00 %', rounding: '修约至 2 位小数' },
    ],
    mechanical: {
      tensile_rm_min: 520,
      yield_rp02_min: 205,
      elongation_a_min: 35,
      hardness_hrb_max: 90,
      hardness_hbw_max: 187,
    },
    process: {
      flattening: '压扁系数 e = 0.09。',
      flaring: '顶心 60° 扩口率 ≥ 10%。',
      ndt: '逐根无损检测。',
      corrosion: '晶间腐蚀 E 法合格。',
    },
    dynamic_formula: {
      formula_name: '钛稳定化动态判定公式',
      expression: 'Ti_min = 5.0 * C_measured',
      variables: ['C', 'Ti'],
      description: '为固定奥氏体晶界碳原子并防止贫铬区形成，钛含量实测值必须满足 Ti ≥ 5 × C 且不超过 0.70%。',
    },
  },
  {
    code: 'S32205',
    name: '022Cr22Ni5Mo3N',
    type: 'duplex',
    typeName: '2205 标准双相不锈钢',
    aliases: ['2205', 'UNS S31803', '1.4462', 'X2CrNiMoN22-5-3'],
    scope: '具备高强度与极高的抗氯化物应力腐蚀开裂性能。',
    chemical: [
      { element: '碳', symbol: 'C', limit: '≤ 0.030 %', rounding: '修约至 3 位小数' },
      { element: '铬', symbol: 'Cr', limit: '22.00 ~ 23.00 %', rounding: '修约至 2 位小数' },
      { element: '镍', symbol: 'Ni', limit: '4.50 ~ 6.50 %', rounding: '修约至 2 位小数' },
      { element: '钼', symbol: 'Mo', limit: '3.00 ~ 3.50 %', rounding: '修约至 2 位小数' },
      { element: '氮', symbol: 'N', limit: '0.14 ~ 0.20 %', rounding: '修约至 2 位小数' },
    ],
    mechanical: {
      tensile_rm_min: 655,
      yield_rp02_min: 450,
      elongation_a_min: 25,
      hardness_hrb_max: 100,
      hardness_hbw_max: 290,
    },
    process: {
      flattening: '双相钢专用压扁系数 e = 0.07。',
      flaring: '扩口率 ≥ 10%。',
      ndt: '逐根探伤 + 金相双相比例检验 (奥氏体/铁素体 40%~60%)。',
      corrosion: '按 ASTM A923 或 GB/T 4334 检验。',
    },
  },
];

/**
 * ============================================================================
 * 国家标准知识库与规格切片浏览器 (Standard Explorer - MD3 精确规范)
 * ============================================================================
 */
export const StandardExplorer: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSlice, setSelectedSlice] = useState<SteelGradeSlice>(PRESET_SLICES[0]!);
  const [activeTab, setActiveTab] = useState<'chemical' | 'mechanical' | 'process' | 'formula'>('chemical');

  const filteredSlices = PRESET_SLICES.filter(slice => {
    const matchesSearch =
      slice.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slice.aliases.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedType === 'all' || slice.type === selectedType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-5 h-[calc(100vh-4rem-2rem)] overflow-y-auto custom-scrollbar p-6 select-none">
      {/* 顶部标准库搜索与分类 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="relative flex-1 max-w-lg">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-base">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索标准编号、钢级牌号或统一代号 (如 S30408, 316L, 13296)..."
              className="w-full rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low pl-9 pr-4 py-2 text-xs text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:border-primary focus:outline-none font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-on-surface-variant mr-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-base">filter_list</span>
              <span>分类:</span>
            </span>
            {[
              { id: 'all', label: '全部钢级 (31)' },
              { id: 'austenite', label: '奥氏体不锈钢 (21)' },
              { id: 'duplex', label: '双相不锈钢 (6)' },
              { id: 'ferrite_martensite', label: '铁素体/马氏体 (4)' },
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedType(cat.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedType === cat.id
                    ? 'bg-primary/10 text-primary dark:bg-primary-fixed-dim/20 dark:text-primary-fixed-dim font-bold border border-primary/30'
                    : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 主体分栏：左侧 35% 目录树，右侧 65% 切片详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 左侧：切片目录列表 */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
            
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-outline-variant/40 dark:border-border-dark">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-xs shrink-0">
                <span className="material-symbols-outlined text-2xl">menu_book</span>
              </div>
              <div>
                <span className="text-xs font-bold font-mono text-primary dark:text-primary-fixed-dim block">GB/T 13296-2023</span>
                <span className="text-xs text-on-surface dark:text-surface-bright font-medium line-clamp-1">
                  锅炉、热交换器用不锈钢无缝钢管
                </span>
                <span className="text-[10px] text-status-pass-text flex items-center gap-1 mt-0.5 font-bold">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  <span>现行有效 · 结构化切片已归档</span>
                </span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
              {filteredSlices.map(slice => {
                const isSelected = selectedSlice.code === slice.code;
                return (
                  <button
                    key={slice.code}
                    type="button"
                    onClick={() => setSelectedSlice(slice)}
                    className={`w-full text-left rounded-xl p-3 transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                        : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-on-surface dark:text-surface-bright">{slice.code}</span>
                        <span className="text-xs text-on-surface-variant">|</span>
                        <span className="font-mono text-xs text-primary dark:text-primary-fixed-dim font-bold">{slice.name}</span>
                      </div>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mt-0.5">{slice.typeName}</span>
                    </div>
                    <span className={`material-symbols-outlined text-base ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                      chevron_right
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：切片详细技术规范 */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-6 space-y-5 shadow-xs">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/40 dark:border-border-dark">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold font-mono text-on-surface dark:text-surface-bright tracking-tight">
                    {selectedSlice.name}
                  </h2>
                  <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary dark:text-primary-fixed-dim">
                    统一数字代号: {selectedSlice.code}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-1">{selectedSlice.scope}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {selectedSlice.aliases.map((alias, idx) => (
                  <span
                    key={idx}
                    className="rounded border border-outline-variant/60 bg-surface-container-low px-2 py-0.5 text-[11px] font-mono text-on-surface-variant"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>

            {/* 4 个技术选项卡 */}
            <div className="flex items-center gap-2 border-b border-outline-variant/40 pb-2">
              {[
                { id: 'chemical', label: '化学成分限值表' },
                { id: 'mechanical', label: '力学与硬度指标' },
                { id: 'process', label: '工艺与无损检验条款' },
                { id: 'formula', label: 'AST 动态公式与算法' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary dark:bg-primary-fixed-dim/20 dark:text-primary-fixed-dim font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 选项卡 1：化学成分 */}
            {activeTab === 'chemical' && (
              <div className="rounded-xl border border-outline-variant/40 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b uppercase">
                    <tr>
                      <th className="px-4 py-2.5">元素名称</th>
                      <th className="px-4 py-2.5">化学符号</th>
                      <th className="px-4 py-2.5">国家标准质量分数限值 (wt%)</th>
                      <th className="px-4 py-2.5">GB/T 8170 进舍修约规则</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {selectedSlice.chemical.map((chem, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-low/40">
                        <td className="px-4 py-2.5 font-sans font-medium text-on-surface dark:text-surface-bright">{chem.element}</td>
                        <td className="px-4 py-2.5 text-primary font-bold">{chem.symbol}</td>
                        <td className="px-4 py-2.5 font-bold text-on-surface dark:text-surface-bright">{chem.limit}</td>
                        <td className="px-4 py-2.5 text-on-surface-variant font-sans">{chem.rounding}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 选项卡 2：力学指标 */}
            {activeTab === 'mechanical' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low dark:bg-surface-dark-low p-4">
                  <span className="text-xs text-on-surface-variant block mb-1">抗拉强度下限 (Rm)</span>
                  <span className="text-2xl font-bold text-primary">
                    ≥ {selectedSlice.mechanical.tensile_rm_min}{' '}
                    <span className="text-xs text-on-surface-variant">MPa</span>
                  </span>
                </div>

                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low dark:bg-surface-dark-low p-4">
                  <span className="text-xs text-on-surface-variant block mb-1">规定塑性延伸强度 (Rp0.2)</span>
                  <span className="text-2xl font-bold text-primary">
                    ≥ {selectedSlice.mechanical.yield_rp02_min}{' '}
                    <span className="text-xs text-on-surface-variant">MPa</span>
                  </span>
                </div>

                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low dark:bg-surface-dark-low p-4">
                  <span className="text-xs text-on-surface-variant block mb-1">断后伸长率 (A)</span>
                  <span className="text-2xl font-bold text-primary">
                    ≥ {selectedSlice.mechanical.elongation_a_min}{' '}
                    <span className="text-xs text-on-surface-variant">%</span>
                  </span>
                </div>
              </div>
            )}

            {/* 选项卡 3：工艺条款 */}
            {activeTab === 'process' && (
              <div className="space-y-3 font-mono text-xs">
                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4">
                  <h4 className="font-bold text-primary mb-1">第 6.4.1 条：压扁试验规范</h4>
                  <p className="text-on-surface leading-relaxed">{selectedSlice.process.flattening}</p>
                </div>
                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4">
                  <h4 className="font-bold text-primary mb-1">第 6.5 条：承压致密性与无损检验</h4>
                  <p className="text-on-surface leading-relaxed">{selectedSlice.process.ndt}</p>
                </div>
              </div>
            )}

            {/* 选项卡 4：AST 公式 */}
            {activeTab === 'formula' && (
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-xs">
                    <span className="material-symbols-outlined text-2xl">calculate</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">
                      {selectedSlice.dynamic_formula ? selectedSlice.dynamic_formula.formula_name : '标准静态公差约束'}
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      基于抽象语法树 (AST) 编译的高性能动态公差求解器
                    </p>
                  </div>
                </div>

                {selectedSlice.dynamic_formula && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 font-mono text-xs text-primary font-bold">
                      <code>{selectedSlice.dynamic_formula.expression}</code>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {selectedSlice.dynamic_formula.description}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
