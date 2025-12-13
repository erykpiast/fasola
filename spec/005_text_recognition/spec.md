We want to add text recognition pipeline inside the photo processor - after all the existing steps.

In native, the pipeline should use the built-in OCR features of the mobile OS
(e.g. `expo-text-**extractor**`).
In web, we should search for some lightweight ML library working efficiently in web browsers, maybe through WebGL?

The pipeline should return exactly the same image as the input one, but additionally it should store the recognized
text in external dedicated context. 

Then, the extracted text should be processed by some lightweight LLM on device.

The LLM or some other lightweight text processing algorithm should work off-thread to allow the user interact with the
form. I should extract from the recognized text few things.

1. Main recipe ingredients
3. General category of food (pasta, pizza, pastry, sweets, etc.)
3. Recipe title

The recognized title should populate the "title" field on in the add recipe form.

The category and ingredients should be passed to some lightweight categorization algorithms that should output proposed 
tags with confidence level:

1. The season of the year where the recipe fits best (spring, summer, autumn, winter)
2. The region of the world where the recipe comes from (asia, mediterranean, middle east, etc.)
3. The food general category itself

If the confidence level is above 80%, we should pre-populate tags in the add recipe form.
