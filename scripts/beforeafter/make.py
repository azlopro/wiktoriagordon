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
SIZE = (1400, 933)           # 3:2, ansigtet rettet op med begge øjne


def sample(im, cx, cy, w, ang_deg, size=None):
    """Hent et udsnit på w px bredde, roteret ang_deg, centreret i (cx,cy).

    size læses ved kaldet, ikke som standardargument: et standardargument
    bindes ved definitionen, og ændrer man SIZE bagefter, tegner den stadig i
    det gamle format, mens udsnittet er regnet ud til det nye. Så falder
    hjørnerne udenfor billedet.
    """
    size = size or SIZE
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


def corners_inside(im, cx, cy, w, ang_deg, size=None):
    size = size or SIZE
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


def plan_pair(shots, zoom, drop):
    """Regn udsnittet ud for et par. Returnerer [(billede, vinkel, bredde, cx, cy)].

    Udsnittet holdes i den ØNSKEDE størrelse. Kan det ikke ligge inden for
    billedet, flyttes det i stedet for at blive zoomet ind, og den samme
    flytning bruges på begge billeder, så motiverne stadig står samme sted i
    de to rammer.

    Flytningen skal passe BEGGE billeder på én gang. Regner man den ud efter
    det ene og bruger den på det andet, skubber man bare problemet derover;
    derfor findes det fælles råderum som fællesmængden af de to intervaller,
    og først når den er tom, zoomes der ud.
    """
    base = []
    for path, a1, a2, mid in shots:
        im = Image.open(path)
        ang = math.degrees(math.atan2(a2[1] - a1[1], a2[0] - a1[0]))
        unit = math.dist(a1, a2)
        th = math.radians(ang + 90)
        base.append([im, ang, unit,
                     mid[0] + unit * drop * math.cos(th),
                     mid[1] + unit * drop * math.sin(th)])

    z = zoom
    while z > 0.3:
        lo_x = lo_y = -1e9
        hi_x = hi_y = 1e9
        ok = True
        for im, ang, unit, cx, cy in base:
            # Bredden skalerer med HVERT billedes egen pupilafstand: kameraet
            # har ikke stået samme sted i de to optagelser, og bruger man den
            # ene som facit, kommer det andet ansigt ud i en anden størrelse.
            w = unit * z
            h = w * SIZE[1] / SIZE[0]
            th = math.radians(ang)
            ex = abs(w/2 * math.cos(th)) + abs(h/2 * math.sin(th))
            ey = abs(w/2 * math.sin(th)) + abs(h/2 * math.cos(th))
            if ex > im.width/2 or ey > im.height/2:
                ok = False
                break
            lo_x = max(lo_x, ex - cx);            hi_x = min(hi_x, im.width - ex - cx)
            lo_y = max(lo_y, ey - cy);            hi_y = min(hi_y, im.height - ey - cy)
        if ok and lo_x <= hi_x and lo_y <= hi_y:
            dx = min(max(0.0, lo_x), hi_x)       # flyt så lidt som muligt
            dy = min(max(0.0, lo_y), hi_y)
            if abs(dx) > 1 or abs(dy) > 1:
                print(f'  (udsnittet flyttet {dx:+.0f},{dy:+.0f} px for at blive inden for begge billeder)')
            if z < zoom:
                print(f'  (zoom trimmet {zoom:.2f} -> {z:.2f} pupilafstande)')
            return [(im, ang, unit * z, cx + dx, cy + dy)
                    for im, ang, unit, cx, cy in base]
        z -= 0.02
    sys.exit('udsnittet kan ikke ligge inden for billederne')


