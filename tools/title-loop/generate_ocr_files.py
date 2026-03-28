#!/usr/bin/env python3
"""
Generate 100 realistic fake OCR recipe text files.
Patterns: page spillover, split titles, metadata prefix, character corruption,
multi-language variants, narrative intros, compound titles, and simple files.
"""

import os
import random
from pathlib import Path

OUTPUT_DIR = Path("tools/title-loop/input")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Exclude existing recipes
EXCLUDED_TITLES = {
    "arayes shrak",
    "smażona zielona fasolka",
    "chlebek z warzywami i boczkiem",
    "saffron wheat buns with quark cottage cheese variation d",
    "mixed seed crispbread",
    "labaneh balls with nigella seeds",
    "baked eggs with feta",
    "harissa tomato sauce coriander",
    "faszerowana papryka",
    "overnight straight pizza dough",
    "finnish milk flatbreads finnish potato flatbreads",
    "krem selerowy z gorgonzola",
}

# English recipes (65+ total)
ENGLISH_RECIPES = [
    "Chicken Piccata",
    "Beef Bourguignon",
    "Pan Seared Salmon",
    "Grilled Steak",
    "Roasted Chicken Thighs",
    "Caesar Salad",
    "Greek Salad",
    "Kale Salad",
    "Quinoa Salad",
    "Caprese Salad",

    "Tomato Bisque",
    "French Onion Soup",
    "Mushroom Barley Soup",
    "Lentil and Kale Soup",
    "Minestrone Vegetable Soup",
    "Clam Chowder",
    "Split Pea Soup",
    "Butternut Squash Soup",
    "Vegetable Stir Fry",
    "Turkey Meatballs",

    "Sourdough Loaf",
    "Ciabatta",
    "Focaccia Bread",
    "Garlic Bread",
    "Irish Soda Bread",
    "Whole Wheat Rolls",
    "Authentic Irish Soda Bread",
    "Banana Bread",
    "Brownies",
    "Baked Cod with Herbs",

    "Tiramisu",
    "Lemon Meringue Pie",
    "Chocolate Lava Cake",
    "Cheesecake",
    "Strawberry Shortcake",
    "Vanilla Panna Cotta",
    "Caramel Pudding",
    "Apple Crumble",
    "Deviled Eggs",
    "Quick Beef Bourguignon",

    "Bruschetta",
    "Mozzarella Sticks",
    "Stuffed Mushrooms",
    "Shrimp Saganaki",
    "Spinach and Feta Phyllo",
    "Coleslaw",
    "Beet Salad",
    "Authentic Kale Salad",
    "Lamb Stew",
    "Homemade Vegetable Stir Fry",

    "Strawberry Smoothie",
    "Lemonade",
    "Iced Tea",
    "Sangria",
    "Strawberry Jam",
    "Tomato Chutney",
    "Dill Pickles",
    "Ratatouille Po Polsku",
    "Quick Golabki",
    "Baked Eggs with Feta",
    "Spaghetti Carbonara",
]

# Polish recipes (45+ total)
POLISH_RECIPES = [
    "Żurek",
    "Bigos",
    "Golabki",
    "Mizeria",
    "Placki Ziemniaczane",
    "Schabowy",
    "Chleb Żytni",

    "Sernik",
    "Makowiec",
    "Kremwka",
    "Szarlotka",
    "Buki Mleczne",
    "Paczki",
    "Piernik",

    "Zupa Pomidorowa",
    "Zupa Grzybowa",
    "Kompot",
    "Kompot Malinowy",
    "Urek",
    "Chodnik",
    "Żur Żytni",

    "Piekarnik",
    "Babka Wielkanocna",
    "Ur-Paski",
    "Ur Ze Mietan",
    "Drożdżowiec",
    "Pita Żytnia",

    "Kaczka Pieczona",
    "Kotlety Mielone",
    "Pulpety w Mietanie",
    "Drab w Sosie Grzybowym",
    "Bigos z Wdzonych Kielbas",
    "Salata Warzywna",
    "Roladki Szpinakowe",

    "Marynata Pieczarkowa",
    "Konfitury ze Liwek",
    "Ogrki Konserwowe",
    "Surwka z Kapusty",
    "Kisiel Malinowy",
    "Barszcz Czysty",
]

def corrupt_text(text, corruption_rate=0.1):
    """Apply OCR character corruption to text."""
    corruption_map = {
        'l': 'ı',  # dotless i
        'L': 'L',
        'o': '0',
        'O': '0',
        's': 's1',
        'ś': 'so1',
        'n': 'n',
        'i': 'ı',
    }

    result = []
    for char in text:
        if random.random() < corruption_rate and char in corruption_map:
            result.append(corruption_map[char])
        else:
            result.append(char)
    return ''.join(result)

