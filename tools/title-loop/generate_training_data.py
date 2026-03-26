#!/usr/bin/env python3
"""
Generate synthetic OCR recipe files that closely mimic real scanned recipes.
Patterns derived from analysis of 207 real .real.txt files and failure patterns.

Output: tools/title-loop/input/{RECIPE_TITLE}.{pattern}.generated.txt
"""

import random
import re
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "input"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

POLISH_CHARS = set("ąęśćźżłóńĄĘŚĆŹŻŁÓŃ")

# ── Recipe titles ─────────────────────────────────────────────────────────────

PL_TITLES = [
    # Long titles (>40 chars, 31% of real files)
    "Makaron z pieczonym kalafiorem i anchois",
    "Sałatka z pieczonego buraka z chrzanowym jogurtem",
    "Kurczak pieczony z cytryną i rozmarynem",
    "Zupa krem z pieczonych pomidorów z bazylią",
    "Łosoś w sosie koperkowym z młodymi ziemniakami",
    "Pierogi z kapustą i grzybami na wigilijny stół",
    "Placki ziemniaczane z sosem grzybowym i śmietaną",
    "Tarta z karmelizowaną cebulą i kozim serem",
    "Risotto z grzybami leśnymi i parmezanem",
    "Sałatka z grillowanym halloumi i arbuzem",
    "Gulasz wołowy z warzywami korzeniowymi",
    "Zupa ogórkowa na rosole z koperkiem",
    "Naleśniki z serem i rodzynkami na słodko",
    "Zapiekanka z bakłażanem i mięsem mielonym",
    "Ciasto drożdżowe z kruszonką i śliwkami",
    "Leczo z papryką i kiełbasą po węgiersku",
    "Kotlety schabowe z kapustą zasmażaną",
    "Zrazy wołowe zawijane z ogórkiem i boczkiem",
    "Fasolka szparagowa z boczkiem i czosnkiem",
    "Sałatka z marchewki z pomarańczą i miętą",
    # Medium titles
    "Sernik na zimno", "Barszcz ukraiński", "Żurek na zakwasie",
    "Pieczona kaczka z jabłkami", "Zupa pomidorowa z ryżem",
    "Bigos staropolski", "Rosół z kury", "Placek po węgiersku",
    "Gołąbki w sosie pomidorowym", "Kopytka z sosem grzybowym",
    "Krem z dyni z imbirem", "Mazurek bakaliowy",
    "Pączki z różą", "Babka piaskowa", "Rogaliki drożdżowe",
    "Chrust faworki", "Kisiel malinowy", "Kompot z rabarbaru",
    # Short titles
    "Żurek", "Bigos", "Mizeria", "Schabowy", "Sernik", "Piernik",
    "Makowiec", "Szarlotka", "Flaki", "Krupnik",
]

EN_TITLES = [
    # Long titles
    "Slow Roasted Lamb Shoulder with Pomegranate and Mint",
    "Crispy Polenta with Parmesan and Sage",
    "Sweet and Sour Brussels Sprouts with Chestnuts and Grapes",
    "Roasted Cauliflower with Tahini and Pomegranate",
    "Baked Aubergines with Tomato and Mozzarella",
    "Grilled Halloumi Salad with Watermelon and Mint",
    "Pan Seared Sea Bass with Lemon Butter Sauce",
    "Chocolate Lava Cake with Salted Caramel",
    "Braised Short Ribs with Red Wine and Rosemary",
    "Butternut Squash Soup with Coconut and Lime",
    "Chicken Thighs with Preserved Lemon and Olives",
    "Spiced Chickpea Stew with Dates and Feta",
    "Roasted Beetroot Salad with Goat Cheese and Walnuts",
    "Charred Corn Salad with Feta and Herbs",
    "Crispy Duck Leg Confit with Orange Sauce",
    # Medium titles
    "Tomato Bisque", "French Onion Soup", "Lamb Tagine",
    "Beef Bourguignon", "Chicken Piccata", "Caesar Salad",
    "Focaccia Bread", "Banana Bread", "Tiramisu",
    "Lemon Meringue Pie", "Apple Crumble", "Brownies",
    "Fish Tacos", "Shrimp Scampi", "Ceviche",
    "Gazpacho", "Ratatouille", "Bruschetta",
    # Short
    "Hummus", "Fattoush", "Shakshuka", "Tabbouleh", "Baklava",
    # Additional EN titles for data balance
    "Roasted Pumpkin Soup with Sage", "Grilled Chicken with Chimichurri",
    "Seared Tuna with Sesame Crust", "Pasta Puttanesca",
    "Mushroom and Thyme Risotto", "Chicken Pot Pie",
    "Beef and Ale Stew", "Prawn Linguine", "Lamb Kofta",
    "Aubergine Parmigiana", "Tuna Nicoise", "Pork Belly Bao Buns",
    "Smoked Salmon Blinis", "Beetroot Hummus", "Thai Red Curry",
    "Coconut Dal", "Spinach and Ricotta Cannelloni",
    "Honey Roasted Carrots", "Crispy Tofu Bowl",
    "Chorizo and Bean Stew", "Duck Ragu", "Goat Cheese Tart",
    "Pistachio Crusted Salmon", "Wild Mushroom Soup",
    "Sticky Toffee Pudding", "Eton Mess", "Victoria Sponge",
    "Millionaire Shortbread", "Treacle Tart", "Scones with Clotted Cream",
]

