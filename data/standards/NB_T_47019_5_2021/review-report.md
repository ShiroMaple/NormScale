# 标准入库人工抽检报告：NB/T 47019.5-2021

- 入库管线版本: 1.7.4
- 切片数: 22，条款数: 27，公差表: 0 项
- 落盘位置: staging（正式库须显式 promote，no-net-loss 门禁把关）
- 标准档（profile）: zh-cn

- 门禁结论: S3 门禁通过，但与存量全量 diff 存在丢失项——按验收口径不得判定全部通过

## 与存量规则级全量 diff（同标准既有库内容）

- 规则总数: 存量 452 -> 本次产物 448
- 新增 0 条 / 丢失 4 条 / 变更 66 条

### 丢失（no-net-loss 门禁将拦截 promote，存在丢失项按验收口径不得判定全部通过）
- 存量规则丢失: S30403/CHEM_S30403_N (N)
- 存量规则丢失: S30408/CHEM_S30408_N (N)
- 存量规则丢失: S31603/CHEM_S31603_N (N)
- 存量规则丢失: S31608/CHEM_S31608_N (N)

### 变更（property_key / criteria 数值比对不一致）
- 规则变更: S11306/PROC_FLATTENING_S11306 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S11306/PROC_REVERSE_BEND_S11306 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S11306/SURFACE_ROUGHNESS_S11306 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S30403/PROC_FLATTENING_S30403 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S30403/PROC_REVERSE_BEND_S30403 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S30403/SURFACE_ROUGHNESS_S30403 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S30408/PROC_FLATTENING_S30408 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S30408/PROC_REVERSE_BEND_S30408 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S30408/SURFACE_ROUGHNESS_S30408 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S30409/PROC_FLATTENING_S30409 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S30409/PROC_REVERSE_BEND_S30409 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S30409/SURFACE_ROUGHNESS_S30409 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S30453/PROC_FLATTENING_S30453 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S30453/PROC_REVERSE_BEND_S30453 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S30453/SURFACE_ROUGHNESS_S30453 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S30458/PROC_FLATTENING_S30458 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S30458/PROC_REVERSE_BEND_S30458 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S30458/SURFACE_ROUGHNESS_S30458 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31008/PROC_FLATTENING_S31008 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31008/PROC_REVERSE_BEND_S31008 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31008/SURFACE_ROUGHNESS_S31008 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31252/PROC_FLATTENING_S31252 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31252/PROC_REVERSE_BEND_S31252 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31252/SURFACE_ROUGHNESS_S31252 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31603/PROC_FLATTENING_S31603 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31603/PROC_REVERSE_BEND_S31603 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31603/SURFACE_ROUGHNESS_S31603 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31608/PROC_FLATTENING_S31608 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31608/PROC_REVERSE_BEND_S31608 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31608/SURFACE_ROUGHNESS_S31608 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31609/PROC_FLATTENING_S31609 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31609/PROC_REVERSE_BEND_S31609 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31609/SURFACE_ROUGHNESS_S31609 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31653/PROC_FLATTENING_S31653 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31653/PROC_REVERSE_BEND_S31653 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31653/SURFACE_ROUGHNESS_S31653 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31658/PROC_FLATTENING_S31658 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31658/PROC_REVERSE_BEND_S31658 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31658/SURFACE_ROUGHNESS_S31658 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31668/PROC_FLATTENING_S31668 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31668/PROC_REVERSE_BEND_S31668 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31668/SURFACE_ROUGHNESS_S31668 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31703/PROC_FLATTENING_S31703 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31703/PROC_REVERSE_BEND_S31703 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31703/SURFACE_ROUGHNESS_S31703 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S31708/PROC_FLATTENING_S31708 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S31708/PROC_REVERSE_BEND_S31708 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S31708/SURFACE_ROUGHNESS_S31708 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S32168/PROC_FLATTENING_S32168 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S32168/PROC_REVERSE_BEND_S32168 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S32168/SURFACE_ROUGHNESS_S32168 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S32169/PROC_FLATTENING_S32169 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S32169/PROC_REVERSE_BEND_S32169 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S32169/SURFACE_ROUGHNESS_S32169 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S34778/PROC_FLATTENING_S34778 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S34778/PROC_REVERSE_BEND_S34778 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S34778/SURFACE_ROUGHNESS_S34778 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S34779/PROC_FLATTENING_S34779 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S34779/PROC_REVERSE_BEND_S34779 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S34779/SURFACE_ROUGHNESS_S34779 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S38367/PROC_FLATTENING_S38367 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S38367/PROC_REVERSE_BEND_S38367 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S38367/SURFACE_ROUGHNESS_S38367 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []
- 规则变更: S39042/PROC_FLATTENING_S39042 property_key flattening_test -> flattening_test; criteria 数值 [] -> []
- 规则变更: S39042/PROC_REVERSE_BEND_S39042 property_key reverse_bend_test -> reverse_bend_test; criteria 数值 [] -> []
- 规则变更: S39042/SURFACE_ROUGHNESS_S39042 property_key surface_roughness -> surface_roughness; criteria 数值 [0.8/2] -> []

