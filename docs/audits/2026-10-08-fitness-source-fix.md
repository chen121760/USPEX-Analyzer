# Fitness 原始值与重建凸包距离分离

Fitness 保留 USPEX 文件提供的原始数值。未提供 Fitness 的结构显示 `—`，不再由程序重建距离补写。程序计算的凸包距离保存在 `eHullRecons`，凸包页可切换到 **Ed（程序重建）** 查看。

## 使用行为

- 数据表、比较和筛选预览显示缺失标记；缺失值不满足任何 Fitness 数值条件，包括“不等于”，排序时放在已有数值之后。
- USPEX Fitness 模式只绘制有原始 Fitness 的结构；Ed 模式绘制有重建距离的结构，提示、色带与图表导出使用 Ed 名称及重建能量单位。
- 固定组分能量排名使用计算的每原子相对焓 `ΔH`，不依赖原始 Fitness；排名 CSV 对应列为 `DeltaH(eV/atom)`。
- 工作台按有效能量和组成导入结构，保留缺少原始 Fitness 的结构。重算只更新 Ed；CSV 分别导出原始 Fitness 与 Ed，JSON 同时保留两个字段。手动结构没有原始 Fitness。
- 内部缺失值使用 `NaN`，CSV 写空单元格，JSON 写 `null`，重新载入恢复为缺失值。有效原始零值始终保留，并用于原始 Fitness 稳定相统计。

## 文件来源与旧项目

有 `extended_convex_hull` 数据时，主 Fitness 列取该文件；只存在于 `Individuals` 的结构保持主 Fitness 缺失。`Individuals` 自身的 Fitness 是独立目标列，保存在 `Fitness-Individuals`，不拿来补齐缺少的凸包文件记录。整个运行没有凸包数据时，继续支持读取 `Individuals` 的原始 Fitness 或 USPEX25 `e_above_hull`；列名存在检查与解析使用一致的大小写归一化。

新解析项目记录 `fitnessSemantics: uspex-original`。旧项目缺少这项标记，数据表与凸包页提示来源未核实。历史文件只保存了最终数值，无法可靠判断哪些值是 USPEX 原值、哪些值由旧版本补写；不能按 `fitness === eHullRecons` 清空，因为真实原值也可能相等。

**恢复旧项目：重新导入原始 USPEX 文件，再保存项目。**

## 验证

新增 `fitnessMissingChecks.ts` 覆盖缺失值筛选、导出、JSON 往返、原始与计算显示分离、固定组分排名、工作台导入、手动结构、文件列缺失与大小写、源文件优先级及稳定统计。既有二元、三元、四元和固定组分数值检查继续验证重建距离；原始 Fitness 的断言独立验证。

子 agent 对修改进行只读对抗性审查，独立复现并复核工作台源值保留、人工结构缺失值、图表点击、空值升降序和 JSON 往返。

验证结果：完整 npm test 通过（包含新增 11 项 Fitness 边界检查），生产构建通过；lint 为 0 errors、25 项已有 warnings。子 agent 最终复查未发现剩余可复现问题，并额外验证了重复 EA_ID／不同 _mergeSeq 的原始值映射及四元工作台保留独立 Ed。
