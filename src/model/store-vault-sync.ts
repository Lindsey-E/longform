import {
  normalizePath,
  TFile,
  type App,
  type CachedMetadata,
  type MetadataCache,
  type Vault,
} from "obsidian";
import { cloneDeep, isEqual } from "lodash";
import { get, type Unsubscriber } from "svelte/store";

import type { Draft } from "./types";
import {
  drafts as draftsStore,
  pluginSettings,
  waitingForSync,
  selectedDraftVaultPath,
} from "./stores";
import {
  arraysToIndentedScenes,
  formatSceneNumber,
  numberScenes,
  setDraftOnFrontmatterObject,
} from "src/model/draft-utils";
import { fileNameFromPath } from "./note-utils";
import { findScene, sceneFolderPath, scenePath } from "./scene-navigation";

type FileWithMetadata = {
  file: TFile;
  metadata: CachedMetadata;
};

export function resolveIfLongformFile(
  metadataCache: MetadataCache,
  file: TFile
): FileWithMetadata | null {
  const metadata = metadataCache.getFileCache(file);
  if (metadata && metadata.frontmatter && metadata.frontmatter["longform"]) {
    return { file, metadata };
  }
  return null;
}

export class StoreVaultSync {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private isInitializing = true;
  private settlingTime = 30000;

  private lastKnownDraftsByPath: Record<string, Draft> = {};
  private unsubscribeDraftsStore: Unsubscriber;

  private pathsToIgnoreNextChange: Set<string> = new Set();

  constructor(app: App) {
    this.app = app;
    this.vault = app.vault;
    this.metadataCache = app.metadataCache;
  }

  destroy(): void {
    this.unsubscribeDraftsStore();
  }

  private isSyncEnabled(): boolean {
    try {
      // @ts-ignore
      const syncPlugin = this.app.internalPlugins?.plugins?.sync;
      return syncPlugin?.enabled === true;
    } catch {
      return false;
    }
  }