- diff 结论: 存在丢失项 4 条：按验收口径本报告不得判定"全部通过"，promote 将被 no-net-loss 门禁拦截（或经 --force 显式确认）

## 切片关键指标 ↔ 来源条款原文对照

### S30403 022Cr19Ni10（022Cr19Ni10 (S30403)）

- 别名（世界知识，供人工抽检）: SUS304L、TP304L、00Cr19Ni10

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S30403_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_Ni | chemical | numeric_range | Ni | 8 | 12 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30403_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S30403_tensile_strength | mechanical | numeric_range | tensile_strength | 480 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30403_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 175 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30403_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S30403 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S30403 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S30403 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S30403 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S30403 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S30403 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S30403 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S30403 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S30403 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S30408 06Cr19Ni10（06Cr19Ni10 (S30408)）

- 别名（世界知识，供人工抽检）: SUS304、TP304、0Cr18Ni9

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S30408_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_Ni | chemical | numeric_range | Ni | 8 | 11 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30408_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S30408_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30408_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30408_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S30408 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S30408 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S30408 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S30408 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S30408 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S30408 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S30408 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S30408 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S30408 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S30409 07Cr19Ni10（07Cr19Ni10 (S30409)）

- 别名（世界知识，供人工抽检）: SUS304H、TP304H、304H

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S30409_C | chemical | numeric_range | C | 0.04 | 0.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_Ni | chemical | numeric_range | Ni | 8 | 11 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30409_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S30409_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30409_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30409_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| DET_GRAIN_SIZE_S30409 | metallographic | numeric_range | grain_size | 4 | 7 | 级 | 6.9 | 6.9 晶粒度 07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。 |
| PROC_FLATTENING_S30409 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S30409 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S30409 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S30409 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S30409 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S30409 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S30409 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S30409 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S30409 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S30453 022Cr19Ni10N（022Cr19Ni10N (S30453)）

- 别名（世界知识，供人工抽检）: SUS304LN、TP304LN、304LN、00Cr18Ni10N

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S30453_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_Ni | chemical | numeric_range | Ni | 8 | 11 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30453_N | chemical | numeric_range | N | 0.1 | 0.16 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S30453_tensile_strength | mechanical | numeric_range | tensile_strength | 515 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30453_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30453_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S30453 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S30453 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S30453 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S30453 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S30453 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S30453 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S30453 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S30453 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S30453 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S30458 06Cr19Ni10N（06Cr19Ni10N (S30458)）

