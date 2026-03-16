/**
 * ~500 common English and Polish food/cooking words for OCR repair.
 * Words are lowercase, without diacritics (OCR-resilient matching).
 * Used by repairOcrWord() to resolve ambiguous digit→letter substitutions.
 */
export const FOOD_DICTIONARY: Set<string> = new Set([
  // ── English ingredients ──────────────────────────────────────────────────
  "chicken", "beef", "pork", "lamb", "veal", "duck", "turkey", "venison",
  "salmon", "cod", "halibut", "tuna", "trout", "sardine", "anchovy",
  "shrimp", "prawn", "lobster", "crab", "scallop", "mussel", "clam",
  "tofu", "tempeh", "seitan",

  // Grains & starches
  "rice", "pasta", "bread", "noodle", "flour", "oat", "barley", "wheat",
  "rye", "quinoa", "corn", "cornmeal", "semolina", "couscous", "polenta",
  "buckwheat", "millet",

  // Dairy & eggs
  "butter", "cream", "cheese", "milk", "egg", "yogurt", "ghee",
  "ricotta", "mozzarella", "parmesan", "cheddar", "brie", "feta",

  // Fats & condiments
  "oil", "vinegar", "mustard", "ketchup", "mayo", "mayonnaise",
  "soy", "sauce", "paste", "stock", "broth", "gravy",

  // Vegetables
  "garlic", "onion", "tomato", "potato", "carrot", "celery", "pepper",
  "broccoli", "cauliflower", "asparagus", "artichoke", "eggplant",
  "zucchini", "squash", "pumpkin", "cucumber", "radish", "turnip",
  "beet", "mushroom", "avocado", "olive", "bean", "lentil", "chickpea",
  "arugula", "spinach", "kale", "lettuce", "cabbage", "leek", "fennel",
  "chard", "endive", "watercress", "sprout", "pea", "edamame",
  "scallion", "shallot", "chili", "jalapeno", "poblano", "serrano",
  "brukselka",

  // Fruits
  "lemon", "lime", "orange", "apple", "berry", "blackberry", "blueberry",
  "raspberry", "strawberry", "cherry", "peach", "pear", "plum", "grape",
  "banana", "mango", "pineapple", "coconut", "fig", "date", "apricot",
  "pomegranate", "melon", "watermelon", "grapefruit", "papaya", "kiwi",
  "passion", "guava", "lychee",

  // Nuts & seeds
  "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut",
  "peanut", "sesame", "flaxseed", "chia", "sunflower", "pumpkinseed",
  "poppy",

  // Spices & herbs
  "ginger", "cinnamon", "cumin", "paprika", "turmeric", "oregano",
  "basil", "thyme", "rosemary", "parsley", "cilantro", "dill", "mint",
  "sage", "chive", "tarragon", "nutmeg", "clove", "cardamom", "saffron",
  "vanilla", "anise", "coriander", "bay", "marjoram", "chervil",
  "fenugreek", "sumac", "caraway", "allspice",

  // Sweeteners & flavourings
  "chocolate", "cocoa", "honey", "maple", "molasses", "sugar", "salt",
  "yeast", "baking", "powder", "soda",

  // Common recipe adjectives / descriptors
  "white", "red", "green", "black", "brown", "sweet", "sour", "hot",
  "cold", "fresh", "dried", "whole", "ground", "roasted", "grilled",
  "braised", "baked", "fried", "steamed", "smoked", "stuffed", "glazed",
  "caramelized", "pickled", "fermented", "cured", "raw", "cooked",
  "crispy", "tender", "spicy", "savory", "creamy", "crunchy", "tangy",
  "herb", "herbed", "seasoned", "marinated",

  // Cooking terms / verbs
  "bake", "roast", "grill", "fry", "saute", "braise", "simmer", "boil",
  "steam", "poach", "broil", "smoke", "cure", "pickle", "ferment",
  "blanch", "reduce", "deglaze", "emulsify", "whisk", "knead", "fold",
  "chop", "dice", "mince", "slice", "julienne", "marinate", "season",
  "glaze", "caramelize", "sear", "flambe", "infuse", "steep", "toast",
  "blend", "puree", "strain", "press", "squeeze", "drizzle", "toss",
  "stir", "mix", "beat", "cream", "sift", "coat", "dredge", "bread",

  // Dish types
  "salad", "soup", "stew", "casserole", "risotto", "curry", "pie",
  "tart", "cake", "cookie", "brownie", "muffin", "scone", "pancake",
  "waffle", "crepe", "quiche", "frittata", "omelette", "sandwich",
  "wrap", "burger", "pizza", "dumpling", "pierogi", "sushi", "taco",
  "burrito", "enchilada", "chowder", "bisque", "broth", "consomme",
  "terrine", "pate", "mousse", "souffle", "galette", "clafoutis",
  "cobbler", "crumble", "pudding", "custard", "parfait", "tiramisu",
  "cheesecake", "torte", "trifle", "fool", "compote", "sorbet",
  "gelato", "icecream", "meringue", "macaron",

  // Wine & drinks that appear in recipes
  "wine", "beer", "cider", "brandy", "rum", "vodka", "gin", "whiskey",
  "vermouth", "sherry", "port", "mirin", "sake", "tea", "coffee",
  "juice",

  // ── Polish ingredients (without diacritics) ───────────────────────────────
  "kurczak", "wolowina", "wieprzowina", "cielecina", "golonka",
  "losos", "dorsz", "krewetki", "ryz", "makaron", "chleb", "maslo",
  "smietana", "ser", "czosnek", "cebula", "pomidor", "ziemniak",
  "marchew", "seler", "pieprz", "sol", "cukier", "maka", "jajko",
  "mleko", "olej", "ocet", "cytryna", "pomarancza", "jablko", "jagoda",
  "malina", "truskawka", "wisnia", "brzoskwinia", "gruszka", "sliwka",
  "winogrono", "banan", "orzech", "migdal", "imbir", "cynamon",
  "kminek", "papryka", "kurkuma", "oregano", "bazylia", "tymianek",
  "rozmaryn", "pietruszka", "kolendra", "koperek", "mieta", "szalwia",
  "szpinak", "kapusta", "kalafior", "szparag", "baklazan", "cukinia",
  "dynia", "ogorek", "rzodkiewka", "burak", "grzyb", "awokado",
  "oliwka", "fasola", "soczewica", "ciecierzyca", "kasza", "owies",
  "jeczmien", "pszenica", "zyto",

  // Polish bread varieties
  "pszenny", "razowy", "zytni", "wieloziarnisty", "tostowy",

  // Polish cooking terms (without diacritics)
  "piec", "smazyc", "grillowac", "gotowac", "dusic", "blanszowac",
  "kroic", "siekac", "marynowac", "przyprawiac", "karmelizowac",
  "podsmaz", "zapiekac", "gotowac", "dusic", "wedzic", "kisic",

  // Polish dishes
  "bigos", "zurek", "barszcz", "rosol", "kotlet", "schabowy",
  "golabki", "placki", "nalesniki", "piernik", "sernik", "makowiec",
  "babka", "chalka", "rogal", "paczek", "faworki", "kluski",
  "kopytka", "pyzy", "uszka", "gzik", "flaczki", "zrazy", "gulasz",
  "leczo", "kapusniak", "grochowka", "krupnik", "zupa", "sałatka",
  "salatka", "mizeria", "surowka",

  // Polish ingredient descriptors (without diacritics)
  "swiezy", "suszony", "marynowany", "wegdzony", "pieczony", "gotowany",
  "smazony", "surowy", "mrożony", "mrozony", "konserwowy",
  "ziemniaczane", "ziemniaczany",

  // Polish section labels (appear in recipe texts, useful for context)
  "skladniki", "przygotowanie", "sposob", "wykonanie", "porcje",
  "czas", "temperatura", "pieczenia",
]);
