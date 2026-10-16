/*
 * Standard thermodynamic data at 298.15 K and 1 bar.
 *
 *   formula | phase | ΔHf° (kJ/mol) | S° (J/(mol·K), blank = not tabulated) | name | note
 *
 * Every compound here is made from the elements, so its formation reaction
 * (elements in their standard states -> 1 mol compound) gives ΔH° = ΔHf° and
 * ΔS° = S°(compound) - Σ S°(elements). The site balances and scales those reactions.
 *
 * Sources: NIST-JANAF Thermochemical Tables, CODATA Key Values for Thermodynamics,
 * CRC Handbook of Chemistry and Physics ("Standard Thermodynamic Properties of
 * Chemical Substances"), NBS Tables of Chemical Thermodynamic Properties.
 * Values from different tables can differ by about 1 kJ/mol.
 */
(function (root) {
  const COMPOUNDS_RAW = `
H2O|l|-285.83|69.95|Water|The H₂/O₂ mixture is explosive when ignited and burns with an almost invisible flame.
H2O|g|-241.83|188.84|Water vapour|What actually comes out of a hydrogen flame.
H2O2|l|-187.78|109.6|Hydrogen peroxide|Not formed directly in practice. It decomposes into water and oxygen.
CO|g|-110.53|197.66|Carbon monoxide|Forms when carbon burns with too little oxygen. Toxic.
CO2|g|-393.51|213.79|Carbon dioxide|Complete combustion of carbon (coal, graphite).
CH4|g|-74.6|186.3|Methane|Main component of natural gas.
C2H6|g|-84.0|229.2|Ethane|
C2H4|g|52.4|219.3|Ethylene|Endothermic compound. Made industrially by cracking, not from the elements.
C2H2|g|227.4|200.9|Acetylene|Strongly endothermic. Formed from the elements only in an electric arc.
C3H8|g|-103.8|270.3|Propane|
C6H6|l|49.1|173.4|Benzene|
CH3OH|l|-239.2|126.8|Methanol|
C2H5OH|l|-277.6|160.7|Ethanol|
HCOOH|l|-425.0|129.0|Formic acid|
CH3COOH|l|-484.3|159.8|Acetic acid|
C6H12O6|s|-1273.3|212.1|Glucose|Made by photosynthesis, not by direct combination.
HCN|g|135.1|201.8|Hydrogen cyanide|Highly toxic, endothermic.
NH3|g|-45.94|192.77|Ammonia|Haber–Bosch process: N₂ + H₂ over an iron catalyst at about 450 °C and 200 bar.
N2H4|l|50.6|121.2|Hydrazine|Endothermic. Used as a rocket fuel.
NO|g|91.29|210.76|Nitric oxide|Forms in lightning and hot engines. Endothermic, so it is only favoured at very high T.
NO2|g|33.18|240.06|Nitrogen dioxide|Brown, toxic gas.
N2O|g|81.6|220.0|Nitrous oxide|Laughing gas.
N2O4|g|11.1|304.4|Dinitrogen tetroxide|
HNO3|l|-174.1|155.6|Nitric acid|
NH4Cl|s|-314.4|94.6|Ammonium chloride|
NH4NO3|s|-365.6|151.1|Ammonium nitrate|Fertiliser and oxidiser.
NOCl|g|51.7|261.7|Nitrosyl chloride|
HF|g|-273.3|173.8|Hydrogen fluoride|H₂ and F₂ react explosively, even in the dark at low temperature.
HCl|g|-92.31|186.90|Hydrogen chloride|H₂ + Cl₂ explodes when exposed to UV light (a photochemical chain reaction).
HBr|g|-36.29|198.70|Hydrogen bromide|
HI|g|26.50|206.59|Hydrogen iodide|Slightly endothermic. The H₂ + I₂ ⇌ 2HI equilibrium is a textbook example.
H2S|g|-20.6|205.8|Hydrogen sulfide|Rotten-egg smell. Toxic.
SO2|g|-296.81|248.22|Sulfur dioxide|Sulfur burns in air with a blue flame.
SO3|g|-395.72|256.76|Sulfur trioxide|
H2SO4|l|-814.0|156.9|Sulfuric acid|
CS2|l|89.0|151.3|Carbon disulfide|
SF6|g|-1220.5|291.5|Sulfur hexafluoride|Very inert gas used as an electrical insulator.
H2Se|g|29.7|219.0|Hydrogen selenide|
SeO2|s|-225.4|67.1|Selenium dioxide|
PH3|g|5.4|210.2|Phosphine|
P4O10|s|-2984.0|228.86|Phosphorus pentoxide|White phosphorus ignites spontaneously in air.
PCl3|l|-319.7|217.1|Phosphorus trichloride|
PCl5|g|-374.9|364.6|Phosphorus pentachloride|
H3PO4|s|-1284.4|110.5|Phosphoric acid|
CCl4|l|-128.2|214.4|Carbon tetrachloride|
CHCl3|l|-134.1|201.7|Chloroform|
CF4|g|-933.6|261.6|Carbon tetrafluoride|
COCl2|g|-219.1|283.5|Phosgene|Extremely toxic.
ClF3|g|-163.2|281.6|Chlorine trifluoride|Among the most aggressive oxidisers known.
OF2|g|24.5|247.5|Oxygen difluoride|
ClO2|g|102.5|256.8|Chlorine dioxide|Endothermic and explosive in concentrated form.
ICl|g|17.8|247.6|Iodine monochloride|
BrCl|g|14.6|240.1|Bromine monochloride|
IBr|g|40.8|258.8|Iodine monobromide|
XeF2|s|-164.0||Xenon difluoride|Xe + F₂ react under UV light or heat. One of the few stable noble-gas compounds.
XeF4|s|-261.5||Xenon tetrafluoride|Made from Xe + 2F₂ at about 400 °C.
XeO3|s|402||Xenon trioxide|Strongly endothermic and dangerously explosive. Made by hydrolysis of XeF₆, never from the elements.
LiH|s|-90.5|20.0|Lithium hydride|
LiF|s|-616.0|35.7|Lithium fluoride|
LiCl|s|-408.6|59.3|Lithium chloride|
Li2O|s|-597.9|37.6|Lithium oxide|Lithium burns with a crimson flame.
Li3N|s|-164.6|62.6|Lithium nitride|Lithium is the only alkali metal that reacts directly with N₂ at room temperature.
LiOH|s|-487.5|42.8|Lithium hydroxide|
Li2CO3|s|-1216.0|90.4|Lithium carbonate|
NaH|s|-56.3|40.0|Sodium hydride|
NaF|s|-576.6|51.1|Sodium fluoride|
NaCl|s|-411.15|72.13|Sodium chloride|Table salt. Molten sodium burns in chlorine with a bright yellow flame.
NaBr|s|-361.1|86.8|Sodium bromide|
NaI|s|-287.8|98.5|Sodium iodide|
Na2O|s|-414.2|75.1|Sodium oxide|
Na2O2|s|-510.9|95.0|Sodium peroxide|The main product when sodium burns in excess oxygen.
NaOH|s|-425.8|64.4|Sodium hydroxide|Lye / caustic soda.
Na2S|s|-364.8|83.7|Sodium sulfide|
Na2CO3|s|-1130.7|135.0|Sodium carbonate|Washing soda.
NaHCO3|s|-950.8|101.7|Sodium bicarbonate|Baking soda.
NaNO3|s|-467.9|116.5|Sodium nitrate|
Na2SO4|s|-1387.1|149.6|Sodium sulfate|
KF|s|-567.3|66.6|Potassium fluoride|
KCl|s|-436.5|82.6|Potassium chloride|
KBr|s|-393.8|95.9|Potassium bromide|
KI|s|-327.9|106.3|Potassium iodide|
KO2|s|-284.9|116.7|Potassium superoxide|Potassium burning in oxygen gives the superoxide. Used in rebreathers.
KOH|s|-424.6|78.9|Potassium hydroxide|
KNO3|s|-494.6|133.1|Potassium nitrate|Saltpetre, an ingredient of gunpowder.
K2CO3|s|-1151.0|155.5|Potassium carbonate|Potash.
KClO3|s|-397.7|143.1|Potassium chlorate|
RbCl|s|-435.4|95.9|Rubidium chloride|
CsF|s|-553.5|92.8|Caesium fluoride|
CsCl|s|-443.0|101.2|Caesium chloride|
BeO|s|-609.4|13.8|Beryllium oxide|
MgO|s|-601.6|26.95|Magnesium oxide|Magnesium burns with a blinding white light.
MgF2|s|-1124.2|57.2|Magnesium fluoride|
MgCl2|s|-641.3|89.6|Magnesium chloride|
MgS|s|-346.0|50.3|Magnesium sulfide|
Mg3N2|s|-461.1|87.9|Magnesium nitride|Forms alongside MgO when Mg burns in air.
Mg(OH)2|s|-924.5|63.2|Magnesium hydroxide|Milk of magnesia.
MgCO3|s|-1095.8|65.7|Magnesium carbonate|
CaH2|s|-181.5|41.4|Calcium hydride|
CaO|s|-634.9|38.1|Calcium oxide|Quicklime.
CaF2|s|-1228.0|68.5|Calcium fluoride|The mineral fluorite.
CaCl2|s|-795.4|108.4|Calcium chloride|
CaS|s|-482.4|56.5|Calcium sulfide|
CaC2|s|-59.8|70.0|Calcium carbide|Reacts with water to give acetylene.
Ca(OH)2|s|-985.2|83.4|Calcium hydroxide|Slaked lime.
CaCO3|s|-1207.6|91.7|Calcium carbonate (calcite)|Limestone, chalk, marble.
CaSO4|s|-1434.5|106.5|Calcium sulfate|Anhydrite (gypsum is the dihydrate).
SrO|s|-592.0|55.5|Strontium oxide|
SrCl2|s|-828.9|114.9|Strontium chloride|Gives the red colour in fireworks.
BaO|s|-548.0|72.1|Barium oxide|
BaF2|s|-1207.1|96.4|Barium fluoride|
BaCl2|s|-855.0|123.7|Barium chloride|
BaCO3|s|-1213.0|112.1|Barium carbonate|
BaSO4|s|-1473.2|132.2|Barium sulfate|Insoluble. Used as a radiocontrast agent.
B2O3|s|-1273.5|53.97|Boron trioxide|
BF3|g|-1136.0|254.4|Boron trifluoride|
BCl3|l|-427.2|206.3|Boron trichloride|
BN|s|-254.4|14.8|Boron nitride|Hexagonal BN ("white graphite").
B2H6|g|36.4|232.1|Diborane|
Al2O3|s|-1675.7|50.92|Aluminium oxide (corundum)|Al powder burns very hot. A protective oxide film normally stops bulk Al from reacting.
AlF3|s|-1510.4|66.5|Aluminium fluoride|
AlCl3|s|-704.2|109.3|Aluminium chloride|
AlN|s|-318.0|20.2|Aluminium nitride|
Al2S3|s|-724.0|116.9|Aluminium sulfide|
SiO2|s|-910.7|41.46|Silicon dioxide (quartz)|Sand and quartz.
SiC|s|-65.3|16.6|Silicon carbide|Carborundum, an abrasive.
SiCl4|l|-687.0|239.7|Silicon tetrachloride|
SiF4|g|-1615.0|282.8|Silicon tetrafluoride|
SiH4|g|34.3|204.6|Silane|Ignites spontaneously in air.
Si3N4|s|-744.8|113.0|Silicon nitride|
GeO2|s|-580.0|39.7|Germanium dioxide|
Ga2O3|s|-1089.1|85.0|Gallium oxide|
In2O3|s|-925.8|104.2|Indium oxide|
SnO|s|-280.7|57.2|Tin(II) oxide|
SnO2|s|-577.6|49.04|Tin(IV) oxide|Cassiterite, the main tin ore.
SnCl4|l|-511.3|258.6|Tin(IV) chloride|
PbO|s|-219.0|66.5|Lead(II) oxide|Litharge.
PbO2|s|-277.4|68.6|Lead(IV) oxide|
PbS|s|-100.4|91.2|Lead(II) sulfide|Galena.
PbCl2|s|-359.4|136.0|Lead(II) chloride|
PbI2|s|-175.5|174.9|Lead(II) iodide|Bright yellow ("golden rain").
As2O3|s|-657.4|107.4|Arsenic trioxide|
Sb2O3|s|-708.8|123.0|Antimony trioxide|
Bi2O3|s|-573.9|151.5|Bismuth trioxide|
TiO2|s|-944.0|50.6|Titanium dioxide (rutile)|White pigment.
TiCl4|l|-804.2|252.3|Titanium tetrachloride|
TiN|s|-337.9|30.3|Titanium nitride|Gold-coloured hard coating.
TiC|s|-184.1|24.2|Titanium carbide|
V2O5|s|-1550.6|131.0|Vanadium pentoxide|Catalyst in the contact process.
Cr2O3|s|-1139.7|81.2|Chromium(III) oxide|Green pigment.
MnO|s|-385.2|59.7|Manganese(II) oxide|
MnO2|s|-520.0|53.1|Manganese dioxide|
MnCl2|s|-481.3|118.2|Manganese(II) chloride|
FeO|s|-272.0|60.75|Iron(II) oxide|
Fe2O3|s|-824.2|87.4|Iron(III) oxide|Rust and haematite. Iron rusts slowly in moist air.
Fe3O4|s|-1118.4|146.4|Iron(II,III) oxide|Magnetite. Forms when steel wool burns.
FeS|s|-100.0|60.3|Iron(II) sulfide|Iron filings + sulfur glow red-hot once heated.
FeS2|s|-178.2|52.9|Iron disulfide (pyrite)|"Fool's gold".
FeCl2|s|-341.8|118.0|Iron(II) chloride|
FeCl3|s|-399.5|142.3|Iron(III) chloride|Hot iron burns in chlorine to give FeCl₃.
CoO|s|-237.9|53.0|Cobalt(II) oxide|
CoCl2|s|-312.5|109.2|Cobalt(II) chloride|Blue when dry, pink when hydrated.
NiO|s|-239.7|38.0|Nickel(II) oxide|
NiCl2|s|-305.3|97.7|Nickel(II) chloride|
CuO|s|-157.3|42.6|Copper(II) oxide|Black coating on heated copper.
Cu2O|s|-168.6|93.1|Copper(I) oxide|Red.
CuS|s|-53.1|66.5|Copper(II) sulfide|
Cu2S|s|-79.5|120.9|Copper(I) sulfide|
CuCl|s|-137.2|86.2|Copper(I) chloride|
CuCl2|s|-220.1|108.1|Copper(II) chloride|
CuSO4|s|-771.4|109.2|Copper(II) sulfate (anhydrous)|White. Turns blue with water.
ZnO|s|-350.5|43.65|Zinc oxide|
ZnS|s|-206.0|57.7|Zinc sulfide (sphalerite)|Zn + S powder reacts violently once ignited.
ZnCl2|s|-415.1|111.5|Zinc chloride|
ZnSO4|s|-982.8|110.5|Zinc sulfate|
ZrO2|s|-1100.6|50.4|Zirconium dioxide|
MoO3|s|-745.1|77.7|Molybdenum trioxide|
WO3|s|-842.9|75.9|Tungsten trioxide|
Ag2O|s|-31.1|121.3|Silver oxide|Only weakly stable. Decomposes above about 200 °C.
AgCl|s|-127.0|96.3|Silver chloride|Light-sensitive (photography).
AgBr|s|-100.4|107.1|Silver bromide|
AgI|s|-61.8|115.5|Silver iodide|Used for cloud seeding.
Ag2S|s|-32.6|144.0|Silver sulfide|The tarnish on silver.
AgNO3|s|-124.4|140.9|Silver nitrate|
AuCl3|s|-117.6|148.1|Gold(III) chloride|Gold barely reacts. Even this needs hot chlorine or aqua regia.
HgO|s|-90.8|70.3|Mercury(II) oxide|Red. Decomposes on heating, which is how Priestley discovered O₂.
HgS|s|-58.2|82.4|Mercury(II) sulfide|Cinnabar / vermilion.
HgCl2|s|-224.3|146.0|Mercury(II) chloride|
Hg2Cl2|s|-265.4|191.6|Mercury(I) chloride|Calomel.
CeO2|s|-1088.7|62.3|Cerium(IV) oxide|
UO2|s|-1085.0|77.0|Uranium dioxide|Nuclear fuel.
UF6|s|-2197.0|227.6|Uranium hexafluoride|Sublimes at 56 °C. Used for isotope enrichment (²³⁵U/²³⁸U).
D2O|l|-294.60|75.94|Heavy water (D₂O)|Deuterium oxide. Used as a neutron moderator.
`;

  /*
   * Non-compound species: free atoms, allotropes and isotopic forms.
   * Used for "same element" combinations and isotope-specific reactions.
   */
  const SPECIES_RAW = `
H|g|218.00|114.72|Atomic hydrogen
N|g|472.68|153.30|Atomic nitrogen
O|g|249.18|161.06|Atomic oxygen
F|g|79.38|158.75|Atomic fluorine
Cl|g|121.30|165.19|Atomic chlorine
Br|g|111.87|175.02|Atomic bromine
I|g|106.76|180.79|Atomic iodine
C|g|716.68|158.10|Atomic carbon
O3|g|142.7|238.9|Ozone
C(diamond)|s|1.895|2.377|Diamond
P(red)|s|-17.6|22.8|Red phosphorus
Sn(grey)|s|-2.09|44.14|Grey tin (α-tin)
D2|g|0|144.96|Deuterium gas
`;

  function parseTable(raw, withNote) {
    return raw.trim().split('\n').map((line) => {
      const [formula, phase, dH, S, name, note] = line.split('|');
      return {
        formula,
        phase,
        dHf: Number(dH),
        S: S === '' ? null : Number(S),
        name,
        note: withNote ? note || '' : '',
      };
    });
  }

  const COMPOUNDS = parseTable(COMPOUNDS_RAW, true);
  const SPECIES = {};
  parseTable(SPECIES_RAW, false).forEach((s) => { SPECIES[s.formula] = s; });

  const api = { COMPOUNDS, SPECIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
