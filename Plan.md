# USPEX Analyzer — 详细实施方案

> **项目名称**: USPEX Analyzer (暂定)
> **部署方式**: GitHub Pages (纯前端静态站点)
> **目标用户**: 使用 USPEX 进行晶体结构预测的科研人员
> **文档版本**: v1.0 | 2026-04-03

---

## 改进计划
1.实现更直观的父辈子辈Tree。
2.完善OnCilck，很多图还点不了。 √
3.凸胞图加上fitness“进度条”筛选。
4.Filter 筛选时，存在Nan时有bug。 √
5.多目标的标签，更智能的识别，适应更多情况！

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈选型](#2-技术栈选型)
3. [项目结构与架构](#3-项目结构与架构)
4. [数据模型设计](#4-数据模型设计)
5. [文件解析引擎](#5-文件解析引擎)
6. [功能模块详细设计](#6-功能模块详细设计)
7. [国际化方案 (i18n)](#7-国际化方案-i18n)
8. [数据持久化方案](#8-数据持久化方案)
9. [UI/UX 设计规范](#9-uiux-设计规范)
10. [开发路线图](#10-开发路线图)
11. [部署与 CI/CD](#11-部署与-cicd)
12. [附录：USPEX 文件格式参考](#12-附录uspex-文件格式参考)

---

## 1. 项目概述

### 1.1 项目目标

构建一个基于浏览器的 USPEX 输出分析工具，用户上传 USPEX 计算输出文件后，可以：

- 汇总浏览所有结构信息（可排序/筛选的数据表格）
- 交互式可视化 Convex Hull（2D + 3D）
- 交互式 Pareto Front（多目标优化场景）
- 自由探索任意两个属性的散点关系
- 3D 结构可视化（基于 3Dmol.js）
- 谱系追溯（父代/子代关系树）
- 进化趋势图（Generation 收敛曲线）
- 高级筛选 + 打包导出结构文件
- 结构对比（并排比较 2~4 个结构）
- 标签系统（候选/待验证/已排除等）
- 用户自定义数据点 + 重新计算相图
- 项目文件保存/加载

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **零安装** | 纯浏览器端，无需安装任何软件 |
| **自适应** | 自动检测单目标/多目标、二元/三元体系 |
| **渐进增强** | 缺失某些输入文件时功能降级但不崩溃 |
| **数据不丢** | IndexedDB 自动保存 + 项目文件导出 |
| **中英双语** | 完整的 i18n 支持 |

---

## 2. 技术栈选型

### 2.1 核心框架

| 层级 | 技术选型 | 理由 |
|------|----------|------|
| **构建工具** | Vite 6.x | 极快的 HMR，原生 ESM 支持，GitHub Pages 友好 |
| **前端框架** | React 19 + TypeScript | 生态最丰富，社区最大，类型安全 |
| **状态管理** | Zustand | 轻量、直觉化、无 boilerplate，适合中型项目 |
| **路由** | React Router v7 | 成熟稳定，支持 hash router（GitHub Pages 需要） |
| **样式方案** | Tailwind CSS 4 + CSS Variables | 快速开发 + 主题切换 |
| **UI 组件库** | Shadcn/UI | 可定制、无黑盒、基于 Radix 无障碍 |

### 2.2 可视化库

| 用途 | 技术选型 | 理由 |
|------|----------|------|
| **交互式图表** | Plotly.js (react-plotly.js) | 原生支持 3D、ternary、hover、zoom、lasso 选择 |
| **3D 结构** | 3Dmol.js | 浏览器端最成熟的晶体/分子可视化库，直接支持 POSCAR/XYZ |
| **谱系树** | D3.js (d3-hierarchy) | 力导向图/树形图最强大的库 |
| **统计图** | Recharts 或 Plotly.js | 饼图/柱状图等简单图表 |

### 2.3 工具库

| 用途 | 技术选型 |
|------|----------|
| **表格** | TanStack Table v8 (虚拟化 + 排序 + 筛选 + 列管理) |
| **文件压缩/导出** | JSZip + FileSaver.js |
| **凸包计算** | convexhull.js 或自行实现（移植 scipy 逻辑） |
| **国际化** | react-i18next |
| **本地存储** | idb (IndexedDB 封装) |
| **图标** | Lucide React |
| **通知/Toast** | Sonner |

### 2.4 开发工具

| 工具 | 用途 |
|------|------|
| ESLint + Prettier | 代码规范 |
| Vitest | 单元测试（特别是文件解析器） |
| GitHub Actions | CI/CD 自动部署到 GitHub Pages |

---

## 3. 项目结构与架构

### 3.1 目录结构

```
uspex-analyzer/
├── public/
│   ├── locales/                  # i18n 翻译文件
│   │   ├── en/
│   │   │   └── translation.json
│   │   └── zh/
│   │       └── translation.json
│   └── sample-data/              # 示例数据（供用户体验）
├── src/
│   ├── main.tsx                  # 入口文件
│   ├── App.tsx                   # 根组件 + 路由配置
│   │
│   ├── components/               # 通用 UI 组件
│   │   ├── ui/                   # shadcn/ui 基础组件
│   │   ├── Layout/               # 布局组件
│   │   │   ├── AppShell.tsx      # 主布局框架
│   │   │   ├── Sidebar.tsx       # 左侧导航栏
│   │   │   └── Header.tsx        # 顶部栏（语言切换等）
│   │   ├── FileDropZone.tsx      # 文件上传区域
│   │   ├── StructureViewer.tsx   # 3Dmol.js 结构查看器
│   │   ├── QueryBuilder.tsx      # 高级筛选条件构建器
│   │   └── ExportDialog.tsx      # 导出配置弹窗
│   │
│   ├── modules/                  # 功能模块（页面级）
│   │   ├── Upload/
│   │   │   ├── UploadPage.tsx
│   │   │   └── FileDetector.ts   # 智能文件类型识别
│   │   ├── Dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── StatCards.tsx
│   │   ├── DataTable/
│   │   │   ├── DataTablePage.tsx
│   │   │   ├── columns.tsx       # 表格列定义
│   │   │   ├── TableToolbar.tsx
│   │   │   └── TagManager.tsx    # 标签管理
│   │   ├── ConvexHull/
│   │   │   ├── ConvexHullPage.tsx
│   │   │   ├── Hull2D.tsx        # 二元凸包图
│   │   │   ├── Hull3D.tsx        # 三元3D凸包图
│   │   │   ├── HullTernary2D.tsx # 三元投影图
│   │   │   └── hullCompute.ts   # 凸包计算逻辑
│   │   ├── Pareto/
│   │   │   ├── ParetoPage.tsx
│   │   │   └── ParetoChart.tsx
│   │   ├── Explorer/
│   │   │   ├── ExplorerPage.tsx  # 万能散点图探索器
│   │   │   └── AxisSelector.tsx
│   │   ├── Genealogy/
│   │   │   ├── GenealogyPage.tsx
│   │   │   └── FamilyTree.tsx
│   │   ├── Evolution/
│   │   │   ├── EvolutionPage.tsx
│   │   │   └── ConvergencePlot.tsx
│   │   ├── Compare/
│   │   │   ├── ComparePage.tsx
│   │   │   └── CompareCard.tsx
│   │   └── Filter/
│   │       ├── FilterPage.tsx
│   │       └── ExportEngine.ts   # 导出逻辑
│   │
│   ├── parsers/                  # 文件解析器
│   │   ├── index.ts              # 统一入口
│   │   ├── parametersParser.ts   # Parameters.txt
│   │   ├── extendedHullParser.ts # extended_convex_hull
│   │   ├── paretoParser.ts       # Pareto_ranking
│   │   ├── mlPropertiesParser.ts # MLProperties
│   │   ├── originParser.ts       # origin
│   │   ├── poscarParser.ts       # gatheredPOSCARS / gatheredPOSCARS_unrelaxed
│   │   ├── convexHullParser.ts   # convex_hull (逐代)
│   │   └── compositionUtils.ts   # 组成/化学式工具函数
│   │
│   ├── store/                    # Zustand 状态管理
│   │   ├── useProjectStore.ts    # 主数据 store
│   │   ├── useUIStore.ts         # UI 状态（侧栏、弹窗等）
│   │   ├── useFilterStore.ts     # 筛选条件 store
│   │   └── useTagStore.ts        # 标签 store
│   │
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useStructureData.ts   # 合并后的数据查询
│   │   ├── usePersistence.ts     # IndexedDB 自动保存
│   │   └── useExport.ts          # 导出功能
│   │
│   ├── lib/                      # 工具函数
│   │   ├── convexHull.ts         # 凸包算法（2D + 3D）
│   │   ├── poscarWriter.ts       # POSCAR 文件生成
│   │   ├── fileDetection.ts      # 文件类型检测逻辑
│   │   └── constants.ts          # 常量（元素颜色、半径等）
│   │
│   ├── types/                    # TypeScript 类型定义
│   │   ├── structure.ts          # 核心数据类型
│   │   ├── filters.ts            # 筛选条件类型
│   │   └── project.ts            # 项目文件类型
│   │
│   └── i18n/                     # i18n 配置
│       └── config.ts
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### 3.2 数据流架构

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│  用户上传文件  │────▶│  文件解析引擎      │────▶│  Zustand Store  │
│  (.json 项目) │     │  (parsers/*.ts)   │     │  (统一数据源)    │
└──────────────┘     └──────────────────┘     └───────┬────────┘
                                                       │
                    ┌──────────────────────────────────┼──────────────────┐
                    │                │                  │                  │
               ┌────▼────┐    ┌─────▼─────┐    ┌──────▼──────┐    ┌─────▼─────┐
               │DataTable │    │ConvexHull │    │  Explorer   │    │  Export    │
               │ Module   │    │  Module   │    │  Module     │    │  Engine   │
               └──────────┘    └───────────┘    └─────────────┘    └───────────┘
                    │                                                     │
               ┌────▼────┐                                         ┌─────▼─────┐
               │3D Viewer│                                         │ .zip/.json │
               │(弹窗)    │                                         │   下载     │
               └──────────┘                                         └───────────┘
```

---

## 4. 数据模型设计

### 4.1 核心类型定义

```typescript
// types/structure.ts

/** 单个结构的完整信息（合并所有来源） */
interface Structure {
  // === 基础标识 ===
  id: number;                    // EA{id}
  formula: string;               // 化学式，如 "Ti3H8"
  composition: number[];         // 原子数组，如 [3, 8] 或 [2, 3, 5]

  // === 来自 extended_convex_hull ===
  enthalpy: number;              // eV/atom
  volume: number;                // Å³/atom
  fitness: number;               // eV/block (距凸包距离)
  spaceGroup: number;            // 空间群编号
  hullX: number;                 // 组成 x 坐标
  hullY: number;                 // 形成能 y 坐标 (eV/atom)

  // === 来自 origin ===
  origin: OriginMethod;          // 来源方法
  parentIds: number[];           // 父代 ID 列表
  parentEnthalpy: number;        // 父代焓
  generation: number;            // 所属代数（需推断）

  // === 来自 Pareto_ranking（可选） ===
  paretoFront?: number;          // Pareto front 编号
  density?: number;              // g/cm³
  secondObjective?: number;      // 第二目标值
  secondObjectiveName?: string;  // 第二目标名称

  // === 来自 MLProperties（可选） ===
  bulkModulus?: number;          // GPa
  shearModulus?: number;         // GPa
  youngModulus?: number;         // GPa
  poissonRatio?: number;
  pughRatio?: number;
  vickersHardness?: number;      // GPa
  fractureToughness?: number;    // MPa·m^½

  // === 来自 gatheredPOSCARS ===
  poscarData?: string;           // 原始 POSCAR 文本
  latticeParams?: {
    a: number; b: number; c: number;
    alpha: number; beta: number; gamma: number;
  };

  // === 用户自定义 ===
  tags: string[];                // 用户标签
  isUserAdded: boolean;          // 是否为用户手动添加
  notes: string;                 // 用户备注
}

/** 来源方法枚举 */
type OriginMethod =
  | 'Seeds'
  | 'Random'
  | 'Heredity'
  | 'LatMutate'
  | 'softmutate'
  | 'Permutate'
  | 'Transmutate'
  | 'spinMutate'
  | 'UserAdded'
  | 'Unknown';

/** 元素信息 */
interface SystemInfo {
  elements: string[];            // 如 ["Ti", "H"]
  systemType: 'unary' | 'binary' | 'ternary';
  optimizationType: 'single' | 'multi';
  secondObjectiveName?: string;  // 如 "ML_Young_Modul"
  totalStructures: number;
  totalGenerations: number;
  stableCount: number;           // fitness = 0 的数量
}
```

### 4.2 项目文件格式

```typescript
// types/project.ts

interface ProjectFile {
  version: string;               // "1.0.0"
  created: string;               // ISO 日期
  lastModified: string;
  systemInfo: SystemInfo;
  structures: Structure[];
  userAddedStructures: Structure[];
  tags: TagDefinition[];
  filterPresets: FilterPreset[];
  convexHullGenerations?: ConvexHullGeneration[];  // 逐代凸包数据
}

interface TagDefinition {
  name: string;
  color: string;                 // hex 颜色
  structureIds: number[];
}

interface FilterPreset {
  name: string;
  conditions: FilterCondition[];
}

interface FilterCondition {
  field: string;                 // 字段名
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: number | string | number[];
}
```

### 4.3 Zustand Store 设计

```typescript
// store/useProjectStore.ts

interface ProjectState {
  // === 数据 ===
  systemInfo: SystemInfo | null;
  structures: Structure[];
  userStructures: Structure[];    // 用户手动添加的
  convexHullHistory: ConvexHullGeneration[];

  // === 文件解析状态 ===
  parsedFiles: {
    parameters: boolean;
    extendedHull: boolean;
    pareto: boolean;
    mlProperties: boolean;
    origin: boolean;
    poscar: boolean;
    convexHull: boolean;
  };

  // === Actions ===
  loadFile: (file: File) => Promise<void>;
  loadProjectFile: (json: ProjectFile) => void;
  exportProjectFile: () => ProjectFile;
  addUserStructure: (structure: Partial<Structure>) => void;
  removeUserStructure: (id: number) => void;
  recalculateHull: (includeUser: boolean) => void;
  reset: () => void;
}
```

---

## 5. 文件解析引擎

### 5.1 智能文件识别逻辑

```typescript
// lib/fileDetection.ts

interface DetectedFile {
  file: File;
  type: USPEXFileType;
  confidence: number;          // 0~1 置信度
}

type USPEXFileType =
  | 'parameters'               // Parameters.txt
  | 'extended_convex_hull'
  | 'pareto_ranking'
  | 'ml_properties'
  | 'origin'
  | 'gathered_poscars'         // gatheredPOSCARS
  | 'gathered_poscars_unrelaxed'
  | 'convex_hull'              // convex_hull (逐代)
  | 'project_json'             // 本工具导出的项目文件
  | 'unknown';

function detectFileType(file: File, content: string): DetectedFile {
  // 1. 文件名匹配（最高优先级）
  const nameMap: Record<string, USPEXFileType> = {
    'Parameters.txt': 'parameters',
    'extended_convex_hull': 'extended_convex_hull',
    'Pareto_ranking': 'pareto_ranking',
    'MLProperties': 'ml_properties',
    'origin': 'origin',
    'gatheredPOSCARS': 'gathered_poscars',
    'gatheredPOSCARS_unrelaxed': 'gathered_poscars_unrelaxed',
    'convex_hull': 'convex_hull',
  };

  // 精确匹配文件名
  if (nameMap[file.name]) {
    return { file, type: nameMap[file.name], confidence: 1.0 };
  }

  // .json 文件 → 检查是否为项目文件
  if (file.name.endsWith('.json')) {
    try {
      const json = JSON.parse(content);
      if (json.version && json.systemInfo && json.structures) {
        return { file, type: 'project_json', confidence: 1.0 };
      }
    } catch {}
  }

  // 2. 内容特征匹配（备选）
  if (content.includes('atomType') && content.includes('%')) {
    return { file, type: 'parameters', confidence: 0.9 };
  }
  if (content.includes('Fitness') && content.includes('eV/block')) {
    return { file, type: 'extended_convex_hull', confidence: 0.9 };
  }
  if (content.includes('Pareto') && content.includes('front')) {
    return { file, type: 'pareto_ranking', confidence: 0.9 };
  }
  if (content.includes('Bulk') && content.includes('Shear') &&
      content.includes('Youngs')) {
    return { file, type: 'ml_properties', confidence: 0.9 };
  }
  if (content.includes('Origin') && content.includes('Parent-E')) {
    return { file, type: 'origin', confidence: 0.9 };
  }
  if (/^EA\d+\s+/.test(content)) {
    return { file, type: 'gathered_poscars', confidence: 0.85 };
  }
  if (content.includes('---- generation')) {
    return { file, type: 'convex_hull', confidence: 0.9 };
  }

  return { file, type: 'unknown', confidence: 0 };
}
```

### 5.2 各文件解析器概要

每个解析器的输入是文件文本内容，输出是结构化数据。核心逻辑直接从你的 Python 脚本移植。

| 解析器 | 输入文件 | 主要输出 | 关键注意点 |
|--------|----------|----------|------------|
| `parametersParser` | Parameters.txt | 元素列表 `string[]` | 解析 `%atomType ... %EndAtomType` 块 |
| `extendedHullParser` | extended_convex_hull | `{id, composition[], enthalpy, volume, fitness, symm, x, y}[]` | 跳过注释行和 header 行，用正则匹配 `[n1 n2]` 或 `[n1 n2 n3]` |
| `paretoParser` | Pareto_ranking | `{front, id, origin, comp, enthalpy, volume, density, secondObj, hull, symm}[]` + 第二目标名 | 自动识别第二目标列名 |
| `mlPropertiesParser` | MLProperties | `{id, bulk, shear, young, poisson, pugh, hardness, toughness}[]` | 跳过 header/unit 行 |
| `originParser` | origin | `{id, origin, enthalpy, parentE, parentIds[]}[]` | 解析 `[id1 id2]` 形式的父代 |
| `poscarParser` | gatheredPOSCARS | `Map<number, {header, poscarText, symm, formula, lattice}>` | 按 `EA{id}` 分割，提取化学式 |
| `convexHullParser` | convex_hull | `{generation, entries: {comp[], enthalpy}[]}[]` | 按 `---- generation N ----` 分段 |

### 5.3 数据合并逻辑

解析完所有文件后，以 `extended_convex_hull` 的 ID 列表为主键，逐个合并其他来源的数据：

```typescript
function mergeStructureData(
  hullData: HullEntry[],
  originData: OriginEntry[],
  paretoData: ParetoEntry[] | null,
  mlData: MLEntry[] | null,
  poscarData: Map<number, PoscarEntry>,
  elements: string[],
): Structure[] {

  const originMap = new Map(originData.map(d => [d.id, d]));
  const paretoMap = paretoData
    ? new Map(paretoData.map(d => [d.id, d]))
    : new Map();
  const mlMap = mlData
    ? new Map(mlData.map(d => [d.id, d]))
    : new Map();

  return hullData.map(hull => {
    const origin = originMap.get(hull.id);
    const pareto = paretoMap.get(hull.id);
    const ml = mlMap.get(hull.id);
    const poscar = poscarData.get(hull.id);

    return {
      id: hull.id,
      composition: hull.composition,
      formula: poscar?.formula ?? buildFormula(hull.composition, elements),
      enthalpy: hull.enthalpy,
      volume: hull.volume,
      fitness: hull.fitness,
      spaceGroup: hull.symm,
      hullX: hull.x,
      hullY: hull.y,

      origin: origin?.origin ?? 'Unknown',
      parentIds: origin?.parentIds ?? [],
      parentEnthalpy: origin?.parentEnthalpy ?? 0,
      generation: 0,  // 后续通过 convex_hull 文件推断

      paretoFront: pareto?.front,
      density: pareto?.density,
      secondObjective: pareto?.secondObj,

      bulkModulus: ml?.bulk,
      shearModulus: ml?.shear,
      youngModulus: ml?.young,
      poissonRatio: ml?.poisson,
      pughRatio: ml?.pugh,
      vickersHardness: ml?.hardness,
      fractureToughness: ml?.toughness,

      poscarData: poscar?.poscarText,
      latticeParams: poscar?.lattice,

      tags: [],
      isUserAdded: false,
      notes: '',
    };
  });
}
```

---

## 6. 功能模块详细设计

### 6.1 模块 A：文件上传与项目管理 (Upload)

**路由**: `/` 或 `/upload`

**UI 布局**:
```
┌─────────────────────────────────────────────┐
│            USPEX Analyzer                    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │     拖拽文件到此处 或 点击选择        │  │
│  │     支持: Parameters.txt,             │  │
│  │     extended_convex_hull, ...         │  │
│  │                                       │  │
│  │     📁 或者加载项目文件 (.json)       │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  已识别文件:                                 │
│  ✅ Parameters.txt          Ti, H           │
│  ✅ extended_convex_hull    1535 条记录      │
│  ✅ Pareto_ranking          多目标: Young    │
│  ✅ MLProperties            弹性模量数据     │
│  ✅ origin                  谱系数据         │
│  ✅ gatheredPOSCARS         1535 结构        │
│  ⬜ convex_hull             未上传(可选)     │
│                                             │
│  [加载示例数据]            [开始分析 →]      │
└─────────────────────────────────────────────┘
```

**功能要点**:
- 支持一次拖入多个文件，智能识别每个文件的类型
- 识别结果实时展示，绿色勾 = 已识别，灰色框 = 未上传
- 必需文件：`extended_convex_hull` + `gatheredPOSCARS`（至少需要这两个）
- 缺少其他文件时给出友好提示，说明哪些功能将不可用
- 支持加载 `.json` 项目文件，一键恢复全部数据
- 提供示例数据一键体验

---

### 6.2 模块 B：统计面板 (Dashboard)

**路由**: `/dashboard`

**UI 布局** (可收起/展开):
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 总结构数  │ │ 稳定结构  │ │ 最低焓值  │ │ 最高杨氏  │
│   1535   │ │    8     │ │-1.7829   │ │  92.7    │
│          │ │(fitness=0)│ │ eV/atom  │ │  GPa     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

┌──────────────────┐  ┌────────────────────────────┐
│ 来源方法分布 (饼图) │  │ 空间群分布 (柱状图)         │
│                  │  │                            │
│  Seeds 30%       │  │ ▓▓▓▓ SG1: 800              │
│  Heredity 25%    │  │ ▓▓ SG5: 120                │
│  softmutate 20%  │  │ ▓ SG191: 45                │
│  LatMutate 15%   │  │ ...                        │
│  Permutate 10%   │  │                            │
└──────────────────┘  └────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 组成分布 (柱状图): 各化学计量比出现次数              │
│                                                    │
│  Ti1H5 ▓▓▓▓▓▓▓▓ 156                              │
│  Ti2H7 ▓▓▓▓▓▓ 98                                 │
│  Ti3H8 ▓▓▓▓ 67                                   │
│  ...                                              │
└────────────────────────────────────────────────────┘
```

---

### 6.3 模块 C：数据表格 (DataTable)

**路由**: `/table`

这是最核心的模块，承载所有结构信息。

**UI 布局**:
```
┌─ 工具栏 ─────────────────────────────────────────────┐
│ 🔍 搜索  │ 🏷️ 标签筛选 │ 📊 列管理 │ 📥 导出 │ 📌 保存项目 │
└──────────────────────────────────────────────────────┘

┌─ 表格 (虚拟滚动) ──────────────────────────────────────┐
│ ☐  ID   │ 化学式  │ SG │ 焓     │ Fitness │ 杨氏  │ 来源   │ 标签     │
│─────────┼────────┼────┼────────┼─────────┼──────┼───────┼─────────│
│ ☐ EA2   │ Ti10H28│ 82 │-1.7829 │ 0.0000  │ 7.8  │ Seeds │ ⭐候选   │
│ ☐ EA134 │ Ti3H8  │ 71 │-1.7810 │ 0.0000  │ 11.9 │ Seeds │         │
│ ☐ EA365 │ Ti4H4  │  1 │-1.2806 │ 0.0000  │  —   │ Seeds │ 🔍待验证 │
│ ...     │        │    │        │         │      │       │         │
└──────────────────────────────────────────────────────────┘

点击某行 → 右侧滑出详情面板:
┌─ EA134 详情 ──────────────────┐
│ Ti₃H₈ (SG 71, Immm)          │
│                               │
│ [🔬 查看3D结构]  [🌳 查看谱系] │
│                               │
│ 热力学:                        │
│   焓: -1.7810 eV/atom         │
│   体积: 4.3455 Å³/atom        │
│   Fitness: 0.0000             │
│                               │
│ 力学 (ML):                     │
│   Young: 11.895 GPa           │
│   Bulk: 15.6 GPa              │
│   ...                         │
│                               │
│ 来源: Seeds                    │
│ 父代: — (初始种子)              │
│                               │
│ 标签: [+ 添加标签]             │
│ 备注: [可编辑文本框]            │
└───────────────────────────────┘
```

**关键实现**:

**TanStack Table 配置**:
```typescript
const columns: ColumnDef<Structure>[] = [
  // 选择列
  { id: 'select', header: CheckboxAll, cell: CheckboxRow },

  // 基本信息
  { accessorKey: 'id', header: 'ID', sortingFn: 'basic' },
  { accessorKey: 'formula', header: t('table.formula') },
  { accessorKey: 'spaceGroup', header: t('table.spaceGroup'), sortingFn: 'basic' },

  // 热力学
  { accessorKey: 'enthalpy', header: t('table.enthalpy'),
    cell: ({ getValue }) => getValue<number>().toFixed(4) },
  { accessorKey: 'fitness', header: t('table.fitness'),
    cell: ({ getValue }) => getValue<number>().toFixed(4) },

  // ML 性质（条件渲染：有 MLProperties 数据时才显示）
  ...(hasMLData ? [
    { accessorKey: 'youngModulus', header: t('table.young') },
    { accessorKey: 'bulkModulus', header: t('table.bulk') },
    // ...
  ] : []),

  // Pareto（条件渲染）
  ...(hasPareto ? [
    { accessorKey: 'paretoFront', header: t('table.pareto') },
    { accessorKey: 'secondObjective', header: secondObjName },
  ] : []),

  // 用户数据
  { accessorKey: 'origin', header: t('table.origin') },
  { accessorKey: 'tags', header: t('table.tags'), cell: TagsCell },
];
```

**标签系统**:
- 预定义标签：⭐ 候选 (Candidate)、🔍 待验证 (To Verify)、❌ 已排除 (Excluded)、📌 收藏 (Bookmarked)
- 用户可自定义标签名和颜色
- 标签可用于筛选（工具栏有标签过滤器）
- 标签数据保存在项目文件中

---

### 6.4 模块 D：交互式 Convex Hull

**路由**: `/convex-hull`

#### 6.4.1 二元体系

使用 Plotly.js 的 `Scatter` 图：

```typescript
// 基本数据
const traceUnstable = {
  x: unstablePoints.map(p => p.hullX),    // 组成
  y: unstablePoints.map(p => p.hullY),     // 形成能 eV/atom
  mode: 'markers',
  marker: {
    color: unstablePoints.map(p => p.fitness),
    colorscale: 'Viridis',
    colorbar: { title: 'Fitness (eV/block)' },
    size: 6,
  },
  text: unstablePoints.map(p =>
    `EA${p.id}: ${p.formula}<br>` +
    `Enthalpy: ${p.enthalpy.toFixed(4)} eV/atom<br>` +
    `Fitness: ${p.fitness.toFixed(4)} eV/block<br>` +
    `SG: ${p.spaceGroup}<br>` +
    `Origin: ${p.origin}`
  ),
  hoverinfo: 'text',
  name: 'Unstable',
};

const traceStable = {
  x: stablePoints.map(p => p.hullX),
  y: stablePoints.map(p => p.hullY),
  mode: 'markers+text',
  marker: { color: 'red', size: 12, symbol: 'diamond' },
  text: stablePoints.map(p => p.formula),
  textposition: 'top center',
  name: 'Stable (on hull)',
};

const traceHullLine = {
  x: hullLineX,
  y: hullLineY,
  mode: 'lines',
  line: { color: 'black', width: 2 },
  name: 'Convex Hull',
};
```

#### 6.4.2 三元体系 — 2D 投影

使用 Plotly.js 的 `Scatterternary`：

```typescript
const trace = {
  type: 'scatterternary',
  mode: 'markers',
  a: points.map(p => p.composition[0] / total),  // 元素A 比例
  b: points.map(p => p.composition[1] / total),  // 元素B 比例
  c: points.map(p => p.composition[2] / total),  // 元素C 比例
  marker: {
    color: points.map(p => p.fitness),
    colorscale: [[0, 'red'], [0.5, 'yellow'], [1, 'blue']],
    size: 8,
    colorbar: { title: 'Fitness' },
  },
  text: hoverTexts,  // 悬停信息
  hoverinfo: 'text',
};

const layout = {
  ternary: {
    aaxis: { title: elements[0] },
    baxis: { title: elements[1] },
    caxis: { title: elements[2] },
  },
};
```

凸包连线叠加：从 `_compute_3d_hull_edges` 移植的 tie-lines，转换为 ternary 坐标后用 `Scatterternary` 的 `mode: 'lines'` 叠加。

#### 6.4.3 三元体系 — 3D 凸包

使用 Plotly.js 的 `Mesh3d` + `Scatter3d`：

```typescript
// 凸包下表面的三角形面片
const meshTrace = {
  type: 'mesh3d',
  x: hullPoints.map(p => p.cartesianX),  // 三角坐标的笛卡尔 x
  y: hullPoints.map(p => p.cartesianY),  // 三角坐标的笛卡尔 y
  z: hullPoints.map(p => p.enthalpy),     // 形成能
  i: faces.map(f => f[0]),  // 三角面片索引
  j: faces.map(f => f[1]),
  k: faces.map(f => f[2]),
  opacity: 0.4,
  color: 'lightblue',
  name: 'Convex Hull Surface',
};

// 所有散点
const scatterTrace = {
  type: 'scatter3d',
  x: allPoints.map(p => p.cartesianX),
  y: allPoints.map(p => p.cartesianY),
  z: allPoints.map(p => p.enthalpy),
  mode: 'markers',
  marker: {
    color: allPoints.map(p => p.fitness),
    colorscale: 'Viridis',
    size: 4,
  },
  text: hoverTexts,
  hoverinfo: 'text',
};
```

**视图切换**：在页面顶部加 Tab 或 Toggle 按钮：`[2D 投影] [3D 凸包]`

**用户自定义点**：如果用户添加了参考点，在图上用特殊标记（五角星）显示，可通过 Toggle 控制是否参与凸包重新计算。

---

### 6.5 模块 E：Pareto Front

**路由**: `/pareto` （仅多目标优化时显示）

**UI 布局**:
```
┌─ 控制栏 ──────────────────────────────────────┐
│ 显示 Pareto Front: [1] [2] [3] [全部]          │
│ X 轴: [ConvexHull ▼]   Y 轴: [Young Modulus ▼] │
│ ☑ 显示 Pareto 前沿连线                          │
└───────────────────────────────────────────────┘

┌─ 散点图 ──────────────────────────────────────┐
│                                               │
│   ★                                          │
│     ★  ●●                                    │
│       ★  ●●  ○○                              │
│         ★  ●●  ○○○                           │
│           ★    ●●  ○○○○                      │
│                                               │
│  ★ Front 1  ● Front 2  ○ Front 3             │
│                                               │
│  悬停: EA134 | Ti3H8 | SG71                   │
│  Enthalpy: -1.781 | Young: 11.9 GPa          │
└───────────────────────────────────────────────┘
```

**关键实现**:
- 每条 Pareto front 用不同颜色和标记
- 用户可选择显示哪几条 front（多选按钮或滑块）
- 支持 lasso 框选 → 联动表格筛选
- 悬停显示完整结构信息

---

### 6.6 模块 F：万能散点图探索器 (Explorer)

**路由**: `/explorer`

**UI 布局**:
```
┌─ 轴配置 ──────────────────────────────────────────────┐
│ X 轴: [焓 (eV/atom) ▼]     Y 轴: [杨氏模量 (GPa) ▼]  │
│ 颜色: [来源方法 ▼]          大小: [无 ▼]               │
│                                                       │
│ ☑ 显示拟合线   ☐ 对数坐标   ☑ 显示标签                 │
└───────────────────────────────────────────────────────┘

┌─ 散点图 (Plotly.js) ─────────────────────────────────┐
│                                                      │
│  全交互式: 缩放、平移、悬停、lasso 选择              │
│  颜色图例可点击切换显示/隐藏                          │
│                                                      │
└──────────────────────────────────────────────────────┘

┌─ 选中结构 (lasso 选择后显示) ─────────────────────────┐
│  选中 15 个结构 │ [在表格中查看] [导出选中] [添加标签]  │
└──────────────────────────────────────────────────────┘
```

**可选字段列表**:

数值型（连续轴）:
- 焓 (enthalpy, eV/atom)
- 体积 (volume, Å³/atom)
- Fitness (eV/block)
- 密度 (density, g/cm³)
- 体弹模量 (Bulk Modulus, GPa)
- 剪切模量 (Shear Modulus, GPa)
- 杨氏模量 (Young's Modulus, GPa)
- 泊松比 (Poisson's Ratio)
- Pugh 比 (Pugh's Ratio)
- 硬度 (Vickers Hardness, GPa)
- 韧性 (Fracture Toughness, MPa·m^½)
- Pareto Front 编号
- 空间群编号

分类型（离散轴/颜色）:
- 来源方法 (Origin)
- 化学计量比 (Composition)
- 标签 (Tags)
- 是否在凸包上 (On Hull: Yes/No)

**Lasso 选择联动**：用户在散点图上框选一组点后，这些点的 ID 被传递到表格模块和导出模块，实现跨模块联动。

---

### 6.7 模块 G：谱系追溯 (Genealogy)

**路由**: `/genealogy`

**数据构建**:

从 `origin` 文件构建有向图：

```typescript
interface GenealogyNode {
  id: number;
  formula: string;
  origin: OriginMethod;
  enthalpy: number;
  fitness: number;
  parentIds: number[];
  childIds: number[];      // 反向索引
  generation: number;      // 推断的代数
}

function buildGenealogyGraph(structures: Structure[]): Map<number, GenealogyNode> {
  const graph = new Map<number, GenealogyNode>();

  // 正向：每个结构记录父代
  for (const s of structures) {
    graph.set(s.id, {
      ...s,
      childIds: [],
    });
  }

  // 反向：构建子代索引
  for (const s of structures) {
    for (const pid of s.parentIds) {
      if (graph.has(pid)) {
        graph.get(pid)!.childIds.push(s.id);
      }
    }
  }

  return graph;
}
```

**可视化方式**:

方案1：**力导向图**（D3 force-directed）— 适合查看全局关系
方案2：**树形展开图** — 适合查看单个结构的上下游

用户在输入框输入结构 ID，选择"向上追溯"或"向下展开"：
- 向上：展示该结构 → 父代 → 祖父代 → ... → Seeds
- 向下：展示该结构 → 所有子代 → 孙代 → ...

每个节点显示：ID、化学式、来源方法（不同颜色），点击节点可跳转到详情。

---

### 6.8 模块 H：进化趋势 (Evolution)

**路由**: `/evolution`

从 `convex_hull` 文件解析逐代数据：

```
---- generation 1 ----
  8  0     0.4841
  0 15    -1.1109
  ...
---- generation 2 ----
  8  0     0.4841
  0 18    -1.1666
  ...
```

**图表 1**：最低焓值 vs Generation（折线图）— 展示收敛趋势
**图表 2**：凸包上稳定结构数量 vs Generation
**图表 3**：各来源方法贡献 vs Generation（堆叠面积图）— 展示不同进化算子在各阶段的贡献

---

### 6.9 模块 I：结构对比 (Compare)

**路由**: `/compare` 或弹窗

用户在表格中勾选 2~4 个结构，点击"对比"按钮。

**UI 布局**:
```
┌─ EA134 ──────┐  ┌─ EA1535 ─────┐  ┌─ EA1225 ─────┐
│ Ti₃H₈        │  │ Ti₂H₄       │  │ Ti₂H₆        │
│ SG 71 (Immm) │  │ SG 1 (P1)   │  │ SG 223 (Pm3m)│
│               │  │              │  │               │
│ [3D结构]      │  │ [3D结构]     │  │ [3D结构]      │
│  (3Dmol.js)  │  │  (3Dmol.js)  │  │  (3Dmol.js)   │
│               │  │              │  │               │
├───────────────┤  ├──────────────┤  ├───────────────┤
│ H: -1.781     │  │ H: -1.733   │  │ H: -1.772     │
│ V: 4.35       │  │ V: 4.82     │  │ V: 4.00       │
│ Fit: 0.000    │  │ Fit: 0.000  │  │ Fit: 0.002    │
│ Y: 11.9 GPa   │  │ Y: 10.4 GPa│  │ Y: 24.9 GPa   │
│ B: 15.6 GPa   │  │ B: —        │  │ B: —           │
│ Origin: Seeds │  │ O: Permutate│  │ O: Heredity    │
└───────────────┘  └──────────────┘  └───────────────┘

┌─ 性质对比雷达图 ──────────────────────────────────────┐
│  (Recharts RadarChart，归一化到 0~1 后叠加显示)       │
│  维度: 焓、体积、杨氏模量、硬度、空间群对称性         │
└──────────────────────────────────────────────────────┘
```

---

### 6.10 模块 J：高级筛选与导出 (Filter & Export)

**路由**: `/filter`

#### 筛选器 UI

```
┌─ 筛选条件构建器 ──────────────────────────────────────┐
│                                                       │
│  条件 1: [Fitness    ▼] [≤  ▼] [0.05          ]  [×] │
│    AND                                                │
│  条件 2: [空间群      ▼] [≥  ▼] [12            ]  [×] │
│    AND                                                │
│  条件 3: [杨氏模量    ▼] [≥  ▼] [30            ]  [×] │
│    AND                                                │
│  条件 4: [标签        ▼] [包含▼] [候选          ]  [×] │
│                                                       │
│  [+ 添加条件]                                          │
│                                                       │
│  符合条件: 23 个结构                                    │
│  [保存为预设 ▼]   [应用到表格]   [导出 ↓]              │
└───────────────────────────────────────────────────────┘
```

**筛选预设**: 用户可以保存常用的筛选组合，命名为如"高杨氏低能量"、"对称结构"等，下次直接调用。

#### 导出配置弹窗

```
┌─ 导出配置 ──────────────────────────────────┐
│                                             │
│ 导出格式:                                    │
│   ○ 分散 VASP 文件 (.zip)                    │
│   ○ 种子文件 (首尾相接)                       │
│   ○ 数据表 (.csv)                            │
│   ○ 项目文件 (.json)                         │
│                                             │
│ 命名规则 (仅分散文件):                         │
│   ☑ [1] 排序编号  ☑ [2] 结构ID               │
│   ☑ [6] 化学式    ☑ [3] 空间群               │
│   ☐ [4] 凸包能    ☐ [5] 第二目标             │
│                                             │
│   第二目标前缀: [Young___]                    │
│                                             │
│ 排序方式:                                    │
│   [按 Fitness 升序 ▼]                        │
│                                             │
│ 预览: 001-EA134-Ti3H8-SG71.vasp             │
│                                             │
│         [取消]        [导出 23 个结构]         │
└──────────────────────────────────────────────┘
```

**导出逻辑 (ExportEngine.ts)**:

```typescript
async function exportStructures(
  structures: Structure[],
  options: ExportOptions,
): Promise<Blob> {

  if (options.format === 'zip') {
    const zip = new JSZip();
    const sorted = sortStructures(structures, options.sortKey, options.sortReverse);
    const padding = String(sorted.length).length;

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const filename = buildFilename(i, s, options.nameParts, padding, options.prefix);
      zip.file(filename, s.poscarData ?? '');
    }

    return zip.generateAsync({ type: 'blob' });
  }

  if (options.format === 'seeds') {
    // 首尾相接：所有 POSCAR 拼接成一个文件
    const content = structures.map(s => s.poscarData).join('\n');
    return new Blob([content], { type: 'text/plain' });
  }

  if (options.format === 'csv') {
    const csv = structuresToCSV(structures);
    return new Blob([csv], { type: 'text/csv' });
  }

  if (options.format === 'json') {
    // 完整项目文件
    const project = useProjectStore.getState().exportProjectFile();
    return new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  }
}
```

---

### 6.11 模块 K：3D 结构查看器 (Structure Viewer)

**实现方式**: 全局弹窗/抽屉组件，不是独立路由

**3Dmol.js 集成**:

```typescript
// components/StructureViewer.tsx
import * as $3Dmol from '3dmol';

function StructureViewer({ poscarData, formula }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<$3Dmol.GLViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !poscarData) return;

    const viewer = $3Dmol.createViewer(containerRef.current, {
      backgroundColor: 'white',
    });

    // 加载 POSCAR 格式数据
    viewer.addModel(poscarData, 'vasp');

    // 设置原子样式
    viewer.setStyle({}, {
      sphere: { scale: 0.3, colorscheme: 'Jmol' },
      stick: { radius: 0.15, colorscheme: 'Jmol' },
    });

    // 添加单胞框
    viewer.addUnitCell();

    // 可选: 超胞显示
    // viewer.replicateUnitCell(2, 2, 2);

    viewer.zoomTo();
    viewer.render();
    viewerRef.current = viewer;

    return () => viewer.clear();
  }, [poscarData]);

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', height: '400px' }} />
      <div className="controls">
        <button onClick={() => /* 切换球棍/空间填充模型 */}>
          显示模式
        </button>
        <button onClick={() => /* 2x2x2 超胞 */}>
          超胞
        </button>
        <button onClick={() => /* 切换多面体显示 */}>
          配位多面体
        </button>
      </div>
    </div>
  );
}
```

**注意**: 3Dmol.js 加载为懒加载（`React.lazy` 或动态 `import()`），只有用户点击"查看结构"时才加载这个较大的库，避免影响首屏性能。

---

### 6.12 模块 L：用户自定义数据

**入口**: 数据表格页面的 `[+ 添加结构]` 按钮

**添加表单**:
```
┌─ 添加自定义结构 ──────────────────────────────┐
│                                               │
│  元素配比:                                     │
│    Ti: [3]   H: [8]                           │
│                                               │
│  焓 (eV/atom): [-1.800]                       │
│                                               │
│  体积 (Å³/atom): [4.50]  (可选)               │
│  空间群编号: [225]  (可选)                      │
│  杨氏模量 (GPa): [—]  (可选)                   │
│                                               │
│  POSCAR 数据: [粘贴或上传]  (可选)              │
│                                               │
│  添加模式:                                     │
│    ○ 仅标记 (Mark) — 不影响凸包计算            │
│    ● 参与计算 — 重新计算凸包和 Fitness         │
│                                               │
│  备注: [用户自由填写，如文献来源]               │
│                                               │
│         [取消]        [添加]                   │
└───────────────────────────────────────────────┘
```

**凸包重新计算逻辑**:

```typescript
function recalculateConvexHull(
  structures: Structure[],
  userStructures: Structure[],
  includeUser: boolean,
): Structure[] {
  // 合并数据
  const allPoints = includeUser
    ? [...structures, ...userStructures]
    : structures;

  // 二元体系
  if (systemType === 'binary') {
    // 用组成和焓构建 2D 凸包
    const coords = allPoints.map(p => [p.hullX, p.enthalpy]);
    const hull = computeLowerHull2D(coords);

    // 对每个点重新计算到凸包的距离（新 fitness）
    return allPoints.map(p => ({
      ...p,
      fitness: distanceToHull2D(p, hull),
    }));
  }

  // 三元体系
  if (systemType === 'ternary') {
    // 用 3D 凸包算法（移植自 Python 脚本）
    const coords3D = allPoints.map(p => [p.cartX, p.cartY, p.enthalpy]);
    const hull3D = computeConvexHull3D(coords3D);
    const lowerFaces = extractLowerFaces(hull3D);

    return allPoints.map(p => ({
      ...p,
      fitness: distanceToLowerHull3D(p, lowerFaces),
    }));
  }
}
```

---

## 7. 国际化方案 (i18n)

### 7.1 技术方案

使用 `react-i18next`，这是 React 生态中最成熟的 i18n 方案。复杂度不高，主要工作量在翻译文本的维护。

### 7.2 配置

```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)     // 自动检测浏览器语言
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    ns: ['common', 'table', 'hull', 'pareto', 'filter', 'export'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
  });
```

### 7.3 翻译文件结构

```
public/locales/
├── en/
│   ├── common.json       # 通用: 按钮、导航、通知
│   ├── table.json        # 表格列名、筛选
│   ├── hull.json         # Convex Hull 相关
│   ├── pareto.json       # Pareto 相关
│   ├── filter.json       # 筛选条件
│   └── export.json       # 导出相关
└── zh/
    ├── common.json
    ├── table.json
    ├── hull.json
    ├── pareto.json
    ├── filter.json
    └── export.json
```

### 7.4 翻译文件示例

```json
// public/locales/zh/common.json
{
  "app.title": "USPEX 分析器",
  "nav.dashboard": "统计面板",
  "nav.table": "数据表格",
  "nav.hull": "凸包图",
  "nav.pareto": "Pareto 前沿",
  "nav.explorer": "数据探索",
  "nav.genealogy": "谱系追溯",
  "nav.evolution": "进化趋势",
  "nav.compare": "结构对比",
  "nav.filter": "筛选导出",
  "btn.upload": "上传文件",
  "btn.export": "导出",
  "btn.save": "保存项目",
  "btn.load": "加载项目",
  "btn.addStructure": "添加结构",
  "btn.compare": "对比选中",
  "upload.title": "上传 USPEX 输出文件",
  "upload.dragHint": "拖拽文件到此处，或点击选择",
  "upload.detected": "已识别文件",
  "upload.missing": "未上传（可选）",
  "upload.required": "必需文件",
  "upload.startAnalysis": "开始分析",
  "upload.loadSample": "加载示例数据",
  "system.binary": "二元体系",
  "system.ternary": "三元体系",
  "system.single": "单目标优化",
  "system.multi": "多目标优化",
  "tag.candidate": "候选",
  "tag.toVerify": "待验证",
  "tag.excluded": "已排除",
  "tag.bookmarked": "收藏"
}
```

```json
// public/locales/en/common.json
{
  "app.title": "USPEX Analyzer",
  "nav.dashboard": "Dashboard",
  "nav.table": "Data Table",
  "nav.hull": "Convex Hull",
  "nav.pareto": "Pareto Front",
  "nav.explorer": "Explorer",
  "nav.genealogy": "Genealogy",
  "nav.evolution": "Evolution",
  "nav.compare": "Compare",
  "nav.filter": "Filter & Export",
  "btn.upload": "Upload Files",
  "btn.export": "Export",
  "btn.save": "Save Project",
  "btn.load": "Load Project",
  "btn.addStructure": "Add Structure",
  "btn.compare": "Compare Selected",
  "upload.title": "Upload USPEX Output Files",
  "upload.dragHint": "Drag files here, or click to select",
  "upload.detected": "Detected Files",
  "upload.missing": "Not uploaded (optional)",
  "upload.required": "Required file",
  "upload.startAnalysis": "Start Analysis",
  "upload.loadSample": "Load Sample Data",
  "system.binary": "Binary System",
  "system.ternary": "Ternary System",
  "system.single": "Single-objective",
  "system.multi": "Multi-objective",
  "tag.candidate": "Candidate",
  "tag.toVerify": "To Verify",
  "tag.excluded": "Excluded",
  "tag.bookmarked": "Bookmarked"
}
```

```json
// public/locales/zh/table.json
{
  "col.id": "结构 ID",
  "col.formula": "化学式",
  "col.spaceGroup": "空间群",
  "col.enthalpy": "焓 (eV/atom)",
  "col.volume": "体积 (Å³/atom)",
  "col.fitness": "Fitness (eV/block)",
  "col.density": "密度 (g/cm³)",
  "col.origin": "来源方法",
  "col.paretoFront": "Pareto Front",
  "col.young": "杨氏模量 (GPa)",
  "col.bulk": "体弹模量 (GPa)",
  "col.shear": "剪切模量 (GPa)",
  "col.poisson": "泊松比",
  "col.hardness": "硬度 (GPa)",
  "col.toughness": "韧性 (MPa·m^½)",
  "col.tags": "标签",
  "col.notes": "备注",
  "toolbar.search": "搜索...",
  "toolbar.columns": "列管理",
  "toolbar.tagFilter": "标签筛选"
}
```

### 7.5 组件中使用

```typescript
import { useTranslation } from 'react-i18next';

function Sidebar() {
  const { t } = useTranslation('common');

  return (
    <nav>
      <NavItem to="/dashboard" label={t('nav.dashboard')} />
      <NavItem to="/table" label={t('nav.table')} />
      <NavItem to="/convex-hull" label={t('nav.hull')} />
      {/* Pareto 仅在多目标时显示 */}
      {systemInfo?.optimizationType === 'multi' && (
        <NavItem to="/pareto" label={t('nav.pareto')} />
      )}
      ...
    </nav>
  );
}
```

### 7.6 语言切换器

```typescript
function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <button onClick={() =>
      i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
    }>
      {i18n.language === 'zh' ? 'EN' : '中文'}
    </button>
  );
}
```

选择的语言会自动保存到 localStorage，下次访问自动恢复。

---

## 8. 数据持久化方案

### 8.1 分层策略

```
┌─────────────────────────────────────────────────┐
│ 第1层: 内存 (Zustand Store)                      │
│   → 运行时数据，最快，页面刷新即丢失              │
├─────────────────────────────────────────────────┤
│ 第2层: IndexedDB (自动保存)                       │
│   → 浏览器本地，刷新不丢失，换设备丢失            │
├─────────────────────────────────────────────────┤
│ 第3层: 项目文件 (.json 导出)                      │
│   → 用户主动保存，跨设备可转移                    │
└─────────────────────────────────────────────────┘
```

### 8.2 IndexedDB 自动保存

```typescript
// hooks/usePersistence.ts
import { openDB } from 'idb';

const DB_NAME = 'uspex-analyzer';
const STORE_NAME = 'project-data';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

// 自动保存（debounce 1 秒）
function useAutoSave() {
  const structures = useProjectStore(s => s.structures);
  const systemInfo = useProjectStore(s => s.systemInfo);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const db = await getDB();
      await db.put(STORE_NAME, {
        systemInfo,
        structures,
        timestamp: Date.now(),
      }, 'current-session');
    }, 1000);

    return () => clearTimeout(timer);
  }, [structures, systemInfo]);
}

