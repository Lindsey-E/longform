import type { Vault } from "obsidian";

/**
 * 场景导航的定位参数
 */
export interface SceneNavigationLocation {
  position: "next" | "previous";
  maintainIndent: boolean;
}

/**
 * 草稿和场景的极简接口声明（与项目中实际类型兼容）
 * 如果你的 types 文件中有更完整的定义，可以改为从 './types' 导入
 */
interface Scene {
  title: string;
  indent: number;
}

interface Draft {
  vaultPath: string;
  format: string;
  scenes: Scene[];
}

/**
 * 根据场景标题和草稿，生成该场景在仓库中的完整路径
 * 假设场景文件与草稿索引文件在同一目录下，文件名 = 场景标题 + ".md"
 */
function getSceneFilePath(scene: Scene, draft: Draft): string {
  const indexDir = draft.vaultPath.substring(
    0,
    draft.vaultPath.lastIndexOf("/")
  );
  return `${indexDir}/${scene.title}.md`;
}

/**
 * 在所有草稿的场景列表中，查找给定文件路径对应的场景
 * 返回的场景对象上会附加对所属草稿的引用
 */
export function findScene(
  filePath: string,
  drafts: Draft[]
): (Scene & { draft: Draft }) | undefined {
  for (const draft of drafts) {
    if (draft.format !== "scenes") continue;
    for (const scene of draft.scenes) {
      if (getSceneFilePath(scene, draft) === filePath) {
        return Object.assign({}, scene, { draft });
      }
    }
  }
  return undefined;
}

/**
 * findSceneWithVault 与 findScene 功能相同（兼容旧版调用）
 */
export function findSceneWithVault(
  filePath: string,
  drafts: Draft[],
  vault: Vault
): (Scene & { draft: Draft }) | undefined {
  return findScene(filePath, drafts);
}

/**
 * 根据场景标题、所属草稿和 vault 实例，返回场景文件的绝对路径
 */
export function scenePath(
  sceneTitle: string,
  draft: Draft,
  vault: Vault
): string | null {
  const path = getSceneFilePath({ title: sceneTitle, indent: 0 }, draft);
  const file = vault.getAbstractFileByPath(path);
  if (file) {
    return path;
  }
  return null;
}

/**
 * 核心导航函数：根据当前位置 (location) 和当前文件路径，找到相邻场景的路径
 * @returns 目标场景路径，或 null
 */
export function scenePathForLocation(
  location: SceneNavigationLocation,
  currentPath: string,
  drafts: Draft[],
  vault: Vault
): string | null {
  const currentScene = findScene(currentPath, drafts);
  if (!currentScene) {
    return null; // 当前文件不是任何草稿的场景
  }

  const draft = currentScene.draft;
  if (!draft || draft.format !== "scenes") {
    return null;
  }

  const scenes = draft.scenes;
  const currentIndex = scenes.findIndex((s) => s.title === currentScene.title);
  if (currentIndex === -1) {
    return null;
  }

  // 根据 position 和 maintainIndent 寻找目标索引
  let targetIndex = -1;
  const step = location.position === "next" ? 1 : -1;
  let i = currentIndex + step;

  while (i >= 0 && i < scenes.length) {
    if (location.maintainIndent) {
      // 保持缩进级别：只跳到同缩进级别的场景
      if (scenes[i].indent === scenes[currentIndex].indent) {
        targetIndex = i;
        break;
      }
    } else {
      // 直接跳到相邻场景（不限制缩进）
      targetIndex = i;
      break;
    }
    i += step;
  }

  if (targetIndex === -1) {
    return null;
  }

  const targetScene = scenes[targetIndex];
  return getSceneFilePath(targetScene, draft);
}
