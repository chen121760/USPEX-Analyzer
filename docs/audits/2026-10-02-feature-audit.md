# 其他功能审查：数据正确性与维护负担

日期：2026-10-02。审查基线：`72e8947`（三元二维凸包重构已提交）。本次审查没有修改业务代码。

结论：最需要优先处理的是凸包工作台的组分映射和能量单位，其次是各凸包视图的形成能约定、HV Tracker 的数据口径、导入失败恢复和导出一致性。长文件本身不是缺陷；这里列出的重构理由均对应实际重复、状态耦合或已发现的功能问题。

## 验证方式

- 浏览相关页面、store、领域计算、解析和导出源码；本轮未逐页做浏览器交互测试。
- 最小复现调用真实领域函数和 store。页面内部函数通过 TypeScript AST 提取原始回调再执行，替换下载、定时器等外部副作用；没有重新实现被检查的算法。
- 临时复现脚本与输出位于 `D:/GitHub/07-USPEX-Analyzer/node_modules/.cache/feature-audit/`，不进入业务构建或标准测试。
- `npm test`：15 组、393 项检查通过。已有测试未覆盖下面这些跨功能场景。
- `npm run lint`：0 个错误、25 个警告，主要是旧绘图及 JSmol 边界的 `any`。

## 需要优先修复的缺陷

### 1. [P1] 工作台手动输入的每原子能量被当成晶胞总能量

位置：[手动结构创建](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/HullWorkshopPage.tsx:240)、[输入单位](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/components/AddStructureModal.tsx:165)、[形成能计算](D:/GitHub/07-USPEX-Analyzer/src/lib/convexHullReconstruction.ts:267)。已复现。

输入框标为 `eV/atom`，创建结构时却同时把输入写入 `enthalpy` 和 `enthalpyTotal`。计算器优先把有限的 `enthalpyTotal` 当作晶胞总能量，再除以原子数。

复现：Ti/H 端元能量分别为 −2/−1 eV/atom，手动添加 TiH₃，输入 −3 eV/atom。

- 正确晶胞能量：−12 eV；形成能：−1.75 eV/atom。
- 实际晶胞能量：−3 eV；形成能：+0.5 eV/atom。

影响：本应降低凸包的结构可能被判断为凸包以上，手动添加的核心科学结果不可信。修复需统一每原子、每晶胞、每组分块的转换，不能只调整标签。

### 2. [P1] 工作台允许元素顺序不同，但没有重排组分

位置：[兼容性判断](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/components/ImportProjectModal.tsx:40)、[复制导入结构](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/components/ImportProjectModal.tsx:140)、[合并结构](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/HullWorkshopPage.tsx:76)。已复现。

项目兼容性按排序后的元素集合判断；导入和合并仅复制结构，未将 `composition`、组分基底和相关坐标重映射到统一元素顺序。合并计算只使用一份 `mergedSystemInfo`。

复现：A 项目元素为 `[Ti,H]`、TiH₃ 组分 `[1,3]`；B 项目元素为 `[H,Ti]`、同一化合物组分 `[3,1]`。导入判断通过，合并采用 `[Ti,H]`，两个结构的 H 分数实际得到 `0.75` 和 `0.25`，正确值均应为 `0.75`。

影响：坐标、端元参考和凸包距离静默出错。应建立统一导入规范化函数，所有来源先转为同一元素顺序和基底，再计算。

### 3. [P1] 固定组分工作台把缺少参考态的结构全部判为 Fitness=0

位置：[固定组分分支](D:/GitHub/07-USPEX-Analyzer/src/lib/workshopHull.ts:119)。已复现。

前面的形成能计算在缺少纯元素参考时写入 `eForm=-1`、`fitness=-1`，并记录 `undefinedFormation`；固定组分分支没有使用该集合，直接用这些 −1 求最小值并重写 Fitness。

复现：只包含两个 TiH 结构，每原子能量分别 −5 和 −4，无纯元素端元。实际两者均为 `eForm=-1, fitness=0`。两者能量不同，排序与相对最低能的距离不应相同。