# ── Metadata pools (from real files) ─────────────────────────────────────────

PL_CATEGORIES = [
    "Warzywa", "Desery", "Zupy", "Dania główne", "Przekąski",
    "Sałatki", "Makarony", "Ryby", "Mięso", "Ciasta",
    "Pieczywo", "Przetwory", "Napoje", "Śniadania",
]
PL_SEASONS = ["Wiosna", "Lato", "Jesień", "Zima", "Cały rok"]
PL_SERVINGS = [
    "DLA 4 OSÓB", "DLA 6 OSÓB", "DLA 2 OSÓB", "DLA 8 OSÓB",
    "NA 4 PORCJE", "CZTERY PORCJE", "SZEŚĆ PORCJI", "CZTERY-SZEŚĆ PORCJI",
    "NA OKOŁO 30 CIASTEK", "NA 12 PORCJI",
    "DLA 4 OSÓB, jako danie główne", "SZEŚĆ-OSIEM PORCJI, jako przekąska",
]
PL_TIMING = [
    "PRZYGOTOWANIE 20 MIN", "PRZYGOTOWANIE 15 MIN",
    "PIECZENIE 45 MIN", "GOTOWANIE 30 MIN",
    "PRZYGOTOWANIE 10 MIN | GOTOWANIE 30 MIN",
    "Czas przygotowywania:\n30 minut",
    "Czas przyrządzania:\n2 godziny 25 minut",
    "Przygotowanie\n20 minut\nGotowanie 30 minut",
    "Czas przygotowywania: 15 minut\nCzas przyrządzania: 1 godzina 30 minut",
]
EN_CATEGORIES = [
    "VEGETABLES", "DESSERTS", "SOUPS", "MAIN COURSE", "APPETIZERS",
    "SALADS", "PASTA", "FISH", "MEAT", "BAKING",
]
EN_SERVINGS = [
    "SERVES 4", "SERVES 6", "FOR 4 SERVINGS", "MAKES 8",
    "FOUR SERVINGS", "SIX PORTIONS",
]

# ── Ingredients ───────────────────────────────────────────────────────────────

PL_INGREDIENTS = [
    "500 g mąki pszennej", "2 jajka", "100 g masła",
    "1 szklanka mleka", "3 ząbki czosnku", "sól i pieprz do smaku",
    "2 łyżki oliwy z oliwek", "1 duża cebula, pokrojona",
    "200 g pieczarek, pokrojonych", "1 łyżeczka papryki",
    "½ szklanki śmietany", "2 liście laurowe",
    "500 ml bulionu", "świeża pietruszka",
    "1 czerwona papryka", "150 g sera, startego",
    "3 średnie marchewki, obrane", "2 łyżki miodu",
    "300 g piersi z kurczaka", "1 puszka (400 g) pomidorów",
    "250 g makaronu", "100 g boczku",
    "1 łyżeczka kuminu", "sok z 1 cytryny",
]
EN_INGREDIENTS = [
    "500g plain flour", "2 eggs", "100g butter",
    "1 cup milk", "3 cloves garlic, minced", "salt and pepper to taste",
    "2 tablespoons olive oil", "1 large onion, diced",
    "200g mushrooms, sliced", "1 teaspoon paprika",
    "¼ cup cream", "2 bay leaves",
    "500ml stock", "fresh parsley",
    "1 red pepper, chopped", "150g cheese, grated",
    "3 medium carrots, peeled", "2 tablespoons honey",
    "300g chicken breast", "1 can (400g) diced tomatoes",
    "250g pasta", "100g bacon",
    "1 teaspoon cumin", "juice of 1 lemon",
]

