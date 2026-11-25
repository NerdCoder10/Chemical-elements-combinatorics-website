/*
 * What compounds (and a few elements that appear as reaction products) are used for.
 *
 *   formula | real-world uses | safety note (optional)
 *
 * Short summaries of well-established uses, written for a general reader. They are not
 * handling advice; check a safety data sheet before working with any of these substances.
 */
(function (root) {
  const RAW = `
H2O|Essential to all known life; drinking, farming and cleaning. The most widely used industrial solvent and coolant, and the working fluid in steam turbines that generate most of the world's electricity.|
H2O2|Bleaching paper pulp and textiles, disinfecting wounds and surfaces (3% solution), hair bleach, wastewater treatment, and rocket propellant at high concentration.|Concentrated solutions burn skin and can explode with organic material.
CO|Fuel in synthesis gas and steel-making blast furnaces, where it reduces iron ore to iron. Feedstock for making methanol, acetic acid and plastics.|Highly toxic: binds to haemoglobin and blocks oxygen transport. Colourless and odourless.
CO2|Carbonated drinks, dry ice, fire extinguishers, greenhouse enrichment, decaffeinating coffee (supercritical CO₂), welding shield gas and making urea fertiliser. Plants turn it into sugar by photosynthesis.|The main greenhouse gas from burning fossil fuels.
CH4|Natural gas: heating, cooking and electricity generation. Main source of hydrogen (steam reforming) and of ammonia-based fertiliser.|Flammable; a potent greenhouse gas.
C2H6|Cracked into ethylene for plastics. Component of natural gas and refrigerant in cryogenic systems.|Flammable.
C2H4|The most produced organic chemical: made into polyethylene, PVC, antifreeze (ethylene glycol) and polystyrene. Also a plant hormone used to ripen bananas and tomatoes.|Flammable.
C2H2|Oxy-acetylene torches for welding and cutting metal (flame about 3,300 °C). Starting material for some plastics.|Unstable under pressure; stored dissolved in acetone.
C3H8|Propane (LPG): barbecues, camping stoves, home heating, forklift fuel and aerosol propellant.|Flammable; heavier than air, so leaks collect low down.
C6H6|Starting material for styrene (polystyrene), nylon, resins, dyes and detergents.|Carcinogen; use is tightly restricted.
CH3OH|Methanol: making formaldehyde and plastics, windscreen washer fluid, antifreeze, fuel (racing, fuel cells) and biodiesel production.|Toxic: drinking it can cause blindness or death.
C2H5OH|Ethanol: alcoholic drinks, fuel (E10 petrol), hand sanitiser, disinfectant, and a solvent for perfumes, medicines and inks.|Flammable.
HCOOH|Formic acid: preserving livestock feed, tanning leather, dyeing textiles. Ants and nettles use it as a defence.|Corrosive.
CH3COOH|Acetic acid: vinegar (about 5% in water), making PET bottles, vinyl acetate for paints and glues, and aspirin.|Concentrated acid is corrosive.
C6H12O6|Glucose: the main energy source of living cells. Used in sports drinks, intravenous drips, food sweetening and brewing.|
HCN|Hydrogen cyanide: making nylon, acrylic plastics and methionine (animal feed); gold mining as cyanide.|Extremely toxic.
NH3|Ammonia: about 80% goes into fertilisers that feed roughly half the world's population. Also refrigerant, cleaning products and making nitric acid, nylon and explosives.|Toxic and corrosive gas with a sharp smell.
N2H4|Hydrazine: rocket and satellite thruster fuel, removing oxygen from power-plant boiler water, and making pesticides and blowing agents.|Toxic and carcinogenic.
NO|Nitric oxide: an intermediate in making nitric acid. In the body it is a signalling molecule that widens blood vessels; inhaled NO treats lung problems in newborns.|Toxic air pollutant from engines.
NO2|Intermediate in making nitric acid and fertilisers. Mostly known as the brown pollutant from car exhausts that causes smog and acid rain.|Toxic.
N2O|Nitrous oxide ("laughing gas"): anaesthetic in dentistry and surgery, whipped-cream propellant, and oxidiser in racing engines and hybrid rockets.|A strong greenhouse gas; harmful when misused.
N2O4|Rocket propellant oxidiser (Apollo, satellites, Titan rockets) paired with hydrazine fuels.|Toxic and corrosive.
HNO3|Nitric acid: making ammonium nitrate fertiliser, explosives (TNT, nitroglycerin), nylon and polyurethanes; etching metals.|Strongly corrosive oxidiser.
NH4Cl|Ammonium chloride: soldering flux, dry-cell batteries, cough medicine, fertiliser, and the Nordic salty liquorice "salmiakki".|
NH4NO3|Ammonium nitrate: one of the most used nitrogen fertilisers, cold packs (dissolving it absorbs heat), and mining explosives (ANFO).|Can detonate in large stockpiles, as in Beirut in 2020.
NOCl|Nitrosyl chloride: making nylon-6 precursors with light, and a component of aqua regia's gold-dissolving power.|Toxic and corrosive.
HF|Hydrogen fluoride: making fluoropolymers (PTFE/Teflon), refrigerants, uranium hexafluoride and aluminium; etching glass and silicon chips.|Extremely dangerous: penetrates skin and attacks bone calcium.
HCl|Hydrochloric acid: cleaning (pickling) steel, making PVC, processing food, regulating pH, and household descalers. Your stomach makes it to digest food.|Corrosive.
HBr|Making bromine compounds for flame retardants, medicines and pesticides; a catalyst in industry.|Corrosive.
HI|Making iodine compounds and pharmaceuticals; a strong acid and reducing agent in labs.|Corrosive.
H2S|Recovered from natural gas to make sulfur and sulfuric acid; used in analytical chemistry. Gives rotten eggs their smell.|Very toxic; deadens the sense of smell at dangerous levels.
SO2|Preserving wine and dried fruit (E220), bleaching paper, and an intermediate in making sulfuric acid.|Toxic; causes acid rain.
SO3|Intermediate in making sulfuric acid (contact process) and sulfonated detergents.|Reacts violently with water.
H2SO4|Sulfuric acid: the most produced industrial chemical. Phosphate fertilisers, car (lead-acid) batteries, refining, metal processing, detergents and drain cleaners.|Strongly corrosive; dehydrates skin.
CS2|Making viscose rayon and cellophane, rubber vulcanisation chemicals and pesticides.|Very flammable and toxic.
SF6|Electrical insulator in high-voltage switchgear and transformers; used in magnesium casting and medical ultrasound contrast.|The most potent greenhouse gas known (about 23,000× CO₂).
H2Se|Doping semiconductors and making selenium compounds.|Highly toxic.
SeO2|Oxidising agent in organic synthesis; colouring glass.|Toxic.
PH3|Fumigating stored grain against insects; doping silicon in the semiconductor industry.|Very toxic.
P4O10|Drying agent (it grabs water strongly) and the precursor of phosphoric acid.|Reacts violently with water.
PCl3|Making glyphosate and other pesticides, flame retardants, and plasticisers.|Corrosive; reacts with water.
PCl5|Chlorinating agent in chemical synthesis; making lithium-battery electrolyte (LiPF6).|Corrosive.
H3PO4|Phosphoric acid: fertilisers, the tangy taste in cola, rust removers, dental etching and food additive (E338).|Concentrated acid is corrosive.
CCl4|Formerly dry cleaning, fire extinguishers and refrigerant production; now mostly banned because it destroys the ozone layer.|Toxic to the liver; ozone-depleting.
CHCl3|Chloroform: solvent in labs and pharmaceuticals, making refrigerant HCFC-22. Historically an anaesthetic.|Toxic.
CF4|Plasma etching in microchip manufacturing; low-temperature refrigerant.|Very long-lived greenhouse gas.
COCl2|Phosgene: making polycarbonate plastics and polyurethane foams.|Extremely toxic; was a chemical weapon in World War I.
ClF3|Cleaning semiconductor manufacturing chambers; nuclear fuel processing. Studied as a rocket oxidiser.|Ignites almost anything it touches, including glass and concrete.
OF2|Studied as a rocket oxidiser; used in some fluorination reactions.|Very toxic.
ClO2|Bleaching wood pulp for paper and disinfecting drinking water.|Toxic; explosive when concentrated.
ICl|Determining the iodine value of fats and oils; a reagent in organic chemistry.|Corrosive.
BrCl|Disinfecting cooling water and wastewater.|Toxic.
IBr|Reagent in organic synthesis.|Corrosive.
XeF2|Etching silicon in microelectromechanical (MEMS) devices; fluorinating agent in chemistry.|Toxic and corrosive.
XeF4|Detecting and analysing trace metals in silicone rubber; research chemistry.|Reacts with water.
XeO3|Laboratory oxidising agent only.|Dangerously explosive when dry.
LiH|Hydrogen storage, nuclear reactor shielding, and making lithium aluminium hydride.|Reacts with water to release hydrogen.
LiF|Optics for ultraviolet light, radiation dosimeters, and molten-salt nuclear reactor coolant.|
LiCl|Dehumidifying air in air-conditioning, making lithium metal by electrolysis, and a flame colorant (crimson).|
Li2O|Ceramic glazes and glass; flux in welding.|
Li3N|Research on solid electrolytes and hydrogen storage.|Reacts with water.
LiOH|Lithium-ion battery cathodes, removing CO₂ from air in spacecraft and submarines, and lithium greases.|Corrosive.
Li2CO3|Lithium-ion batteries, ceramics and glass, and a mood-stabilising medicine for bipolar disorder.|
NaH|Strong base for organic synthesis; descaling metals.|Reacts violently with water.
NaF|Fluoride toothpaste and water fluoridation to prevent tooth decay.|Toxic in large doses.
NaCl|Table salt: seasoning and preserving food, de-icing roads, water softeners, saline drips, and making chlorine and sodium hydroxide.|
NaBr|Sedative in the past; now oil-well drilling fluids, water treatment and photography.|
NaI|Iodised salt to prevent goitre, and radiation detectors (sodium iodide crystals).|
Na2O|Component of glass and ceramics (from soda ash).|Corrosive.
Na2O2|Bleaching paper and textiles; regenerating oxygen in submarines and space.|Strong oxidiser.
NaOH|Caustic soda: making soap, paper, aluminium (Bayer process) and textiles; drain cleaner; curing olives and pretzels.|Strongly corrosive.
Na2S|Removing hair from hides in leather tanning; paper pulping (kraft process); ore flotation.|Releases toxic H₂S with acids.
Na2CO3|Washing soda: glass making (the largest use), detergents, water softening and pool pH control.|
NaHCO3|Baking soda: raising agent in baking, antacid, fire extinguishers, cleaning and deodorising.|
NaNO3|Fertiliser ("Chile saltpetre"), food preservative, fireworks and glass making.|
Na2SO4|Powdered detergents, paper making (kraft process) and glass.|
KF|Etching glass and making organofluorine compounds.|Toxic.
KCl|Potash fertiliser (its main use), salt substitute, and medical potassium supplements.|
KBr|Veterinary anti-seizure medicine for dogs; infrared spectroscopy windows; formerly photography.|
KI|Iodised salt, and tablets that protect the thyroid after a nuclear accident.|
KO2|Breathing apparatus in mines, submarines and spacecraft: it absorbs CO₂ and releases O₂.|Strong oxidiser.
KOH|Making soft (liquid) soaps, alkaline batteries, biodiesel and fertilisers.|Strongly corrosive.
KNO3|Saltpetre: gunpowder, fireworks, fertiliser, curing meat and toothpaste for sensitive teeth.|Oxidiser.
K2CO3|Potash: making glass (TV screens, optics), soap, and Asian noodles and gingerbread.|
KClO3|Matches, fireworks and oxygen generators.|Explosive mixed with fuels.
RbCl|Medical research and as a biomarker; gene transfer in labs.|
CsF|Reagent in organic synthesis.|Toxic.
CsCl|Density-gradient centrifugation to separate DNA (used in the Meselson–Stahl experiment).|
BeO|Ceramics that conduct heat but not electricity: electronics heat sinks, lasers and nuclear reactors.|Dust is very toxic (berylliosis).
MgO|Lining furnaces (refractory bricks), antacid and laxative, animal feed, and fire-resistant boards.|
MgF2|Anti-reflective coatings on lenses and optics.|
MgCl2|De-icing roads, dust control, making magnesium metal, and tofu coagulant (nigari).|
MgS|Research material; forms in steel desulfurisation.|
Mg3N2|Catalyst for making boron nitride; research.|Reacts with water to give ammonia.
Mg(OH)2|Milk of magnesia (antacid and laxative), flame retardant in plastics, and wastewater neutraliser.|
MgCO3|Climbing and gymnastics chalk, antacid, and anti-caking agent in salt.|
CaH2|Drying solvents in labs; portable hydrogen source.|Reacts with water to release hydrogen.
CaO|Quicklime: making steel, cement and mortar, treating water, and self-heating food cans.|Reacts hotly with water; caustic.
CaF2|Fluorite: source of fluorine, flux in steel making, and lenses for UV and infrared optics.|
CaCl2|De-icing roads, keeping dust down, drying agent, firming canned vegetables, and cheese making.|
CaS|Luminous paints that glow in the dark.|
CaC2|Making acetylene for welding and old carbide lamps; ripening fruit; steel desulfurisation.|Gives flammable acetylene with water.
Ca(OH)2|Slaked lime: mortar and plaster, whitewash, water treatment, soil improvement and nixtamalising corn for tortillas.|Caustic.
CaCO3|Limestone, chalk and marble: building stone, cement and lime, toothpaste, antacids, paper filler and calcium supplements.|
CaSO4|Gypsum and plaster of Paris: drywall, casts for broken bones, cement additive and tofu coagulant.|
SrO|Making glass for old CRT TV screens that blocked X-rays; ceramics.|Caustic.
SrCl2|Red fireworks and flares; toothpaste for sensitive teeth.|
BaO|Coating cathodes in vacuum tubes; making other barium compounds.|Toxic.
BaF2|Infrared and ultraviolet optics; scintillation detectors.|Toxic.
BaCl2|Testing for sulfate in labs; heat-treatment salt baths for steel.|Toxic.
BaCO3|Rat poison (historically), ceramic glazes and making special glass.|Toxic.
BaSO4|"Barium meal" X-ray contrast for the gut (insoluble, so non-toxic), white paint pigment and oil-well drilling mud.|
B2O3|Borosilicate glass (Pyrex), fibreglass insulation and enamels.|
BF3|Catalyst for plastics and petrochemical reactions; neutron detectors.|Toxic and corrosive.
BCl3|Refining aluminium and making boron fibres; semiconductor etching.|Corrosive.
BN|"White graphite": high-temperature lubricant, cosmetics, crucibles, and cubic BN cutting tools nearly as hard as diamond.|
B2H6|Doping silicon in semiconductors; rocket fuel research.|Toxic; ignites in moist air.
Al2O3|Alumina: making aluminium metal, abrasives (corundum, emery), sapphire and ruby gemstones, spark-plug insulators and smartphone camera covers.|
AlF3|Added to the molten bath in aluminium smelting to lower its melting point.|
AlCl3|Catalyst for making plastics and petrochemicals (Friedel-Crafts reactions); antiperspirants (as hydrated chlorides).|Reacts violently with water.
AlN|Heat-spreading ceramic substrates for electronics and LEDs.|
Al2S3|Research; source of hydrogen sulfide in labs.|Gives toxic H₂S with water.
SiO2|Sand and quartz: glass, concrete, silicon chips, optical fibres, quartz watch crystals and silica gel desiccant.|Breathing fine crystalline dust causes silicosis.
SiC|Carborundum: abrasives and sandpaper, car brake discs, bulletproof armour, and power electronics in electric vehicles.|
SiCl4|Making ultra-pure silicon and the glass of optical fibres; smoke screens.|Reacts with water.
SiF4|Etching in microchip manufacturing; by-product of phosphate fertiliser production.|Toxic.
SiH4|Depositing silicon layers in solar cells and microchips.|Ignites spontaneously in air.
Si3N4|Bearings, turbocharger rotors, cutting tools and engine parts that withstand heat.|
GeO2|Glass for optical fibres and wide-angle camera lenses; catalyst for PET plastic.|
Ga2O3|Next-generation power electronics; phosphors.|
In2O3|Transparent conductive films in touchscreens and LCDs (as indium tin oxide).|
SnO|Making other tin compounds; glass and ceramics.|
SnO2|Cassiterite (tin ore); gas sensors, conductive glass coatings and opaque white glazes.|
SnCl4|Coating glass bottles to make them stronger; catalyst.|Corrosive.
PbO|Lead-acid batteries, lead glass (crystal) and ceramic glazes.|Toxic (lead).
PbO2|Positive plates of car (lead-acid) batteries; matches.|Toxic (lead).
PbS|Galena, the main lead ore; infrared detectors.|Toxic (lead).
PbCl2|Making ornamental glass and pigments; research.|Toxic (lead).
PbI2|Solar cell research (perovskites); formerly a yellow pigment.|Toxic (lead).
As2O3|Leukaemia medicine (acute promyelocytic leukaemia); historically wood preservative and poison.|Highly toxic.
Sb2O3|Flame retardant in plastics and textiles; catalyst for PET bottles.|Toxic.
Bi2O3|Fire-safe "dragon's eggs" fireworks crackle; X-ray-opaque medical materials; varistors.|
TiO2|The brightest white pigment: paints, paper, toothpaste, sunscreen (UV blocker) and self-cleaning glass.|Dust may be harmful to breathe.
TiCl4|Making titanium metal and titanium dioxide pigment; skywriting smoke.|Reacts with moist air to give HCl fumes.
TiN|Gold-coloured hard coating on drill bits, cutting tools and jewellery.|
TiC|Cutting tools and wear-resistant coatings (cermets).|
V2O5|Catalyst in making sulfuric acid; vanadium flow batteries; steel making.|Toxic.
Cr2O3|Green pigment (paints, banknotes), polishing compound (green rouge) and refractory bricks.|
MnO|Fertiliser and animal feed additive; ceramics.|
MnO2|Alkaline and zinc-carbon batteries; making steel; decolourising glass.|
MnCl2|Making dry-cell batteries; MRI contrast research; animal feed.|
FeO|Component of iron ores and slags; pigments.|
Fe2O3|Haematite iron ore (smelted into steel), red pigment (ochre), polishing compound (jeweller's rouge), and thermite.|
Fe3O4|Magnetite: iron ore, magnetic recording media, MRI contrast nanoparticles, and black pigment.|
FeS|Making hydrogen sulfide in labs; occurs in meteorites.|
FeS2|Pyrite ("fool's gold"): source of sulfur for sulfuric acid; striking sparks in early firearms.|
FeCl2|Treating wastewater; reducing agent.|Corrosive.
FeCl3|Purifying drinking water and sewage; etching copper on printed circuit boards.|Corrosive.
CoO|Blue colour in glass and ceramics (cobalt blue); battery cathode materials.|Toxic.
CoCl2|Humidity indicator cards and silica gel (blue when dry, pink when damp).|Toxic; suspected carcinogen.
NiO|Making nickel alloys, ceramics and nickel-based battery electrodes.|Carcinogenic dust.
NiCl2|Nickel electroplating; catalyst.|Toxic.
CuO|Ceramic glazes and pigments, a catalyst, and wood preservatives.|
Cu2O|Red pigment and antifouling paint for ship hulls; fungicide.|
CuS|Occurs as the mineral covellite; research on solar cells and catalysts.|
Cu2S|Chalcocite, an important copper ore.|
CuCl|Catalyst in organic chemistry; making fungicides.|
CuCl2|Catalyst, wood preservative, and blue-green colour in fireworks.|Toxic.
CuSO4|Fungicide (Bordeaux mixture) for grapes, killing algae in ponds, electroplating, and school chemistry crystals (blue when hydrated).|Toxic if swallowed.
ZnO|Sunscreen and nappy-rash cream, rubber vulcanisation, white paint, and food supplement.|
ZnS|Glow-in-the-dark paint, phosphors in old TV screens, and infrared windows.|
ZnCl2|Soldering flux, wood preservative, and dry-cell batteries.|Corrosive.
ZnSO4|Zinc supplement and oral rehydration treatment; fertiliser; rayon production.|
ZrO2|Cubic zirconia (diamond simulant), dental crowns, ceramic knives and oxygen sensors in cars.|
MoO3|Making molybdenum metal and catalysts; steel additive.|
WO3|Smart windows that tint electrically (electrochromic glass); making tungsten metal.|
Ag2O|Silver-oxide button batteries for watches and hearing aids.|
AgCl|Reference electrodes, photochromic glasses that darken in sunlight, and antibacterial coatings.|
AgBr|Light-sensitive layer of photographic film.|
AgI|Cloud seeding to make rain or snow.|
Ag2S|The black tarnish on silver; semiconductor research.|
AgNO3|Cauterising warts and wounds (silver nitrate sticks), making mirrors, and photographic chemicals.|Stains skin black; corrosive.
AuCl3|Making gold nanoparticles; catalyst in organic chemistry.|
HgO|Formerly mercury batteries; source of mercury.|Toxic.
HgS|Cinnabar, the main mercury ore; vermilion red pigment.|Toxic.
HgCl2|Formerly a disinfectant and wood preservative; catalyst for making PVC.|Highly toxic.
Hg2Cl2|Calomel reference electrodes; formerly a medicine.|Toxic.
CeO2|Polishing glass and lenses, catalytic converters, and self-cleaning oven coatings.|
UO2|Fuel pellets in nuclear power reactors.|Radioactive and toxic.
UF6|Enriching uranium in gas centrifuges (it turns into a gas at 56 °C).|Radioactive; gives toxic HF with moisture.
D2O|Heavy water: neutron moderator in CANDU nuclear reactors, and tracing molecules in research and NMR spectroscopy.|
Fe|Iron and steel: buildings, bridges, cars, tools, ships and machinery. The most used metal by far.|
Al|Aluminium: drinks cans, foil, aircraft, car bodies, window frames and power lines.|
Cu|Copper: electrical wiring, motors, plumbing pipes and coins.|
H2|Hydrogen: making ammonia and methanol, refining oil, fuel cells and rocket fuel.|Flammable; explosive mixed with air.
O2|Oxygen: medical oxygen, steel making, welding torches, rocket oxidiser and water treatment.|Feeds fires strongly.
O3|Ozone: disinfecting drinking water and pools, bleaching, and removing odours. High in the atmosphere it shields life from UV light.|Irritating and harmful to breathe at ground level.
N2|Nitrogen: food packaging (keeps crisps fresh), liquid nitrogen for freezing, tyre filling and inert atmospheres.|Can suffocate in enclosed spaces.
Cl2|Chlorine: disinfecting drinking water and pools, making PVC, bleach and medicines.|Toxic gas.
C(diamond)|Diamond: jewellery, and cutting, drilling and polishing tools.|
P(red)|Red phosphorus: the striking surface of safety-match boxes; flame retardants.|
Sn(grey)|Grey tin has no practical use: it is the brittle form ("tin pest") that tin objects crumble into in the cold.|
`;
  const USES = {};
  RAW.trim().split('\n').forEach((line) => {
    const [formula, uses, safety] = line.split('|');
    USES[formula] = { uses, safety: safety || '' };
  });

  /** Uses for a formula; tries the formula as written and with any allotrope label removed. */
  function usesOf(formula) {
    return USES[formula] || null;
  }

  const api = { USES, usesOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