固定组分的相对能量排序不需要纯元素参考，应按同一组分、同一能量单位直接计算；不要拿“形成能不可用”的显示值参与计算。

### 4. [P1] 二元、三元 3D、四元图仍把合法形成能 −1 当作缺失

位置：[二元能量访问](D:/GitHub/07-USPEX-Analyzer/src/modules/ConvexHull/BinaryHullPlot.tsx:93)、[三元 3D 凸包输入](D:/GitHub/07-USPEX-Analyzer/src/modules/ConvexHull/TernaryHullPlot3D.tsx:149)、[四元凸包输入](D:/GitHub/07-USPEX-Analyzer/src/modules/ConvexHull/QuaternaryHullPlot3D.tsx:525)、[数据表显示](D:/GitHub/07-USPEX-Analyzer/src/modules/DataTable/DataTablePage.tsx:373)。二元访问函数已复现，其余同类条件已静态核对。

`eForm !== -1 ? eForm : enthalpy` 混用了参考形成能与原始焓。真实 `eForm=-1`、原始焓 −9 的结构，二元图实际得到 −9；表格还会显示“—”。三元二维已修正这类判断，其他页面尚未统一。

影响：改变凸包输入能量和相平衡线；使用组分基底时还有 eV/atom 与 eV/block 混用风险。应把可用性、参考态和单位作为领域数据，所有视图共享同一个能量访问入口。

### 5. [P1] HV Tracker 用任意字段值 <900 过滤参考点与收敛曲线

位置：[自动参考点数据](D:/GitHub/07-USPEX-Analyzer/src/modules/BetaExplorer/BetaExplorerPage.tsx:290)、[逐代 HV 数据](D:/GitHub/07-USPEX-Analyzer/src/modules/BetaExplorer/BetaExplorerPage.tsx:550)。已复现。

`p.x < 900 && p.y < 900` 被应用到任意所选轴。Generation、Volume、弹性模量等合法数据可能超过 900，不能借用能量未收敛阈值。与此同时，这两个分支没有与散点相同的 `enthalpyTotal` 有效性检查。

复现：Generation=1000 和 Generation=1 的两条有效结构均进入散点；自动参考点数据只剩 Generation=1。逐代 HV 分支使用同样的错误条件。

影响：散点、参考点和 HV 曲线不是同一套有效数据，可能得出错误的优化进展结论。应先统一结构有效性，再对所选字段做有限值检查。

### 6. [P1] 项目 JSON 恢复失败后加载遮罩不会退出

位置：[JSON 类型识别](D:/GitHub/07-USPEX-Analyzer/src/lib/fileDetection.ts:57)、[恢复过程](D:/GitHub/07-USPEX-Analyzer/src/store/useProjectStore.ts:268)、[上传调用](D:/GitHub/07-USPEX-Analyzer/src/modules/Upload/UploadPage.tsx:167)。已复现。

检测只验证 `version/systemInfo/structures` 为真值；恢复先设置 `isLoading=true`，随后规范化，没有失败清理。

复现：合法 JSON 文本，含 `version`、`systemInfo`，但 `structures={}`。检测结果为 `project_json`；恢复抛出 `structures.map is not a function`；异常后 `isLoading` 仍为 true。上传页面虽然捕获异常，不能解除 store 的加载遮罩。

应在改变项目状态前验证 schema；恢复失败保留原项目，并在 finally 中结束加载。

## 导出、交互和保存问题

### 7. [P2] 筛选页 JSON 导出忽略筛选结果

位置：[JSON 导出分支](D:/GitHub/07-USPEX-Analyzer/src/modules/Filter/FilterPage.tsx:155)、[导出数量按钮](D:/GitHub/07-USPEX-Analyzer/src/modules/Filter/components/FilterExportPanel.tsx:162)。已复现。

按钮数量来自筛选结果；JSON 分支直接调用整个项目的 `exportProjectFile()`。复现：筛选匹配 1 个结构，JSON 实际导出 2 个。

如果产品需要“完整项目备份”，应明确放在独立入口；筛选导出应使用筛选快照，并定义关联数据如何保留。

