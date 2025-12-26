/**
 * Label Definitions for Recipe Classification
 * Shared across native and web implementations
 */

/**
 * Season labels with descriptions for semantic similarity
 */
export const SEASON_LABELS = {
  spring:
    "fresh vegetables, asparagus, peas, ramps, radishes, rhubarb, fava beans, artichokes, spring onions, baby greens, herbs, lemon, light salads",
  summer:
    "grilled food, salads, berries, cold dishes, barbecue, tomatoes, peaches, corn, zucchini, eggplant, cucumbers, basil, watermelon, stone fruit",
  autumn:
    "pumpkin, squash, mushrooms, warm soups, harvest vegetables, apples, pears, cranberries, sweet potatoes, beets, Brussels sprouts, roasted vegetables, baking spices",
  winter:
    "hearty stews, comfort food, root vegetables, warm dishes, casseroles, braises, slow-cooked, baked pasta, cabbage, cauliflower, citrus, dumplings",
} as const;

/**
 * Cuisine labels with descriptions for semantic similarity
 */
export const CUISINE_LABELS = {
  // Mediterranean & Southern Europe
  italian:
    "pasta, pizza, risotto, olive oil, parmesan, tomato, basil, mozzarella, garlic, oregano, balsamic, prosciutto, pesto, lasagna, gnocchi, tiramisu, espresso",
  french:
    "croissant, baguette, cheese, wine, cream, butter, pastry, ratatouille, escargot, coq au vin, bouillabaisse, béarnaise, crème brûlée, soufflé, quiche, brie, champagne",
  spanish:
    "paella, tapas, chorizo, olive oil, saffron, seafood, jamón, gazpacho, manchego, patatas bravas, sangria, tortilla española, garlic, paprika, sherry",
  greek:
    "feta cheese, olive oil, tzatziki, moussaka, gyros, oregano, lemon, lamb, souvlaki, spanakopita, dolmades, ouzo, honey, phyllo, olives",
  mediterranean:
    "olive oil, tomatoes, garlic, herbs, lemon, seafood, grilled vegetables, feta, hummus, tahini, eggplant, zucchini, chickpeas, yogurt, fresh herbs",
  // Western & Central Europe
  german:
    "sausage, sauerkraut, potato, schnitzel, beer, pretzels, spätzle, bratwurst, rouladen, black forest cake, pumpernickel, mustard, pork, cabbage",
  british:
    "roast beef, fish and chips, pie, pudding, tea, yorkshire pudding, bangers and mash, scones, shepherd's pie, trifle, cheddar, crumpets, ale",
  // Eastern Europe
  polish:
    "pierogi, kielbasa, bigos, cabbage, sour cream, beets, rye bread, żurek, gołąbki, pickles, dill, mushrooms, poppy seed, horseradish",
  russian:
    "borscht, pelmeni, blini, sour cream, caviar, beets, dill, buckwheat, vodka, beef stroganoff, pickles, rye bread, cabbage, kvass",
  ukrainian:
    "borscht, varenyky, salo, cabbage, beets, sour cream, garlic, dill, buckwheat, sunflower oil, rye bread, pickled vegetables, mushrooms",
  hungarian:
    "goulash, paprika, sour cream, lard, onions, cabbage, dumplings, langos, chimney cake, tokaji wine, pork, peppers, caraway",
  romanian:
    "sarmale, mămăligă, mici, cabbage, sour cream, garlic, polenta, paprika, plum brandy, pickles, pork, dill, sunflower oil",
  czech:
    "svíčková, knedlíky, goulash, beer, dumplings, sauerkraut, pork, beef, caraway, horseradish, paprika, cream sauce",
  slovak:
    "bryndzové halušky, kapustnica, sheep cheese, cabbage, potato, sauerkraut, bacon, paprika, dumplings, pork",
  eastern_european:
    "cabbage, sour cream, beets, dill, rye bread, pickles, dumplings, pork, mushrooms, buckwheat, potatoes, paprika, kvass, fermented foods",
  balkan:
    "čevapi, burek, ajvar, phyllo pastry, sheep cheese, peppers, yogurt, lamb, grilled meats, rakija, cabbage rolls, eggplant, paprika",
  caucasus:
    "khachapuri, khinkali, adjika, walnuts, cheese, herbs, pomegranate, lamb, eggplant, yogurt, flatbread, cilantro, tkemali, satsivi",
  // Scandinavia
  scandinavian:
    "salmon, herring, rye bread, berries, potatoes, dill, pickled fish, gravlax, meatballs, lingonberries, aquavit, cardamom, smørrebrød, butter",
  // East Asia
  chinese:
    "rice, soy sauce, ginger, wok, stir-fry, noodles, dim sum, tofu, sesame oil, scallions, star anise, sichuan pepper, hoisin, bok choy, tea, rice vinegar",
  japanese:
    "sushi, rice, soy sauce, miso, wasabi, nori, tempura, ramen, dashi, sake, matcha, teriyaki, udon, edamame, pickled ginger, bonito",
  korean:
    "kimchi, gochujang, rice, bulgogi, bibimbap, sesame, garlic, gochugaru, doenjang, soju, japchae, banchan, napa cabbage, perilla, ginseng",
  // Southeast Asia
  thai: "coconut milk, curry, pad thai, lemongrass, fish sauce, chili, basil, galangal, lime, kaffir lime, palm sugar, tamarind, cilantro, peanuts, rice noodles",
  vietnamese:
    "pho, rice noodles, fish sauce, herbs, spring rolls, lemongrass, mint, cilantro, lime, chili, star anise, nuoc mam, bahn mi, basil",
  indonesian:
    "satay, rice, peanut sauce, coconut, sambal, nasi goreng, tempeh, turmeric, galangal, kecap manis, lemongrass, shrimp paste, rendang, tamarind",
  filipino:
    "adobo, lumpia, pancit, vinegar, soy sauce, garlic, bay leaves, fish sauce, coconut, lechon, calamansi, banana leaves, bagoong",
  malaysian:
    "nasi lemak, rendang, laksa, coconut milk, sambal, pandan, curry, tamarind, belacan, lemongrass, chili, turmeric, palm sugar",
  singaporean:
    "hainanese chicken rice, laksa, chili crab, kaya, coconut, sambal, curry, fish sauce, soy sauce, pandan, belacan, satay",
  cambodian:
    "amok, prahok, lemongrass, galangal, fish sauce, coconut milk, turmeric, lime, palm sugar, rice, kroeung, tamarind, kaffir lime",
  laotian:
    "larb, sticky rice, fish sauce, lemongrass, galangal, chili, lime, herbs, padaek, papaya salad, tamarind, mint, cilantro",
  burmese:
    "mohinga, curry, fish sauce, shrimp paste, turmeric, lemongrass, chickpea flour, noodles, tamarind, fermented tea leaves, peanuts",
  southeast_asian:
    "rice, coconut milk, fish sauce, lemongrass, chili, lime, curry, garlic, ginger, galangal, tamarind, palm sugar, shrimp paste, peanuts, herbs",
  // South Asia
  indian:
    "curry, rice, naan, spices, turmeric, cumin, coriander, lentils, chickpeas, garam masala, ghee, cardamom, ginger, garlic, tamarind, paneer, chutney, basmati",
  pakistani:
    "biryani, nihari, karahi, naan, cumin, coriander, turmeric, garam masala, ghee, yogurt, chili, ginger, garlic, lentils, basmati rice",
  bangladeshi:
    "hilsa fish, mustard oil, panch phoron, curry, rice, lentils, coconut, turmeric, chili, ginger, yogurt, mustard seeds, nigella",
  sri_lankan:
    "curry, rice, coconut, cinnamon, cardamom, curry leaves, turmeric, chili, tamarind, hoppers, kottu, sambol, jaggery, cashews",
  nepalese:
    "dal bhat, momo, curry, rice, lentils, cumin, coriander, turmeric, ginger, garlic, cardamom, timur, ghee, mustard oil",
  // Middle East
  turkish:
    "kebab, yogurt, eggplant, bulgur, hummus, baklava, dolma, börek, sumac, pomegranate molasses, tahini, lamb, olive oil, pistachios, raki",
  lebanese:
    "hummus, tabbouleh, pita, tahini, falafel, olive oil, garlic, lemon, parsley, mint, za'atar, sumac, kibbeh, labneh, pomegranate",
  persian:
    "rice, saffron, kebab, yogurt, pomegranate, herbs, tahdig, sumac, barberries, rosewater, pistachios, walnuts, lamb, dried limes, tahini",
  israeli:
    "hummus, falafel, tahini, pita, shakshuka, za'atar, halva, couscous, eggplant, chickpeas, sesame, lemon, olive oil, dates",
  syrian:
    "kibbeh, fattoush, shawarma, tahini, pomegranate molasses, sumac, bulgur, lamb, yogurt, olive oil, parsley, mint, chickpeas",
  iraqi:
    "masgouf, kubba, rice, dates, pomegranate molasses, sumac, cardamom, saffron, lamb, tahini, chickpeas, flatbread, tamarind",
  middle_eastern:
    "hummus, tahini, olive oil, chickpeas, lemon, garlic, cumin, coriander, sumac, za'atar, pomegranate, lamb, yogurt, flatbread, eggplant, parsley, mint",
  central_asian:
    "pilaf, lamb, cumin, coriander, yogurt, noodles, dumplings, flatbread, dried fruit, nuts, sesame, garlic, onions, carrots, mutton",
  // North Africa
  moroccan:
    "couscous, tagine, spices, lamb, dates, olives, preserved lemons, ras el hanout, cumin, cinnamon, saffron, harissa, almonds, argan oil, mint tea",
  north_african:
    "couscous, harissa, cumin, coriander, cinnamon, dates, olives, preserved lemons, chickpeas, lamb, semolina, mint, flatbread, ras el hanout",
  egyptian:
    "ful medames, koshari, falafel, tahini, cumin, coriander, lentils, chickpeas, rice, eggplant, molasses, dukkah, flatbread",
  // Sub-Saharan Africa
  west_african:
    "jollof rice, fufu, yam, cassava, plantain, peanuts, okra, palm oil, scotch bonnet, ginger, tomatoes, black-eyed peas, egusi",
  east_african:
    "injera, berbere, teff, lentils, chickpeas, coconut, cardamom, curry, ugali, maize, plantain, tamarind, chili, ginger",
  southern_african:
    "braai, biltong, pap, maize, chakalaka, peri-peri, boerewors, curry, coconut, chutney, bobotie, sweet potato, cassava",
  // Latin America
  mexican:
    "tortilla, beans, corn, chili, avocado, cilantro, lime, salsa, tacos, cumin, oregano, epazote, mole, tomatillo, chipotle, queso fresco, chocolate",
  peruvian:
    "ceviche, aji amarillo, quinoa, potatoes, corn, cilantro, lime, purple corn, pisco, anticuchos, causa, rocoto, lucuma, yuca",
  argentinian:
    "asado, chimichurri, beef, empanadas, dulce de leche, yerba mate, chorizo, provolone, oregano, parsley, garlic, red wine",
  colombian:
    "arepas, bandeja paisa, plantain, corn, beans, avocado, cilantro, aji, panela, coffee, yuca, coconut, hogao, cheese",
  chilean:
    "empanadas, pastel de choclo, seafood, corn, beef, avocado, merkén, cilantro, wine, pebre, potatoes, beans, dulce de leche",
  brazilian:
    "beans, rice, meat, farofa, churrasco, cassava, coconut, dendê oil, lime, cilantro, guaraná, açaí, passion fruit, cachaça, hearts of palm",
  latin_american:
    "corn, beans, chili, cilantro, lime, avocado, plantain, rice, cumin, garlic, tomatoes, tortillas, yuca, cassava, tropical fruits",
  // North America & Caribbean
  american:
    "burger, hot dog, barbecue, fries, steak, apple pie, maple syrup, cornbread, fried chicken, mac and cheese, ranch, bacon, cheddar, bourbon",
  cajun:
    "spicy, rice, seafood, gumbo, jambalaya, andouille, crawfish, file powder, holy trinity, cayenne, okra, hot sauce, blackened, creole seasoning",
  caribbean:
    "jerk, plantain, rice, beans, coconut, tropical fruit, scotch bonnet, allspice, lime, rum, mango, cassava, curry, callaloo, ackee",
} as const;