# ── Narratives ────────────────────────────────────────────────────────────────

PL_NARRATIVES = [
    "To danie najczęściej przyrządza się w rodzinnej kuchni. Moja mama często przygotowywała je jako przekąskę na podwieczorek, ale możesz podawać je zarówno w porze obiadu, jak i na kolację.",
    "Próbowałem wymyślić jakiś ciekawszy tytuł. Byłby za długi, gdybym chciał wspomnieć o wszystkich składnikach. Zdecydowałem, że podam podstawowe.",
    "W naszej piekarni używamy krajalnicy do wędlin, żeby ciasteczka były naprawdę cienkie i równe, jednak duży ostry nóż też się nadaje.",
    "Przypominają batony energetyczne. Z wierzchu są chrupiące dzięki orzechom, pestkom i nasionom, a w środku lekko ciągnące.",
    "Batoniki można przechowywać do 5 dni w hermetycznym pojemniku.",
    "Składniki dla tej potrawy powinny być jak najświeższe. Najlepiej kupować je na targu.",
]
EN_NARRATIVES = [
    "The best aubergines in Palestine are known to come from the village of Battir to the west of Bethlehem. We use aubergines in all recipes.",
    "This classic recipe has been passed down through generations of home cooks. The combination of fresh ingredients creates a warm and satisfying dish.",
    "A versatile dish that can be prepared ahead and reheated when needed. The flavors develop even more overnight.",
    "Simple yet sophisticated, this recipe showcases the natural flavors of quality ingredients. Serve with crusty bread.",
    "For the full experience, prepare all components fresh. The textures and colors make this a feast for the eyes.",
]

# ── Garbage lines (spillover) ─────────────────────────────────────────────────

GARBAGE_PL = [
    "Obierz ziemniaki i pokrój na kawałki...",
    "Roztop masło w garnku na małym ogniu.",
    "Dodaj sól, pieprz i zioła. Wymieszaj dokładnie.",
    "Gotuj do miękkości, ok. 20-30 minut.",
    "Podawaj na ciepło z dodatkami do wyboru.",
    "Wyjmij z piekarnika i ostudź przez 10 minut.",
    "½ szklanki cukru wymieszanego z cynamonem",
    "Delikatnie złóż ciasto i ponownie złóż.",
]
GARBAGE_EN = [
    "Peel the potatoes and cut into chunks...",
    "Melt butter in a 225°C oven. Heat until golden",
    "½ cup plus 1 tablespoon of sugar mixed with cinnamon",
    "Cook until tender, about 20-30 minutes or until fork...",
    "Add salt, pepper, and herbs. Mix well with the butter",
    "Serve warm with accompaniments of your choosing",
    "Remove from the oven and let cool for 10 minutes",
    "Garnish with fresh herbs before serving",
]

# ── Metadata artifacts (from real files) ──────────────────────────────────────

PAGE_REFS_PL = [
    "patrz zdjęcie na stronie {n}", "(s. {n})", "zob. str. {n}",
]
PAGE_REFS_EN = [
    "For image see page {n}", "For image see page opposite",
    "see page {n}", "(page {n})",
]
EDITORIAL_PL = ["AD - {text}", "PN - {text}"]
EDITORIAL_EN = ["Tip: {text}", "Note: {text}", "Chef's note: {text}"]
FOOTERS_PL = ["DESERY", "ZUPY", "WARZYWA", "DANIA GŁÓWNE", "PRZEKĄSKI"]
FOOTERS_EN = ["SUMMER", "WINTER", "APPETIZERS", "DESSERTS", "MAIN COURSES"]

# ── OCR corruption ───────────────────────────────────────────────────────────

