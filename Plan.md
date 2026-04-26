# USPEX Analyzer 

## 版本更新记录
### V1.0.5

全局
- 英文与数字字体改为 Times New Roman

Explorer 页面
- Color 滑块新增自动播放：上限从当前位置步进至 dataMax，下限固定不动
- 播放参数可调：步进量（step）和帧率（fps）均可在滑块旁实时修改
- 新增 GIF 导出：将播放过程逐帧截图并合成动图下载，绕开 React 状态异步问题，直接用 `Plotly.react()` 强制渲染每帧

Filter 页面
- CSV 导出从 9 列扩展为完整字段：新增 Composition、ParentIDs、Tags、Notes
- CSV 列动态生成：与 Table 页保持一致，仅当数据中实际存在时才输出 Pareto（ParetoFront、ExtraProps）、ML 弹性模量（Bulk/Shear/Young/Poisson/Pugh/Vickers/FractureToughness）、指纹参数（Q_Entropy/A_Order/S_Order）列

### V1.0.4

Explorer 页面
- 新增 ΔE 字段：`E_child - parentEnthalpy`，无父母的结构自动隐藏
- 新增 ΔObj 字段：对每个 extraProps 键各生成一个，采用双亲均值方案 `obj_child - avg(obj_parent1, obj_parent2)`
- Color By 数值字段时，新增双滑块过滤器：拖动范围排除区间外的点，色带本身固定不变
- X/Y 轴范围输入框、Mark on Chart 移至图表下方

凸包图 / Pareto / Energy Ranking
- Mark on Chart 面板统一移至图表下方

### V1.0.3

上传页面
- 项目命名改为自动生成：格式为 `元素-calculationType-压强GPa[-后缀]`，例如 `Li-H-300-100GPa-Tc`
- 输入框由"项目名称"改为可选后缀，不填则自动生成不带后缀的名称，不再强制要求用户命名
- 强制要求上传全部 4 个核心文件（Individuals、origin、Parameters.txt、gatheredPOSCARS）才能开始分析

解析器
- `parametersParser` 新增解析 `ExternalPressure` 字段（单位 GPa）
- `SystemInfo` 新增 `calculationType` 和 `externalPressure` 字段
- 移除无 Parameters.txt 时的元素占位符 fallback 逻辑（`Elem1`, `Elem2`...）

修复
- 修复新建项目后不出现在"最近的项目"列表的 bug：`setProjectName` 现在会在设置名称后触发一次自动保存

### V1.0.2
Filter 页面
筛选字段动态生成：根据当前项目实际数据决定显示哪些字段（多目标参数、弹性模量、指纹等），不再硬编码全量列表

数据表格
筛选条件持久化：切换页面后返回，已添加的筛选条件不再丢失

全局
修复单目标优化项目出现 Fitness-Individuals 列的 bug：`detectSecondObjective` 将 `Fitness` 列正确识别为标准列

所有图表（凸胞图、三元相图、能量排名、Explorer、Pareto）
新增 Mark 标记功能：在每个图表页面顶部显示 MarkPanel 控制面板
- 按标签标记：点击标签按钮（Candidate / To Verify / Excluded / Bookmarked 及自定义标签），对应结构以该标签颜色的五角星覆盖显示在图上
- 按 EA ID 标记：输入框支持 "EA1, EA5, EA10" 或 "1 5 10" 等格式，匹配结构以金色（#FFD700）五角星标出，实时显示匹配数量

### V1.0.1
Filter 页面
标签筛选重新设计：两个独立区域合并为单列表，点击循环切换三态（灰=忽略 / 绿✓=必须含有 / 红✗=必须排除）
修复排除标签在加入数值筛选条件后失效的 bug
筛选条件、导出格式、排序方式等设置切换页面后不再丢失
加入元素占比的筛选

数据表格
前四列（ID、化学式、标签、操作）固定冻结，横向滚动时始终可见
标签下拉框和备注弹框改为浮层渲染，不再被表格遮挡，并自动避开屏幕边缘
筛选功能扩展：数字列覆盖所有可用字段（弹性模量、指纹等）；新增文字列筛选（化学式/来源），支持多选 + 包含/不包含/等于/不等于
界面文字全面支持中英文切换

全局
Explorer 轴选择、Pareto 前沿选择、表格排序状态切换页面后均不再重置
所有页面 UI 状态自动保存到本地，刷新浏览器后恢复


## 改进计划
1.实现更直观的父辈子辈Tree。 √
2.完善OnCilck，很多图还点不了。 √
3.凸胞图加上fitness“进度条”筛选。 √
4.Filter 筛选时，存在Nan时有bug。 √
5.多目标的标签，更智能的识别，适应更多情况！（暂时只能处理焓值与第二目标的双目标优化） √
6.第二目标识别出现负数。对比多种individuals文件。 √
7.自动解析origin，比如Energy Ranking 内无法识别kepbest和LatMulate等，自动识别来源。  √
8.Filter 页面。加入否个筛选条件后，展示候选区域的表格加上这个变量。√
9.Exclude by Tag 功能不完善，加入筛选条件后不能exclude了。√
10.9部分的中英文混合。√
11.页面间持久化！ √
12.Table 冻结前四列。√
13.加入一元二元三元的筛选 √
14.加入元素占比的筛选 √
15.正确的formula √
16.数据探索器加上元素含量√
17.Filter内，非多目标优化内，有多目标优化的参数（有什么筛什么，不要“写死了”） √
18.Table标签和Filter没有持久化，换了页面后就消失了。 √
19.加入ΔE和ΔObj √
20.加入滑块调节explorer的color √
20.1 调节滑块还是有问题， √
21.滑块加入自动播放输出动图gif输出功能 √
22.图直接导出对应的csv（有多少数据就输出多少数据）
23.英文和数字字体改为Times new roman √
24.导出文件命名时，用户自定义
25.导出csv时保存所有已知信息 √