### 8. [P2] HV Tracker 普通散点 CSV 仍只导出前 N 层

位置：[散点 CSV 导出](D:/GitHub/07-USPEX-Analyzer/src/modules/BetaExplorer/BetaExplorerPage.tsx:640)。已复现。

普通散点模式绘制全部 `filteredData`，导出却始终执行 `front > numFronts` 排除判断，不检查 `colorByFront`。

复现：普通散点有 2 个结构，分别属于 Front 1/2，`numFronts=1`；CSV 只有 1 个。渲染与导出应共享当前模式的可见结构集合。

### 9. [P2] HV Tracker 默认播放立即停止，GIF 默认只有一帧

位置：[播放](D:/GitHub/07-USPEX-Analyzer/src/modules/BetaExplorer/BetaExplorerPage.tsx:196)、[GIF 帧序列](D:/GitHub/07-USPEX-Analyzer/src/modules/BetaExplorer/BetaExplorerPage.tsx:219)。已复现。

在数值着色的普通散点模式，上限默认是最大值。播放从该值继续增加，第一步即停止；GIF 从最大值生成序列，只生成一帧。Explorer 对这两个场景有从最小值重播的处理，HV 的重复实现没有同步。

复现范围 0–10、步长 1：HV 第一帧后 `isPlaying=false`、无后续定时器，GIF 1 帧；Explorer 保持播放，GIF 11 帧。

核对说明：HV 的前沿模式不开放 GIF 入口，不能把 GIF 没有 Pareto 前沿单独报为缺陷。

### 10. [P2] Explorer GIF 忽略共享筛选的隐藏、高亮和淡化模式

位置：[GIF 数据构造](D:/GitHub/07-USPEX-Analyzer/src/modules/Explorer/ExplorerPage.tsx:332)、[实际页面可见数据](D:/GitHub/07-USPEX-Analyzer/src/modules/Explorer/ExplorerPage.tsx:452)。已复现隐藏模式；其余模式已静态核对。

页面通过 `effectiveFocusMode/focusMatches` 构造可见数据及高亮、淡化图层；GIF 从全部 `structures` 另建散点，只应用颜色范围。

复现：两个结构，隐藏模式仅匹配 ID1；实际 GIF 的最终帧仍有两个点。页面、PNG、GIF 和 CSV 应共享绘图模型，再按用途设置悬浮和交互选项。

### 11. [P2] Pareto 标记绕过已选择的前沿

位置：[标记候选集合](D:/GitHub/07-USPEX-Analyzer/src/modules/Pareto/ParetoPage.tsx:113)。静态核对。

主散点使用 `selectedFronts`；星形标记从所有有 Pareto 数据的结构查找，未限制所选前沿。用户取消 Front 2 后，属于 Front 2 的已标记结构仍可能出现，CSV 则按所选前沿导出。

应统一标记候选、计数、基础散点和导出范围，并明确是否允许“显示筛选外标记”。

### 12. [P2] 命名项目自动保存的异步错误捕获无效

位置：[自动保存助手](D:/GitHub/07-USPEX-Analyzer/src/store/useProjectStore.ts:40)、[会话自动保存](D:/GitHub/07-USPEX-Analyzer/src/hooks/usePersistence.ts:75)。异步拒绝已复现，保存触发差异已静态核对。

`saveProject()` 返回 Promise，助手没有 await/catch Promise；外层同步 try/catch 捕获不到 IndexedDB 异步拒绝。模拟配额错误时，拒绝实际逃逸为 `unhandledRejection`。

此外，命名项目和当前会话分别由 store 的零散 action 调用及 hook 的全状态订阅保存。标签定义、坐标标题等变更可更新会话记录，却不一定更新最近项目记录；对称性进度等非持久化变化又会触发整个会话保存的防抖。

应统一持久化服务、快照版本和错误反馈，分别定义会话恢复与用户项目保存的触发规则。

### 13. [P1] 工作台 JSON 导入没有使用已有的兼容性规则