def corrupt_ocr(text, rate=0.08):
    """Realistic OCR corruption — expanded map based on real file analysis."""
    swaps = {
        # Polish diacritics
        'ł': 'l', 'Ł': 'L', 'ą': 'a', 'ę': 'e', 'ó': 'o',
        'ś': 's', 'ć': 'c', 'ń': 'n', 'ż': 'z', 'ź': 'z',
        # Shape-based confusions (from real OCR)
        'l': 'ı', 'i': 'ı', 'o': '0', 'O': '0', 'I': '1', 'S': '5',
        'ó': '6', 'ż': '2', 'ą': 'q', 'B': '8', 'g': '9', 'b': '6',
        # Multi-char (classic OCR)
        'rn': 'm', 'cl': 'd',
        # Period/comma swap
        '.': ',', ',': '.',
        # Misc
        'é': 'e', 'ü': 'u',
    }
    result = []
    i = 0
    while i < len(text):
        if random.random() < rate:
            if i + 1 < len(text) and text[i:i+2] in swaps:
                result.append(swaps[text[i:i+2]])
                i += 2
                continue
            if text[i] in swaps:
                result.append(swaps[text[i]])
                i += 1
                continue
        result.append(text[i])
        i += 1
    return ''.join(result)


# ── Title transforms ─────────────────────────────────────────────────────────

def _case_transform(title):
    """Apply realistic case variation (real: 60% ALL CAPS, 25% Title Case, 15% sentence)."""
    r = random.random()
    if r < 0.60:
        return title.upper()
    elif r < 0.85:
        return title
    else:
        return title[0].upper() + title[1:].lower()


def _split_title(title):
    """Split title across 1-3 lines (49% of real files have split titles)."""
    words = title.split()
    if len(words) <= 2 or random.random() < 0.4:
        return [title]
    n_splits = min(random.randint(1, 2), len(words) - 1)
    positions = sorted(random.sample(range(1, len(words)), n_splits))
    parts = []
    idx = 0
    for pos in positions:
        parts.append(" ".join(words[idx:pos]))
        idx = pos
    parts.append(" ".join(words[idx:]))
    return parts


def _emit_title(title):
    """Apply case transform + split — used by all generators."""
    return _split_title(_case_transform(title))


# ── Block helpers ─────────────────────────────────────────────────────────────

def _ingredients_block(lang, n=None):
    if n is None:
        n = random.randint(6, 14)
    pool = PL_INGREDIENTS if lang == "pl" else EN_INGREDIENTS
    header = "SKŁADNIKI" if lang == "pl" else "INGREDIENTS"
    two_column = random.random() < 0.15
    lines = [header]
    for ing in random.sample(pool, min(n, len(pool))):
        if two_column and " " in ing:
            parts = ing.split(" ", 2)
            if len(parts) >= 3 and any(c.isdigit() for c in parts[0]):
                lines.append(parts[0] + " " + parts[1])
                lines.append(parts[2] if len(parts) > 2 else "")
                continue
        lines.append(ing)
    return lines


def _instructions_block(lang, n=None):
    if n is None:
        n = random.randint(3, 8)
    header = "PRZYGOTOWANIE" if lang == "pl" else "INSTRUCTIONS"
    lines = [header]
    for i in range(1, n + 1):
        if lang == "pl":
            lines.append(f"Krok {i}. Przygotuj składniki i gotuj.")
        else:
            lines.append(f"Step {i}. Prepare and cook together.")
    return lines


# ── Post-processors ──────────────────────────────────────────────────────────

def _interleave_metadata(lines, lang):
    """Insert random metadata artifacts (page numbers, cross-refs, editorial markers)."""
    result = list(lines)
    insertions = []

    # Bare page number
    if random.random() < 0.35:
        insertions.append((random.randint(0, len(result)), str(random.randint(12, 350))))

    # Cross-reference
    if random.random() < 0.20:
        refs = PAGE_REFS_PL if lang == "pl" else PAGE_REFS_EN
        ref = random.choice(refs).format(n=random.randint(10, 300))
        insertions.append((random.randint(0, len(result)), ref))

    # Editorial annotation
    if random.random() < 0.15:
        tmpls = EDITORIAL_PL if lang == "pl" else EDITORIAL_EN
        narratives = PL_NARRATIVES if lang == "pl" else EN_NARRATIVES
        text = random.choice(tmpls).format(text=random.choice(narratives)[:60])
        insertions.append((random.randint(0, len(result)), text))

    # Category footer
    if random.random() < 0.25:
        footer = random.choice(FOOTERS_PL if lang == "pl" else FOOTERS_EN)
        insertions.append((len(result), footer))

    for pos, text in sorted(insertions, key=lambda x: x[0], reverse=True):
        result.insert(min(pos, len(result)), text)
    return result


