# Fitness 原始值与重建凸包距离分离

Fitness 保留 USPEX 文件提供的原始数值。未提供 Fitness 的结构显示 `—`，不再由程序重建距离补写。程序计算的凸包距离保存在 `eHullRecons`，凸包页可切换到 **Ed（程序重建）** 查看。

## 使用行为

- 数据表、比较和筛选预览显示缺失标记；缺失值不满足任何 Fitness 数值条件，包括“不等于”，排序时放在已有数值之后。
- USPEX Fitness 模式只绘制有原始 Fitness 的结构；Ed 模式绘制有重建距离的结构，提示、色带与图表导出使用 Ed 名称及重建能量单位。
- 固定组分能量排名使用计算的每原子相对焓 `ΔH`，不依赖原始 Fitness；排名 CSV 对应列为 `DeltaH(eV/atom)`。
- 工作台项目导入按 USPEX 结果文件的结构 ID 选择有效能量和组成的记录。变组分使用 `extended_convex_hull`；定组分使用 `goodStructures` 或 `goodStructures_POSCARS`。缺失 Fitness 不影响保留集合，重建 Ed 也不能改变保留状态。
- 内部缺失值使用 `NaN`，CSV 写空单元格，JSON 写 `null`，重新载入恢复为缺失值。有效原始零值始终保留，并用于原始 Fitness 稳定相统计。

## 文件来源与旧项目

有 `extended_convex_hull` 数据时，主 Fitness 列取该文件；只存在于 `Individuals` 的结构保持主 Fitness 缺失。`Individuals` 自身的 Fitness 是独立目标列，保存在 `Fitness-Individuals`，不拿来补齐缺少的凸包文件记录。整个运行没有凸包数据时，继续支持读取 `Individuals` 的原始 Fitness 或 USPEX25 `e_above_hull`；列名存在检查与解析使用一致的大小写归一化。

新解析项目记录 `fitnessSemantics: uspex-original`。旧项目缺少这项标记，数据表与凸包页提示来源未核实。历史文件只保存了最终数值，无法可靠判断哪些值是 USPEX 原值、哪些值由旧版本补写；不能按 `fitness === eHullRecons` 清空，因为真实原值也可能相等。

**恢复旧项目：重新导入原始 USPEX 文件，再保存项目。**

## 2026-10-11：工作台统一使用 USPEX 保留结构

新解析项目记录 `uspexSelection: { source, ids }`。变组分在 `Individuals` 回退之前记录实际凸包文件的 ID；定组分按保留结果表的 ID 列读取，或按对应 POSCARS 的结构 ID 读取。两份定组分保留文件不一致时报告差异，结果表优先。

当前项目、历史项目及已有工作台缓存中的项目分组，都在计算之前按这份 ID 记录筛选。侧栏数量、凸包绘图、CSV 和 JSON 导出使用同一批结构。只有 `Individuals` 或只有文件表头的任务继续支持原项目分析，但工作台不能猜测去重状态。缺少保留记录的旧项目提示补充对应 USPEX 输出。

本地 USPEX 10.6 官方参考示例验证了定组分来源：EX01 的 `Individuals` 有 197 个 ID，`goodStructures` 与对应 POSCARS 都有 6 个；EX38 的 `goodStructures` 有 20 个 ID，而 `Pareto_ranking` 有 74 个。`BESTIndividuals`、`Pareto_ranking` 和全体 `gatheredPOSCARS` 不能替代指定保留集合。[USPEX 官方手册](https://uspex-team.org/static/file/uspex_manual_english_v2022.0.pdf)也分别列明定组分和变组分的对应结果文件。

定组分原始 Fitness 是优化目标，可为负能量；解析记录 `fitnessKind: objective`，有限负值保留并可显示、筛选、导出。变组分凸包距离记录 `fitnessKind: distance`，继续排除负占位值。定组分 Fitness 缺失仍为空，能量排名使用独立的每原子相对焓。

同一化学比例的不同晶胞（例如 `[4,8]` 与 `[3,6]`）按整数约分识别为定组分。保留 POSCARS 与同 ID 能量记录的原子组成发生冲突时，该 ID 不进入工作台，原项目中的能量记录继续保留。

新工作台 JSON 记录每组来源、组分模式、Fitness 语义和保留 ID，重新上传仍执行项目筛选。未记录来源的旧 JSON 及旧 JSON 缓存组不能自动当作外部候选；界面提示从原始 USPEX 项目重新导入。完整的旧手动候选分组可恢复为手动来源。明确的外部输入与手动候选保留其工作台用途。

## 验证

`fitnessMissingChecks.ts` 的 18 项边界检查覆盖缺失值、保留 ID、文件识别、几何冲突、源文件优先级及混合分组 JSON 往返；`fixedFitnessChecks.ts` 的 8 项检查覆盖真实负目标值、筛选、表格、CSV、JSON 与文件命名。既有二元、三元、四元和固定组分数值检查继续验证重建距离。

子 agent 对修改进行只读对抗性审查，核对官方定组分参考输出并独立复现同化学比例晶胞被误判为变组分的问题；该问题已修复。最终用 EX01 和 EX38 原始参考输出复核，工作台分别准确导入 6 个和 20 个保留 ID，原始负 Fitness 保持不变。

验证结果：完整 `npm test` 通过，生产构建通过；lint 为 0 errors、25 项已有 warnings。