位置：[JSON 导入](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/HullWorkshopPage.tsx:173)、[保存项目兼容性](D:/GitHub/07-USPEX-Analyzer/src/modules/HullWorkshop/components/ImportProjectModal.tsx:95)。静态核对。

保存项目入口检查元素集合和压力；JSON 入口只检查 `type === 'uspex-workshop'`，直接追加组。两个入口均未形成统一的组分基底兼容规则。

影响：不同压力或不同元素/基底的结构可混入同一个参考体系。应让当前项目、已存项目、JSON、手动输入共用导入规范化与兼容检查。

## “屎山”集中在哪里

| 模块 | 维护负担 | 建议 |
| --- | --- | --- |
| Explorer（952 行）与 HV Tracker（872 行） | 两套字段目录、有效值判定、颜色范围、定时播放、GIF 构造和边缘分布；已产生不同的行为与数据口径 | 共用字段目录、有效数据选择器、播放 hook 与绘图模型；HV 只负责前沿和收敛计算 |
| 三元 3D（898 行）、四元图（1085 行）、二元图 | 不同的形成能 fallback、标记逻辑和组分转换；三元 3D 的几何 useMemo 依赖 Fitness 上限，筛选也重新算凸包；四元组件内包含线性求解、几何计算和 UI | 先共享能量/单位/组分模型，再把几何计算移入领域层，保持视图组件只管交互和绘图 |
| 保存/恢复链路 | IndexedDB schema 在多个入口声明；会话、命名项目、工作台三套存储与跨 store 订阅；状态提交和异常恢复交织 | 抽出持久化服务及导入事务，成功后一次性替换项目状态 |
| DataTable（849 行）与筛选页 | 条件组追加逻辑复制；过滤器编辑器由 DataTable 模块导出并被其他页使用；旧过滤状态仍常驻 store | 把共享过滤器提升为独立领域/组件；迁移完成后只保留一份条件组运行状态 |
| FilterStore / ProjectStore | `filterConditions/filterUnifiedConditions` 没有活跃页面消费者；`filterPresets`、主项目手动结构增删 action 没有 UI 调用 | 先区分历史文件兼容字段与活跃功能，再移除无消费者的运行状态和 action；保留旧文件读取迁移 |
| ECharts adapter（1433 行） | 兼容旧图形描述、2D/3D、直方图、色标、注释和点击数据混在同一文件 | 按功能拆纯转换函数，维持适配契约与已有 83 项测试；不宜先整体推翻绘图库 |

解析、对称性 worker、共享筛选判断、导出 CSV 基础设施已经有较清晰的分层或回归检查。统计面板、对比页、谱系与结构查看器本轮没有发现同级别可确认缺陷，不代表已完成所有输入与浏览器兼容性的验证。

## 重构顺序与验收条件

1. **工作台正确性**：每原子/晶胞单位、元素顺序、组分基底、压力兼容和固定组分排名。验收时同一结构换元素顺序结果不变；手动 TiH₃ 的能量换算与独立手算一致；缺少端元也能正确比较同组分结构。
2. **共享科学数据约定**：形成能可用性与单位；HV 统一有效数据。合法 −1 不能消失；Volume=1000、Generation=1000 等有效值不能因阈值被排除；各视图与导出的科学字段一致。
3. **导出及交互一致性**：共享绘图模型和播放逻辑。筛选 JSON、普通散点 CSV、Explorer 隐藏模式 GIF 均使用明确的数据范围；默认播放及 GIF 能实际变化；Pareto 标记遵守前沿选择。
4. **保存/恢复**：schema 验证、失败清理、异步错误反馈、单一持久化服务。坏 JSON 不挂住界面；保存失败可见；恢复与最近项目记录的更新规则明确。
5. **删除冗余与拆大文件**：在以上功能回归通过后，清理旧过滤状态、无消费者 action、重复目录与兼容命名；保持筛选、标记、结构点击、谱系、对比、图形导出和旧项目读取正常。

本次只审查并记录问题。上述缺陷尚未修复，不能把已有测试通过视为它们已解决。
