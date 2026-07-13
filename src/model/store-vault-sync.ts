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

/**
 * 观察所有带有 `longform` 元数据条目的文件，并保持其元数据和关联场景（如果有）在 `drafts` 存储中更新。
 *
 * 订阅 `drafts` 存储并将其中的更改记录到磁盘。
 *
 * 因此，保持存储与 vault 之间的同步。
 */
export class StoreVaultSync {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private isInitializing = true;
  private settlingTime = 30000; // 后备等待时间（毫秒）

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
      // @ts-ignore - 访问私有 API
      const syncPlugin = this.app.internalPlugins?.plugins?.sync;
      return syncPlugin?.enabled === true;
    } catch {
      return false;
    }
  }

  private async waitForSync(): Promise<void> {
    const settings = get(pluginSettings);

    // 首先检查设置中的“等待同步”或 Sync 插件本身是否已启用
    if (!settings.waitForSync || !this.isSyncEnabled()) {
      return Promise.resolve();
    }

    try {
      // @ts-ignore - 访问私有 API
      const sync = this.app.internalPlugins.plugins.sync.instance;

      // 设置 waitingForSync 以禁用监视器并启用加载动画
      waitingForSync.set(true);

      // 如果无法访问同步状态（可能是由于 Sync 插件 API 更改），则使用后备等待
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

        // 每秒轮询同步状态
        const interval = setInterval(() => {
          if (!sync.syncing) {
            clearInterval(interval);
            clearTimeout(timeout);  // 同步完成时清除超时
            console.log("[Longform] 同步完成。");
            waitingForSync.set(false);
            resolve();
          }
          console.log("[Longform] 同步状态:", sync.syncStatus);
        }, 1000);

        // 添加超时以防同步永远不会完成
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

    // 将发现的草稿写入草稿存储
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
        // 草稿的 YAML 前置元数据被移除，从草稿列表中删除
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
          // 新草稿
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

    // 检查是否有新的场景被移动到此文件夹中
    const scenePath = file.parent.path;
    const memberOfDraft = drafts.find((d) => {
      if (d.format !== "scenes") {
        return false;
      }
      const parentPath = this.vault.getAbstractFileByPath(d.vaultPath).parent
        .path;
      const targetPath = normalizePath(`${parentPath}/${d.sceneFolder}`);
      return (
        // 文件在场景文件夹中
        targetPath === scenePath &&
        // 文件还不是已有场景
        !d.scenes.map((s) => s.title).contains(file.basename)
      );
    });
    if (memberOfDraft) {
      draftsStore.update((allDrafts) => {
        return allDrafts.map((d) => {
          if (
            d.vaultPath === memberOfDraft.vaultPath &&
            d.format === "scenes" &&
            !d.unknownFiles.contains(file.basename)
          ) {
            d.unknownFiles.push(file.basename);
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
      // 索引文件被删除 = 从存储中移除草稿
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
      // 场景被删除 = 从草稿中移除场景
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
        // 检查未知文件，如果存在就从那里删除
        const inDraftUnknown = drafts.find(
          (d) => d.format === "scenes" && d.unknownFiles.contains(file.basename)
        );
        if (inDraftUnknown) {
          draftsStore.update((allDrafts) => {
            return allDrafts.map((d) => {
              if (
                d.vaultPath === inDraftUnknown.vaultPath &&
                d.format === "scenes"
              ) {
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
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

      // 可能的情况：
      // 1. 原地重命名：在关联草稿中重命名场景
      // 2. 移出草稿：从旧草稿中移除
      // 3. 移入草稿：添加到新草稿
      // (2) 和 (3) 可能同时发生。

      // 原地重命名
      const oldParent = oldPath.split("/").slice(0, -1).join("/");
      if (foundOld && oldParent === file.parent.path) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === foundOld.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes[foundOld.index].title = newTitle;
            }
            return d;
          });
        });
      } else {
        // 移出或移入操作

        // 移出草稿
        const oldDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === oldParent
          );
        });
        if (oldDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === oldDraft.vaultPath && d.format === "scenes") {
                d.scenes = d.scenes.filter((s) => s.title !== file.basename);
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
        }

        // 移入草稿
        const newDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === file.parent.path
          );
        });
        if (newDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === newDraft.vaultPath && d.format === "scenes") {
                d.unknownFiles.push(file.basename);
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

  // 如果 dirty 为 true，表示草稿与索引文件的实际内容不一致，需要写回索引文件
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
        // 处理元数据缓存可能无法正确识别 YAML 数组的问题。
        // 这种情况下，它报告数组为空，但实际上并非如此，
        // 因此我们直接从文件内容中解析 YAML，以防万一。
        // discord 讨论：https://discord.com/channels/686053708261228577/840286264964022302/994589562082951219

        // 2023-01-03：确认此问题仍然存在；但使用新的 processFrontMatter 函数似乎能正确读取！

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

      // 转换为缩进场景
      const scenes = arraysToIndentedScenes(rawScenes);
      const sceneFolder = longformEntry["sceneFolder"] ?? "/";
      const sceneTemplate = longformEntry["sceneTemplate"] ?? null;
      const ignoredFiles: string[] = longformEntry["ignoredFiles"] ?? [];
      const normalizedSceneFolder = normalizePath(
        `${fileWithMetadata.file.parent.path}/${sceneFolder}`
      );

      let filenamesInSceneFolder: string[] = [];
      if (await this.vault.adapter.exists(normalizedSceneFolder)) {
        // 递归收集场景文件夹内（包括子目录）的所有 markdown 文件
        const allFiles = this.vault.getFiles();
        filenamesInSceneFolder = allFiles
          .filter(
            (f) =>
              f.path.startsWith(normalizedSceneFolder + "/") &&
              f.path !== fileWithMetadata.file.path &&
              f.path.endsWith(".md")
          )
          .map((f) => f.basename)
          .filter((name) => name !== null && name !== undefined);
      }

      // 过滤掉已被移除的场景
      const knownScenes = scenes.filter(({ title }) =>
        filenamesInSceneFolder.contains(title)
      );

      const dirty = knownScenes.length !== scenes.length;

      const sceneTitles = new Set(scenes.map((s) => s.title));
      const newScenes = filenamesInSceneFolder.filter(
        (s) => !sceneTitles.has(s)
      );

      // 根据 ignoredFiles 忽略所有已知应忽略的新场景
      const ignoredRegexes = ignoredFiles.filter(n => n).map((p) => ignoredPatternToRegex(p));
      const unknownFiles = newScenes.filter(
        (s) => ignoredRegexes.find((r) => r.test(s)) === undefined
      );

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

    // 对于多场景项目，可选地在每个场景上设置一个属性来保存其在项目中的顺序
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
          // 文件夹或未找到时为 false
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
      // 文件夹或未找到时为 false
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
