#!/usr/bin/env python3
"""
Skærer før/efter-parrene til slideren ud af Wiktorias råfiler i ig-posts/.

HVORFOR BILLEDERNE RETTES OP:
Kunden ligger ned under behandlingen, så ansigtet er optaget på skrå. En
wipe-slider skærer lodret, og på et skævt ansigt deler den linje de to øjne
fra hinanden i stedet for at dele ét ansigt: man kom til at sammenligne det
ubehandlede nederste øje med det behandlede øverste. Når pupillerne står i
vater, går wipen ned gennem næseryggen, og man ser den samme person halvt
behandlet.

HVORFOR ÉN AFFIN TRANSFORMATION OG IKKE "rotér, så beskær":
Roterer man hele billedet først, opstår der tomme hjørner, og det udsnit der
kan ligge helt inde i den skrå flade bliver meget mindre end nødvendigt. Ved
at sample det roterede udsnit direkte fra originalen bruges hele opløsningen,
og der kan pr. konstruktion ikke komme tomme hjørner med.

Begge billeder i et par får NØJAGTIG samme udsnit. Flugter de ikke, ligner
wipen en fejl i stedet for et resultat.

Kør:  python3 scripts/beforeafter/make.py
"""
import math, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'ig-posts' / '2026-08-23-fra-wiktoria'
OUT = ROOT / 'static' / 'img'
SIZE = (1400, 1050)          # 4:3, ansigtet rettet op med begge øjne


def sample(im, cx, cy, w, ang_deg, size=SIZE):
    """Hent et udsnit på w px bredde, roteret ang_deg, centreret i (cx,cy)."""
    h = w * size[1] / size[0]
    th = math.radians(ang_deg)
    s = w / size[0]
    ct, st = math.cos(th), math.sin(th)
    W, H = size
    a, b = s * ct, -s * st
    d, e = s * st,  s * ct
    c = cx - (a * W / 2 + b * H / 2)
    f = cy - (d * W / 2 + e * H / 2)
    return im.transform(size, Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)


def corners_inside(im, cx, cy, w, ang_deg, size=SIZE):
    h = w * size[1] / size[0]
    th = math.radians(ang_deg)
    ct, st = math.cos(th), math.sin(th)
    for sx in (-w/2, w/2):
        for sy in (-h/2, h/2):
            x = cx + sx * ct - sy * st
            y = cy + sx * st + sy * ct
            if not (0 <= x < im.width and 0 <= y < im.height):
                return False
    return True


def build(name, shots, zoom, drop=-0.06):
    """shots = [(fil, akse_p1, akse_p2, centrum), ...] for hhv. før og efter.

    Aksen er to punkter, der ligger vandret i et opret ansigt, fx de to
    pupiller eller øjets to hjørner. Vinklen mellem dem siger hvor meget
    billedet skal rettes op, og afstanden bruges som målestok, så zoom
    betyder det samme uanset hvor tæt på kameraet har været.

    Hvert billede rettes op efter SINE EGNE punkter. På par, hvor før og
    efter er to separate optagelser, har hovedet flyttet sig imellem dem, og
    ét fælles udsnit ville give en wipe, hvor ansigtet hopper. Normaliserer
    man hvert billede for sig, lander øjet samme sted i begge.

    Udsnittet centreres om "centrum" (pupillen). Kilderne er høje og smalle,
    fordi ansigtet ligger på skrå, så et opret udsnit med begge øjne kan
    ikke ligge inden for billedet. Ét øje i liggende format lader brynet
    fylde bredden, så wipe-linjen går ned gennem det, man skal se.
    """
    plan = []
    for path, a1, a2, mid in shots:
        im = Image.open(path)
        ang = math.degrees(math.atan2(a2[1] - a1[1], a2[0] - a1[0]))
        unit = math.dist(a1, a2)
        th = math.radians(ang + 90)
        cx = mid[0] + unit * drop * math.cos(th)
        cy = mid[1] + unit * drop * math.sin(th)
        plan.append([im, ang, unit, cx, cy])

    # Fælles zoom målt i akseenheder, så motiverne står lige store.
    z = zoom
    def ok(z):
        return all(corners_inside(im, cx, cy, unit * z, ang)
                   for im, ang, unit, cx, cy in plan)
    while z > 0.4 and not ok(z):
        z -= 0.02
    if z <= 0.4:
        sys.exit(f'{name}: udsnittet kan ikke ligge inden for billederne')
    if z < zoom:
        print(f'  (zoom trimmet {zoom:.2f} -> {z:.2f} akseenheder)')

    for tag, (im, ang, unit, cx, cy) in zip(('before', 'after'), plan):
        out = sample(im, cx, cy, unit * z, ang)
        p = OUT / f'ba-{name}-{tag}.jpg'
        out.save(p, 'JPEG', quality=84, optimize=True, progressive=True)
        print(f'  {p.relative_to(ROOT)}  {SIZE[0]}x{SIZE[1]}  {p.stat().st_size//1024} KB')


if __name__ == '__main__':
    print('Bygger før/efter-par:')
    # Par 1 (standard): bryn OG vipper. Kilden er én diptych, hvor Wiktoria
    # selv har sat før og efter side om side, så halvdelene flugter allerede.
    dip = Image.open(RAW / 'blond-diptych-foer-efter.jpeg')
    half = dip.width // 2
    tmp = [ROOT / '.ba-tmp-a.jpg', ROOT / '.ba-tmp-b.jpg']
    dip.crop((0, 0, half, dip.height)).save(tmp[0], quality=96)
    dip.crop((half, 0, dip.width, dip.height)).save(tmp[1], quality=96)
    # Aksen (de to pupiller) sætter rotation og målestok. Centrum måles
    # derimod i HVER halvdel for sig: hovedet har flyttet sig 130 px til
    # siden og 220 px ned mellem de to optagelser, og med ét fælles centrum
    # kom efter-billedets øje til at ligge for langt til venstre i rammen.
    AXIS = ((770, 2540), (1340, 1290))
    build('lashes-brows', [
        (tmp[0], *AXIS, (730, 2510)),      # pupillen i FØR
        (tmp[1], *AXIS, (860, 2730)),      # pupillen i EFTER
    ], zoom=0.95)
    for t in tmp:
        t.unlink()

    # Par 2: kun vipper. To separate optagelser, hvor hovedet har flyttet sig
    # ~5° imellem dem, så hver har sine egne punkter. Aksen er øjets to
    # hjørner, da kun det ene øje er med i billedet.
    build('lashes', [
        # øjets to hjørner som akse, pupillen som centrum
        (RAW / 'rodhaaret-foer.jpeg',  (1290, 1810), (1810, 2050), (1560, 1900)),
        (RAW / 'rodhaaret-efter.jpeg', (1180, 1650), (1680, 1830), (1440, 1720)),
    ], zoom=2.6)
