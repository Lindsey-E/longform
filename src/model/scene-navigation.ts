import type { Vault } from "obsidian";
import type { Draft, IndentedScene, MultipleSceneDraft } from "./types";

/**
 * 场景导航的定位参数
 */
export interface SceneNavigationLocation {
  position: "next" | "previous";
  maintainIndent: boolean;
}

// ─── 场景文件夹路径 ────────────────────────────────────────
/**
 * 获取场景文件夹的绝对路径（相对于仓库根目录）
 * 兼容旧版调用：sceneFolderPath(draft, vault)，vault 参数忽略
 */
export function sceneFolderPath(draft: MultipleSceneDraft): string;
export function sceneFolderPath(draft: Draft, vault?: Vault): string | null;
export function sceneFolderPath(draft: Draft, _vault?: Vault): string | null {
  if (draft.format !== "scenes") return null;
  const draftDir = draft.vaultPath.substring(
    0,
    draft.vaultPath.lastIndexOf("/")
  );
  // sceneFolder 内部存储的是相对于索引文件父目录的路径
  return `${draftDir}/${draft.sceneFolder}`.replace(/\/$/, "");
}

/**
 * 根据场景标题和目标文件夹路径生成场景文件的完整路径（如 new-draft-modal 中使用）
 */
export function scenePathForFolder(
  sceneTitle: string,
  folderPath: string
): string {
  return `${folderPath}/${sceneTitle}.md`;
}

// ─── 辅助函数 ──────────────────────────────────────────────
/**
 * 生成某个场景在仓库中的完整路径
 * 优先使用 scene.relativePath（不含 .md），否则用 scene.title
 */
function getSceneFilePath(
  scene: IndentedScene,
  draft: MultipleSceneDraft
): string {
  const relative = scene.relativePath ?? scene.title;
  const folderPath = sceneFolderPath(draft);
  return `${folderPath}/${relative}.md`;
}

// ─── 场景查找 ──────────────────────────────────────────────
/**
 * 在所有草稿中查找指定路径对应的场景，并附上索引、当前缩进等信息
 */
export function findScene(
  filePath: string,
  drafts: Draft[]
): (
  | IndentedScene
  & { draft: MultipleSceneDraft; index: number; currentIndent: number }
) | undefined {
  for (const draft of drafts) {
    if (draft.format !== "scenes") continue;
    const multiDraft = draft as MultipleSceneDraft;
    for (let i = 0; i < multiDraft.scenes.length; i++) {
      const scene = multiDraft.scenes[i];
      if (getSceneFilePath(scene, multiDraft) === filePath) {
        return {
          title: scene.title,
          indent: scene.indent,
          relativePath: scene.relativePath,
          draft: multiDraft,
          index: i,
          currentIndent: scene.indent,
        };
      }
    }
  }
  return undefined;
}

/**
 * findSceneWithVault 兼容旧版签名（忽略 vault 参数）
 */
export function findSceneWithVault(
  filePath: string,
  drafts: Draft[],
  _vault: Vault
): (
  | IndentedScene
  & { draft: MultipleSceneDraft; index: number; currentIndent: number }
) | undefined {
  return findScene(filePath, drafts);
}

// ─── 根据标题获取路径 ──────────────────────────────────────
/**
 * 根据场景标题、所属草稿和 vault 实例，返回场景文件路径（仅当文件实际存在时）
 */
export function scenePath(
  sceneTitle: string,
  draft: Draft,
  vault: Vault
): string | null {
  if (draft.format !== "scenes") return null;
  const scene = draft.scenes.find((s) => s.title === sceneTitle);
  if (!scene) return null;
  const path = getSceneFilePath(scene, draft);
  const file = vault.getAbstractFileByPath(path);
  return file ? path : null;
}

// ─── 场景导航（上一 / 下一场景）───────────────────────────
/**
 * 根据当前位置和当前文件路径，找到相邻场景的路径
 * 支持 maintainIndent 模式（只跳到同缩进级别）
 */
export function scenePathForLocation(
  location: SceneNavigationLocation,
  currentPath: string,
  drafts: Draft[],
  vault: Vault
): string | null {
  const currentScene = findScene(currentPath, drafts);
  if (!currentScene) return null;

  const draft = currentScene.draft;
  const scenes = draft.scenes;
  const currentIndex = currentScene.index;

  let targetIndex = -1;
  const step = location.position === "next" ? 1 : -1;
  let i = currentIndex + step;
  while (i >= 0 && i < scenes.length) {
    if (location.maintainIndent) {
      if (scenes[i].indent === scenes[currentIndex].indent) {
        targetIndex = i;
        break;
      }
    } else {
      targetIndex = i;
      break;
    }
    i += step;
  }
  if (targetIndex === -1) return null;

  const targetScene = scenes[targetIndex];
  return getSceneFilePath(targetScene, draft);
}

// ─── 根据路径反查草稿 ─────────────────────────────────────
/**
 * draftForPath: 根据文件路径返回它所属的 Draft 对象
 * - 如果是草稿索引文件本身，则直接返回该草稿
 * - 如果是某个草稿的场景文件，则返回其所属草稿
 */
export function draftForPath(
  filePath: string,
  drafts: Draft[],
  _vault: Vault
): Draft | undefined {
  const indexDraft = drafts.find((d) => d.vaultPath === filePath);
  if (indexDraft) return indexDraft;

  const sceneResult = findScene(filePath, drafts);
  if (sceneResult) return sceneResult.draft;

  return undefined;
}
