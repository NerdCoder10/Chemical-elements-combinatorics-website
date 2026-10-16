/*
 * All 118 known chemical elements.
 *
 * Fields (comma separated):
 *   Z, symbol, name, standard atomic weight ([n] = mass number of the most stable isotope),
 *   category, group (blank for f-block), period,
 *   Pauling electronegativity (blank = not determined),
 *   common oxidation states (space separated, most common first),
 *   standard state at 298.15 K / 1 bar (s, l, g; "s?" = predicted),
 *   standard molar entropy S° of the element in its standard state, J/(mol·K)
 *   (per mole of the reference formula unit, e.g. per mole of H2; blank = not reliably known).
 *
 * Sources: IUPAC standard atomic weights; CRC Handbook of Chemistry and Physics;
 * NIST-JANAF / CODATA key values for thermodynamics.
 */
(function (root) {
  const RAW = `
1,H,Hydrogen,1.008,nm,1,1,2.20,+1 -1,g,130.68
2,He,Helium,4.0026,ng,18,1,,0,g,126.15
3,Li,Lithium,6.94,am,1,2,0.98,+1,s,29.12
4,Be,Beryllium,9.0122,ae,2,2,1.57,+2,s,9.50
5,B,Boron,10.81,md,13,2,2.04,+3,s,5.90
6,C,Carbon,12.011,nm,14,2,2.55,+4 -4 +2,s,5.74
7,N,Nitrogen,14.007,nm,15,2,3.04,-3 +5 +3 +2 +4 +1,g,191.61
8,O,Oxygen,15.999,nm,16,2,3.44,-2,g,205.15
9,F,Fluorine,18.998,hg,17,2,3.98,-1,g,202.79
10,Ne,Neon,20.180,ng,18,2,,0,g,146.33
11,Na,Sodium,22.990,am,1,3,0.93,+1,s,51.30
12,Mg,Magnesium,24.305,ae,2,3,1.31,+2,s,32.67
13,Al,Aluminium,26.982,pt,13,3,1.61,+3,s,28.30
14,Si,Silicon,28.085,md,14,3,1.90,+4 -4,s,18.81
15,P,Phosphorus,30.974,nm,15,3,2.19,+5 +3 -3,s,41.09
16,S,Sulfur,32.06,nm,16,3,2.58,-2 +6 +4,s,32.07
17,Cl,Chlorine,35.45,hg,17,3,3.16,-1 +1 +3 +5 +7,g,223.08
18,Ar,Argon,39.95,ng,18,3,,0,g,154.85
19,K,Potassium,39.098,am,1,4,0.82,+1,s,64.68
20,Ca,Calcium,40.078,ae,2,4,1.00,+2,s,41.59
21,Sc,Scandium,44.956,tm,3,4,1.36,+3,s,34.64
22,Ti,Titanium,47.867,tm,4,4,1.54,+4 +3,s,30.72
23,V,Vanadium,50.942,tm,5,4,1.63,+5 +4 +3,s,28.94
24,Cr,Chromium,51.996,tm,6,4,1.66,+3 +6 +2,s,23.62
25,Mn,Manganese,54.938,tm,7,4,1.55,+2 +4 +7,s,32.01
26,Fe,Iron,55.845,tm,8,4,1.83,+3 +2,s,27.28
27,Co,Cobalt,58.933,tm,9,4,1.88,+2 +3,s,30.04
28,Ni,Nickel,58.693,tm,10,4,1.91,+2,s,29.87
29,Cu,Copper,63.546,tm,11,4,1.90,+2 +1,s,33.15
30,Zn,Zinc,65.38,tm,12,4,1.65,+2,s,41.63
31,Ga,Gallium,69.723,pt,13,4,1.81,+3,s,40.83
32,Ge,Germanium,72.630,md,14,4,2.01,+4,s,31.09
33,As,Arsenic,74.922,md,15,4,2.18,+3 +5 -3,s,35.1
34,Se,Selenium,78.971,nm,16,4,2.55,-2 +4 +6,s,42.27
35,Br,Bromine,79.904,hg,17,4,2.96,-1 +5,l,152.21
36,Kr,Krypton,83.798,ng,18,4,3.00,0 +2,g,164.08
37,Rb,Rubidium,85.468,am,1,5,0.82,+1,s,76.78
38,Sr,Strontium,87.62,ae,2,5,0.95,+2,s,55.0
39,Y,Yttrium,88.906,tm,3,5,1.22,+3,s,44.43
40,Zr,Zirconium,91.224,tm,4,5,1.33,+4,s,38.99
41,Nb,Niobium,92.906,tm,5,5,1.6,+5,s,36.40
42,Mo,Molybdenum,95.95,tm,6,5,2.16,+6 +4,s,28.66
43,Tc,Technetium,[97],tm,7,5,1.9,+7 +4,s,
44,Ru,Ruthenium,101.07,tm,8,5,2.2,+3 +4,s,28.53
45,Rh,Rhodium,102.91,tm,9,5,2.28,+3,s,31.56
46,Pd,Palladium,106.42,tm,10,5,2.20,+2,s,37.57
47,Ag,Silver,107.87,tm,11,5,1.93,+1,s,42.55
48,Cd,Cadmium,112.41,tm,12,5,1.69,+2,s,51.80
49,In,Indium,114.82,pt,13,5,1.78,+3,s,57.82
50,Sn,Tin,118.71,pt,14,5,1.96,+4 +2,s,51.18
51,Sb,Antimony,121.76,md,15,5,2.05,+3 +5,s,45.69
52,Te,Tellurium,127.60,md,16,5,2.1,-2 +4 +6,s,49.71
53,I,Iodine,126.90,hg,17,5,2.66,-1 +5 +7,s,116.14
54,Xe,Xenon,131.29,ng,18,5,2.6,0 +2 +4 +6,g,169.68
55,Cs,Caesium,132.91,am,1,6,0.79,+1,s,85.23
56,Ba,Barium,137.33,ae,2,6,0.89,+2,s,62.5
57,La,Lanthanum,138.91,ln,,6,1.10,+3,s,56.9
58,Ce,Cerium,140.12,ln,,6,1.12,+3 +4,s,72.0
59,Pr,Praseodymium,140.91,ln,,6,1.13,+3,s,73.2
60,Nd,Neodymium,144.24,ln,,6,1.14,+3,s,71.5
61,Pm,Promethium,[145],ln,,6,1.13,+3,s,
62,Sm,Samarium,150.36,ln,,6,1.17,+3 +2,s,69.6
63,Eu,Europium,151.96,ln,,6,1.2,+3 +2,s,77.8
64,Gd,Gadolinium,157.25,ln,,6,1.2,+3,s,68.1
65,Tb,Terbium,158.93,ln,,6,1.1,+3,s,73.2
66,Dy,Dysprosium,162.50,ln,,6,1.22,+3,s,75.6
67,Ho,Holmium,164.93,ln,,6,1.23,+3,s,75.3
68,Er,Erbium,167.26,ln,,6,1.24,+3,s,73.2
69,Tm,Thulium,168.93,ln,,6,1.25,+3,s,74.0
70,Yb,Ytterbium,173.05,ln,,6,1.1,+3 +2,s,59.9
71,Lu,Lutetium,174.97,ln,,6,1.27,+3,s,51.0
72,Hf,Hafnium,178.49,tm,4,6,1.3,+4,s,43.56
73,Ta,Tantalum,180.95,tm,5,6,1.5,+5,s,41.51
74,W,Tungsten,183.84,tm,6,6,2.36,+6,s,32.64
75,Re,Rhenium,186.21,tm,7,6,1.9,+7 +4,s,36.86
76,Os,Osmium,190.23,tm,8,6,2.2,+4 +8,s,32.6
77,Ir,Iridium,192.22,tm,9,6,2.20,+3 +4,s,35.48
78,Pt,Platinum,195.08,tm,10,6,2.28,+2 +4,s,41.63
79,Au,Gold,196.97,tm,11,6,2.54,+3 +1,s,47.4
80,Hg,Mercury,200.59,tm,12,6,2.00,+2 +1,l,75.90
81,Tl,Thallium,204.38,pt,13,6,1.62,+1 +3,s,64.18
82,Pb,Lead,207.2,pt,14,6,1.87,+2 +4,s,64.80
83,Bi,Bismuth,208.98,pt,15,6,2.02,+3,s,56.74
84,Po,Polonium,[209],pt,16,6,2.0,+4 +2,s,
85,At,Astatine,[210],hg,17,6,2.2,-1 +1,s,
86,Rn,Radon,[222],ng,18,6,,0,g,176.21
87,Fr,Francium,[223],am,1,7,0.7,+1,s,
88,Ra,Radium,[226],ae,2,7,0.9,+2,s,71
89,Ac,Actinium,[227],an,,7,1.1,+3,s,
90,Th,Thorium,232.04,an,,7,1.3,+4,s,51.8
91,Pa,Protactinium,231.04,an,,7,1.5,+5,s,51.9
92,U,Uranium,238.03,an,,7,1.38,+6 +4,s,50.20
93,Np,Neptunium,[237],an,,7,1.36,+5,s,50.46
94,Pu,Plutonium,[244],an,,7,1.28,+4,s,54.46
95,Am,Americium,[243],an,,7,1.3,+3,s,55.4
96,Cm,Curium,[247],an,,7,1.3,+3,s,
97,Bk,Berkelium,[247],an,,7,1.3,+3,s,
98,Cf,Californium,[251],an,,7,1.3,+3,s,
99,Es,Einsteinium,[252],an,,7,1.3,+3,s,
100,Fm,Fermium,[257],an,,7,1.3,+3,s,
101,Md,Mendelevium,[258],an,,7,1.3,+3,s,
102,No,Nobelium,[259],an,,7,1.3,+2,s,
103,Lr,Lawrencium,[266],an,,7,1.3,+3,s,
104,Rf,Rutherfordium,[267],tm,4,7,,+4,s?,
105,Db,Dubnium,[268],tm,5,7,,+5,s?,
106,Sg,Seaborgium,[269],tm,6,7,,+6,s?,
107,Bh,Bohrium,[270],tm,7,7,,+7,s?,
108,Hs,Hassium,[269],tm,8,7,,+8,s?,
109,Mt,Meitnerium,[278],uk,9,7,,,s?,
110,Ds,Darmstadtium,[281],uk,10,7,,,s?,
111,Rg,Roentgenium,[282],uk,11,7,,,s?,
112,Cn,Copernicium,[285],uk,12,7,,+2,s?,
113,Nh,Nihonium,[286],uk,13,7,,,s?,
114,Fl,Flerovium,[289],uk,14,7,,,s?,
115,Mc,Moscovium,[290],uk,15,7,,,s?,
116,Lv,Livermorium,[293],uk,16,7,,,s?,
117,Ts,Tennessine,[294],uk,17,7,,,s?,
118,Og,Oganesson,[294],uk,18,7,,,s?,
`;

  const CATEGORIES = {
    am: 'Alkali metal',
    ae: 'Alkaline earth metal',
    tm: 'Transition metal',
    pt: 'Post-transition metal',
    md: 'Metalloid',
    nm: 'Reactive nonmetal',
    hg: 'Halogen',
    ng: 'Noble gas',
    ln: 'Lanthanide',
    an: 'Actinide',
    uk: 'Unknown properties',
  };

  // Elements whose standard-state form is a molecule; everything else is written as single atoms.
  const MOLECULAR = { H: 2, N: 2, O: 2, F: 2, Cl: 2, Br: 2, I: 2 };

  const ELEMENTS = RAW.trim().split('\n').map((line) => {
    const [z, symbol, name, mass, cat, group, period, en, ox, state, s] = line.split(',');
    const Z = Number(z);
    const fBlock = cat === 'ln' || cat === 'an';
    const atomicity = MOLECULAR[symbol] || 1;
    return {
      Z,
      symbol,
      name,
      mass,
      massNum: parseFloat(mass.replace(/[[\]]/g, '')),
      category: cat,
      categoryName: CATEGORIES[cat],
      group: group ? Number(group) : null,
      period: Number(period),
      en: en ? Number(en) : null,
      ox: ox ? ox.split(' ').map(Number) : [],
      state: state.replace('?', ''),
      statePredicted: state.endsWith('?'),
      S: s ? Number(s) : null,
      atomicity,
      refFormula: atomicity > 1 ? symbol + atomicity : symbol,
      // Position in the 18-column display grid (f-block drawn in two extra rows).
      col: fBlock ? (cat === 'ln' ? Z - 57 + 3 : Z - 89 + 3) : Number(group),
      row: fBlock ? (cat === 'ln' ? 9 : 10) : Number(period),
      isMetal: ['am', 'ae', 'tm', 'pt', 'ln', 'an', 'uk'].includes(cat),
      radioactive: Z === 43 || Z === 61 || Z >= 84,
      // Z > 100: only made a few atoms at a time; no bulk chemistry is possible.
      superheavy: Z > 100,
    };
  });

  const BY_SYMBOL = {};
  ELEMENTS.forEach((e) => { BY_SYMBOL[e.symbol] = e; });

  const api = { ELEMENTS, BY_SYMBOL, CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