- 别名（世界知识，供人工抽检）: SUS304N1、304N、0Cr19Ni9N

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S30458_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_Ni | chemical | numeric_range | Ni | 8 | 11 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S30458_N | chemical | numeric_range | N | 0.1 | 0.16 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S30458_tensile_strength | mechanical | numeric_range | tensile_strength | 550 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30458_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 240 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S30458_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S30458 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S30458 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S30458 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S30458 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S30458 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S30458 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S30458 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S30458 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S30458 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31008 06Cr25Ni20（06Cr25Ni20 (S31008)）

- 别名（世界知识，供人工抽检）: SUS310S、TP310S、0Cr25Ni20

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31008_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_Ni | chemical | numeric_range | Ni | 19 | 22 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31008_Cr | chemical | numeric_range | Cr | 24 | 26 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31008_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31008_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31008_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31008 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31008 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31008 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31008 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31008 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31008 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31008 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31008 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31008 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31603 022Cr17Ni12Mo2（022Cr17Ni12Mo2 (S31603)）

- 别名（世界知识，供人工抽检）: 316L、SUS316L、TP316L、00Cr17Ni14Mo2

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31603_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_Ni | chemical | numeric_range | Ni | 10 | 14 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_Cr | chemical | numeric_range | Cr | 16 | 18 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31603_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31603_tensile_strength | mechanical | numeric_range | tensile_strength | 480 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31603_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 175 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31603_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31603 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31603 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31603 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31603 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31603 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31603 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31603 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31603 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31603 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31608 06Cr17Ni12Mo2（06Cr17Ni12Mo2 (S31608)）

- 别名（世界知识，供人工抽检）: 316、SUS316、TP316、0Cr17Ni12Mo2

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31608_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_Ni | chemical | numeric_range | Ni | 10 | 14 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_Cr | chemical | numeric_range | Cr | 16 | 18.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31608_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31608_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31608_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31608_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31608 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31608 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31608 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31608 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31608 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31608 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31608 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31608 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31608 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31609 07Cr17Ni12Mo2（07Cr17Ni12Mo2 (S31609)）

- 别名（世界知识，供人工抽检）: 316H、TP316H

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31609_C | chemical | numeric_range | C | 0.04 | 0.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_Ni | chemical | numeric_range | Ni | 10 | 14 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_Cr | chemical | numeric_range | Cr | 16 | 18 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31609_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31609_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31609_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31609_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| DET_GRAIN_SIZE_S31609 | metallographic | numeric_range | grain_size | 4 | 7 | 级 | 6.9 | 6.9 晶粒度 07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。 |
| PROC_FLATTENING_S31609 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31609 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31609 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31609 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31609 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31609 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31609 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31609 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31609 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31653 022Cr17Ni12Mo2N（022Cr17Ni12Mo2N (S31653)）

- 别名（世界知识，供人工抽检）: 316LN、SUS316LN、TP316LN

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31653_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_Ni | chemical | numeric_range | Ni | 10 | 13 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_Cr | chemical | numeric_range | Cr | 16 | 18 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31653_N | chemical | numeric_range | N | 0.1 | 0.16 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31653_tensile_strength | mechanical | numeric_range | tensile_strength | 515 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31653_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31653_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31653 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31653 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31653 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31653 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31653 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31653 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31653 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31653 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S31653 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31658 06Cr17Ni12Mo2N（06Cr17Ni12Mo2N (S31658)）

- 别名（世界知识，供人工抽检）: 316N、SUS316N、TP316N

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31658_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_Ni | chemical | numeric_range | Ni | 10 | 13 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_Cr | chemical | numeric_range | Cr | 16 | 18 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31658_N | chemical | numeric_range | N | 0.1 | 0.16 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31658_tensile_strength | mechanical | numeric_range | tensile_strength | 550 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31658_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 240 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31658_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31658 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31658 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31658 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31658 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31658 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31658 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31658 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31658 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S31658 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31668 06Cr17Ni12Mo2Ti（06Cr17Ni12Mo2Ti (S31668)）