def generate_ingredients(num=8):
    """Generate a simple ingredients list."""
    ingredients = [
        "salt and pepper to taste",
        "2 tablespoons olive oil",
        "1 large onion, diced",
        "3 cloves garlic, minced",
        "1 cup chicken broth",
        "500g meat",
        "2 cups vegetables",
        "1 teaspoon paprika",
        "¼ cup cream",
        "2 eggs",
        "100g butter",
        "3 tablespoons flour",
        "1 lemon, juiced",
        "fresh parsley",
        "2 bay leaves",
        "500ml water",
    ]
    return random.sample(ingredients, min(num, len(ingredients)))

def generate_spillover_garbage():
    """Generate corrupted text from a fake previous recipe."""
    garbage_recipes = [
        "Peel the potatoes and cut nto a loured work counter...",
        "Melt butter in a 225°C/435-VI0 oven. Heat until golden",
        "½ cup plus ı tablespoon of sugar mixed with cinnamon",
        "Fold gently UuIw then fold again. Bake at gorg-onzol temp",
        "Stir in the centy-metrowe pieces of...chocolate, diced",
        "Cook until tender, about 20-30 minutes or untıl fork...",
        "Add salt, pepper, and herbs. Mix weII with the bnutter",
        "Serve warm with accompanıments of your chosing, optıonal",
    ]
    lines = []
    num_lines = random.randint(10, 50)
    for _ in range(num_lines):
        line = random.choice(garbage_recipes)
        if random.random() < 0.3:
            line = corrupt_text(line, corruption_rate=0.15)
        lines.append(line)
    return lines

def generate_file_simple(title):
    """Generate a simple OCR file with basic noise."""
    lines = []

    # Add some page noise
    if random.random() < 0.3:
        lines.append(f"Page 42 | Recipe")

    lines.append(title)
    lines.append("")

    # Ingredients
    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 8)):
        lines.append(f"{i}. Mix and cook until done.")

    # Add some footer noise
    if random.random() < 0.2:
        lines.append("")
        lines.append("--- End of page ---")

    return lines

def generate_file_page_spillover(title):
    """Generate file with corrupted text from a previous recipe (40-60 lines)."""
    lines = []

    # Add spillover garbage
    lines.extend(generate_spillover_garbage())

    lines.append("")
    lines.append("=" * 50)
    lines.append("")
    lines.append(title)
    lines.append("")

    # Ingredients and instructions
    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 6)):
        lines.append(f"{i}. Prepare and cook.")

    return lines

def generate_file_split_title(title):
    """Generate file with title split across 2-4 lines."""
    lines = []

    # Split title randomly
    words = title.split()
    if len(words) >= 2:
        split_positions = random.sample(range(1, len(words)), min(random.randint(1, 2), len(words) - 1))
        split_positions.sort()

        idx = 0
        for pos in split_positions:
            lines.append(" ".join(words[idx:pos]))
            idx = pos
        lines.append(" ".join(words[idx:]))
    else:
        lines.append(title)

    lines.append("")
    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 7)):
        lines.append(f"{i}. Mix and prepare.")

    return lines

def generate_file_metadata_prefix(title):
    """Generate file with metadata/category before title."""
    lines = []

    metadata_options = [
        "DANIA GŁÓWNE | Lato",
        "ZUPY / Jesień",
        "DLA 4 OSÓB",
        "PRZYGOTOWANIE: 10 MIN | GOTOWANIE: 30 MIN",
        "DESSERTS & PASTRIES",
        "VEGETARIAN | SERVES 6",
        "STARTER | PREPARATION TIME: 15 MINUTES",
        "GŁÓWNE | Gotowanie: 45 min",
    ]

    lines.append(random.choice(metadata_options))
    lines.append("")
    lines.append(title)
    lines.append("")

    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 7)):
        lines.append(f"{i}. Cook until ready.")

    return lines

def generate_file_ocr_corruption(title):
    """Generate file with OCR character corruption throughout."""
    lines = []

    lines.append(corrupt_text(title, corruption_rate=0.08))
    lines.append("")

    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        corrupted = corrupt_text(ingredient, corruption_rate=0.1)
        lines.append(f"  • {corrupted}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 7)):
        instr = f"{i}. Prepare and cook together with care."
        corrupted = corrupt_text(instr, corruption_rate=0.08)
        lines.append(corrupted)

    return lines

def generate_file_multi_language(title):
    """Generate file with multi-language variant titles."""
    lines = []

    # Polish and English versions
    lines.append(title)  # Original

    # Add English translation or variant
    translations = {
        "żurek": "SOUR RYE SOUP",
        "bigos": "HUNTER'S STEW",
        "golabki": "STUFFED CABBAGE ROLLS",
        "mizeria": "CUCUMBER AND SOUR CREAM",
        "placki ziemniaczane": "POTATO PANCAKES",
        "schabowy": "BREADED PORK CUTLET",
    }

    title_lower = title.lower()
    if any(t in title_lower for t in translations.keys()):
        for key, trans in translations.items():
            if key in title_lower:
                lines.append(trans)
                break
    else:
        lines.append(title.upper() + " (ENGLISH VERSION)")

    lines.append("")
    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 7)):
        lines.append(f"{i}. Combine and cook.")

    return lines

