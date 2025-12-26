/**
 * Label Definitions for Recipe Classification
 * Shared across native and web implementations
 */

/**
 * Season labels with descriptions for semantic similarity
 */
export const SEASON_LABELS = {
  whole_year:
    "all-season, year-round, everyday cooking, weeknight meals, pantry staples, comfort food, quick meals, meal prep, leftovers, one-pot, bread, flatbread, pasta, pizza, rice, soup, salad, stew, casserole, sandwich, breakfast, brunch, lunch, dinner, snack, appetizer, side dish, main course, dessert, beverage, baked, pastry, stir-fry, grill, roast, preserves, pickled, fermented",
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
  ukrainian:
    "borscht, varenyky, salo, cabbage, beets, sour cream, garlic, dill, buckwheat, sunflower oil, rye bread, pickled vegetables, mushrooms",
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
  southeast_asian:
    "rice, coconut milk, fish sauce, lemongrass, chili, lime, curry, garlic, ginger, galangal, tamarind, palm sugar, shrimp paste, peanuts, herbs",
  // South Asia
  indian:
    "curry, rice, naan, spices, turmeric, cumin, coriander, lentils, chickpeas, garam masala, ghee, cardamom, ginger, garlic, tamarind, paneer, chutney, basmati",
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
  appetizer:
    "starter, small bites, finger food, hors d'oeuvres, snacks, tapas, canapés, bruschetta, crostini, dip, spread, mezze, bite-size, party food",
  soup: "broth, liquid, warm, bowl, vegetables, stock, ramen, chowder, bisque, consommé, creamy soup, noodle soup, lentil soup, miso",
  salad:
    "fresh, greens, vegetables, dressing, cold, lettuce, vinaigrette, chopped salad, caesar, coleslaw, pasta salad, grain salad, cucumber salad, slaw",
  pasta:
    "noodles, spaghetti, penne, linguine, Italian, sauce, fettuccine, rigatoni, macaroni, ravioli, gnocchi, al dente, pesto, bolognese",
  pizza:
    "dough, cheese, tomato sauce, toppings, Italian, oven-baked, crust, mozzarella, pepperoni, slice, margherita, wood-fired, calzone, flatbread",
  rice: "grains, pilaf, risotto, fried rice, steamed, side dish, basmati, jasmine, rice bowl, paella, biryani, sushi rice, sticky rice, congee",
  stew: "slow-cooked, thick, hearty, meat, vegetables, braised, simmered, one-pot, goulash, chili, ragout, casserole, comfort food",
  roast:
    "oven-baked, meat, poultry, vegetables, whole, tender, roast chicken, pot roast, brisket, sunday roast, gravy, roasting, carved",
  grill:
    "barbecue, char, meat, vegetables, smoky, outdoor cooking, grilled, chargrilled, skewers, kebab, flame-grilled, BBQ sauce, grill marks",
  "stir-fry":
    "wok, quick-cooked, vegetables, Asian, high heat, soy sauce, garlic, ginger, sesame oil, wok hei, noodles, beef stir-fry, chicken stir-fry",
  baked:
    "oven, casserole, dish, cheese, golden, crispy, gratin, traybake, baked chicken, sheet pan, bubbling, crusty",
  pastry:
    "dough, butter, flaky, sweet, croissant, tart, pie crust, puff pastry, filo, danish, shortcrust, choux, laminated dough, turnover",
  dessert:
    "sweet, cake, cookies, pudding, chocolate, fruit, ice cream, sugar, brownie, cheesecake, pie, tart, custard, mousse, caramel",
  beverage:
    "drink, liquid, coffee, tea, juice, smoothie, cocktail, mocktail, soda, lemonade, latte, cocoa, shake, sparkling water",
  preserves:
    "jam, jelly, marmalade, pickle, pickled, fermented, canned, preserved, stored, chutney, relish, compote, confit, brine, cured",
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