def _apply_structural_artifacts(lines):
    """Apply line-level OCR artifacts: smart quotes, hyphenation splits."""
    result = []
    for line in lines:
        # Smart quotes around ALL CAPS lines
        if random.random() < 0.05 and line == line.upper() and len(line) > 3:
            line = '\u201e' + line + '\u201d'
        # Stray linebreak mid-word
        if random.random() < 0.04 and len(line) > 15:
            pos = random.randint(5, len(line) - 5)
            if line[pos] != ' ':
                result.append(line[:pos] + "-")
                result.append(line[pos:])
                continue
        result.append(line)
    return result


# ── Catastrophic OCR helpers ─────────────────────────────────────────────────

CYRILLIC = "гаропкажеsнмтвлб"
NONSENSE = ["Bully", "sorted", "cacing", "lent", "mporaton", "coat",
            "toantains", "desat", "laste", "floured", "ssekart", "alled"]


def _catastrophic_line():
    style = random.choice(["truncated", "single_chars", "cyrillic", "nonsense"])
    if style == "truncated":
        words = random.choice(GARBAGE_EN + GARBAGE_PL).split()
        return " ".join(w[:random.randint(1, 3)] if len(w) > 2 and random.random() < 0.5 else w for w in words)
    elif style == "single_chars":
        return " ".join(random.choice("abcdefghijklmnoprstuvwyz") for _ in range(random.randint(3, 8)))
    elif style == "cyrillic":
        words = random.choice(GARBAGE_PL + GARBAGE_EN).split()
        return " ".join(
            "".join(random.choice(CYRILLIC) for _ in range(len(w))) if random.random() < 0.4 else w
            for w in words[:random.randint(2, 4)]
        )
    else:
        return " ".join(random.sample(NONSENSE, min(random.randint(3, 6), len(NONSENSE))))


def _catastrophic_block(n=None):
    if n is None:
        n = random.randint(5, 20)
    return [_catastrophic_line() for _ in range(n)]


# ── Pattern generators ────────────────────────────────────────────────────────

def gen_category_season_title(title, lang):
    lines = []
    if lang == "pl":
        cat = random.choice(PL_CATEGORIES)
        season = random.choice(PL_SEASONS)
        fmt = random.choice([f"/ {season} / {cat}", f"{cat}\n{season}", f"{cat} | {season}"])
        lines.extend(fmt.split("\n"))
    else:
        lines.append(random.choice(EN_CATEGORIES))
    lines.extend(_emit_title(title))
    lines.append("")
    if lang == "pl":
        lines.append(random.choice(PL_SERVINGS))
        if random.random() < 0.6:
            lines.append(random.choice(PL_TIMING).split("\n")[0])
    else:
        lines.append(random.choice(EN_SERVINGS))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_servings_before_title(title, lang):
    lines = []
    if lang == "pl":
        lines.append(random.choice(PL_SERVINGS))
        if random.random() < 0.5:
            lines.append("jako dodatek")
    else:
        lines.append(random.choice(EN_SERVINGS))
    if random.random() < 0.3:
        pool = PL_INGREDIENTS if lang == "pl" else EN_INGREDIENTS
        for ing in random.sample(pool, random.randint(3, 6)):
            lines.append(ing)
        lines.append("")
    lines.extend(_emit_title(title))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_title_with_narrative(title, lang):
    lines = list(_emit_title(title))
    lines.append("")
    narratives = PL_NARRATIVES if lang == "pl" else EN_NARRATIVES
    for _ in range(random.randint(1, 3)):
        lines.append(random.choice(narratives))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_timing_before_title(title, lang):
    lines = []
    if lang == "pl":
        lines.extend(random.choice(PL_TIMING).split("\n"))
    else:
        lines.append(f"Preparation: {random.randint(10,30)} minutes")
        lines.append(f"Cooking: {random.randint(20,60)} minutes")
    lines.append("")
    lines.extend(_emit_title(title))
    lines.append("")
    if random.random() < 0.5:
        narratives = PL_NARRATIVES if lang == "pl" else EN_NARRATIVES
        lines.append(random.choice(narratives))
        lines.append("")
    lines.extend(_ingredients_block(lang))
    return lines


