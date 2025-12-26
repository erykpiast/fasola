# Text Classifier CLI

A command-line tool for testing the text classifier in Node.js.

## Overview

This CLI script uses the same classification logic as the web version but runs directly in Node.js without Web Workers. It uses Transformers.js with MiniLM sentence embeddings to perform semantic similarity-based classification on recipe text and extract metadata like title and tags.

## Prerequisites

The CLI requires `tsx` to run TypeScript files directly in Node.js:

```bash
npm install -g tsx
```

Alternatively, you can use `npx tsx` (which will automatically download and use tsx).

## Usage

### Basic Usage

```bash
npx tsx lib/text-classifier/cli.ts <text-file-path>
```

### Using the npm script

```bash
npm run test-classifier <text-file-path>
```

### Examples

Test with the provided sample file:

```bash
npm run test-classifier lib/text-classifier/sample.txt
```

Test with your own file:

```bash
npm run test-classifier path/to/your/recipe.txt
```

## What it does

The script performs the following steps:

1. **Title Extraction**: Uses heuristics to extract the recipe title from the text
2. **Model Loading**: Downloads and loads the MiniLM embedding model (first run only, ~50MB)
3. **Label Embeddings**: Computes sentence embeddings for all 44 labels across three dimensions:
   - **Seasons**: spring, summer, autumn, winter
   - **Cuisines**: italian, french, spanish, greek, chinese, japanese, mexican, etc.
   - **Food Categories**: appetizer, soup, salad, pasta, dessert, etc.
4. **Classification**: Classifies the text using cosine similarity against label embeddings
5. **Results**: Displays all tags grouped by category with similarity scores (threshold: 0.453)

## Output

The script outputs:

- Extracted title
- Model loading progress
- Classification progress for each category
- Final results with:
  - Tag suggestions grouped by category
  - Confidence scores as percentages
  - Total processing time

## Example Output

```
============================================================
TEXT CLASSIFIER TEST (MiniLM Embeddings)
============================================================

Extracting title...
Title: pizza dough dinner tomatoes

Loading MiniLM embedding model (this may take a moment)...
Model loaded!

Computing label embeddings...
Cached 44 label embeddings

Classifying text...

============================================================
RESULTS
============================================================

Tag Suggestions (similarity scores):

  CUISINE:
    #italian             0.507 █████████████████████████

  FOOD-CATEGORY:
    #pizza               0.659 ████████████████████████████████
    #pasta               0.471 ███████████████████████

Processing time: 181ms (0.2s)
```

## Notes

- **First Run**: The first run will download the MiniLM model (~50MB) and take longer
- **Subsequent Runs**: The model is cached locally, making subsequent runs much faster
- **Similarity Threshold**: Only tags with similarity >= 0.453 are shown
- **Scoring**: Scores range from 0 to 1, where higher values indicate stronger semantic similarity

## Troubleshooting

### Model Download Issues

If model download fails, check your internet connection and try again. The model is downloaded from Hugging Face and cached in `~/.cache/huggingface/`.

### Out of Memory

If you encounter memory issues, the model may be too large for your system. The CLI uses MiniLM which is a lightweight model, but still requires ~300MB RAM.

### File Not Found

Make sure the file path is correct and the file exists. Use absolute paths if relative paths don't work.