- 别名（世界知识，供人工抽检）: 316Ti、SUS316Ti、TP316Ti

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31668_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_Ni | chemical | numeric_range | Ni | 10 | 14 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_Cr | chemical | numeric_range | Cr | 16 | 18 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31668_Mo | chemical | numeric_range | Mo | 2 | 3 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31668_tensile_strength | mechanical | numeric_range | tensile_strength | 530 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31668_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31668_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31668 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31668 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31668 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31668 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31668 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31668 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31668 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31668 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| CHEM_TI_STABILIZED_5C_S31668 | chemical | dynamic_expression | Ti |  | 0.7 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| DET_HARDNESS_AUSTENITIC_2_S31668 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31703 022Cr19Ni13Mo3（022Cr19Ni13Mo3 (S31703)）

- 别名（世界知识，供人工抽检）: 317L、SUS317L、00Cr19Ni13Mo3

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31703_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_Ni | chemical | numeric_range | Ni | 11 | 15 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31703_Mo | chemical | numeric_range | Mo | 3 | 4 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31703_tensile_strength | mechanical | numeric_range | tensile_strength | 480 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31703_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 175 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31703_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31703 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31703 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31703 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31703 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31703 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31703 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31703 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31703 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31703 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31708 06Cr19Ni13Mo3（06Cr19Ni13Mo3 (S31708)）

- 别名（世界知识，供人工抽检）: 317、SUS317、0Cr19Ni13Mo3

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31708_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_Ni | chemical | numeric_range | Ni | 11 | 15 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_Cr | chemical | numeric_range | Cr | 18 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31708_Mo | chemical | numeric_range | Mo | 3 | 4 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31708_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31708_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31708_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31708 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31708 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31708 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31708 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31708 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31708 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31708 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31708 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_2_S31708 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S32168 06Cr18Ni11Ti（06Cr18Ni11Ti (S32168)）

- 别名（世界知识，供人工抽检）: 321、SUS321、0Cr18Ni10Ti、1Cr18Ni9Ti

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S32168_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_Ni | chemical | numeric_range | Ni | 9 | 12 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32168_Cr | chemical | numeric_range | Cr | 17 | 19 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S32168_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S32168_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S32168_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S32168 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S32168 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S32168 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S32168 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S32168 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S32168 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S32168 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S32168 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| CHEM_TI_STABILIZED_5CN_S32168 | chemical | dynamic_expression | Ti |  | 0.7 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| DET_HARDNESS_AUSTENITIC_2_S32168 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S32169 07Cr19Ni11Ti（07Cr19Ni11Ti (S32169)）

- 别名（世界知识，供人工抽检）: 321H、SUS321H、1Cr18Ni11Ti

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S32169_C | chemical | numeric_range | C | 0.04 | 0.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_Si | chemical | numeric_range | Si |  | 0.75 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_P | chemical | numeric_range | P |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_Ni | chemical | numeric_range | Ni | 9 | 13 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S32169_Cr | chemical | numeric_range | Cr | 17 | 20 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S32169_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S32169_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S32169_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| DET_GRAIN_SIZE_S32169 | metallographic | numeric_range | grain_size | 4 | 7 | 级 | 6.9 | 6.9 晶粒度 07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。 |
| PROC_FLATTENING_S32169 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S32169 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S32169 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S32169 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S32169 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S32169 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S32169 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S32169 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| CHEM_TI_STABILIZED_4CN_S32169 | chemical | dynamic_expression | Ti |  | 0.6 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| DET_HARDNESS_AUSTENITIC_2_S32169 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S34778 06Cr18Ni11Nb（06Cr18Ni11Nb (S34778)）

- 别名（世界知识，供人工抽检）: 347、SUS347、0Cr18Ni11Nb

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S34778_C | chemical | numeric_range | C |  | 0.08 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_Ni | chemical | numeric_range | Ni | 9 | 12 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34778_Cr | chemical | numeric_range | Cr | 17 | 19 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S34778_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S34778_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S34778_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S34778 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S34778 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S34778 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S34778 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S34778 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S34778 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S34778 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S34778 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| CHEM_NB_STABILIZED_10C_S34778 | chemical | dynamic_expression | Nb |  | 1.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| DET_HARDNESS_AUSTENITIC_2_S34778 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S34779 07Cr18Ni11Nb（07Cr18Ni11Nb (S34779)）

