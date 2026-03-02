import * as Crypto from "expo-crypto";
import { storage } from "../storage";
import type { PhotoUri, RecipeId, SourceId, StorageKey, TagId } from "../types/primitives";
import type { Recipe } from "../types/recipe";
import { migrateIfNeeded } from "./photosToRecipesMigration";
import { tagsRepository } from "./tags";
import type { RecipeMetadataWrite, RecipeRepository } from "./types";

const RECIPES_KEY: StorageKey = "@recipes";

function stripRuntimeFields(recipe: Recipe): Recipe {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { thumbnailUri, ...persisted } = recipe;
  return { ...persisted, photoUri: persisted.id };
}

function dedupeTagIds(tagIds: Array<TagId>): Array<TagId> {
  return Array.from(new Set(tagIds));
}

function normalizeRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    photoUri: recipe.photoUri || recipe.id,
    status: recipe.status || "ready",
    metadata: {
      ...recipe.metadata,
      tagIds: Array.isArray(recipe.metadata?.tagIds)
        ? dedupeTagIds(recipe.metadata.tagIds)
        : [],
    },
  };
}

class AsyncStorageRecipeRepository implements RecipeRepository {
  private async readPersistedRecipes(): Promise<Array<Recipe>> {
    await migrateIfNeeded(RECIPES_KEY);

    const data = await storage.getItem(RECIPES_KEY);
    if (!data) {
      return [];
    }

    try {
      const recipes = JSON.parse(data) as Array<Recipe>;
      return recipes.map(normalizeRecipe);
    } catch {
      return [];
    }
  }

  private async writePersistedRecipes(recipes: Array<Recipe>): Promise<void> {
    await storage.setItem(
      RECIPES_KEY,
      JSON.stringify(recipes.map(stripRuntimeFields))
    );
  }

  private async withRuntimeUris(recipes: Array<Recipe>): Promise<Array<Recipe>> {
    const recipesWithUris = await Promise.all(
      recipes.map(async (recipe): Promise<Recipe> => {
        const photoUri = await storage.getPhoto(recipe.id);
        const thumbnailUri = await storage.getThumbnail(recipe.id);
        const finalPhotoUri = photoUri || recipe.photoUri || recipe.id;

        return {
          ...recipe,
          photoUri: finalPhotoUri,
          thumbnailUri: thumbnailUri || finalPhotoUri,
        };
      })
    );

    return recipesWithUris;
  }

  private getTagResolutionInput(
    metadata: Partial<RecipeMetadataWrite>
  ): { nextTagIds?: Array<TagId>; nextLabels?: Array<string> } | null {
    if (metadata.tags !== undefined) {
      return { nextLabels: metadata.tags };
    }

    if (metadata.tagIds !== undefined) {
      return { nextTagIds: dedupeTagIds(metadata.tagIds) };
    }

    return null;
  }

