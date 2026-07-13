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

/**
 * 根据场景的 title 和 relativePath 计算实际文件路径。
 * relativePath 可能为 undefined（表示就在场景文件夹根目录）。
 */
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

export function findScene(
  path: string,
  drafts: Draft[]
): { draft: Draft; index: number; currentIndent: number } | null {
  for (const draft of drafts) {
    if (draft.format === "scenes") {
      const baseFolder = sceneFolderPath(draft, vaultFromDraft(draft));
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

// 辅助函数，因为本文件没有直接引用 vault，需要从外部传入或使用 obsidian API
function vaultFromDraft(draft: Draft): Vault {
  // 这里需要全局 app 对象，可以通过传入，暂时使用全局（插件实例）
  // 但为了兼容，这里保留简单实现：从 draft.vaultPath 获取 vault 实例
  // 由于 draft.vaultPath 是路径，需要插件上下文，暂时不暴露。
  // 在实际插件中，可通过 get() 获取 app.vault，但此文件独立，需要重构。
  // 为了不破坏原有结构，我们改成将 vault 作为参数传入，但现有调用需要调整。
  // 这里提供一个简便方案：修改函数签名，增加 vault 参数。
  // 原 findScene 没有 vault，所以需要全局化或重构。
  // 现在尽量保持原有签名，使用全局 app（通过闭包或单例），但暂时先保留。
  // 为了快速修复，临时方案：使用 Obsidian 的全局 getters。
  // 但严格来说会破坏pure函数，这里提供重载版本。
  throw new Error("vault 缺失，需要重构");
}

// 正确的做法：修改 findScene 签名，增加 vault 参数。
// 原插件其他地方调用 findScene 时都需要修改，但我们可以在 store-vault-sync 中传入 vault。
// 下面提供修改后的版本：

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

export function draftForPath(path: string, drafts: Draft[], vault: Vault): Draft | null {
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