def gen_spillover(title, lang):
    lines = []
    garbage = GARBAGE_PL if lang == "pl" else GARBAGE_EN
    for _ in range(random.randint(8, 30)):
        line = random.choice(garbage)
        if random.random() < 0.2:
            line = corrupt_ocr(line, 0.12)
        lines.append(line)
    lines.append("")
    lines.extend(_emit_title(title))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_simple(title, lang):
    lines = list(_emit_title(title))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_ocr_corrupted(title, lang):
    rate = random.uniform(0.05, 0.15)
    lines = [corrupt_ocr(part, rate) for part in _emit_title(title)]
    lines.append("")
    pool = PL_INGREDIENTS if lang == "pl" else EN_INGREDIENTS
    for ing in random.sample(pool, random.randint(6, 10)):
        lines.append(corrupt_ocr(ing, rate))
    lines.append("")
    lines.extend(_instructions_block(lang))
    return lines


def gen_catastrophic(title, lang):
    """Severely garbled OCR with title buried in nonsense."""
    lines = _catastrophic_block(random.randint(3, 15))
    lines.append("")
    # Title with mild corruption so it's still findable by fuzzy matching
    rate = random.uniform(0.02, 0.08)
    lines.extend(corrupt_ocr(part, rate) for part in _emit_title(title))
    lines.append("")
    lines.extend(_catastrophic_block(random.randint(5, 15)))
    pool = PL_INGREDIENTS if lang == "pl" else EN_INGREDIENTS
    for ing in random.sample(pool, min(4, len(pool))):
        lines.append(corrupt_ocr(ing, random.uniform(0.10, 0.25)))
    return lines


def gen_website_header(title, lang):
    lines = []
    sites = ["aedesk.pl", "kwestiasmaku.com", "przepisy.pl", "gotujmy.pl",
             "allrecipes.com", "seriouseats.com", "bonappetit.com"]
    lines.append(random.choice(sites))
    if random.random() < 0.5:
        narratives = PL_NARRATIVES if lang == "pl" else EN_NARRATIVES
        lines.append(random.choice(narratives))
    lines.append("")
    lines.extend(_emit_title(title))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    return lines


def gen_multilang(title, lang):
    lines = list(_emit_title(title))
    if lang == "pl":
        lines.append(title.upper() + " (ENGLISH)")
    else:
        lines.append(title.upper())
        lines.append("WERSJA POLSKA")
    lines.append("")
    lines.extend(_ingredients_block(lang))
    return lines


def gen_compound_separator(title, lang):
    """Compound title with varied separators (|, /, :, +, -)."""
    SEPS = [" | ", " / ", " : ", " + ", " - "]
    SEP_W = [30, 20, 20, 15, 15]
    sep = random.choices(SEPS, weights=SEP_W, k=1)[0]
    words = title.split()
    if len(words) >= 4:
        mid = len(words) // 2
        compound = " ".join(words[:mid]) + sep + " ".join(words[mid:])
    else:
        compound = title
    lines = _split_title(_case_transform(compound))
    lines.append("")
    narratives = PL_NARRATIVES if lang == "pl" else EN_NARRATIVES
    lines.append(random.choice(narratives))
    lines.append("")
    lines.extend(_ingredients_block(lang))
    return lines


# ── Generator registry ────────────────────────────────────────────────────────