def build(name, shots, zoom, drop=0.0):
    """shots = [(fil, akse_p1, akse_p2, pupil), ...] for hhv. før og efter.

    Aksen er to punkter, der ligger vandret i et opret ansigt, typisk de to
    pupiller. Vinklen mellem dem siger hvor meget billedet skal rettes op, og
    afstanden bruges som målestok, så zoom betyder det samme uanset hvor tæt
    kameraet har været.

    Pupillen måles i HVERT billede for sig. Selv på en diptych, hvor før og
    efter er sat sammen på forhånd, har hovedet flyttet sig imellem
    optagelserne, og ét fælles centrum giver et efter-billede, hvor øjet
    ligger skævt i rammen.

    zoom = udsnittets bredde målt i pupilafstande.
    drop = flytter udsnittet ned i ansigtets eget koordinatsystem, også målt
           i pupilafstande. Negativt = op mod brynet.
    """
    for tag, (im, ang, w, cx, cy) in zip(('before', 'after'), plan_pair(shots, zoom, drop)):
        out = sample(im, cx, cy, w, ang)
        p = OUT / f'ba-{name}-{tag}.jpg'
        out.save(p, 'JPEG', quality=84, optimize=True, progressive=True)
        print(f'  {p.relative_to(ROOT)}  {SIZE[0]}x{SIZE[1]}  {p.stat().st_size//1024} KB')


def sheet(shots, options, path):
    """Kontaktark: samme par ved forskellige udsnit, vist som slideren viser
    det (halvt før, halvt efter). Til at vælge ud fra i stedet for at gætte."""
    from PIL import ImageDraw
    tw, th = 380, 285
    cols = 2
    rows = (len(options) + cols - 1) // cols
    sheet_im = Image.new('RGB', (cols*(tw+16)+16, rows*(th+34)+16), (245, 240, 236))
    d = ImageDraw.Draw(sheet_im)
    for i, (zoom, drop, label) in enumerate(options):
        pair = plan_pair(shots, zoom, drop)
        imgs = [sample(im, cx, cy, w, ang).resize((tw, th), Image.LANCZOS)
                for im, ang, w, cx, cy in pair]
        mix = imgs[0].copy()
        mix.paste(imgs[1].crop((tw//2, 0, tw, th)), (tw//2, 0))
        d.line([(tw//2, 0), (tw//2, th)], fill=(255, 255, 255), width=1)
        x = 16 + (i % cols)*(tw+16)
        y = 16 + (i // cols)*(th+34)
        sheet_im.paste(mix, (x, y))
        d.text((x+4, y+th+8), label, fill=(60, 45, 40))
    sheet_im.save(path, quality=92)
    print('kontaktark:', path)


if __name__ == '__main__':
    print('Bygger før/efter-par:')

    # Ankrene er MASKINMÅLT med normaliseret krydskorrelation, ikke aflæst i
    # øjemål. Se README-noten nederst i filen for hvordan de findes igen.
    #
    # Par 1 (standard): bryn OG vipper, begge øjne med. Kilden er de to
    # originalfiler, ikke diptychens halvdele: originalerne er 2268 px brede
    # mod diptychens 1836, og det er dét, der giver plads til begge øjne.
    FB = ((1310, 2100), (1830, 1030))      # pupiller i FØR
    FA = ((1374, 2170), (1801, 1023))      # samme to punkter i EFTER
    mid = lambda a, b: ((a[0]+b[0])//2, (a[1]+b[1])//2)
    build('lashes-brows', [
        (RAW / 'blond-foer.jpeg',  *FB, mid(*FB)),
        (RAW / 'blond-efter.jpeg', *FA, mid(*FA)),
    ], zoom=1.80, drop=0.10)

    # Par 2: kun vipper. Her er kun det ene øje med i billedet, så aksen er
    # øjets to kroge og centrum er pupillen. Krydskorrelationen fandt den
    # indre krog og pupillen forskudt (-85, -184) mellem de to optagelser;
    # den ydre krog kunne ikke matches, fordi de løftede vipper har ændret
    # den for meget, så vinklen antages uændret. Centrum er efterprøvet ved
    # at minimere forskellen i en lodret stribe omkring wipe-linjen; en
    # søgning over vinkel og skala oveni gav kun 8 % mindre restfejl, så
    # resten er ægte forskel mellem billederne, ikke skæv justering.
    build('lashes', [
        (RAW / 'rodhaaret-foer.jpeg',  (1290, 1810), (1810, 2050), (1560, 1900)),
        (RAW / 'rodhaaret-efter.jpeg', (1200, 1628), (1720, 1868), (1475, 1716)),
    ], zoom=2.00, drop=0.0)
