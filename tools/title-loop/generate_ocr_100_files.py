#!/usr/bin/env python3
"""Generate 100 realistic fake OCR recipe text files for title extraction testing."""

import os
from pathlib import Path
import random

# Configuration
OUTPUT_DIR = Path(__file__).parent / "input"
OUTPUT_DIR.mkdir(exist_ok=True)

# Exclude these existing recipes
EXCLUDE_RECIPES = {
    "ARAYES SHRAK",
    "Smażona zielona fasolka",
    "CHLEBEK Z WARZYWAMI I BOCZKIEM",
    "SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)",
    "MIXED SEED CRISPBREAD",
    "LABANEH BALLS WITH NIGELLA SEEDS",
    "Baked Eggs with Feta",
    "Harissa Tomato Sauce & Coriander",
    "Faszerowana papryka",
    "OVERNIGHT STRAIGHT PIZZA DOUGH",
    "FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS",
    "KREM SELEROWY Z GORGONZOLA",
}

# English recipes (60 total)
ENGLISH_RECIPES = [
    # Soups (10)
    "Tomato Bisque",
    "French Onion Soup",
    "Butternut Squash Soup",
    "Mushroom Barley Soup",
    "Split Pea Soup",
    "Lentil and Kale Soup",
    "Minestrone Vegetable Soup",
    "Clam Chowder",
    "Chicken Piccata",
    "Vegetable Stir Fry",

    # Mains (10)
    "Beef Bourguignon",
    "Quick Beef Bourguignon",
    "Spaghetti Carbonara",
    "Grilled Steak",
    "Pan Seared Salmon",
    "Roasted Chicken Thighs",
    "Baked Cod with Herbs",
    "Lamb Stew",
    "Homemade Vegetable Stir Fry",
    "Shrimp Saganaki",

    # Desserts (10)
    "Chocolate Lava Cake",
    "Tiramisu",
    "Cheesecake",
    "Lemon Meringue Pie",
    "Strawberry Shortcake",
    "Apple Crumble",
    "Brownies",
    "Vanilla Panna Cotta",
    "Caramel Pudding",
    "Strawberry Jam",

    # Salads (10)
    "Caesar Salad",
    "Greek Salad",
    "Caprese Salad",
    "Quinoa Salad",
    "Kale Salad",
    "Authentic Kale Salad",
    "Coleslaw",
    "Beet Salad",
    "Authentic Irish Soda Bread",
    "Whole Wheat Rolls",

    # Appetizers (10)
    "Bruschetta",
    "Deviled Eggs",
    "Stuffed Mushrooms",
    "Mozzarella Sticks",
    "Spinach and Feta Phyllo",
    "Dill Pickles",
    "Garlic Bread",
    "Focaccia Bread",
    "Ciabatta",
    "Sourdough Loaf",

    # Breads (5)
    "Irish Soda Bread",
    "Banana Bread",
    "Pita Bread",
    "Whole Grain Rolls",
    "Garlic Naan",

    # Drinks (3)
    "Strawberry Smoothie",
    "Lemonade",
    "Iced Tea",
    "Sangria",

    # Preserves (2)
    "Tomato Chutney",
    "Strawberry Jam",
]

# Polish recipes (40 total)
POLISH_RECIPES = [
    # Soups (6)
    "Żurek",
    "Żur żytni",
    "Barszcz Czysty",
    "Zupa Grzybowa",
    "Zupa Pomidorowa",
    "Chodnik",

    # Mains (7)
    "Schabowy",
    "Kotlety Mielone",
    "Kaczka Pieczona",
    "Drab w Sosie Grzybowym",
    "Urek",
    "Bigos",
    "Bigos z Wdzonych Kielbas",

    # Desserts (7)
    "Makowiec",
    "Sernik",
    "Piernik",
    "Paczki",
    "Kremwka",
    "Szarlotka",
    "Babka Wielkanocna",

    # Salads (6)
    "Mizeria",
    "Salata Warzywna",
    "Surwka z Kapusty",
    "Ur-Paski",
    "Ur Ze Mietan",
    "Golabki",

    # Appetizers (6)
    "Marynata Pieczarkowa",
    "Ogrki Konserwowe",
    "Roladki Szpinakowe",
    "Placki Ziemniaczane",
    "Pulpety w Mietanie",
    "Piekarnik",

    # Breads (4)
    "Chleb żytni",
    "Drozdżowiec",
    "Kisiel Malinowy",
    "Kompot",

    # Drinks (2)
    "Kompot Malinowy",
    "Kompot",

    # Preserves (2)
    "Konfitury ze Liwek",
    "Kisiel Malinowy",
]