  async getAll(): Promise<Array<Recipe>> {
    const recipes = await this.readPersistedRecipes();
    const recipesWithUris = await this.withRuntimeUris(recipes);
    return recipesWithUris.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getById(id: RecipeId): Promise<Recipe | null> {
    const recipes = await this.getAll();
    return recipes.find((recipe) => recipe.id === id) ?? null;
  }

  async save(
    recipe: Omit<Recipe, "id" | "timestamp" | "metadata"> & {
      metadata: RecipeMetadataWrite;
    }
  ): Promise<Recipe> {
    const id = Crypto.randomUUID();
    const timestamp = Date.now();
    const tagResolutionInput = this.getTagResolutionInput(recipe.metadata) ?? {
      nextTagIds: [],
    };

    await storage.savePhoto(id, recipe.photoUri, timestamp);

    const newRecipe = await tagsRepository.mutateRecipeTags(
      {
        prevTagIds: [],
        ...tagResolutionInput,
      },
      async (resolvedNextTagIds): Promise<Recipe> => {
        const recipeToSave: Recipe = {
          id,
          photoUri: id,
          originalPhotoUri: recipe.originalPhotoUri,
          timestamp,
          metadata: {
            title: recipe.metadata.title,
            source: recipe.metadata.source,
            tagIds: resolvedNextTagIds,
          },
          recognizedText: recipe.recognizedText,
          status: recipe.status || "ready",
        };

        const recipes = await this.readPersistedRecipes();
        recipes.push(recipeToSave);
        await this.writePersistedRecipes(recipes);

        return recipeToSave;
      }
    );

    const photoUri = await storage.getPhoto(id);
    const finalPhotoUri = photoUri || id;

    try {
      await storage.saveThumbnail(id, finalPhotoUri);
    } catch {
      // Thumbnail failure must not break save
    }

    return {
      ...newRecipe,
      photoUri: finalPhotoUri,
    };
  }

  async update(id: RecipeId, metadata: RecipeMetadataWrite): Promise<Recipe> {
    const recipes = await this.readPersistedRecipes();
    const index = recipes.findIndex((recipe) => recipe.id === id);

    if (index === -1) {
      throw new Error(`Recipe with id ${id} not found`);
    }

    const previousTagIds = recipes[index].metadata.tagIds;
    const shouldUpdateTags =
      metadata.tags !== undefined || metadata.tagIds !== undefined;

    if (!shouldUpdateTags) {
      recipes[index] = {
        ...recipes[index],
        metadata: {
          title: metadata.title,
          source: metadata.source,
          tagIds: previousTagIds,
        },
      };

      await this.writePersistedRecipes(recipes);

      const runtimeRecipes = await this.withRuntimeUris([recipes[index]]);
      return runtimeRecipes[0];
    }

    const tagResolutionInput = this.getTagResolutionInput(metadata);
    if (!tagResolutionInput) {
      throw new Error("Tag resolution input required when updating tags");
    }

    const updatedRecipe = await tagsRepository.mutateRecipeTags(
      {
        prevTagIds: async (): Promise<Array<TagId>> => {
          const latestRecipes = await this.readPersistedRecipes();
          const latestIndex = latestRecipes.findIndex((recipe) => recipe.id === id);

          if (latestIndex === -1) {
            throw new Error(`Recipe with id ${id} not found`);
          }

          return latestRecipes[latestIndex].metadata.tagIds;
        },
        ...tagResolutionInput,
      },
      async (resolvedNextTagIds): Promise<Recipe> => {
        const latestRecipes = await this.readPersistedRecipes();
        const latestIndex = latestRecipes.findIndex((recipe) => recipe.id === id);

        if (latestIndex === -1) {
          throw new Error(`Recipe with id ${id} not found`);
        }

        latestRecipes[latestIndex] = {
          ...latestRecipes[latestIndex],
          metadata: {
            title: metadata.title,
            source: metadata.source,
            tagIds: resolvedNextTagIds,
          },
        };

        await this.writePersistedRecipes(latestRecipes);
        return latestRecipes[latestIndex];
      }
    );

    const runtimeRecipes = await this.withRuntimeUris([updatedRecipe]);
    return runtimeRecipes[0];
  }

  async delete(id: RecipeId): Promise<void> {
    const recipes = await this.readPersistedRecipes();
    const recipe = recipes.find((item) => item.id === id);
    const filtered = recipes.filter((item) => item.id !== id);

    await storage.deletePhoto(id);
    await storage.deleteThumbnail(id);

    if (!recipe) {
      await this.writePersistedRecipes(filtered);
      return;
    }

    await tagsRepository.mutateRecipeTags(
      {
        prevTagIds: async (): Promise<Array<TagId>> => {
          const latestRecipes = await this.readPersistedRecipes();
          const latestRecipe = latestRecipes.find((item) => item.id === id);
          return latestRecipe?.metadata.tagIds ?? [];
        },
        nextTagIds: [],
      },
      async (): Promise<void> => {
        const latestRecipes = await this.readPersistedRecipes();
        const latestFiltered = latestRecipes.filter((item) => item.id !== id);
        await this.writePersistedRecipes(latestFiltered);
      }
    );
  }

  async deleteMany(ids: Array<RecipeId>): Promise<void> {
    const uniqueIds = new Set(ids);
    if (uniqueIds.size === 0) {
      return;
    }

    await Promise.all(
      Array.from(uniqueIds).map(async (id): Promise<void> => {
        await storage.deletePhoto(id);
        await storage.deleteThumbnail(id);
      })
    );

    await tagsRepository.mutateMultipleRecipeDiffs(async () => {
      const recipes = await this.readPersistedRecipes();
      const recipesToDelete = recipes.filter((recipe) => uniqueIds.has(recipe.id));
      const remainingRecipes = recipes.filter((recipe) => !uniqueIds.has(recipe.id));

      await this.writePersistedRecipes(remainingRecipes);

      return {
        result: undefined,
        diffs: recipesToDelete.map((recipe) => ({
          prevTagIds: recipe.metadata.tagIds,
          nextTagIds: [],
        })),
      };
    });
  }

  async savePending(
    originalPhotoUri: PhotoUri,
    source?: SourceId
  ): Promise<Recipe> {
    const id = Crypto.randomUUID();
    const timestamp = Date.now();

    await storage.savePhoto(id, originalPhotoUri, timestamp);

    const newRecipe: Recipe = {
      id,
      photoUri: id,
      originalPhotoUri: id,
      timestamp,
      metadata: {
        source,
        tagIds: [],
      },
      status: "pending",
    };

    const recipes = await this.readPersistedRecipes();
    recipes.push(newRecipe);
    await this.writePersistedRecipes(recipes);

    const photoUri = await storage.getPhoto(id);
    const finalPhotoUri = photoUri || id;

    try {
      await storage.saveThumbnail(id, finalPhotoUri);
    } catch {
      // Thumbnail failure must not break import
    }

    return {
      ...newRecipe,
      photoUri: finalPhotoUri,
    };
  }

  async updateProcessing(id: RecipeId): Promise<void> {
    const recipes = await this.readPersistedRecipes();
    const index = recipes.findIndex((recipe) => recipe.id === id);

    if (index === -1) {
      throw new Error(`Recipe with id ${id} not found`);
    }

    recipes[index] = {
      ...recipes[index],
      status: "processing",
    };

    await this.writePersistedRecipes(recipes);
  }

  async updateComplete(
    id: RecipeId,
    processedPhotoUri: PhotoUri,
    recognizedText?: string,
    classifiedMetadata?: Partial<RecipeMetadataWrite>
  ): Promise<Recipe> {
    const timestamp = Date.now();
    await storage.savePhoto(id, processedPhotoUri, timestamp);

    const recipes = await this.readPersistedRecipes();
    const index = recipes.findIndex((recipe) => recipe.id === id);

    if (index === -1) {
      throw new Error(`Recipe with id ${id} not found`);
    }

    const existingRecipe = recipes[index];
    const shouldUpdateTags =
      classifiedMetadata?.tags !== undefined ||
      classifiedMetadata?.tagIds !== undefined;

    let updatedRecipe: Recipe;

    if (shouldUpdateTags) {
      const tagResolutionInput = this.getTagResolutionInput(classifiedMetadata ?? {});
      if (!tagResolutionInput) {
        throw new Error("Tag resolution input required when updating tags");
      }

      updatedRecipe = await tagsRepository.mutateRecipeTags(
        {
          prevTagIds: async (): Promise<Array<TagId>> => {
            const latestRecipes = await this.readPersistedRecipes();
            const latestRecipe = latestRecipes.find((recipe) => recipe.id === id);

            if (!latestRecipe) {
              throw new Error(`Recipe with id ${id} not found`);
            }

            return latestRecipe.metadata.tagIds;
          },
          ...tagResolutionInput,
        },
        async (resolvedNextTagIds): Promise<Recipe> => {
          const latestRecipes = await this.readPersistedRecipes();
          const latestIndex = latestRecipes.findIndex((recipe) => recipe.id === id);

          if (latestIndex === -1) {
            throw new Error(`Recipe with id ${id} not found`);
          }

          const latestRecipe = latestRecipes[latestIndex];

          latestRecipes[latestIndex] = {
            ...latestRecipe,
            photoUri: id,
            status: "ready",
            recognizedText,
            metadata: {
              source: latestRecipe.metadata.source,
              title: classifiedMetadata?.title || latestRecipe.metadata.title,
              tagIds: resolvedNextTagIds,
            },
          };

          await this.writePersistedRecipes(latestRecipes);
          return latestRecipes[latestIndex];
        }
      );
    } else {
      recipes[index] = {
        ...existingRecipe,
        photoUri: id,
        status: "ready",
        recognizedText,
        metadata: {
          source: existingRecipe.metadata.source,
          title: classifiedMetadata?.title || existingRecipe.metadata.title,
          tagIds: existingRecipe.metadata.tagIds,
        },
      };

      await this.writePersistedRecipes(recipes);
      updatedRecipe = recipes[index];
    }

    const photoUri = await storage.getPhoto(id);
    const finalPhotoUri = photoUri || id;

    try {
      await storage.saveThumbnail(id, finalPhotoUri);
    } catch {
      // Thumbnail failure must not break processing completion
    }

    return {
      ...updatedRecipe,
      photoUri: finalPhotoUri,
    };
  }

  async getPendingRecipes(): Promise<Array<Recipe>> {
    const recipes = await this.getAll();
    return recipes.filter((recipe) => recipe.status !== "ready");
  }
}

export const recipeRepository = new AsyncStorageRecipeRepository();
