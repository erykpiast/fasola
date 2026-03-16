#!/usr/bin/env python3
"""Generate 100 realistic OCR recipe text files with artifacts."""

import os
import random
from pathlib import Path

# Recipes to exclude
EXCLUDE = {
    "ARAYES SHRAK",
    "CHLEBEK Z WARZYWAMI I BOCZKIEM",
    "SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)",
    "MIXED SEED CRISPBREAD",
    "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander",
    "Faszerowana papryka",
    "OVERNIGHT STRAIGHT PIZZA DOUGH",
    "FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS"
}

# English recipes
ENGLISH_RECIPES = [
    "Classic Tomato Soup",
    "Chicken Parmesan",
    "Chocolate Layer Cake",
    "Caesar Salad",
    "Garlic Bruschetta",
    "Sourdough Bread",
    "Espresso Coffee",
    "Strawberry Jam",
    "Beef Stew",
    "Apple Pie",
    "Garlic Bread",
    "Pasta Carbonara",
    "Fish Tacos",
    "Lemon Bars",
    "Mushroom Risotto",
    "Caprese Salad",
    "Fluffy Pancakes",
    "Beef Wellington",
    "Tiramisu",
    "Minestrone Soup",
    "Grilled Chicken Breast",
    "Fudge Brownies",
    "Greek Salad",
    "Mozzarella Sticks",
    "Ciabatta Loaf",
    "Iced Tea",
    "Mango Chutney",
    "Lamb Chops",
    "Cheesecake",
    "French Onion Soup",
    "Shrimp Scampi",
    "Shortbread Cookies",
    "Caprese Sandwich",
    "Spinach Dip",
    "Baguette",
    "Lemonade",
    "Peach Preserves",
    "Pork Tenderloin",
    "Carrot Cake",
    "Vegetable Minestrone",
    "Baked Salmon",
    "Oatmeal Cookies",
    "Spinach Salad",
    "Stuffed Mushrooms",
    "Focaccia Bread",
    "Iced Coffee",
    "Apple Butter",
    "Duck Confit",
    "Cheesecake Bars",
    "Clam Chowder",
    "Grilled Fish",
    "Sugar Cookies",
    "Beet Salad",
    "Arancini",
    "Whole Wheat Bread",
    "Hot Chocolate",
    "Blackberry Jam",
    "Roast Beef",
    "Red Velvet Cake",
    "Vegetable Soup",
]

# Polish recipes
POLISH_RECIPES = [
    "Barszcz Czerwony",
    "Piernik",
    "Żurek",
    "Pączki",
    "Bigos",
    "Sernik",
    "Zupa Owocowa",
    "Placki Ziemniaczane",
    "Pierogi Ruskie",
    "Makowiec",
    "Zupa Grochowa",
    "Babka Wielkanocna",
    "Zwoje z Miodem",
    "Żurawina w Syropie",
    "Łazanki",
    "Krakers",
    "Konfitura Truskawkowa",
    "Kluski",
    "Kielbasa",
    "Makownik",
    "Żur",
    "Ciastka Maślane",
    "Chrust",
    "Zupa Żurawina",
    "Naleśniki",
    "Karpatka",
    "Dżem Malinowy",
    "Kopytka",
    "Oscypek",
    "Pączuszki",
    "Grochówka",
    "Tort Sachera",
    "Drożdżówki",
    "Konfitury Domowe",
    "Flaki",
    "Babeczki",
    "Konfitura Malinowa",
    "Jaja w Śmietanie",
    "Zupa Szpinakowa",
    "Chleb Żytni",
]

# OCR noise functions
def random_ocr_noise():
    """Generate random OCR artifacts."""
    artifacts = [
        "1' ",
        "''",
        "|",
        "!",
        "0",
        "rn",
        "ni",
        "cl",
        "rl",
        "-",
        "_",
        "~",
        "`",
    ]
    return random.choice(artifacts)

def garbled_line():
    """Generate a garbled OCR line."""
    patterns = [
        "1l1l1l1l1l1l1l1l1l",
        "0|0|0|0|0|0|0|0|0|",
        "~-~-~-~-~-~-~-~-~-",
        "''''''''''''''''''",
        "||||||||||||||||",
        "rnrnrnrnrnrnrnrnrn",
    ]
    return random.choice(patterns)

def mangle_word(word):
    """Introduce OCR errors into a word."""
    if random.random() < 0.3:
        chars = list(word)
        if len(chars) > 1:
            idx = random.randint(0, len(chars) - 1)
            replacements = ['1', '|', '0', 'n', 'rn', 'rl']
            chars[idx] = random.choice(replacements)
        return ''.join(chars)
    return word