def generate_file_narrative_intro(title):
    """Generate file with narrative intro between title and ingredients."""
    lines = []

    lines.append(title)
    lines.append("")

    # Narrative intros
    intros = [
        "This classic recipe has been passed down through generations of home cooks. The combination of fresh ingredients creates a warm and satisfying dish.",
        "A beloved comfort food that brings families together at the dinner table. Prepare with care and love for the best results.",
        "Traditional preparation method ensures authentic flavor and texture. This dish pairs well with fresh bread and a simple salad.",
        "An elegant presentation worthy of any special occasion. The aroma alone will delight your guests.",
        "Simple yet sophisticated, this recipe showcases the natural flavors of quality ingredients.",
        "Preparation is straightforward, but the results are impressive and deeply satisfying.",
        "A versatile dish that can be prepared ahead and reheated when needed.",
    ]

    num_intro_lines = random.randint(3, 7)
    intro = random.choice(intros)
    lines.append(intro)
    lines.append("")

    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(6, 10)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    for i in range(1, random.randint(4, 7)):
        lines.append(f"{i}. Follow preparation steps carefully.")

    return lines

def generate_file_compound_title(title):
    """Generate file with compound/complex title (multiple recipes or variations)."""
    lines = []

    # Create a compound title with variations
    if " " in title:
        parts = title.split(" ", 1)
        compound = f"{parts[0]} + {title.upper()} (VARIATION A)"
    else:
        compound = f"{title} + {title} WITH VARIATION"

    lines.append(compound)
    lines.append("")

    lines.append("INGREDIENTS:")
    for ingredient in generate_ingredients(random.randint(8, 12)):
        lines.append(f"  • {ingredient}")

    lines.append("")
    lines.append("INSTRUCTIONS:")
    lines.append("VARIATION A:")
    for i in range(1, 4):
        lines.append(f"{i}. Follow these steps.")

    lines.append("")
    lines.append("VARIATION B:")
    for i in range(1, 4):
        lines.append(f"{i}. Alternative method.")

    return lines

def generate_file(title, pattern_type):
    """Generate a file based on pattern type."""
    if pattern_type == "spillover":
        return generate_file_page_spillover(title)
    elif pattern_type == "split_title":
        return generate_file_split_title(title)
    elif pattern_type == "metadata":
        return generate_file_metadata_prefix(title)
    elif pattern_type == "corruption":
        return generate_file_ocr_corruption(title)
    elif pattern_type == "multi_language":
        return generate_file_multi_language(title)
    elif pattern_type == "narrative":
        return generate_file_narrative_intro(title)
    elif pattern_type == "compound":
        return generate_file_compound_title(title)
    else:
        return generate_file_simple(title)

def save_file(title, lines, lang="en"):
    """Save file with proper filename convention."""
    # Filename uses spaces, not hyphens
    filename = f"{title}.{lang}.generated.txt"
    filepath = OUTPUT_DIR / filename

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✓ {filename}")

def main():
    """Generate 100 OCR recipe files."""
    # Combine recipes as (title, lang) tuples
    all_recipes = [(r, "en") for r in ENGLISH_RECIPES] + [(r, "pl") for r in POLISH_RECIPES]

    # Filter out excluded titles
    all_recipes = [(r, l) for r, l in all_recipes if r.lower() not in EXCLUDED_TITLES]

    # Ensure 60% English, 40% Polish from what we have
    random.shuffle(all_recipes)
    selected_recipes = all_recipes[:100]

    # Distribute patterns
    patterns = (
        ["spillover"] * 15 +
        ["split_title"] * 15 +
        ["metadata"] * 10 +
        ["corruption"] * 20 +
        ["multi_language"] * 5 +
        ["narrative"] * 15 +
        ["compound"] * 5 +
        ["simple"] * 15
    )

    random.shuffle(patterns)

    print(f"Generating {len(selected_recipes)} OCR recipe files...\n")

    for i, ((recipe, lang), pattern) in enumerate(zip(selected_recipes, patterns), 1):
        lines = generate_file(recipe, pattern)
        save_file(recipe, lines, lang=lang)

        if i % 20 == 0:
            print(f"  ... {i}/100 files created")

    print(f"\n✓ All 100 files generated in {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