- 别名（世界知识，供人工抽检）: 347H、SUS347H、1Cr19Ni11Nb

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S34779_C | chemical | numeric_range | C | 0.04 | 0.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_Ni | chemical | numeric_range | Ni | 9 | 12 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S34779_Cr | chemical | numeric_range | Cr | 17 | 19 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S34779_tensile_strength | mechanical | numeric_range | tensile_strength | 520 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S34779_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 205 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S34779_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| DET_GRAIN_SIZE_S34779 | metallographic | numeric_range | grain_size | 4 | 7 | 级 | 6.9 | 6.9 晶粒度 07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。 |
| PROC_FLATTENING_S34779 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S34779 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S34779 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S34779 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S34779 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S34779 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S34779 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S34779 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| CHEM_NB_STABILIZED_8C_S34779 | chemical | dynamic_expression | Nb |  | 1.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| DET_HARDNESS_AUSTENITIC_2_S34779 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |

### S31252 015Cr20Ni18Mo6CuN（015Cr20Ni18Mo6CuN (S31252)）

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S31252_C | chemical | numeric_range | C |  | 0.02 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Si | chemical | numeric_range | Si |  | 0.8 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Mn | chemical | numeric_range | Mn |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_P | chemical | numeric_range | P |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_S | chemical | numeric_range | S |  | 0.01 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Ni | chemical | numeric_range | Ni | 17.5 | 18.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Cr | chemical | numeric_range | Cr | 19.5 | 20.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Mo | chemical | numeric_range | Mo | 6 | 6.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S31252_tensile_strength | mechanical | numeric_range | tensile_strength | 675 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31252_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 310 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S31252_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S31252 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S31252 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S31252 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S31252 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S31252 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S31252 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S31252 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S31252 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S31252 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |
| CHEM_S31252_N | chemical | numeric_range | N | 0.18 | 0.22 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S31252_Cu | chemical | numeric_range | Cu | 0.5 | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |

### S38367 022Cr21Ni25Mo7N（022Cr21Ni25Mo7N (S38367)）

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S38367_C | chemical | numeric_range | C |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Ni | chemical | numeric_range | Ni | 23.5 | 25.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Cr | chemical | numeric_range | Cr | 20 | 22 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Mo | chemical | numeric_range | Mo | 6 | 7 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S38367_tensile_strength | mechanical | numeric_range | tensile_strength | 690 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S38367_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 310 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S38367_elongation_A | mechanical | numeric_range | elongation_A | 30 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S38367 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S38367 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S38367 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S38367 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S38367 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S38367 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S38367 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S38367 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S38367 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |
| CHEM_S38367_N | chemical | numeric_range | N | 0.18 | 0.25 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S38367_Cu | chemical | numeric_range | Cu |  | 0.75 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |

### S39042 015Cr21Ni26Mo5Cu2（015Cr21Ni26Mo5Cu2 (S39042)）

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S39042_C | chemical | numeric_range | C |  | 0.02 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_Mn | chemical | numeric_range | Mn |  | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_P | chemical | numeric_range | P |  | 0.03 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_Ni | chemical | numeric_range | Ni | 24 | 26 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_Cr | chemical | numeric_range | Cr | 19 | 21 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_Mo | chemical | numeric_range | Mo | 4 | 5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S39042_tensile_strength | mechanical | numeric_range | tensile_strength | 490 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S39042_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 220 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S39042_elongation_A | mechanical | numeric_range | elongation_A | 40 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S39042 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S39042 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S39042 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S39042 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S39042 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S39042 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S39042 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S39042 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_AUSTENITIC_1_S39042 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |
| CHEM_S39042_Cu | chemical | numeric_range | Cu | 1.2 | 2 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S39042_N | chemical | numeric_range | N |  | 0.1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |

