import { normalizePath, type Vault } from "obsidian";
import type { Draft, MultipleSceneDraft } from "./types";

export function projectFolderPath(draft: Draft, vault: Vault): string {
  return vault.getAbstractFileByPath(draft.vaultPath).parent.path;
}

export function sceneFolderPath(
  draft: MultipleSceneDraft,
  vault: Vault
): string {
  const root = vault.getAbstractFileByPath(draft.vaultPath).parent.path;
  return normalizePath(`${root}/${draft.sceneFolder}`);
}

export function scenePathForFolder(
  sceneName: string,
  folderPath: string
): string {
  return normalizePath(`${folderPath}/${sceneName}.md`);
}

export function scenePath(
  sceneName: string,
  draft: MultipleSceneDraft,
  vault: Vault
): string {
  const baseFolder = sceneFolderPath(draft, vault);
  const scene = draft.scenes.find(s => s.title === sceneName);
  if (scene && scene.relativePath) {
    return normalizePath(`${baseFolder}/${scene.relativePath}.md`);
  }
  return scenePathForFolder(sceneName, baseFolder);
}

export function findSceneWithVault(
  path: string,
  drafts: Draft[],
  vault: Vault
): { draft: Draft; index: number; currentIndent: number } | null {
  for (const draft of drafts) {
    if (draft.format === "scenes") {
      const baseFolder = sceneFolderPath(draft, vault);
      for (let i = 0; i < draft.scenes.length; i++) {
        const scene = draft.scenes[i];
        const computedPath = scene.relativePath
          ? normalizePath(`${baseFolder}/${scene.relativePath}.md`)
          : normalizePath(`${baseFolder}/${scene.title}.md`);
        if (computedPath === path) {
          return { draft, index: i, currentIndent: scene.indent };
        }
      }
    }
  }
  return null;
}

export function draftForPath(
  path: string,
  drafts: Draft[],
  vault: Vault
): Draft | null {
  for (const draft of drafts) {
    if (draft.vaultPath === path) {
      return draft;
    } else {
      const found = findSceneWithVault(path, drafts, vault);
      if (found) {
        return found.draft;
      }
    }
  }
  return null;
}

export type SceneNavigationLocation = {
  position: "next" | "previous";
  maintainIndent: boolean;
};

export function scenePathForLocation(
  location: SceneNavigationLocation,
  path: string,
  drafts: Draft[],
  vault: Vault
): string | null {
  const found = findSceneWithVault(path, drafts, vault);
  if (!found) return null;

  const draft = found.draft as MultipleSceneDraft;
  const scenes = draft.scenes;
  const index = found.index;

  if (location.position === "next" && index < scenes.length - 1) {
    const nextScene = scenes[index + 1];
    return scenePath(nextScene.title, draft, vault);
  } else if (location.position === "previous" && index > 0) {
    const prevScene = scenes[index - 1];
    return scenePath(prevScene.title, draft, vault);
  }
  return null;
}
