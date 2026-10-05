# 第一性原理审查缺陷修复

日期：2026-10-05。对应审查：[2026-10-04-first-principles-review.md](2026-10-04-first-principles-review.md)。本轮修复 B1–B8，保留开始时已有工作区修改。

| 编号 | 修复后的行为 | 兼容性与回归覆盖 |
| --- | --- | --- |
| B1 | 固定组分按总能量/原子数计算相对能量，不要求纯元素参考相 | TiH 排序 `[0, 0.5]`；比例晶胞相同归一化；已有 USPEX fitness 保留；形成能参考缺失时仍保持未知，并可 JSON 往返 |
| B2 | 主解析器与工作台共用按投影维数处理的三元下包络 | 三条二元边均得到正确端元与同组分距离；原有共线、共面、完整三维及绘图连线测试通过 |
| B3 | USPEX25 的缺失/非有限能量、体积和 Ed 保持 NaN | `nan` 能量不会变成有效零能量或稳定结构；能量有效但 Ed 未知时仍能重建；真实零值保留；Individuals 与 extended_convex_hull 均覆盖 |
| B4 | 在项目普通结构和手动结构的同一命名空间内拒绝重复 ID | 校验在替换当前项目之前完成；拒绝后当前项目和加载状态正常；不同工作台组仍各自校验自己的 ID |
| B5 | 对 POSCAR 按元素映射核对原子数，冲突几何被隔离并报告 EA 编号 | 能量记录保留；冲突几何不进入查看器与 seeds 导出；正常几何、元素重排、纯元素省略其他物种和零计数均保留 |
| B6 | 缺省能量保持未知；仅有有效总能量时可推导每原子能量 | 无能量结构不会成为有效能量图数据；有效每原子能量可补总能量；显式 null 保持未知；有效零值保留 |
| B7 | JSON null 体积还原为 NaN | 未知体积不会往返变成零；真实零体积保留；旧文件缺省字段保持原迁移兼容规则 |
| B8 | 化学式先转义文本，仅生成受控下标；ECharts 提示统一限制 HTML 格式 | 普通化学式下标、换行和上标保留；任意标签、事件属性、group/origin 与默认提示文本均无法直接成为 HTML 元素 |

## 实现范围

- `src/lib/hullGeometry.ts` 从原重建模块提取原有几何函数，原模块继续导出同一 API，避免共享三元几何时产生循环依赖。
- `src/lib/convexHullReconstruction.ts` 独立处理固定组分排名，并在三元分支调用共享几何。能量无效的结构不参与形成能计算。
- `src/domain/structure/normalizeStructure.ts` 修复缺失能量、null 体积与 null 形成能的迁移，防止有了相对能量后把缺失形成能的旧 −1 标记误当成真实值。
- `src/domain/project/validateProject.ts` 增加项目内 ID 唯一性约束。
- `src/parsers/index.ts` 隔离组成冲突的 POSCAR；两个 USPEX25 解析器区分未知值与实测零；POSCAR 计数支持合法零项并在公式中省略它们。
- `src/utils/htmlText.ts`、公式显示与图表适配器建立受控文本转义边界。
- `scripts/firstPrinciplesReviewChecks.ts` 加入默认 `npm test`。

没有新增依赖，没有调整发布版本或桌面配置，没有修改前一轮已经完成的自动保存生命周期修复。

## 验证

- **`npm test`：501 项检查全部通过**，包含原有 478 项与本轮 23 项。
- 独立命令 `node scripts/runFirstPrinciplesReview.mjs`：`0 defect(s) reproduced; 23 invariant(s) passed.`，退出码 0。
- `npm run build`：通过 TypeScript 与生产构建；仍有已有的大 chunk 提示。
- `npm run lint`：0 errors、25 个已有 warnings，没有新增 lint 问题。
- `git diff --check`：通过。

三份真实归档直接经正式解压、文件识别和解析流程验证：

| 归档 | 解析结构数 | 原有几何保留数 |
| --- | ---: | ---: |
| `uspex_20260918_103502.tar.gz` | 553 | 213 |
| `uspex_20260926_161206.tar.gz` | 368 | 368 |
| `uspex_20260926_230011.tar.gz` | 1437 | 152 |

逐结构检查与归档原始 POSCAR 文本一致、有效 Individuals 总能量一致、有效 USPEX hull fitness 一致，并验证导出 JSON 的结构校验。三份输入均未产生组成冲突误报。

测试没有观察到原有功能回归。安全检查通过正式 React 组件静态渲染及正式 ECharts tooltip formatter 验证文本输出；本轮没有执行浏览器事件或进行穷尽的人工界面操作。上一轮仅列为待验证的跨方法能量兼容性、解压资源预算及 JSmol 数据分隔符风险不属于本轮 8 项修复。
