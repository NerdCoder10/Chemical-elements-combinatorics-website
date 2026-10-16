#!/usr/bin/env python3
"""Generate js/isotopes.js from the NUBASE2020 evaluation.

Source: data/nubase_4.mas20.txt, downloaded from
  https://www-nds.iaea.org/amdc/ame2020/nubase_4.mas20.txt
  (sha256 1585a5eea86c5e17e90307c7e6e786d060049c4039e392a261ff6db977df9859)
Citation: F.G. Kondev, M. Wang, W.J. Huang, S. Naimi, G. Audi,
  "The NUBASE2020 evaluation of nuclear physics properties", Chin. Phys. C 45, 030001 (2021).

Every nuclide that has actually been observed (it has a discovery year) is included:
all ground states, plus the isomers listed in NOTABLE. Run:  python3 scripts/build_isotopes.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'nubase_4.mas20.txt')
OUT = os.path.join(ROOT, 'js', 'isotopes.js')

U_KEV = 931494.10242  # 1 u in keV (CODATA 2018), as used by AME2020
YEAR_S = 365.2422 * 86400  # NUBASE's year
UNITS = {
    'ys': 1e-24, 'zs': 1e-21, 'as': 1e-18, 'fs': 1e-15, 'ps': 1e-12, 'ns': 1e-9, 'us': 1e-6,
    'ms': 1e-3, 's': 1, 'm': 60, 'h': 3600, 'd': 86400, 'y': YEAR_S, 'ky': 1e3 * YEAR_S,
    'My': 1e6 * YEAR_S, 'Gy': 1e9 * YEAR_S, 'Ty': 1e12 * YEAR_S, 'Py': 1e15 * YEAR_S,
    'Ey': 1e18 * YEAR_S, 'Zy': 1e21 * YEAR_S, 'Yy': 1e24 * YEAR_S,
}
UNIT_LABEL = {'us': 'μs', 'm': 'min'}

# Isotopes highlighted by default in the UI (stable isotopes are always notable).
# Isomers use NUBASE's letter (m, n, ... in order of energy) and are shown with the usual "m".
NOTABLE = {
    'H': '3', 'Be': '7 10', 'C': '11 14', 'N': '13', 'O': '15', 'F': '18', 'Na': '22 24', 'Al': '26',
    'Si': '32', 'P': '32 33', 'S': '35', 'Cl': '36', 'Ar': '39', 'K': '40', 'Ca': '41 48', 'Sc': '46',
    'V': '50', 'Cr': '51', 'Mn': '53 54', 'Fe': '55 59 60', 'Co': '57 60', 'Ni': '59 63', 'Cu': '64 67',
    'Zn': '65', 'Ga': '67 68', 'Ge': '68', 'As': '73 74', 'Se': '75 82', 'Br': '82', 'Kr': '81 85',
    'Rb': '82 87', 'Sr': '89 90', 'Y': '88 90', 'Zr': '89 93', 'Nb': '92 94', 'Mo': '99',
    'Tc': '97 98 99 99m', 'Ru': '106', 'Rh': '102', 'Pd': '107', 'Ag': '110n', 'Cd': '109',
    'In': '111 115', 'Sn': '126', 'Sb': '125', 'Te': '128 130', 'I': '123 125 129 131', 'Xe': '133 135',
    'Cs': '134 135 137', 'Ba': '133', 'La': '138', 'Ce': '144', 'Pr': '143', 'Nd': '144',
    'Pm': '145 146 147', 'Sm': '147 153', 'Eu': '152 154', 'Gd': '153', 'Tb': '158 161', 'Ho': '166m',
    'Er': '169', 'Tm': '170 171', 'Yb': '169', 'Lu': '176 177', 'Hf': '182', 'Ta': '180m 182',
    'W': '188', 'Re': '186 187 188', 'Os': '194', 'Ir': '192', 'Pt': '190', 'Au': '195 198',
    'Hg': '194 203', 'Tl': '201 204', 'Pb': '205 210', 'Bi': '208 209 210', 'Po': '208 209 210',
    'At': '209 210 211', 'Rn': '211 220 222', 'Fr': '221 222 223', 'Ra': '223 224 226 228',
    'Ac': '225 227', 'Th': '229 230 232', 'Pa': '231 233', 'U': '233 234 235 236 238',
    'Np': '236 237 239', 'Pu': '238 239 240 241 242 244', 'Am': '241 242m 243',
    'Cm': '242 244 245 247 248', 'Bk': '247 248 249', 'Cf': '249 250 251 252', 'Es': '252 253 254',
    'Fm': '252 253 257', 'Md': '256 258 260', 'No': '255 259', 'Lr': '262 266', 'Rf': '265 267',
    'Db': '268 270', 'Sg': '269 271', 'Bh': '270 274', 'Hs': '269 270', 'Mt': '276 278',
    'Ds': '280 281', 'Rg': '281 282', 'Cn': '283 285', 'Nh': '285 286', 'Fl': '288 289',
    'Mc': '289 290', 'Lv': '292 293', 'Ts': '293 294', 'Og': '294',
}


YEAR_MULT = {'ky': 3, 'My': 6, 'Gy': 9, 'Ty': 12, 'Py': 15, 'Ey': 18, 'Zy': 21, 'Yy': 24}
SUPERSCRIPT = str.maketrans('0123456789-', '⁰¹²³⁴⁵⁶⁷⁸⁹⁻')


def years_text(v, unit):
    """'5.70', 'ky' -> '5,700 y'; '1.248', 'Gy' -> '1.248×10⁹ y' (keeps the significant figures)."""
    prefix = ''.join(c for c in v if c in '<>~')
    digits = v.lstrip('<>~')
    sig = len(digits.replace('.', '').lstrip('0')) or 1
    val = float(digits) * 10 ** YEAR_MULT[unit]
    if val < 1e5:
        text = f'{val:,.{max(0, sig - len(str(int(val))))}f}'
    else:
        mant, exp = f'{val:.{sig - 1}e}'.split('e')
        text = f'{mant}×10{str(int(exp)).translate(SUPERSCRIPT)}'
    return f'{prefix}{text} y'


def col(line, a, b):
    """1-based inclusive column range, as in the NUBASE format header."""
    return line[a - 1:b].strip()


def num(s):
    s = s.replace('#', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def decay_modes(br):
    modes, abundance = [], None
    for tok in br.split(';'):
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith('IS='):
            abundance = num(tok[3:].split()[0])
            continue
        m = re.match(r'^([^=~<>?]+)\s*([=~<>]+)?\s*([\d.eE+-]+#?)?', tok)
        if not m:
            continue
        name = m.group(1).strip()
        name = name.replace('B-', 'β⁻').replace('B+', 'β⁺').replace('A', 'α')
        if m.group(3):
            rel = {'=': '', '~': '≈', '>': '>', '<': '<', '>~': '≳', '<~': '≲'}.get(m.group(2) or '=', m.group(2) or '')
            modes.append(f'{name} {rel}{m.group(3).replace("#", "")}%')
        else:
            modes.append(f'{name} (seen)' if '?' not in tok else f'{name}?')
    return modes, abundance


def main():
    out = {}
    for line in open(SRC, encoding='latin-1'):
        if line.startswith('#'):
            continue
        Z = int(col(line, 5, 7))
        level = line[7]
        if Z == 0:
            continue  # free neutron
        year = col(line, 115, 118)
        if not year:
            continue  # predicted from systematics, never observed
        name = col(line, 12, 16)  # e.g. "56Fe", "99Tcm" uses column 17 for the isomer letter
        m = re.match(r'^(\d+)([A-Za-z]+)$', name)
        A, sym = m.group(1), m.group(2)
        sym = sym[0].upper() + sym[1:].lower()
        iso_letter = col(line, 17, 17)
        label = A + (iso_letter if level != '0' else '')
        if level != '0':
            if label not in NOTABLE.get(sym, '').split():
                continue
            label = A + 'm'

        t = col(line, 70, 78)
        unit = col(line, 79, 80)
        approx = '#' in t
        if t == 'stbl':
            half, secs = None, None
        elif t == 'p-unst':
            half, secs = 'particle-unbound', 0.0
        else:
            v = t.replace('#', '')
            shown = years_text(v, unit) if unit in YEAR_MULT else f'{v} {UNIT_LABEL.get(unit, unit)}'.strip()
            half = ('~' if approx else '') + shown
            secs_v = num(v.lstrip('<>~'))
            secs = secs_v * UNITS[unit] if secs_v is not None and unit in UNITS else None
        me = num(col(line, 19, 31))
        mass = round(int(A) + me / U_KEV, 6) if me is not None else None
        modes, abundance = decay_modes(col(line, 120, 209))
        spin = col(line, 89, 102).replace('*', '')
        out.setdefault(sym, []).append({
            'A': label, 'h': half, 't': secs, 'ab': abundance, 'dm': ', '.join(modes),
            'u': mass, 'j': spin, 'y': int(year),
        })

    for sym, lst in out.items():
        nset = {re.sub(r'[a-z]$', 'm', x) for x in NOTABLE.get(sym, '').split()}
        for i in lst:
            i['n'] = 1 if (i['h'] is None or i['ab'] is not None or i['A'] in nset) else 0
        lst.sort(key=lambda i: (int(re.match(r'\d+', i['A']).group()), i['A']))

    total = sum(1 for lst in out.values() for i in lst if not re.search(r'[a-z]$', i['A']))
    header = f"""/*
 * GENERATED by scripts/build_isotopes.py. Do not edit by hand.
 *
 * Every observed nuclide of every element: {total} ground states plus a few notable long-lived
 * isomers, from the NUBASE2020 evaluation:
 *   F.G. Kondev, M. Wang, W.J. Huang, S. Naimi, G. Audi, Chin. Phys. C 45, 030001 (2021).
 *
 * Per isotope: A (mass number, "m" = isomer), h (half-life text; null = stable; "~" = estimate
 * from systematics), t (half-life in seconds), ab (natural abundance, atom-%), dm (decay modes),
 * u (atomic mass in u), j (spin/parity), y (discovery year), n (1 = shown by default).
 */
"""
    js = header + """(function (root) {
  const RAW = """ + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + """;
  const ISOTOPES = {};
  Object.keys(RAW).forEach((sym) => {
    ISOTOPES[sym] = RAW[sym].map((i) => ({
      A: i.A,
      mass: parseInt(i.A, 10),
      halfLife: i.h,
      seconds: i.t,
      abundance: i.ab,
      decay: i.dm,
      atomicMass: i.u,
      spin: i.j,
      discovered: i.y,
      notable: !!i.n,
      stable: i.h === null,
    }));
  });
  const NUCLIDE_COUNT = """ + str(total) + """;
  const api = { ISOTOPES, NUCLIDE_COUNT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
"""
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'wrote {OUT}: {total} ground-state nuclides, {len(out)} elements, {len(js) // 1024} KB')


if __name__ == '__main__':
    main()
