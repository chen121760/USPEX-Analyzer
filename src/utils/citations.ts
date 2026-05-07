/**
 * USPEX citation data.
 * Edit this file to update citation entries shown in the app.
 */

export interface Citation {
  /** Category label (shown as section header) */
  category: string;
  /** Individual references in this category */
  refs: string[];
}

export const citations: Citation[] = [
  {
    category: 'General (always cite)',
    refs: [
      'Oganov A.R., Glass C.W. (2006). Crystal structure prediction using ab initio evolutionary techniques: Principles and applications. J. Chem. Phys. 124, 244704',
      'Oganov A.R., Stokes H., Valle M. (2011). How evolutionary crystal structure prediction works — and why. Acc. Chem. Res. 44, 227–237',
      'Lyakhov A.O., Oganov A.R., Stokes H., Zhu Q. (2013). New developments in evolutionary structure prediction algorithm USPEX. Comp. Phys. Comm. 184, 1172–1182',
    ],
  },
  {
    category: 'Variable Composition',
    refs: [
      'Lyakhov A.O., Oganov A.R., Valle M. (2010). Crystal structure prediction using evolutionary approach. In: Modern methods of crystal structure prediction (ed: A.R. Oganov), Berlin: Wiley-VCH',
      'Oganov A.R., Ma Y., Lyakhov A.O., Valle M., Gatti C. (2010). Evolutionary crystal structure prediction as a method for the discovery of minerals and materials. Rev. Mineral. Geochem. 71, 271–298',
    ],
  },
  {
    category: 'Random Topological Structure Generator',
    refs: [
      'Bushlanov P.V., Blatov V.A., Oganov A.R. (2019). Topology-based crystal structure generator. Comp. Phys. Comm., DOI: 10.1016/j.cpc.2018.09.016',
    ],
  },
  {
    category: 'Multi-Objective Pareto Optimization',
    refs: [
      'Allahyari Z., Oganov A.R. (2020). Multi-objective Optimization as a Tool for Material Design. In: Andreoni W., Yip S. (eds) Handbook of Materials Modeling. Springer, Cham, pp 2777–2790. doi.org/10.1007/978-3-319-44680-6_71',
    ],
  },
];

/** USPEX team website */
export const uspexUrl = 'http://uspex-team.org/';