// 启动时恢复
async function restoreFromDB(): Promise<ProjectData | null> {
  const db = await getDB();
  const saved = await db.get(STORE_NAME, 'current-session');
  if (saved && Date.now() - saved.timestamp < 7 * 24 * 60 * 60 * 1000) {
    return saved; // 7 天内的数据才恢复
  }
  return null;
}
```

### 8.3 项目文件导出/导入

```typescript
// 导出
function exportProject() {
  const state = useProjectStore.getState();
  const project: ProjectFile = {
    version: '1.0.0',
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    systemInfo: state.systemInfo!,
    structures: state.structures,
    userAddedStructures: state.userStructures,
    tags: useTagStore.getState().tags,
    filterPresets: useFilterStore.getState().presets,
  };

  const blob = new Blob(
    [JSON.stringify(project, null, 2)],
    { type: 'application/json' }
  );

  // 使用 FileSaver.js
  saveAs(blob, `uspex-project-${state.systemInfo?.elements.join('-')}.json`);
}

// 导入
async function importProject(file: File) {
  const text = await file.text();
  const project: ProjectFile = JSON.parse(text);

  // 版本兼容性检查
  if (!project.version) throw new Error('Invalid project file');

  useProjectStore.getState().loadProjectFile(project);
}
```

---

## 9. UI/UX 设计规范

### 9.1 整体布局

```
┌─ Header ──────────────────────────────────────────┐
│ 🔬 USPEX Analyzer    Ti-H Binary    [EN/中] [🌙]  │
├──────────┬────────────────────────────────────────┤
│          │                                        │
│ Sidebar  │            Main Content Area           │
│          │                                        │
│ 📊 Dashboard │                                     │
│ 📋 Table     │                                     │
│ 📐 Hull      │                                     │
│ 🎯 Pareto    │                                     │
│ 🔍 Explorer  │                                     │
│ 🌳 Genealogy │                                     │
│ 📈 Evolution │                                     │
│ ⚖️ Compare   │                                     │
│ 🔧 Filter    │                                     │
│              │                                     │
│ ──────────── │                                     │
│ 💾 Save      │                                     │
│ 📂 Load      │                                     │
│              │                                     │
└──────────┴────────────────────────────────────────┘
```

### 9.2 颜色方案

```css
:root {
  /* 主色调 — 科学/专业感 */
  --primary: #2563eb;        /* 蓝色 */
  --primary-light: #dbeafe;
  --primary-dark: #1d4ed8;

  /* 功能色 */
  --success: #16a34a;        /* 稳定结构 */
  --warning: #f59e0b;        /* 提示 */
  --danger: #dc2626;         /* 不稳定/删除 */

  /* 来源方法颜色 */
  --origin-seeds: #6366f1;
  --origin-heredity: #ec4899;
  --origin-latmutate: #f97316;
  --origin-softmutate: #14b8a6;
  --origin-permutate: #8b5cf6;
  --origin-random: #6b7280;
  --origin-user: #eab308;

  /* 暗色主题 */
  --bg-dark: #0f172a;
  --surface-dark: #1e293b;
  --text-dark: #e2e8f0;
}
```

### 9.3 响应式设计

- **桌面端** (>1280px): 左侧导航 + 右侧内容
- **平板端** (768px~1280px): 可折叠导航
- **移动端** (<768px): 底部 Tab 导航（简化功能）

注意：由于大量数据表格和图表，这个工具主要面向桌面端使用。移动端可做基本浏览但不需要完整功能。

---

## 10. 开发路线图

### Phase 1: 核心可用 (预计 3~4 周)

| 任务 | 预计工时 | 优先级 |
|------|----------|--------|
| 项目初始化 (Vite + React + TS + Tailwind + Shadcn) | 0.5 天 | P0 |
| 布局框架 (AppShell + Sidebar + Router) | 1 天 | P0 |
| i18n 基础配置 | 0.5 天 | P0 |
| 文件解析引擎（全部 7 个 parser） | 3 天 | P0 |
| 智能文件识别 + 上传页面 | 1 天 | P0 |
| 数据合并逻辑 + Zustand Store | 1 天 | P0 |
| 数据表格（TanStack Table + 排序 + 列管理） | 3 天 | P0 |
| Convex Hull 2D（二元体系） | 2 天 | P0 |
| 高级筛选器 (QueryBuilder) | 2 天 | P0 |
| 导出引擎（zip + seeds + csv） | 2 天 | P0 |
| 项目文件导出/导入 | 1 天 | P0 |
| IndexedDB 自动保存 | 0.5 天 | P1 |

**Phase 1 产出**: 可上传文件、查看表格、2D 凸包图、筛选导出。已经比手动跑脚本方便一个量级。

### Phase 2: 进阶可视化 (预计 3~4 周)

| 任务 | 预计工时 | 优先级 |
|------|----------|--------|
| Pareto Front 交互图 | 2 天 | P1 |
| 万能散点图 Explorer（含 lasso 联动） | 3 天 | P1 |
| Convex Hull 三元 2D 投影 | 2 天 | P1 |
| Convex Hull 三元 3D 凸包 | 2 天 | P1 |
| 进化趋势图 | 1.5 天 | P1 |
| Dashboard 统计面板 | 2 天 | P1 |
| 标签系统 | 2 天 | P1 |

**Phase 2 产出**: 完整的可视化套件。

### Phase 3: 高级功能 (预计 3~4 周)

| 任务 | 预计工时 | 优先级 |
|------|----------|--------|
| 3D 结构查看器（3Dmol.js 集成） | 3 天 | P2 |
| 谱系追溯图（D3.js 力导向图） | 3 天 | P2 |
| 结构对比功能 | 2 天 | P2 |
| 用户自定义数据 + 凸包重新计算 | 3 天 | P2 |
| 筛选预设保存/加载 | 1 天 | P2 |
| 暗色主题 | 1 天 | P2 |

### Phase 4: 打磨优化 (预计 2 周)

| 任务 | 预计工时 |
|------|----------|
| URL 状态同步 | 1 天 |
| 性能优化（大数据集虚拟化） | 2 天 |
| 移动端适配 | 1 天 |
| 完善翻译文本 | 1 天 |
| 使用文档 / README | 1 天 |
| 示例数据准备 | 0.5 天 |
| Bug 修复 & 边界情况处理 | 2 天 |

---

## 11. 部署与 CI/CD

### 11.1 GitHub Pages 部署

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - uses: actions/deploy-pages@v4
```

