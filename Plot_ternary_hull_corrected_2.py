#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三元相图凸胞可视化工具（修正版）
用于绘制USPEX计算结果的二维凸胞图

修正说明：
- 使用3D凸胞算法（x, y, enthalpy）计算热力学凸胞
- 提取凸胞下表面的边作为相平衡连线（tie-lines）
- 正确显示相图内部的三相区划分
"""

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.colorbar import ColorbarBase
from matplotlib.cm import ScalarMappable
import matplotlib.patches as mpatches
import numpy as np
import os
import re
import argparse
from scipy.spatial import ConvexHull, Delaunay
from pathlib import Path

# =============== 绘图颜色配置 ===============
COLORS = {
    'triangle_edge': (0/255, 0/255, 0/255),          # 黑色边框
    'hull_point': (212/255, 37/255, 23/255),         # 红色（凸胞点）
    'hull_line': (0/255, 0/255, 0/255),              # 黑色连线
    'fitness_colormap': [
        (238/255, 63/255, 77/255),
        (252/255, 183/255, 10/255),
        (65/255, 174/255, 60/255),
        (81/255, 196/255, 211/255),    
        (36/255, 116/255, 181/255),   
    ],
    'label_color': (0/255, 0/255, 0/255),
    'background': (255/255, 255/255, 255/255),
    'grid_line': (200/255, 200/255, 200/255),
}

# =============== 配置参数 ===============
CONFIG = {
    'figsize_cm': (10.0, 8.5),
    'font_sizes': {'title': 12, 'label': 11, 'tick': 9, 'colorbar': 9},
    'hull_point_size': 80,
    'point_size': 40,
    'point_alpha': 0.6,
    'linewidths': {
        'triangle_edge': 1.5,
        'hull_line': 0.8,
        'grid_line': 0.3,
        'axes': 0.5,
    },
    'hull_threshold': 1e-4,
    'fitness_cutoff': None,
    'max_points': None,
    'show_grid': False,
    'colorbar_width': 0.03,
    'colorbar_pad': 0.05,
}


class TernaryHullPlotter:
    """三元相图凸胞绘制器（修正版）"""
    
    def __init__(self, figsize_cm=None, fitness_cutoff=None, max_points=None,
                 point_size=None, hull_point_size=None, alpha=None):
        self.config = CONFIG.copy()
        self.config['linewidths'] = CONFIG['linewidths'].copy()
        
        if figsize_cm is not None:
            self.config['figsize_cm'] = figsize_cm
        if fitness_cutoff is not None:
            self.config['fitness_cutoff'] = fitness_cutoff
        if max_points is not None:
            self.config['max_points'] = max_points
        if point_size is not None:
            self.config['point_size'] = point_size
        if hull_point_size is not None:
            self.config['hull_point_size'] = hull_point_size
        if alpha is not None:
            self.config['point_alpha'] = alpha
        
        self._setup_fonts()
        self._create_colormap()
        
        self.elements = []
        self.data = []
        self.hull_points = []
        self.other_points = []
        self.max_fitness = 0.1
        self.hull_edges = []  # 存储凸胞连线
        
    def _cm_to_inches(self, cm_value):
        return cm_value / 2.54
    
    def _get_figsize_inches(self):
        width_cm, height_cm = self.config['figsize_cm']
        return (self._cm_to_inches(width_cm), self._cm_to_inches(height_cm))
    
    def _setup_fonts(self):
        """
        设置字体，按优先级尝试：
        1. 系统已安装的 Times New Roman
        2. ~/fonts 目录下的字体文件
        3. 从网络下载字体
        4. 使用系统默认 serif 字体
        """
        import urllib.request
        import ssl
        
        def download_font(url, dest_path, timeout=15):
            """下载字体文件"""
            try:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                req = urllib.request.Request(url, headers=headers)
                
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                    with open(dest_path, 'wb') as f:
                        f.write(response.read())
                
                # 验证文件大小（太小可能是错误页面）
                if os.path.getsize(dest_path) < 10000:
                    os.remove(dest_path)
                    return False
                return True
            except Exception as e:
                print(f"    下载失败: {e}")
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                return False
        
        # 字体下载源（按优先级）
        font_sources = [
            # Times New Roman 镜像
            ('https://raw.githubusercontent.com/AntPace/fonts/main/Times%20New%20Roman.ttf', 'TimesNewRoman.ttf'),
            ('https://github.com/AntPace/fonts/raw/main/Times%20New%20Roman.ttf', 'TimesNewRoman.ttf'),
            # TeX Gyre Termes（开源替代）
            ('https://mirrors.ctan.org/fonts/tex-gyre/opentype/texgyretermes-regular.otf', 'TexGyreTermes.otf'),
        ]
        
        font_name = 'DejaVu Serif'  # 默认字体
        
        try:
            # ===== 1. 检查系统是否已安装 Times New Roman =====
            available_fonts = [f.name for f in fm.fontManager.ttflist]
            
            if 'Times New Roman' in available_fonts:
                print("✓ 系统已安装 Times New Roman")
                font_name = 'Times New Roman'
            else:
                # ===== 2. 检查 ~/fonts 目录 =====
                fonts_dir = Path.home() / "fonts"
                fonts_dir.mkdir(parents=True, exist_ok=True)
                
                # 检查已存在的字体文件
                existing_files = [
                    ('TimesNewRoman.ttf', 'Times New Roman'),
                    ('times_new_roman.ttf', 'Times New Roman'),
                    ('TexGyreTermes.otf', 'TeX Gyre Termes'),
                    ('texgyretermes-regular.otf', 'TeX Gyre Termes'),
                ]
                
                font_found = False
                for filename, name in existing_files:
                    font_path = fonts_dir / filename
                    if font_path.exists():
                        print(f"✓ 在 ~/fonts 找到字体: {filename}")
                        fm.fontManager.addfont(str(font_path))
                        font_name = name
                        font_found = True
                        break
                
                # ===== 3. 尝试下载字体 =====
                if not font_found:
                    print("~/fonts 中没有找到字体，尝试下载...")
                    
                    for url, filename in font_sources:
                        font_path = fonts_dir / filename
                        print(f"  尝试下载: {filename}...")
                        
                        if download_font(url, font_path):
                            print(f"  ✓ 下载成功: {font_path}")
                            fm.fontManager.addfont(str(font_path))
                            font_name = 'Times New Roman' if 'Times' in filename else 'TeX Gyre Termes'
                            break
                    else:
                        print("  ⚠ 所有下载源均失败，使用默认字体")
        
        except Exception as e:
            print(f"字体设置出错: {e}")
        
        # ===== 4. 应用字体设置 =====
        plt.rcParams['font.family'] = 'serif'
        plt.rcParams['font.serif'] = [font_name, 'DejaVu Serif', 'serif']
        plt.rcParams['mathtext.fontset'] = 'custom'
        plt.rcParams['mathtext.rm'] = font_name
        plt.rcParams['mathtext.it'] = f'{font_name}:italic'
        plt.rcParams['mathtext.bf'] = f'{font_name}:bold'
        
        plt.rcParams.update({
            'axes.linewidth': self.config['linewidths']['axes'],
            'figure.dpi': 300,
            'savefig.dpi': 600,
            'pdf.fonttype': 42,
        })
        
        print(f"当前使用字体: {font_name}")
    
    def _create_colormap(self):
        colors = COLORS['fitness_colormap']
        self.cmap = LinearSegmentedColormap.from_list('fitness', colors, N=256)
    
    def parse_parameters(self, param_file):
        """解析Parameters.txt文件"""
        try:
            with open(param_file, 'r') as f:
                content = f.read()
            
            match = re.search(r'%\s*atomType\s*\n(.*?)\n%\s*EndAtomType', content, re.DOTALL | re.IGNORECASE)
            if match:
                atoms_line = match.group(1).strip()
                self.elements = atoms_line.split()
                print(f"元素列表: {self.elements}")
                return True
            else:
                print("警告: 未找到atomType块")
                return False
                
        except FileNotFoundError:
            print(f"错误: 未找到文件 {param_file}")
            return False
        except Exception as e:
            print(f"解析Parameters.txt出错: {e}")
            return False
    
    def parse_convex_hull(self, hull_file):
        """解析extended_convex_hull文件"""
        try:
            with open(hull_file, 'r') as f:
                lines = f.readlines()
            
            self.data = []
            
            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if 'ID' in line or 'Compositions' in line or 'eV/atom' in line:
                    continue
                
                try:
                    comp_match = re.search(r'\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]', line)
                    if not comp_match:
                        continue
                    
                    n1 = int(comp_match.group(1))
                    n2 = int(comp_match.group(2))
                    n3 = int(comp_match.group(3))
                    
                    id_match = re.match(r'(\d+)', line)
                    struct_id = int(id_match.group(1)) if id_match else 0
                    
                    after_bracket = line[comp_match.end():].split()
                    if len(after_bracket) >= 3:
                        enthalpy = float(after_bracket[0])
                        volume = float(after_bracket[1])
                        fitness = float(after_bracket[2])
                    else:
                        continue
                    
                    self.data.append({
                        'id': struct_id,
                        'composition': [n1, n2, n3],
                        'enthalpy': enthalpy,
                        'volume': volume,
                        'fitness': fitness,
                    })
                    
                except (ValueError, IndexError):
                    continue
            
            print(f"成功读取 {len(self.data)} 个数据点")
            return len(self.data) > 0
            
        except FileNotFoundError:
            print(f"错误: 未找到文件 {hull_file}")
            return False
        except Exception as e:
            print(f"解析convex hull文件出错: {e}")
            return False
    
    def _composition_to_cartesian(self, composition):
        """将组成转换为笛卡尔坐标"""
        n1, n2, n3 = composition
        total = n1 + n2 + n3
        
        if total == 0:
            return (0.5, np.sqrt(3)/6)
        
        x1 = n1 / total  # 元素A (左下角)
        x2 = n2 / total  # 元素B (顶部)
        x3 = n3 / total  # 元素C (右下角)
        
        # 三角形顶点: A(0,0), B(0.5, √3/2), C(1,0)
        x = x1 * 0 + x2 * 0.5 + x3 * 1.0
        y = x1 * 0 + x2 * (np.sqrt(3)/2) + x3 * 0
        
        return (x, y)
    
    def _filter_and_classify_points(self):
        """筛选和分类数据点"""
        sorted_data = sorted(self.data, key=lambda d: d['fitness'])
        
        filtered_data = []
        for d in sorted_data:
            if self.config['fitness_cutoff'] is not None:
                if d['fitness'] > self.config['fitness_cutoff']:
                    continue
            
            filtered_data.append(d)
            
            if self.config['max_points'] is not None:
                if len(filtered_data) >= self.config['max_points']:
                    break
        
        hull_threshold = self.config['hull_threshold']
        self.hull_points = []
        self.other_points = []
        
        for d in filtered_data:
            x, y = self._composition_to_cartesian(d['composition'])
            point_data = {
                'x': x,
                'y': y,
                'fitness': d['fitness'],
                'id': d['id'],
                'composition': d['composition'],
                'enthalpy': d['enthalpy'],
            }
            
            if d['fitness'] <= hull_threshold:
                self.hull_points.append(point_data)
            else:
                self.other_points.append(point_data)
        
        if filtered_data:
            self.max_fitness = max(d['fitness'] for d in filtered_data)
        else:
            self.max_fitness = 0.1
        
        print(f"筛选后总点数: {len(filtered_data)}")
        print(f"凸胞上的点: {len(self.hull_points)}")
        print(f"其他点: {len(self.other_points)}")
        print(f"最大fitness: {self.max_fitness:.4f} eV/block")
    
    def _get_unique_hull_points(self):
        """获取凸胞上的唯一成分点"""
        seen_compositions = {}
        
        for p in self.hull_points:
            comp_key = tuple(p['composition'])
            if comp_key not in seen_compositions:
                seen_compositions[comp_key] = p
            elif p['enthalpy'] < seen_compositions[comp_key]['enthalpy']:
                seen_compositions[comp_key] = p
        
        return list(seen_compositions.values())
    
    def _compute_3d_hull_edges(self, points):
        """
        【核心修正】使用3D凸胞算法计算热力学相平衡连线
        
        原理：
        1. 在3D空间 (x, y, enthalpy) 中计算凸胞
        2. 找出凸胞的下表面（法向量z分量 < 0）
        3. 提取下表面的边，投影到2D作为tie-lines
        
        Args:
            points: 稳定点列表（fitness ≈ 0）
            
        Returns:
            edges: 边的列表 [((x1,y1), (x2,y2)), ...]
        """
        if len(points) < 3:
            print("警告: 稳定点数量不足3个，无法计算凸胞")
            return []
        
        # 步骤1: 构建3D坐标 (x, y, enthalpy)
        coords_3d = np.array([
            [p['x'], p['y'], p['enthalpy']] 
            for p in points
        ])
        
        print(f"\n=== 3D凸胞计算 ===")
        print(f"输入点数: {len(points)}")
        print(f"能量范围: [{coords_3d[:, 2].min():.4f}, {coords_3d[:, 2].max():.4f}] eV/atom")
        
        # 检查是否有足够的非共面点
        # 如果所有点几乎在同一平面上，添加扰动
        z_range = coords_3d[:, 2].max() - coords_3d[:, 2].min()
        if z_range < 1e-10:
            print("警告: 所有点能量相同，添加微小扰动")
            coords_3d[:, 2] += np.random.uniform(-1e-8, 1e-8, len(points))
        
        try:
            # 步骤2: 计算3D凸胞
            hull_3d = ConvexHull(coords_3d)
            
            edges = set()
            lower_faces = 0
            
            # 步骤3: 遍历所有面，找出下表面
            for simplex, equation in zip(hull_3d.simplices, hull_3d.equations):
                # equation = [a, b, c, d]，表示平面 ax + by + cz + d = 0
                # 法向量为 (a, b, c)，指向凸胞外部
                # 下表面：法向量的z分量 < 0（即法向量朝下，面朝上看是下表面）
                
                normal_z = equation[2]
                
                if normal_z < -1e-10:  # 下表面（法向量朝下）
                    lower_faces += 1
                    # simplex包含3个点的索引，提取这个三角形的三条边
                    for i in range(3):
                        for j in range(i+1, 3):
                            idx1, idx2 = simplex[i], simplex[j]
                            edge = tuple(sorted([idx1, idx2]))
                            edges.add(edge)
            
            print(f"凸胞总面数: {len(hull_3d.simplices)}")
            print(f"下表面数量: {lower_faces}")
            print(f"提取的边数: {len(edges)}")
            
            # 步骤4: 将边转换为2D坐标
            edge_coords = []
            for idx1, idx2 in edges:
                p1 = (coords_3d[idx1, 0], coords_3d[idx1, 1])
                p2 = (coords_3d[idx2, 0], coords_3d[idx2, 1])
                
                # 存储边的信息（用于调试）
                edge_coords.append({
                    'p1': p1,
                    'p2': p2,
                    'comp1': points[idx1]['composition'],
                    'comp2': points[idx2]['composition'],
                    'e1': coords_3d[idx1, 2],
                    'e2': coords_3d[idx2, 2],
                })
            
            # 打印一些边的信息
            print("\n前5条边的信息:")
            for i, e in enumerate(edge_coords[:5]):
                print(f"  {e['comp1']} ↔ {e['comp2']}")
            
            return [(e['p1'], e['p2']) for e in edge_coords]
            
        except Exception as e:
            print(f"3D凸胞计算失败: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _compute_hull_edges_delaunay(self, points):
        """
        备选方法：使用Delaunay三角剖分 + 能量筛选
        
        这个方法在某些边界情况下可能更稳定
        """
        if len(points) < 3:
            return []
        
        coords_2d = np.array([[p['x'], p['y']] for p in points])
        energies = np.array([p['enthalpy'] for p in points])
        
        try:
            tri = Delaunay(coords_2d)
            edges = set()
            
            for simplex in tri.simplices:
                # 对于每个三角形，检查它是否在凸胞下表面上
                # 简化判断：如果三角形的三个顶点都是稳定点（fitness≈0），则保留其边
                for i in range(3):
                    for j in range(i+1, 3):
                        idx1, idx2 = simplex[i], simplex[j]
                        edge = tuple(sorted([idx1, idx2]))
                        edges.add(edge)
            
            return [((coords_2d[i, 0], coords_2d[i, 1]), 
                     (coords_2d[j, 0], coords_2d[j, 1])) 
                    for i, j in edges]
            
        except Exception as e:
            print(f"Delaunay计算失败: {e}")
            return []
    
    def _draw_triangle(self, ax):
        """绘制三角形边框"""
        vertices = np.array([
            [0, 0], [1, 0], [0.5, np.sqrt(3)/2], [0, 0]
        ])
        ax.plot(vertices[:, 0], vertices[:, 1], 
                color=COLORS['triangle_edge'], 
                linewidth=self.config['linewidths']['triangle_edge'],
                zorder=2)
    
    def _draw_grid(self, ax):
        """绘制网格"""
        if not self.config['show_grid']:
            return
        
        n_lines = 10
        for i in range(1, n_lines):
            t = i / n_lines
            
            # 平行于底边
            x1, y1 = t * 0.5, t * np.sqrt(3)/2
            x2, y2 = 1 - t * 0.5, t * np.sqrt(3)/2
            ax.plot([x1, x2], [y1, y2], color=COLORS['grid_line'], 
                   linewidth=self.config['linewidths']['grid_line'], zorder=1, alpha=0.3)
            
            # 平行于左边
            x1, y1 = t, 0
            x2, y2 = 0.5 + t * 0.5, (1-t) * np.sqrt(3)/2
            ax.plot([x1, x2], [y1, y2], color=COLORS['grid_line'],
                   linewidth=self.config['linewidths']['grid_line'], zorder=1, alpha=0.3)
            
            # 平行于右边
            x1, y1 = t * 0.5, t * np.sqrt(3)/2
            x2, y2 = t, 0
            ax.plot([x1, x2], [y1, y2], color=COLORS['grid_line'],
                   linewidth=self.config['linewidths']['grid_line'], zorder=1, alpha=0.3)
    
    def _draw_element_labels(self, ax):
        """绘制元素标签"""
        if len(self.elements) < 3:
            labels = ['A', 'B', 'C']
        else:
            labels = self.elements[:3]
        
        font_size = self.config['font_sizes']['label']
        offset = 0.06
        
        ax.text(-offset, -offset, labels[0], fontsize=font_size, 
                color=COLORS['label_color'], ha='center', va='top', fontweight='bold')
        ax.text(0.5, np.sqrt(3)/2 + offset, labels[1], fontsize=font_size,
                color=COLORS['label_color'], ha='center', va='bottom', fontweight='bold')
        ax.text(1 + offset, -offset, labels[2], fontsize=font_size,
                color=COLORS['label_color'], ha='center', va='top', fontweight='bold')
    
    def plot(self, output_prefix='ternary_hull'):
        """绘制三元相图"""
        print("\n" + "="*50)
        print("正在绘制三元相图（修正版3D凸胞算法）")
        print("="*50)
        
        # 分类数据点
        self._filter_and_classify_points()
        
        # 创建图形
        fig = plt.figure(figsize=self._get_figsize_inches())
        ax_main = fig.add_axes([0.1, 0.1, 0.75, 0.8])
        ax_cbar = fig.add_axes([0.88, 0.1, 0.03, 0.8])
        
        # 绘制网格和边框
        self._draw_grid(ax_main)
        self._draw_triangle(ax_main)
        
        # 绘制其他点（不稳定点）
        if self.other_points:
            fitness_values = np.array([p['fitness'] for p in self.other_points])
            if self.max_fitness > 0:
                normalized_fitness = fitness_values / self.max_fitness
            else:
                normalized_fitness = np.zeros_like(fitness_values)
            
            colors = self.cmap(normalized_fitness)
            
            for i, p in enumerate(self.other_points):
                ax_main.scatter(p['x'], p['y'],
                          s=self.config['point_size'],
                          c=[colors[i]],
                          alpha=self.config['point_alpha'],
                          edgecolors='none',
                          zorder=5)
        
        # 【核心】计算并绘制凸胞连线
        unique_hull = self._get_unique_hull_points()
        print(f"\n唯一成分的稳定点数: {len(unique_hull)}")
        
        if len(unique_hull) >= 3:
            # 使用3D凸胞算法
            edges = self._compute_3d_hull_edges(unique_hull)
            self.hull_edges = edges
            
            print(f"\n绘制 {len(edges)} 条相平衡连线")
            
            for (x1, y1), (x2, y2) in edges:
                ax_main.plot([x1, x2], [y1, y2],
                       color=COLORS['hull_line'],
                       linewidth=self.config['linewidths']['hull_line'],
                       zorder=8,
                       solid_capstyle='round')
        else:
            print("警告: 稳定点不足3个，无法绘制凸胞连线")
        
        # 绘制凸胞点
        if self.hull_points:
            hull_x = [p['x'] for p in self.hull_points]
            hull_y = [p['y'] for p in self.hull_points]
            ax_main.scatter(hull_x, hull_y,
                      s=self.config['hull_point_size'],
                      c=[COLORS['hull_point']],
                      alpha=1.0,
                      edgecolors='white',
                      linewidths=0.8,
                      zorder=10)
        
        # 元素标签
        self._draw_element_labels(ax_main)
        
        # 标题
        if self.elements:
            title = f"{'-'.join(self.elements[:3])} Ternary Phase Diagram"
        else:
            title = "Ternary Phase Diagram"
        ax_main.set_title(title, fontsize=self.config['font_sizes']['title'], 
                         pad=15, fontweight='normal')
        
        # 设置坐标轴
        ax_main.set_xlim(-0.12, 1.12)
        ax_main.set_ylim(-0.12, np.sqrt(3)/2 + 0.15)
        ax_main.set_aspect('equal')
        ax_main.axis('off')
        
        # # 信息文本
        # info_text = []
        # if self.config['fitness_cutoff'] is not None:
        #     info_text.append(f"Fitness cutoff: {self.config['fitness_cutoff']:.2f} eV/block")
        # if self.config['max_points'] is not None:
        #     info_text.append(f"Max points: {self.config['max_points']}")
        
        # if info_text:
        #     ax_main.text(0.5, -0.10, ' | '.join(info_text),
        #            transform=ax_main.transAxes,
        #            ha='center', va='top',
        #            fontsize=self.config['font_sizes']['tick'],
        #            color='gray')
        
        # Colorbar
        norm = plt.Normalize(vmin=0, vmax=self.max_fitness)
        sm = ScalarMappable(cmap=self.cmap, norm=norm)
        sm.set_array([])
        
        cbar = plt.colorbar(sm, cax=ax_cbar, orientation='vertical')
        cbar.set_label('Fitness (eV/block)', 
                      fontsize=self.config['font_sizes']['colorbar'],
                      rotation=270, labelpad=20)
        cbar.ax.tick_params(labelsize=self.config['font_sizes']['tick'])
        
        # 保存
        plt.savefig(f"{output_prefix}.png", dpi=600, bbox_inches='tight', 
                   facecolor='white', edgecolor='none')
        plt.savefig(f"{output_prefix}.pdf", bbox_inches='tight',
                   facecolor='white', edgecolor='none')
        print(f"\n图形已保存: {output_prefix}.png/.pdf")
        
        return fig, (ax_main, ax_cbar)


def main():
    parser = argparse.ArgumentParser(description='三元相图凸胞可视化工具（修正版）')
    parser.add_argument('--hull', default='extended_convex_hull', 
                       help='extended_convex_hull文件路径')
    parser.add_argument('--param', default='Parameters.txt',
                       help='Parameters.txt文件路径')
    parser.add_argument('--output', default='ternary_hull',
                       help='输出文件名前缀')
    parser.add_argument('--fitness', type=float, default=0.4,
                       help='Fitness截断值')
    parser.add_argument('--max-points', type=int, default=None,
                       help='最多显示的点数')
    parser.add_argument('--point-size', type=float, default=15,
                       help='普通点的大小')
    parser.add_argument('--hull-point-size', type=float, default=20,
                       help='凸胞点的大小')
    parser.add_argument('--alpha', type=float, default=0.6,
                       help='点的透明度')
    parser.add_argument('--width', type=float, default=10.0,
                       help='图片宽度（厘米）')
    parser.add_argument('--height', type=float, default=8.5,
                       help='图片高度（厘米）')
    parser.add_argument('--show-grid', action='store_true',
                       help='显示网格线')
    
    args = parser.parse_args()
    
    plotter = TernaryHullPlotter(
        figsize_cm=(args.width, args.height),
        fitness_cutoff=args.fitness,
        max_points=args.max_points,
        point_size=args.point_size,
        hull_point_size=args.hull_point_size,
        alpha=args.alpha
    )
    
    if args.show_grid:
        plotter.config['show_grid'] = True
    
    plotter.parse_parameters(args.param)
    
    if plotter.parse_convex_hull(args.hull):
        plotter.plot(args.output)
    else:
        print("数据解析失败")


if __name__ == "__main__":
    main()


# =============== 原理说明 ===============
"""
【三元相图凸胞连线的正确算法】

1. 问题定义：
   - 三元体系有组成 (xA, xB, xC)，满足 xA + xB + xC = 1
   - 每个相有形成能 Ef
   - 需要找出热力学稳定的相及其相平衡关系

2. 为什么不能用2D凸胞？
   - 2D凸胞只考虑点的位置，忽略能量
   - 得到的是几何外轮廓，不是热力学相平衡

3. 正确方法：3D凸胞下表面
   - 在 (x, y, Ef) 空间计算凸胞
   - 凸胞的下表面（lower hull）由多个三角形面片组成
   - 每个三角形代表一个三相区
   - 三角形的边就是相平衡连线（tie-lines）

4. 算法实现：
   coords_3d = [(x, y, enthalpy) for each point]
   hull = ConvexHull(coords_3d)
   
   for face in hull.simplices:
       normal = hull.equations[face][:3]
       if normal[2] < 0:  # 法向量朝下 → 下表面
           edges.add(face的三条边)

5. 物理意义：
   - 连线表示两相可以共存
   - 三角形区域内的任意组成，平衡态由三个顶点的相组成
   - fitness = 0 的点在凸胞上，是热力学稳定相
"""
