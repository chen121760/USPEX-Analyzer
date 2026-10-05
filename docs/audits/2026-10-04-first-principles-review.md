# 从第一性原理出发的对抗性审查

更新：本报告记录审查时的缺陷基线。B1–B8 已于 2026-10-05 修复，复现脚本已改为默认回归检查；最新结果见 [修复与兼容性验证](2026-10-05-first-principles-fixes.md)。

日期：2026-10-04。审查对象：`724dee0d000e073f18aedbe680f674d6d8a1400b` 加审查开始时工作区已有的 v1.5.4 修复。已有改动保留，本轮只新增审查报告和独立复现脚本，没有修改业务实现。

结论：**8 项可复现缺陷，5 项 P1、3 项 P2**。优先风险是科学结论错误和导入数据进入 HTML 执行边界。现有测试通过，但没有覆盖这些输入。上一轮 A4 的工作台退化凸包已修复；本轮 B2 揭示主解析器仍走另一套错误实现。

## 1. 项目必须满足的基本契约

用户使用这个项目的核心目的，是从 USPEX 输出中选出值得继续计算或验证的结构。因此，关键验收标准是“结果是否对应同一个结构，并且比较是否有定义”。

1. **结构身份一致。** ID 只在一个计算来源内有意义。合并能量、组成、几何前，需要核对元素映射和原子数。项目内一个可编辑 ID 必须唯一。
2. **归一化一致。** 对总原子数 N，`H_cell = N × H_atom`。同一组成和能量密度的比例晶胞应得到相同排序与凸包距离。
3. **凸包满足组成守恒。** 令每原子能量为 h、组成分数为 x，则：

   `h_hull(x) = min Σ λᵢ hᵢ`，约束为 `λᵢ ≥ 0`、`Σ λᵢ = 1`、`Σ λᵢ xᵢ = x`。

   `E_above_hull = h - h_hull(x)`。减去整个数据集的最低能量，只有同一组成的排序才成立。
4. **参考能不改变同组分能量差。** 对 `h' = h - x·μ`，满足组成守恒的混合物与候选相减去相同参考项，凸包距离不变。固定化合物的 `Δh = h - min(h)` 尤其不需要纯元素参考相；形成能可以未知，相对排序仍然有定义。
5. **未知值保持未知。** 缺失、非数值和未收敛不能变成实测零值；序列化不能改变这一状态。
6. **边界与往返保持语义。** 三元空间内的一条二元边应该得到相同的二元凸包；项目导出再载入，应保持结构身份、物性值和缺失状态。
7. **导入数据只提供数据。** 化学式、标签、来源和几何文本不应成为 HTML 或脚本。

本轮用这些契约建立最小输入，调用正式解析器、领域函数、Zustand store 和 React 组件。没有另写凸包算法来替代被审查实现。

## 2. 已确认缺陷

### B1 · P1：固定化合物排序错误依赖纯元素参考相