### 11.2 Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/uspex-analyzer/',  // GitHub Pages 子路径
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js-dist-min'],  // 单独 chunk，按需加载
          '3dmol': ['3dmol'],
          d3: ['d3'],
        },
      },
    },
  },
});
```

### 11.3 路由配置（Hash Router）

GitHub Pages 不支持 SPA 的 history mode fallback，必须用 Hash Router：

```typescript
// App.tsx
import { HashRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/table" element={<DataTablePage />} />
          <Route path="/convex-hull" element={<ConvexHullPage />} />
          <Route path="/pareto" element={<ParetoPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/genealogy" element={<GenealogyPage />} />
          <Route path="/evolution" element={<EvolutionPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/filter" element={<FilterPage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
```

---

## 12. 附录：USPEX 文件格式参考

### 12.1 extended_convex_hull

```
# X axis: Composition
# Y axis: Formation energy relative to the substance
# Fitness: its distance to the convex hull (eV/block)
  ID   Compositions    Enthalpies     Volumes     Fitness   SYMM    X        Y
                       (eV/atom)    (A^3/atom)   (eV/block)              (eV/atom)
   2  [    10 28  ]     -1.7829       4.1487      0.0000     82   0.737  -1.0302
 134  [     3  8  ]     -1.7810       4.3455      0.0000     71   0.727  -1.0444
```

**解析要点**: 
- 跳过 `#` 注释行和含文字的 header 行
- 用正则提取 `[n1 n2]` 或 `[n1 n2 n3]` 组成
- `]` 之后的数值按顺序为: enthalpy, volume, fitness, symm, x, y
- 二元/三元体系通过组成数组长度自动判断

### 12.2 Pareto_ranking

```
Pareto  ID   Origin     Composition     Enthalpy   Volume  Density  ML_Young_Modul ConvexHull  KPOINTS   SYMM
front                                   eV/atom    (A^3)  (g/cm^3)
  1    222    Seeds     [     1  5  ]    -1.380    20.106   4.369       92.677        0.201    [ 1  1  1]   1
```

**解析要点**:
- 第一个非标准列即为第二目标（自动识别）
- 注意有两组 `[...]`: 第一组是组成，第二组是 KPOINTS
- 二元/三元体系通过组成中数字的个数自动判断

### 12.3 MLProperties

```
ID   Modulus:Bulk, Shear, Youngs  Ratio:Poissons,Pughs Vicker-Hard Toughness
            (GPa)  (GPa)   (GPa)                           (GPa)  (MPa*m^1/2)
    1         0.0    0.0     0.0         0.250   0.500     10.00      5.00
```

**解析要点**: 纯数值表格，ID 为第一列，后面依次是 Bulk, Shear, Young, Poisson, Pugh, Hardness, Toughness

### 12.4 origin

```
 ID    Origin    Enthalpy   Parent-E   Parent-ID
   1   Seeds       26.289    26.289  [         0]
 349   Heredity    -1.418    -1.425  [    18   191]
```

**解析要点**: 
- Seeds/Random 的 Parent-ID 通常为 `[0]`
- Heredity 有两个父代 `[id1 id2]`
- 其他变异算子通常有一个父代

### 12.5 gatheredPOSCARS

```
EA1     6.154  6.121  3.900 89.98 89.56 90.25 Sym.group:    1
1.0
    6.153649     0.000000     0.000000
   -0.026338     6.120825     0.000000
    0.029929     0.001695     3.900027
  Ti   H
   9  29
Direct
    0.705588     0.399935     0.249206
    ...
```

**解析要点**: 
- 按 `EA{id}` 行分割
- Header 行包含晶胞参数和空间群
- 标准 VASP POSCAR 格式

### 12.6 convex_hull

```
---- generation  1 ----
   8   0      0.4841
   0  15     -1.1109
  10  28     -1.7829
---- generation  2 ----
   8   0      0.4841
   0  18     -1.1666
```

**解析要点**: 
- 按 `---- generation N ----` 分段
- 每段内为该代凸包上的点: 组成 + 焓
- 用于绘制进化趋势图

### 12.7 Parameters.txt

```
% atomType
Ti H
% EndAtomType
```

**解析要点**: 提取 `%atomType` 和 `%EndAtomType` 之间的元素列表

---

## 总结

本方案设计了一个功能完整、模块化良好的 USPEX 输出分析 Web 应用。核心设计思想：

1. **纯前端架构** — 零安装，GitHub Pages 一键部署
2. **智能自适应** — 自动识别文件类型、体系类型、优化类型
3. **渐进增强** — 缺失文件时功能降级但不崩溃
4. **中英双语** — react-i18next 实现完整国际化
5. **数据安全** — IndexedDB 自动保存 + 项目文件导出
6. **模块化开发** — 12 个独立模块，可分阶段迭代交付

建议从 Phase 1 开始，做完就已经非常实用。每完成一个 Phase 就发布一个版本，快速迭代。

---

*文档完*