def get_spillover_text():
    """Generate corrupted text from a previous recipe."""
    fragments = [
        "½ cup plus ı tablespoon of finely ground",
        "nto a loured work counter and knead until smooth",
        "Fold in the chocolate chips and mix until just combined",
        "Heat oven to 225°C/435-VI0F. Combine flour, sugar",
        "ıllll the bowl with cold water and place",
        "Season with salt, pepper, and nutmeg. Let simmer for",
        "Remove from heat and stir in the cream",
        "Beat egg whites until stiff peaks form, then fold",
        "Bake for 35-40 minutes or until golden brown",
        "Cool completely on a wire rack before serving",
    ]
    return random.choice(fragments)

def get_metadata_prefix():
    """Generate metadata prefix lines."""
    prefixes = [
        "Lato | Dania główne",
        "Jesień / Zupy",
        "DLA 4 OSÓB",
        "PRZYGOTOWANIE 10 MIN",
        "GOTOWANIE 30 MIN",
        "SEZON: WIOSNA",
        "Vegetarian | Serves 6",
        "Prep time: 15 minutes | Cook time: 45 minutes",
        "Summer | Main Course",
        "Difficulty: Medium | Serves 4",
        "Spring | Appetizer",
        "Winter | Soup",
    ]
    return random.choice(prefixes)

def get_narrative_intro(recipe_type):
    """Generate narrative intro between title and ingredients."""
    intros = [
        "This classic dish brings warmth and comfort to any table. Perfect for family gatherings, it's been passed down through generations with love and care.",
        "A traditional recipe that celebrates the finest seasonal ingredients. The combination of flavors creates a harmonious blend that delights the palate.",
        "Originating from ancient culinary traditions, this preparation method ensures maximum flavor extraction and nutritional retention.",
        "Simple yet elegant, this dish requires only the finest ingredients and careful attention to technique.",
        "A beloved family recipe that has stood the test of time. Prepare with patience and attention to detail for best results.",
        "This dish represents the very best of home cooking traditions. Serve warm to fully appreciate its complex flavors.",
        "Z pokolenia na pokolenie, ten przepis pozostaje ulubieńcem całej rodziny.",
        "Tradycyjny sposób przygotowania, który gwarantuje doskonały smak i doskonałą teksturę.",
    ]
    return "\n".join(random.sample(intros, k=random.randint(3, 5)))