位置：[convexHullReconstruction.ts:655](../../src/lib/convexHullReconstruction.ts#L655)、[固定排序分支:712](../../src/lib/convexHullReconstruction.ts#L712)。

输入：两个 TiH 晶胞，总能量分别为 −4、−3 eV，各有 2 个原子；没有纯 Ti 或纯 H 相，也没有 USPEX fitness 列。正式 `parseAllFiles()` 识别为固定组分。

- 正确：每原子能量 −2、−1.5 eV，排序距离为 `[0, 0.5]` eV/atom。
- 实际：`fitness = [NaN, NaN]`，`eHullRecons = [-1, -1]`。

原因：先要求形成能有定义，随后将缺少元素参考的结构从 `converged` 排除；固定排序分支因此没有可用结构。Energy Ranking 使用 fitness 作纵轴，这类普通化合物搜索无法得到正确图表和导出距离。已有固定组分测试只用单元素 Si，Si 本身就是参考相，遗漏了这个场景。

修复要求：固定组分分支应在形成能参考筛选之前，用有效每原子焓独立排名；形成能与相对能量分别记录。工作台已存在无需参考相的正确对照实现。

### B2 · P1：主解析器的三元边界凸包仍错误判定稳定端元

位置：[convexHullReconstruction.ts:754](../../src/lib/convexHullReconstruction.ts#L754)。

输入：系统为 Ti-H-Li，但结构只在 Ti-H 边上：Ti、H、低能 TiH、高能 TiH 的每原子焓为 `[-2, -1, -2.5, -2]`。Li 参考缺失不影响这些不含 Li 的结构。

- 正确距离：`[0, 0, 0, 0.5]` eV/atom。
- 实际距离：`[1, 1, 0, 0.5]` eV/atom。

原因：投影退化导致没有三维下凸包面时，主实现直接减全局最低形成能，没有满足组成守恒。Ti 和 H 被误判为不稳定。相同输入经普通二元重建或修复后的三元工作台均得到正确结果。

修复要求：主重建与工作台共用按投影有效维数构建的几何；覆盖单点、共线、共面和完整三维数据，距离计算与连线必须来自同一几何结果。

### B3 · P1：USPEX25 的 `nan` 被转换为零能量、零凸包距离

位置：[individualsParser.ts:153](../../src/parsers/individualsParser.ts#L153)、[能量与距离读取:227](../../src/parsers/individualsParser.ts#L227)。同类默认值也存在于 `extendedHullParser.ts`。

输入：Ti/H 两个正常端元，加一行 `num_atoms_all=[1,1], energy=nan, e_above_hull=nan`。

实际：失败行得到 `enthalpyTotal=0`、`fitness=0`、`eForm=1.5`、`eHullRecons=1.5`。同一结构一方面被 fitness 标为稳定，另一方面重建距离显示高于凸包 1.5 eV/atom。

原因：`parseNumber()` 把缺失和所有非有限数转换为 0；后续流程优先保留非负原始 fitness，不会用重建结果覆盖这个伪造的 0。失败计算可进入稳定结构统计、选点和导出。

修复要求：科学数值解析显式保留缺失状态；无效能量排除出有效计算样本，无效 Ed 允许在能量有效时重建。不要将缺失数值和真实零值共用默认值。

### B5 · P1：同 ID 的能量与不匹配的 POSCAR 静默合并

位置：[parsers/index.ts:520](../../src/parsers/index.ts#L520)、[化学式选择:529](../../src/parsers/index.ts#L529)。

输入：Individuals 的 EA1 为 `[1,1]`、总能量 −8 eV；gatheredPOSCARS 的同 ID 几何为 `[1,3]`。

实际：一个结构记录同时具有 `formula=TiH3`、`composition=[1,1]`、TiH₃ 几何；能量归一化用 2 个原子得到 −4 eV/atom。没有任何针对组成冲突的警告。

原因：多个文件只按数字 ID 连接，组成和几何未经交叉校验。用户混入另一个运行的同名文件、拿错结构文件，或同 ID 出现不同记录，都会产生看似完整的错误对象。ID 相同不能证明结构相同。

修复要求：按元素符号映射核对组成、总原子数和来源；冲突记录拒绝合并或隔离，并给出 ID 与文件级诊断。不能通过任选一个公式让冲突消失。

### B8 · P1：导入的化学式进入真实 HTML 标签与事件属性

位置：[compositionUtils.ts:307](../../src/parsers/compositionUtils.ts#L307)、[FormulaDisplay.tsx:23](../../src/components/FormulaDisplay.tsx#L23)。

输入：合法项目 JSON 的 formula 为 `<img src=x onerror="window.__reviewMarker=true">`。

实际：项目校验和正式 store 载入均成功；正式 `FormulaDisplay` 的 React 静态渲染结果为：

```html
<span><img src=x onerror="window.__reviewMarker=true"></span>
```

`formulaToHtml()` 只替换数字，不转义 HTML；“formula 总是内部生成”的注释与 JSON 导入路径矛盾。同一函数还用于结构模态框及图表提示。这个输出已确认任意标签和事件属性能够到达 HTML sink，具备导入型持久化 XSS 条件；本轮未在浏览器执行事件，也未尝试读取或发送用户数据。

修复要求：先转义文本，再生成受控下标，或直接使用 React 文本节点与 `<sub>`。为图表提示中的 formula、origin、groupName 等动态文本定义统一的转义边界。

### B4 · P2：重复 ID 被接受，一次备注操作修改多个结构

位置：[validateProject.ts:52](../../src/domain/project/validateProject.ts#L52)、[项目结构校验:99](../../src/domain/project/validateProject.ts#L99)。

输入：项目中一个 Ti 和一个 H 结构都为 ID 1。

实际：正式加载成功；执行 `updateStructureNotes(1, 'single target')` 后，两个结构都被写入同一备注。标签和按 ID 维护的选择也无法区分它们。

修复要求：在项目结构与手动结构的合并命名空间内校验 ID 唯一性；冲突应在替换当前项目之前拒绝。原始文件重复行若需要支持，应明确按来源或历史记录处理，不能让相互冲突的数据进入同一可编辑 ID。

### B6 · P2：没有任何能量字段的 JSON 被补成“有效零能量样本”

位置：[normalizeStructure.ts:73](../../src/domain/structure/normalizeStructure.ts#L73)、[validateProject.ts:50](../../src/domain/project/validateProject.ts#L50)。

输入：结构只包含 `{id:3, composition:[1,1], fitness:0}`。

实际：校验通过，载入后 `enthalpy=0`、`enthalpyTotal=0`；正式 `validPlotStructure()` 判定它是有效能量图数据。

原因：省略值采用 `?? 0`，虽然显式 JSON null 能量已被上一轮修复，但完全缺省的能量仍被制造为零。

修复要求：至少需要一个有明确单位的有效能量字段，或者载入为未知能量并排除出能量计算；仅当一侧有效且原子数有效时补另一侧。

### B7 · P2：未知体积导出再导入后变成实测零值

位置：[normalizeStructure.ts:75](../../src/domain/structure/normalizeStructure.ts#L75)、[volumeTotal:86](../../src/domain/structure/normalizeStructure.ts#L86)。

输入：有效能量结构的 `volume` 和 `volumeTotal` 都为 NaN，经过真实 `JSON.stringify/parse` 再调用项目载入。

实际：JSON 中的 null 被归一化为 `volume=0`、`volumeTotal=0`，未知状态丢失。以体积为轴的图表、数值筛选和导出会把它当成真实零值。

修复要求：科学字段采用统一的缺失值迁移规则；null 与缺省不能随意转换为实测零。补充缺失物性与有效零值分别往返的对照。

## 3. 根本设计问题与优先顺序

这些缺陷集中在三个边界，而非图表功能数量不足：

- **科学计算分叉。** 主重建与工作台维护不同的固定排序、退化几何和失效规则，修复容易只覆盖一个入口。应先合并领域实现，使 UI、解析和导出共用同一计算契约。
- **字段过载。** fitness 同时承担 USPEX 原始评价、固定组分相对焓、补算凸包距离和稳定性判断。B3 展示原始评价与补算距离矛盾却继续显示“稳定”。应至少保留值、单位、来源、缺失/失败状态和比较条件，明确稳定性由哪个有定义的量决定。
- **校验偏重类型，缺少关系约束。** 数字或字符串类型正确，不代表 ID 唯一、组成与 POSCAR 一致、能量单位可还原或文本可以作为 HTML。导入需要结构完整性和渲染信任边界的共同校验。

建议顺序：先封堵 B8 的 HTML 边界与 B3 的伪造数值；再修复 B1/B2 的科学核心；然后落实 B5/B4 的身份校验；最后统一 B6/B7 的缺失状态。修复时应让本轮正确行为断言逐项通过，并加入默认回归。

还有三个需要单独扩展验证的风险，本轮没有把它们计入上述 8 个缺陷：

- 工作台兼容性检查只比较元素、压力和组成块，未记录 DFT 方法、能量基准及收敛条件，无法自动保证跨运行能量可比。
- 归档解压使用同步 `unzipSync/gunzipSync`，没有文件数和解压后大小上限；主解析和部分凸包也在主线程运行。需要尺寸预算与取消机制，并用受控大输入验证可用性。
- JSmol 直接把 poscarText 拼入 `load DATA` 脚本，并设置 `allowJavaScript:true`；需要验证数据分隔符注入和 applet 权限。这里只记录代码路径风险，没有声称已经完成利用验证。

## 4. 复现与验证边界

在仓库根目录执行：

```powershell
node scripts/runFirstPrinciplesReview.mjs
```

当前输出：`8 defect(s) reproduced; 3 invariant(s) passed.`，退出码 **1**。断言写的是正确行为；退出 1 表示缺陷仍存在。脚本没有加入默认 `npm test`，避免改变本次审查范围。

三个通过的对照：工作台固定化合物排序；工作台三元边界凸包；普通二元解析重建。复现中的断言失败均来自正式业务函数；B8 额外使用正式 React 组件静态渲染。没有运行实际 DFT，也没有对浏览器视觉、跨标签页竞态、真实 IndexedDB 终止时落盘或所有文件格式做穷尽验证。

常规检查：现有 `npm test` 全部通过；`npm run build` 通过；`npm run lint` 为 0 errors、25 个已有 warnings。新增审查脚本单独 lint 通过，`git diff --check` 通过。

新增文件：

- `scripts/firstPrinciplesReviewChecks.ts`：8 项缺陷断言和 3 项对照。
- `scripts/runFirstPrinciplesReview.mjs`：通过 rolldown 打包正式源代码后执行，无新增依赖。
- 本审查报告。
