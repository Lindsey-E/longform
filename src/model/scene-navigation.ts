import type { Vault } from "obsidian";
import type { Draft, IndentedScene, MultipleSceneDraft } from "./types";

/**
 * 场景导航的定位参数
 */
export interface SceneNavigationLocation {
  position: "next" | "previous";
  maintainIndent: boolean;
}

// ─── 辅助函数 ────────────────────────────────────────────────

/**
 * 获取场景文件夹的绝对路径（相对于仓库根目录）
 * @param draft 必须是 scenes 格式的草稿
 */
export function sceneFolderPath(draft: MultipleSceneDraft): string;
export function sceneFolderPath(draft: Draft): string | null;
export function sceneFolderPath(draft: Draft): string | null {
  if (draft.format !== "scenes") return null;
  // sceneFolder 存储在 draft 中，是相对于草稿索引文件父目录的路径
  const draftDir = draft.vaultPath.substring(
    0,
    draft.vaultPath.lastIndexOf("/")
  );
  return `${draftDir}/${draft.sceneFolder}`.replace(/\/$/, "");
}

/**
 * scenePathForFolder: 对外暴露的场景文件夹路径（与 sceneFolderPath 相同语义）
 * 在 new-draft-modal 中被使用
 */
export function scenePathForFolder(draft: MultipleSceneDraft): string {
  return sceneFolderPath(draft);
}

/**
 * 根据场景对象和其所属的 scenes 格式草稿，生成该场景的完整文件路径
 * 优先使用 scene.relativePath（不含 .md），否则使用 scene.title
 */
function getSceneFilePath(scene: IndentedScene, draft: MultipleSceneDraft): string {
  const relative = scene.relativePath ?? scene.title;
  const folderPath = sceneFolderPath(draft);
  return `${folderPath}/${relative}.md`;
}

// ─── 场景查找函数（多处于 store-vault-sync / indentation / navigation 中调用） ──

/**
 * 在所有草稿中查找指定路径对应的场景，并附带草稿引用、索引、当前缩进信息
 */
export function findScene(
  filePath: string,
  drafts: Draft[]
): (IndentedScene & { draft: MultipleSceneDraft; index: number; currentIndent: number }) | undefined {
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
          currentIndent: scene.indent, // 兼容 indentation 命令的调用
        };
      }
    }
  }
  return undefined;
}

/**
 * findSceneWithVault 兼容旧版签名，忽略 vault 参数，直接调用 findScene
 */
export function findSceneWithVault(
  filePath: string,
  drafts: Draft[],
  _vault: Vault
): (IndentedScene & { draft: MultipleSceneDraft; index: number; currentIndent: number }) | undefined {
  return findScene(filePath, drafts);
}

// ─── 根据场景标题获取路径 ────────────────────────────────────

/**
 * 根据场景标题、所属草稿和 vault 实例，返回场景文件的仓库绝对路径
 * 仅在文件实际存在时返回路径，否则返回 null
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

// ─── 场景定位导航（上一场景 / 下一场景）────────────────────

/**
 * 核心导航函数：根据当前位置和当前文件路径，找到相邻场景的路径
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

// ─── 根据文件路径反查所属草稿（writing-session-tracker / main 等处使用） ──

/**
 * draftForPath: 根据文件路径，返回它所属的 Draft 对象
 * 如果文件是某个草稿的索引文件，直接返回该草稿；
 * 如果文件是某个草稿的场景，返回其所属草稿；
 * 否则返回 undefined。
 */
export function draftForPath(
  filePath: string,
  drafts: Draft[],
  _vault: Vault
): Draft | undefined {
  // 首先检查是否为草稿索引文件本身
  const indexDraft = drafts.find((d) => d.vaultPath === filePath);
  if (indexDraft) return indexDraft;

  // 检查是否为某个草稿的场景
  const sceneResult = findScene(filePath, drafts);
  if (sceneResult) return sceneResult.draft;

  return undefined;
}