### S11306 06Cr13（06Cr13 (S11306)）

- 别名（世界知识，供人工抽检）: 0Cr13、410S、SUS410S

| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |
|---|---|---|---|---|---|---|---|---|
| CHEM_S11306_C | chemical | numeric_range | C |  | 0.06 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_Si | chemical | numeric_range | Si |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_Mn | chemical | numeric_range | Mn |  | 1 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_P | chemical | numeric_range | P |  | 0.035 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_S | chemical | numeric_range | S |  | 0.015 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_Ni | chemical | numeric_range | Ni |  | 0.6 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| CHEM_S11306_Cr | chemical | numeric_range | Cr | 11.5 | 13.5 | % | 表1 | 表 1 钢的牌号和化学成分 组织 类型 序 号 牌号 统一数 字代号 化学成分（质量分数） C Si Mn P S Ni Cr Mo 其他 不大于 奥 氏 体 型 1 022Cr1 |
| MECH_S11306_tensile_strength | mechanical | numeric_range | tensile_strength | 410 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S11306_yield_strength_rp02 | mechanical | numeric_range | yield_strength_rp02 | 210 |  | MPa | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| MECH_S11306_elongation_A | mechanical | numeric_range | elongation_A | 25 |  | % | 表2 | 表 2 Ⅱ级、Ⅰ级无缝管和焊接管的推荐热处理制度、室温力学性能及密度 组织 类型 序 号 牌号 统一数 字代号 推荐热处理制度 室温力学性能 密度 ρ/（kg/dm³） 加热温度/ |
| PROC_FLATTENING_S11306 | process | qualitative_pass | flattening_test |  |  |  | 6.5.1 | 6.5.1 压扁 壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。 |
| PROC_FLARING_SEAMLESS_AUSTENITIC_S11306 | process | qualitative_and_numeric | flaring_test |  |  |  | 6.5.2 | 6.5.2 扩口 |
| PROC_REVERSE_BEND_S11306 | process | qualitative_pass | reverse_bend_test |  |  |  | 6.5.4 | 6.5.4 焊接接头反向弯曲 焊接管应进行焊接接头反向弯曲试验。从管子上截取一段长 100mm 的试样，沿距焊缝两侧成 90°角位置纵向剖开，并将试样展平。弯芯直径为 4 倍试样厚 |
| NDT_TIGHTNESS_SEAMLESS_GROUP_S11306 | ndt | alternative_group | pressure_tightness |  |  |  | 6.6 | 6.6 水压试验 |
| CORR_INTERGRANULAR_S11306 | corrosion | qualitative_enum | intergranular_corrosion |  |  |  | 6.8 | 6.8 腐蚀试验 管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀 倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法 |
| NDT_ULTRASONIC_S11306 | ndt | enum_acceptance | ultrasonic_test |  |  |  | 6.10.1 | 6.10.1 超声检测 |
| SURFACE_DEFECT_FREE_S11306 | surface | qualitative_pass | surface_quality |  |  |  | 6.11.1 | 6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。若有这些缺陷应清除，清除处 的实际壁厚应不小于壁厚允许的最小值，且清除处应圆滑过渡。不超过壁厚允许最小值的其他局部 |
| SURFACE_ROUGHNESS_S11306 | surface | qualitative_pass | surface_roughness |  |  |  | 6.12 | 6.12 表面粗糙度 管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。 |
| DET_HARDNESS_FERRITIC_3_S11306 | mechanical | or_choice_group | hardness |  |  |  | 表4 | 表 4 硬度 组织类型 管子的牌号 硬度 HBW HRB HV 奥氏体型 022Cr19Ni10N、06Cr19Ni10N、 022Cr17Ni12Mo2N、06Cr17Ni12M |