  private async waitForSync(): Promise<void> {
    const settings = get(pluginSettings);
    if (!settings.waitForSync || !this.isSyncEnabled()) {
      return Promise.resolve();
    }

    try {
      // @ts-ignore
      const sync = this.app.internalPlugins.plugins.sync.instance;
      waitingForSync.set(true);

      if (!sync?.syncing) {
        return this.fallbackWait();
      }

      return new Promise((resolve) => {
        if (!sync.syncing) {
          waitingForSync.set(false);
          resolve();
          return;
        }

        console.log("[Longform] 正在等待活动同步完成...");

        const interval = setInterval(() => {
          if (!sync.syncing) {
            clearInterval(interval);
            clearTimeout(timeout);
            console.log("[Longform] 同步完成。");
            waitingForSync.set(false);
            resolve();
          }
          console.log("[Longform] 同步状态:", sync.syncStatus);
        }, 1000);

        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[Longform] 同步等待超时");
          waitingForSync.set(false);
          resolve();
        }, this.settlingTime);
      });
    } catch (error) {
      waitingForSync.set(false);
      return this.fallbackWait();
    }
  }

  private async fallbackWait(): Promise<void> {
    const settings = get(pluginSettings);
    if (!settings.fallbackWaitEnabled) {
      return Promise.resolve();
    }

    return new Promise(resolve =>
      setTimeout(resolve, settings.fallbackWaitTime * 1000)
    );
  }

  async initialize() {
    try {
      await this.waitForSync();
      await this.discoverDrafts();
      this.isInitializing = false;
    } catch (error) {
      this.isInitializing = false;
    }
  }

  async discoverDrafts() {
    const start = new Date().getTime();

    const files = this.vault.getMarkdownFiles();
    const resolvedFiles = files.map((f) =>
      resolveIfLongformFile(this.metadataCache, f)
    );
    const draftFiles = resolvedFiles.filter((f) => f !== null);

    const possibleDrafts = await Promise.all(
      draftFiles.map((f) => this.draftFor(f))
    );
    const drafts = possibleDrafts.filter((d) => d !== null);

    // 将脏数据写回索引文件
    const dirtyDrafts = drafts.filter((d) => d.dirty);
    for (const d of dirtyDrafts) {
      await this.writeDraftFrontmatter(d.draft);
    }

    const draftsToWrite = drafts.map((d) => d.draft);

    this.lastKnownDraftsByPath = cloneDeep(
      draftsToWrite.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
    draftsStore.set(draftsToWrite);

    const message = `[Longform] 已加载并监视项目。在 ${(new Date().getTime() - start) / 1000.0} 秒内找到 ${draftFiles.length} 个草稿。`;
    console.log(message);

    this.unsubscribeDraftsStore = draftsStore.subscribe(
      this.draftsStoreChanged.bind(this)
    );
  }

  async fileMetadataChanged(file: TFile, _data: string, cache: CachedMetadata) {
    if (this.isInitializing) return;
    if (this.pathsToIgnoreNextChange.delete(file.path)) {
      return;
    }

    const result = await this.draftFor({ file, metadata: cache });
    if (!result) {
      const testDeletedDraft = this.lastKnownDraftsByPath[file.path];
      if (testDeletedDraft) {
        draftsStore.update((drafts) => {
          return drafts.filter((d) => d.vaultPath !== file.path);
        });
      }
      return;
    }

    const { draft } = result;

    const old = this.lastKnownDraftsByPath[draft.vaultPath];
    if (!old || !isEqual(draft, old)) {
      this.lastKnownDraftsByPath[draft.vaultPath] = draft;
      draftsStore.update((drafts) => {
        const indexOfDraft = drafts.findIndex(
          (d) => d.vaultPath === draft.vaultPath
        );
        if (indexOfDraft < 0) {
          drafts.push(draft);
        } else {
          drafts[indexOfDraft] = draft;
        }
        return drafts;
      });
    }
  }

  async fileCreated(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);

    const scenePath = file.parent.path;
    const memberOfDraft = drafts.find((d) => {
      if (d.format !== "scenes") {
        return false;
      }
      const folderPath = sceneFolderPath(d, this.vault);
      // 检查文件是否在场景文件夹内（包括子目录）
      return (
        scenePath.startsWith(folderPath + "/") &&
        // 文件还不是已有场景（按标题匹配）
        !d.scenes.some((s) => s.title === file.basename)
      );
    });

    if (memberOfDraft) {
      draftsStore.update((allDrafts) => {
        return allDrafts.map((d) => {
          if (
            d.vaultPath === memberOfDraft.vaultPath &&
            d.format === "scenes"
          ) {
            const folderPath = sceneFolderPath(d, this.vault);
            let relative = file.path.substring(folderPath.length + 1);
            if (relative.endsWith(".md")) {
              relative = relative.slice(0, -3);
            }
            if (!d.unknownFiles.includes(relative)) {
              d.unknownFiles.push(relative);
            }
          }
          return d;
        });
      });
    }
  }

  async fileDeleted(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    const draftIndex = drafts.findIndex((d) => d.vaultPath === file.path);
    if (draftIndex >= 0) {
      // 索引文件被删除
      const newDrafts = cloneDeep(drafts);
      newDrafts.splice(draftIndex, 1);
      draftsStore.set(newDrafts);
      if (get(selectedDraftVaultPath) === file.path) {
        if (newDrafts.length > 0) {
          selectedDraftVaultPath.set(newDrafts[0].vaultPath);
        } else {
          selectedDraftVaultPath.set(null);
        }
      }
    } else {
      // 场景被删除
      const found = findScene(file.path, drafts);
      if (found) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === found.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes.splice(found.index, 1);
            }
            return d;
          });
        });
      } else {
        // 如果不在场景列表中，可能属于 unknownFiles
        const draftsWithUnknown = drafts.filter(
          d => d.format === "scenes"
        ) as MultipleSceneDraft[];
        for (const d of draftsWithUnknown) {
          const folderPath = sceneFolderPath(d, this.vault);
          if (file.path.startsWith(folderPath + "/")) {
            let relative = file.path.substring(folderPath.length + 1);
            if (relative.endsWith(".md")) {
              relative = relative.slice(0, -3);
            }
            const idx = d.unknownFiles.indexOf(relative);
            if (idx >= 0) {
              draftsStore.update((allDrafts) => {
                return allDrafts.map((draft) => {
                  if (draft.vaultPath === d.vaultPath) {
                    draft.unknownFiles.splice(idx, 1);
                  }
                  return draft;
                });
              });
              break;
            }
          }
        }
      }
    }
  }

  async fileRenamed(file: TFile, oldPath: string) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    const draftIndex = drafts.findIndex((d) => d.vaultPath === oldPath);
    if (draftIndex >= 0) {
      // 索引文件被重命名
      draftsStore.update((_drafts) => {
        const d = _drafts[draftIndex];
        d.vaultPath = file.path;
        if (!d.titleInFrontmatter) {
          d.title = fileNameFromPath(file.path);
        }
        _drafts[draftIndex] = d;
        return _drafts;
      });
      if (get(selectedDraftVaultPath) === oldPath) {
        selectedDraftVaultPath.set(file.path);
      }
    } else {
      // 场景被重命名
      const newTitle = fileNameFromPath(file.path);
      const foundOld = findScene(oldPath, drafts);

      const oldParent = oldPath.split("/").slice(0, -1).join("/");
      const newParent = file.parent.path;

      // 原地重命名（父文件夹未变）
      if (foundOld && oldParent === newParent) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === foundOld.draft.vaultPath &&
              d.format === "scenes"
            ) {
              const scene = d.scenes[foundOld.index];
              scene.title = newTitle;
              // 更新 relativePath
              const oldRelative = scene.relativePath ?? scene.title;
              const newRelative = oldRelative.replace(
                new RegExp(scene.title + "$"),
                newTitle
              );
              scene.relativePath = newRelative;
            }
            return d;
          });
        });
      } else {
        // 移出或移入
        // 移出旧草稿
        const oldDraft = drafts.find((d) => {
          if (d.format !== "scenes") return false;
          const folder = sceneFolderPath(d, this.vault);
          return (
            oldParent.startsWith(folder + "/") || oldParent === folder
          );
        });
        if (oldDraft) {
          const oldFolder = sceneFolderPath(oldDraft, this.vault);
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === oldDraft.vaultPath && d.format === "scenes") {
                // 从 scenes 中移除
                d.scenes = d.scenes.filter((s) => {
                  const sceneFile = scenePath(s.title, d, this.vault);
                  return sceneFile !== oldPath;
                });
                // 从 unknownFiles 中移除
                let relOld = oldPath.substring(oldFolder.length + 1);
                if (relOld.endsWith(".md")) relOld = relOld.slice(0, -3);
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== relOld
                );
              }
              return d;
            });
          });
        }

        // 移入新草稿
        const newDraft = drafts.find((d) => {
          if (d.format !== "scenes") return false;
          const folder = sceneFolderPath(d, this.vault);
          return (
            newParent.startsWith(folder + "/") || newParent === folder
          );
        });
        if (newDraft) {
          const newFolder = sceneFolderPath(newDraft, this.vault);
          let relNew = file.path.substring(newFolder.length + 1);
          if (relNew.endsWith(".md")) relNew = relNew.slice(0, -3);
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === newDraft.vaultPath && d.format === "scenes") {
                if (!d.unknownFiles.includes(relNew)) {
                  d.unknownFiles.push(relNew);
                }
              }
              return d;
            });
          });
        }
      }
    }
  }

  async draftsStoreChanged(newValue: Draft[]) {
    for (const draft of newValue) {
      const old = this.lastKnownDraftsByPath[draft.vaultPath];
      if (!old || !isEqual(draft, old)) {
        this.pathsToIgnoreNextChange.add(draft.vaultPath);
        await this.writeDraftFrontmatter(draft);
      }
    }

    this.lastKnownDraftsByPath = cloneDeep(
      newValue.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
  }

  private async draftFor(
    fileWithMetadata: FileWithMetadata
  ): Promise<{ draft: Draft; dirty: boolean } | null> {
    if (!fileWithMetadata.metadata.frontmatter) {
      return null;
    }
    const longformEntry = fileWithMetadata.metadata.frontmatter["longform"];
    if (!longformEntry) {
      return null;
    }
    const format = longformEntry["format"];
    const vaultPath = fileWithMetadata.file.path;
    let title = longformEntry["title"];
    let titleInFrontmatter = true;
    if (!title) {
      titleInFrontmatter = false;
      title = fileNameFromPath(vaultPath);
    }
    const workflow = longformEntry["workflow"] ?? null;
    const draftTitle = longformEntry["draftTitle"] ?? null;

    if (format === "scenes") {
      let rawScenes: any = longformEntry["scenes"] ?? [];

      if (rawScenes.length === 0) {
        let fm = null;
        try {
          await this.app.fileManager.processFrontMatter(
            fileWithMetadata.file,
            (_fm) => {
              fm = _fm;
            }
          );
        } catch (error) {
          console.error(
            "[Longform] 手动加载前置元数据时出错:",
            error
          );
        }

        if (fm) {
          rawScenes = fm["longform"]["scenes"];
        }
      }

      const scenes = arraysToIndentedScenes(rawScenes);
      const sceneFolder = longformEntry["sceneFolder"] ?? "/";
      const sceneTemplate = longformEntry["sceneTemplate"] ?? null;
      const ignoredFiles: string[] = longformEntry["ignoredFiles"] ?? [];
      const normalizedSceneFolder = normalizePath(
        `${fileWithMetadata.file.parent.path}/${sceneFolder}`
      );

      // 扫描场景文件夹内所有 markdown 文件（递归）
      let allSceneFiles: { relative: string; basename: string; path: string }[] = [];
      if (await this.vault.adapter.exists(normalizedSceneFolder)) {
        const allFiles = this.vault.getFiles();
        allSceneFiles = allFiles
          .filter(
            (f) =>
              f.path.startsWith(normalizedSceneFolder + "/") &&
              f.path !== fileWithMetadata.file.path &&
              f.path.endsWith(".md")
          )
          .map((f) => {
            const relative = f.path
              .substring(normalizedSceneFolder.length + 1)
              .replace(/\.md$/, "");
            return {
              relative,
              basename: fileNameFromPath(f.path),
              path: f.path,
            };
          });
      }

      // 建立 basename -> relativePath 映射，用于补全现有场景
      const basenameToRelative: Record<string, string> = {};
      for (const fileInfo of allSceneFiles) {
        // 如果同一个 basename 多次出现，优先使用直接子文件夹下的路径
        if (!basenameToRelative[fileInfo.basename] || !fileInfo.relative.includes("/")) {
          basenameToRelative[fileInfo.basename] = fileInfo.relative;
        }
      }

      // 为已有场景设置 relativePath（如果缺失）
      for (const scene of scenes) {
        if (!scene.relativePath) {
          scene.relativePath = basenameToRelative[scene.title] ?? scene.title;
        }
      }

      // 过滤掉已被移除的场景（即文件在磁盘上仍然存在）
      const knownScenes = scenes.filter(({ title, relativePath }) =>
        allSceneFiles.some(
          (f) =>
            f.basename === title ||
            f.relative === relativePath
        )
      );

      const dirty = knownScenes.length !== scenes.length;

      const existingPaths = new Set(knownScenes.map(s => s.relativePath));
      const newScenes = allSceneFiles.filter(
        (f) => !existingPaths.has(f.relative)
      );

      // 应用 ignoredFiles 过滤
      const ignoredRegexes = ignoredFiles
        .filter(n => n)
        .map((p) => ignoredPatternToRegex(p));
      const unknownFiles = newScenes
        .filter(
          (s) =>
            !ignoredRegexes.some((r) => r.test(s.relative)) &&
            !ignoredRegexes.some((r) => r.test(s.basename))
        )
        .map(s => s.relative);

      return {
        draft: {
          format: "scenes",
          title,
          titleInFrontmatter,
          draftTitle,
          vaultPath,
          sceneFolder,
          scenes: knownScenes,
          ignoredFiles,
          unknownFiles,
          sceneTemplate,
          workflow,
        },
        dirty,
      };
    } else if (format === "single") {
      return {
        draft: {
          format: "single",
          title,
          titleInFrontmatter,
          draftTitle,
          vaultPath,
          workflow,
        },
        dirty: false,
      };
    } else {
      console.log(
        `[Longform] 加载草稿时出错 ${fileWithMetadata.file.path}：无效的 longform.format。已忽略。`
      );
      return null;
    }
  }

  private async writeDraftFrontmatter(draft: Draft) {
    const file = this.app.vault.getAbstractFileByPath(draft.vaultPath);
    if (!file || !(file instanceof TFile)) {
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      setDraftOnFrontmatterObject(fm, draft);
    });

    if (get(pluginSettings).writeProperty) {
      if (draft.format === "scenes") {
        const writes: Promise<void>[] = [];
        const sceneNumbers = numberScenes(draft.scenes);
        sceneNumbers.forEach((numberedScene, index) => {
          const sceneFilePath = scenePath(
            numberedScene.title,
            draft,
            this.app.vault
          );

          const sceneFile = this.app.vault.getAbstractFileByPath(sceneFilePath);
          if (!(sceneFile instanceof TFile)) {
            return;
          }
          writes.push(
            writeSceneNumbers(
              this.app,
              sceneFile,
              index,
              numberedScene.numbering
            )
          );
        });

        await Promise.all(writes);
      }
    }
  }
}