def generate_recipe_text(title, is_polish=False):
    """Generate realistic OCR recipe text."""
    lines = []

    # Decide title position
    title_pos = random.randint(0, 2)

    # Sometimes add noise at top
    if random.random() < 0.7:
        for _ in range(random.randint(1, 3)):
            if random.random() < 0.5:
                lines.append(garbled_line())
            else:
                lines.append("Page 47 " + "".join(random.choice(["'", "|", "l", "1"]) for _ in range(random.randint(5, 15))))

    # Maybe add section header before title
    if title_pos == 1 and random.random() < 0.6:
        section = "SKŁADNIKI" if is_polish else "INGREDIENTS"
        lines.append(section)
        lines.append("")

    # Title position 0: early (after noise)
    if title_pos == 0:
        lines.append(title.upper())
        lines.append("")

    # Title position 1: after header
    if title_pos == 1:
        lines.append(title.upper())
        lines.append("")

    # Title position 2: after some ingredients mentioned
    if title_pos == 2:
        lines.append("")
        lines.append(title.upper())
        lines.append("")

    # Build ingredient list
    if is_polish:
        ingredient_headers = ["SKŁADNIKI:", "Składniki", "skladniki", "SKŁADNIKI"]
        ingredients = [
            "- 250 g mąki",
            "- 2 jajka",
            "- 100 ml mleka",
            "- 1 łyżka cukru",
            "- Sól do smaku",
            "- 50 g masła",
        ]
    else:
        ingredient_headers = ["INGREDIENTS:", "Ingredients", "ingredients"]
        ingredients = [
            "- 2 cups flour",
            "- 3 eggs",
            "- 1 cup milk",
            "- 2 tbsp sugar",
            "- Salt to taste",
            "- 100g butter",
        ]

    if title_pos != 1:
        lines.append(random.choice(ingredient_headers))

    num_ingredients = random.randint(4, 8)
    for _ in range(num_ingredients):
        ing = random.choice(ingredients)
        if random.random() < 0.15:
            ing = mangle_word(ing)
        lines.append(ing)

    lines.append("")

    # Instructions
    if is_polish:
        instr_header = random.choice(["PRZYGOTOWANIE:", "Przygotowanie", "Sposób przygotowania"])
    else:
        instr_header = random.choice(["INSTRUCTIONS:", "Instructions", "Directions"])

    lines.append(instr_header)

    num_instructions = random.randint(4, 8)
    for i in range(1, num_instructions + 1):
        instr = f"{i}. " + random.choice([
            "Mieszaj składniki razem" if is_polish else "Mix ingredients together",
            "Podgrzej piekarnik" if is_polish else "Preheat oven",
            "Gotuj przez 20 minut" if is_polish else "Cook for 20 minutes",
            "Dodaj przyprawy" if is_polish else "Add seasonings",
            "Wyłóż na talerz" if is_polish else "Plate and serve",
            "Dekoruj świeżą bazylią" if is_polish else "Garnish with fresh basil",
        ])
        if random.random() < 0.1:
            instr = mangle_word(instr)
        lines.append(instr)

    lines.append("")

    # Random note
    if random.random() < 0.6:
        note = random.choice([
            "Podpowiedź: można przygotować dzień wcześniej" if is_polish else "Tip: can be prepared the day before",
            "Pora przygotowania: 30 minut" if is_polish else "Prep time: 30 minutes",
            "Porcji: 4" if is_polish else "Servings: 4",
        ])
        lines.append(note)

    # Noise at bottom
    if random.random() < 0.6:
        lines.append("")
        lines.append("Page 48 " + "".join(random.choice(["'", "|", "l", "1"]) for _ in range(random.randint(5, 15))))

    # Ensure 15-40 lines
    while len(lines) < 15:
        lines.append("")

    while len(lines) > 40:
        lines.pop(random.randint(1, len(lines) - 2))

    return "\n".join(lines)

def main():
    output_dir = Path("tools/title-loop/input")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Combine and filter recipes
    all_recipes = [(title, False) for title in ENGLISH_RECIPES] + [(title, True) for title in POLISH_RECIPES]

    # Shuffle and take first 100
    random.shuffle(all_recipes)
    recipes = [(title, is_polish) for title, is_polish in all_recipes[:100]]

    created = 0
    for idx, (title, is_polish) in enumerate(recipes, 1):
        # Sanitize filename
        safe_title = title.replace("/", " ").replace(":", " ").replace("\\", " ").strip()
        filename = f"{safe_title}.generated.txt"
        filepath = output_dir / filename

        # Generate text
        text = generate_recipe_text(title, is_polish)

        # Write file
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text)

        created += 1
        if idx % 10 == 0:
            print(f"Created {idx}/100 files...")

    print(f"\n✓ Generated {created} recipe files in {output_dir}")

if __name__ == "__main__":
    main()
