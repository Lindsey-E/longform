import { App, TFile, Vault } from "obsidian";
import { get, type Writable } from "svelte/store";

import type { Draft, IndentedScene, MultipleSceneDraft } from "./types";
import { scenePath } from "src/model/scene-navigation";
import { createNoteWithPotentialTemplate } from "./note-utils";
import { pluginSettings } from "./stores";

export function draftTitle(draft: Draft): string {
  return draft.draftTitle ?? draft.vaultPath;
}

type SceneInsertionLocation = {
  at: "before" | "after" | "end";
  relativeTo: number | null;
};

export async function createScene(
  app: App,
  path: string,
  index: number,
  draft: MultipleSceneDraft,
  open: boolean
): Promise<void> {
  const template = draft.sceneTemplate ?? get(pluginSettings).sceneTemplate;
  const note = await createNoteWithPotentialTemplate(app, path, template);
  if (note === null) return;

  if (get(pluginSettings).writeProperty) {
    await app.fileManager.processFrontMatter(note, (fm) => {
      fm["longform-order"] = index;
    });
  }

  if (open) {
    app.workspace.openLinkText(path, "/", false);
  }
}

export async function insertScene(
  app: App,
  draftsStore: Writable<Draft[]>,
  draft: MultipleSceneDraft,
  sceneName: string,
  vault: Vault,
  location: SceneInsertionLocation,
  open: boolean
) {
  // sceneName 目前只是名称，不含路径，所以新场景默认在根目录
  const newScene: IndentedScene = {
    title: sceneName,
    indent: 0,
    relativePath: sceneName, // 新场景直接映射为 sceneName.md
  };

  const newScenePath = scenePath(sceneName, draft, vault);

  if (!newScenePath || !draft || draft.format !== "scenes") {
    return;
  }

  draftsStore.update((allDrafts) => {
    return allDrafts.map((d) => {
      if (d.vaultPath === draft.vaultPath && d.format === "scenes") {
        if (location.at === "end") {
          d.scenes = [...d.scenes, newScene];
        } else {
          const relativeScene = d.scenes[location.relativeTo];
          const index =
            location.at === "before"
              ? location.relativeTo
              : location.relativeTo + 1;
          d.scenes.splice(index, 0, newScene);
        }
      }
      return d;
    });
  });

  await createScene(
    app,
    newScenePath,
    draft.scenes.findIndex((s) => s.title === sceneName),
    draft,
    open
  );
}

export function setDraftOnFrontmatterObject(
  obj: Record<string, any>,
  draft: Draft
) {
  obj["longform"] = {};
  obj["longform"]["format"] = draft.format;
  if (draft.titleInFrontmatter) {
    obj["longform"]["title"] = draft.title;
  }
  if (draft.draftTitle) {
    obj["longform"]["draftTitle"] = draft.draftTitle;
  }
  if (draft.workflow) {
    obj["longform"]["workflow"] = draft.workflow;
  }

  if (draft.format === "scenes") {
    obj["longform"]["sceneFolder"] = draft.sceneFolder;
    obj["longform"]["scenes"] = indentedScenesToArrays(draft.scenes);
    if (draft.sceneTemplate) {
      obj["longform"]["sceneTemplate"] = draft.sceneTemplate;
    }
    obj["longform"]["ignoredFiles"] = draft.ignoredFiles;
  }
}

export function indentedScenesToArrays(indented: IndentedScene[]) {
  const result: any = [];
  let currentIndent = 0;
  let currentNesting = result;
  const nestingAt: Record<number, any> = {};
  nestingAt[0] = currentNesting;

  indented.forEach(({ title, indent }) => {
    if (indent > currentIndent) {
      while (currentIndent < indent) {
        currentIndent = currentIndent + 1;
        const newNesting: any = [];
        currentNesting.push(newNesting);
        nestingAt[currentIndent] = newNesting;
        currentNesting = newNesting;
      }
    } else if (indent < currentIndent) {
      currentNesting = nestingAt[indent];
      currentIndent = indent;
    }

    currentNesting.push(title);
  });
  return result;
}

export function arraysToIndentedScenes(
  arr: any,
  result: IndentedScene[] = [],
  currentIndent = -1
): IndentedScene[] {
  if (arr instanceof Array) {
    if (arr.length === 0) {
      return result;
    }

    const next = arr.shift();
    const inner = arraysToIndentedScenes(next, [], currentIndent + 1);
    return arraysToIndentedScenes(arr, [...result, ...inner], currentIndent);
  } else {
    return [
      {
        title: arr,
        indent: currentIndent,
        // relativePath 不在序列化范围内，保持 undefined 即可，后续 draftFor 会补全
      },
    ];
  }
}

export type NumberedScene = IndentedScene & {
  numbering: number[];
};

export function numberScenes(scenes: IndentedScene[]): NumberedScene[] {
  const numbering = [0];
  let lastNumberedIndent = 0;

  return scenes.map((scene) => {
    const { indent } = scene;
    if (indent > lastNumberedIndent) {
      let fill = lastNumberedIndent + 1;
      while (fill <= indent) {
        numbering[fill] = 1;
        fill = fill + 1;
      }
      numbering[indent] = 0;
    } else if (indent < lastNumberedIndent) {
      const start = indent + 1;
      numbering.splice(start, numbering.length - start);
    }
    lastNumberedIndent = indent;

    numbering[indent] = numbering[indent] + 1;
    return {
      ...scene,
      numbering: [...numbering],
    };
  });
}

export function formatSceneNumber(numbering: number[]): string {
  return numbering.join(".");
}

export async function insertDraftIntoFrontmatter(
  app: App,
  path: string,
  draft: Draft
) {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    await app.vault.create(path, "");
  }

  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return;
  }
  try {
    await app.fileManager.processFrontMatter(file, (fm) => {
      setDraftOnFrontmatterObject(fm, draft);
    });
  } catch (error) {
    console.error(
      "[Longform] insertDraftIntoFrontmatter: processFrontMatter error:",
      error
    );
  }
}