export function syncSceneIndices(app: App): void | Promise<void[]> {
  const writes: Promise<void>[] = [];
  get(draftsStore).forEach((draft) => {
    if (draft.format !== "scenes") return;
    numberScenes(draft.scenes).map((numberedScene, index) => {
      const sceneFilePath = scenePath(numberedScene.title, draft, app.vault);
      const sceneFile = app.vault.getAbstractFileByPath(sceneFilePath);
      if (!(sceneFile instanceof TFile)) {
        return;
      }
      return writeSceneNumbers(app, sceneFile, index, numberedScene.numbering);
    });
  });
  if (writes.length === 0) return;
  return Promise.all(writes);
}

function writeSceneNumbers(
  app: App,
  file: TFile,
  index: number,
  numbering: number[]
) {
  return app.fileManager.processFrontMatter(file, (fm) => {
    fm["longform-order"] = index;
    fm["longform-number"] = formatSceneNumber(numbering);
  });
}

const ESCAPED_CHARACTERS = new Set("/&$^+.()=!|[]{},".split(""));
function ignoredPatternToRegex(pattern: string): RegExp {
  let regex = "";

  for (let index = 0; index < pattern.length; index++) {
    const c = pattern[index];

    if (ESCAPED_CHARACTERS.has(c)) {
      regex += "\\" + c;
    } else if (c === "*") {
      regex += ".*";
    } else if (c === "?") {
      regex += ".";
    } else {
      regex += c;
    }
  }

  return new RegExp(`^${regex}$`);
}