/**
 * Food category labels with descriptions for semantic similarity
 */
export const CATEGORY_LABELS = {
  appetizer: "starter, small bites, finger food, hors d'oeuvres, snacks",
  soup: "broth, liquid, warm, bowl, vegetables, stock",
  salad: "fresh, greens, vegetables, dressing, cold, lettuce",
  pasta: "noodles, spaghetti, penne, linguine, Italian, sauce",
  pizza: "dough, cheese, tomato sauce, toppings, Italian, oven-baked",
  rice: "grains, pilaf, risotto, fried rice, steamed, side dish",
  stew: "slow-cooked, thick, hearty, meat, vegetables, braised",
  roast: "oven-baked, meat, poultry, vegetables, whole, tender",
  grill: "barbecue, char, meat, vegetables, smoky, outdoor cooking",
  "stir-fry": "wok, quick-cooked, vegetables, Asian, high heat",
  baked: "oven, casserole, dish, cheese, golden, crispy",
  pastry: "dough, butter, flaky, sweet, croissant, tart, pie crust",
  dessert: "sweet, cake, cookies, pudding, chocolate, fruit, ice cream, sugar",
  beverage: "drink, liquid, coffee, tea, juice, smoothie, cocktail",
  preserves: "jam, pickle, fermented, canned, preserved, stored",
} as const;

/**
 * All label keys for easy iteration
 */
export const ALL_SEASON_KEYS = Object.keys(SEASON_LABELS) as Array<
  keyof typeof SEASON_LABELS
>;
export const ALL_CUISINE_KEYS = Object.keys(CUISINE_LABELS) as Array<
  keyof typeof CUISINE_LABELS
>;
export const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as Array<
  keyof typeof CATEGORY_LABELS
>;

/**
 * All labels combined
 */
export const ALL_LABELS = {
  ...SEASON_LABELS,
  ...CUISINE_LABELS,
  ...CATEGORY_LABELS,
} as const;

export type SeasonKey = keyof typeof SEASON_LABELS;
export type CuisineKey = keyof typeof CUISINE_LABELS;
export type CategoryKey = keyof typeof CATEGORY_LABELS;
export type LabelKey = SeasonKey | CuisineKey | CategoryKey;