def apply_ocr_corruption(text):
    """Apply OCR character corruption to text."""
    corruptions = {
        'l': 'ı',  # dotless i
        'e': 'e',  # normal
        'o': 'o',  # normal
        '1': 'l',  # one to L
        '0': 'O',  # zero to O
    }

    lines = text.split('\n')
    corrupted_lines = []
    for line in lines:
        # 30% chance to corrupt characters in this line
        if random.random() < 0.3:
            chars = list(line)
            num_corruptions = random.randint(1, max(2, len(chars) // 10))
            positions = random.sample(range(len(chars)), min(num_corruptions, len(chars)))

            for pos in positions:
                if random.random() < 0.4:  # 40% chance per position
                    if chars[pos] == 's':
                        chars[pos] = 'só1'[random.randint(0, 2)]
                    elif chars[pos] == 'a':
                        chars[pos] = 'e'
                    elif chars[pos] == 'l':
                        chars[pos] = 'ı'
                    elif chars[pos].isdigit():
                        chars[pos] = random.choice('OIl')

            line = ''.join(chars)

        corrupted_lines.append(line)

    return '\n'.join(corrupted_lines)

def format_title_multiline(title):
    """Split title across multiple lines."""
    words = title.split()
    num_lines = random.randint(2, min(4, len(words)))
    words_per_line = max(1, len(words) // num_lines)

    lines = []
    for i in range(num_lines - 1):
        start = i * words_per_line
        end = start + random.randint(1, words_per_line + 1)
        lines.append(' '.join(words[start:end]))

    lines.append(' '.join(words[(num_lines - 1) * words_per_line:]))
    return '\n'.join(lines)

def generate_ingredients(recipe_title, num_ingredients=7):
    """Generate a basic ingredient list."""
    ingredients = [
        "2 cups flour",
        "1 cup sugar",
        "3 eggs",
        "½ cup butter",
        "2 teaspoons vanilla extract",
        "1 teaspoon salt",
        "2 teaspoons baking powder",
        "¾ cup milk",
        "1 pound beef",
        "3 cloves garlic",
        "2 onions, diced",
        "Salt and pepper to taste",
        "2 tablespoons olive oil",
        "1 cup chicken broth",
        "2 cups vegetables",
    ]
    return random.sample(ingredients, k=min(num_ingredients, len(ingredients)))

def generate_ocr_file(recipe_title, pattern_type):
    """Generate OCR file content based on pattern type."""
    content_lines = []

    # Apply pattern-specific formatting
    if pattern_type == "spillover":
        # Add 10-50 lines of corrupted previous recipe text
        num_spillover = random.randint(10, 50)
        for _ in range(num_spillover):
            content_lines.append(get_spillover_text())
        content_lines.append("")  # blank line

    if pattern_type == "metadata":
        # Add metadata prefix
        content_lines.append(get_metadata_prefix())
        content_lines.append("")

    if pattern_type == "multiline_title":
        # Split title across multiple lines
        content_lines.append(format_title_multiline(recipe_title))
    else:
        # Normal title
        content_lines.append(recipe_title)

    if pattern_type == "multilang":
        # Add alternative language version
        lang_variants = [
            "Paprika Gyeran-jjim",
            "PILAFF AU POULET",
            "Zuppa di Verdure",
            "GEMÜSESUPPE",
        ]
        content_lines.append(random.choice(lang_variants))

    content_lines.append("")

    # Narrative intro (15% of all files, sometimes combined with other patterns)
    if pattern_type == "narrative" or random.random() < 0.15:
        content_lines.append(get_narrative_intro(recipe_title))
        content_lines.append("")

    # Ingredients section
    content_lines.append("INGREDIENTS:")
    content_lines.append("")
    for ingredient in generate_ingredients(recipe_title):
        content_lines.append(ingredient)

    content_lines.append("")
    content_lines.append("INSTRUCTIONS:")
    content_lines.append("")

    # Basic instructions
    instructions = [
        "1. Preheat oven to 350°F (175°C).",
        "2. Mix dry ingredients in a large bowl.",
        "3. In another bowl, combine wet ingredients.",
        "4. Fold dry ingredients into wet mixture.",
        "5. Pour into prepared pan.",
        "6. Bake for 25-30 minutes until golden.",
        "7. Cool before serving.",
    ]
    content_lines.extend(instructions)

    # Apply OCR corruption if this pattern type is "corruption"
    content = '\n'.join(content_lines)
    if pattern_type == "corruption":
        content = apply_ocr_corruption(content)

    return content

def sanitize_filename(title):
    """Create a valid filename from recipe title."""
    # Remove special chars but keep spaces and diacritics
    safe_title = ''.join(c if c.isalnum() or c.isspace() or ord(c) > 127 else ' ' for c in title)
    return f"{safe_title.strip()}.generated.txt"

def main():
    """Generate 100 OCR recipe files."""

    # Prepare recipe list (exclude existing ones)
    english_recipes = [r for r in ENGLISH_RECIPES if r not in EXCLUDE_RECIPES]
    polish_recipes = [r for r in POLISH_RECIPES if r not in EXCLUDE_RECIPES]

    # Ensure we have enough recipes
    assert len(english_recipes) >= 60, f"Need 60 English recipes, have {len(english_recipes)}"
    assert len(polish_recipes) >= 40, f"Need 40 Polish recipes, have {len(polish_recipes)}"

    # Select exactly 60 English and 40 Polish
    selected_english = random.sample(english_recipes, k=60)
    selected_polish = random.sample(polish_recipes, k=40)
    all_recipes = selected_english + selected_polish

    # Define pattern distribution (totals to 100)
    patterns = (
        ["spillover"] * 15 +          # 15%
        ["multiline_title"] * 15 +    # 15%
        ["metadata"] * 10 +           # 10%
        ["corruption"] * 20 +         # 20%
        ["multilang"] * 5 +           # 5%
        ["narrative"] * 15 +          # 15%
        ["compound"] * 5 +            # 5%
        ["simple"] * 15               # 15%
    )

    random.shuffle(patterns)

    # Generate files
    generated_count = 0
    for i, recipe_title in enumerate(all_recipes):
        pattern = patterns[i % len(patterns)]

        # Handle compound recipes (multiple recipes in one)
        if pattern == "compound" and i % 2 == 0:
            second_recipe = all_recipes[(i + 1) % len(all_recipes)]
            recipe_title = f"{recipe_title} + {second_recipe}"

        try:
            content = generate_ocr_file(recipe_title, pattern)
            filename = sanitize_filename(recipe_title)
            filepath = OUTPUT_DIR / filename

            filepath.write_text(content, encoding='utf-8')
            generated_count += 1
            print(f"✓ {generated_count:3d} {filename}")
        except Exception as e:
            print(f"✗ Failed to generate {recipe_title}: {e}")

    print(f"\n✅ Generated {generated_count} OCR recipe files in {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