GENERATORS = [
    ("category_season", gen_category_season_title, 18),
    ("servings_before", gen_servings_before_title, 12),
    ("narrative", gen_title_with_narrative, 10),
    ("timing_before", gen_timing_before_title, 8),
    ("spillover", gen_spillover, 13),
    ("simple", gen_simple, 8),
    ("corrupted", gen_ocr_corrupted, 5),
    ("catastrophic", gen_catastrophic, 8),
    ("website", gen_website_header, 5),
    ("multilang", gen_multilang, 5),
    ("compound", gen_compound_separator, 12),
]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    random.seed(42)

    existing_real = {
        re.sub(r"\.real\.txt$", "", p.name).lower()
        for p in OUTPUT_DIR.glob("*.real.txt")
    }

    all_recipes = [(t, "pl") for t in PL_TITLES] + [(t, "en") for t in EN_TITLES]
    all_recipes = [(t, l) for t, l in all_recipes if t.lower() not in existing_real]

    pattern_names = [name for name, _, _ in GENERATORS]
    pattern_fns = [fn for _, fn, _ in GENERATORS]
    pattern_weights = [w for _, _, w in GENERATORS]

    generated = 0
    skipped = 0

    for recipe, lang in all_recipes:
        n_variants = random.randint(3, 5)
        chosen = random.choices(range(len(GENERATORS)), weights=pattern_weights, k=n_variants)
        seen = set()

        for idx in chosen:
            name = pattern_names[idx]
            fn = pattern_fns[idx]
            if name in seen:
                continue
            seen.add(name)

            filename = f"{recipe}.{name}.generated.txt"
            filepath = OUTPUT_DIR / filename
            if filepath.exists():
                skipped += 1
                continue

            lines = fn(recipe, lang)

            # Post-processing: metadata interleaving (45%)
            if random.random() < 0.45:
                lines = _interleave_metadata(lines, lang)

            # Post-processing: structural OCR artifacts (20%)
            if random.random() < 0.20:
                lines = _apply_structural_artifacts(lines)

            filepath.write_text("\n".join(lines), encoding="utf-8")
            generated += 1

    # ── Real-data augmentation ────────────────────────────────────────────
    print("\nAugmenting real files...")
    aug_count = 0
    real_files = sorted(OUTPUT_DIR.glob("*.real.txt"))

    for real_file in real_files:
        title = re.sub(r"\.real\.txt$", "", real_file.name)
        text = real_file.read_text(encoding="utf-8")
        file_lines = text.splitlines()

        for aug_idx in range(random.randint(5, 8)):
            aug_name = f"{title}.aug{aug_idx}.generated.txt"
            aug_path = OUTPUT_DIR / aug_name
            if aug_path.exists():
                continue

            aug_lines = list(file_lines)
            is_pl = any(c in title for c in POLISH_CHARS)
            file_lang = "pl" if is_pl else "en"

            augmentations = random.sample(
                ["corrupt", "garbage_prepend", "line_delete", "line_shuffle",
                 "whitespace", "metadata_insert", "catastrophic_prepend",
                 "structural_ocr", "case_shift"],
                k=random.randint(1, 4),
            )

            for aug_type in augmentations:
                if aug_type == "corrupt":
                    rate = random.uniform(0.03, 0.10)
                    aug_lines = [corrupt_ocr(l, rate) for l in aug_lines]
                elif aug_type == "garbage_prepend":
                    garbage = GARBAGE_PL if is_pl else GARBAGE_EN
                    prefix = [random.choice(garbage) for _ in range(random.randint(3, 15))]
                    aug_lines = prefix + [""] + aug_lines
                elif aug_type == "line_delete":
                    if len(aug_lines) > 5:
                        for _ in range(random.randint(1, 3)):
                            idx = random.randint(2, len(aug_lines) - 1)
                            if idx < len(aug_lines):
                                aug_lines.pop(idx)
                elif aug_type == "line_shuffle":
                    for _ in range(random.randint(1, 2)):
                        if len(aug_lines) > 4:
                            idx = random.randint(2, len(aug_lines) - 2)
                            aug_lines[idx], aug_lines[idx + 1] = aug_lines[idx + 1], aug_lines[idx]
                elif aug_type == "whitespace":
                    new = []
                    for line in aug_lines:
                        if line == "" and random.random() < 0.3:
                            continue
                        new.append(line)
                        if random.random() < 0.1:
                            new.append("")
                    aug_lines = new
                elif aug_type == "metadata_insert":
                    aug_lines = _interleave_metadata(aug_lines, file_lang)
                elif aug_type == "catastrophic_prepend":
                    aug_lines = _catastrophic_block(random.randint(3, 10)) + [""] + aug_lines
                elif aug_type == "structural_ocr":
                    aug_lines = _apply_structural_artifacts(aug_lines)
                elif aug_type == "case_shift":
                    # Randomly uppercase/lowercase 20-50% of lines
                    frac = random.uniform(0.2, 0.5)
                    aug_lines = [
                        l.upper() if random.random() < frac else l
                        for l in aug_lines
                    ]

            aug_path.write_text("\n".join(aug_lines), encoding="utf-8")
            aug_count += 1

    total = len(list(OUTPUT_DIR.glob("*.generated.txt")))
    print(f"Generated {generated} synthetic + {aug_count} augmented = {generated + aug_count} files")
    print(f"Total .generated.txt files: {total}")


if __name__ == "__main__":
    main()
