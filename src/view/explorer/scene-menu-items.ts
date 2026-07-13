import { drafts, selectedDraft } from "src/model/stores";
import type { MultipleSceneDraft } from "src/model/types";
import { get } from "svelte/store";

const getSelectedDraftWithIndex = () => {
  const draft = get(selectedDraft) as MultipleSceneDraft;
  if (!draft) {
    return { index: -1, draft };
  }
  const index = get(drafts).findIndex((d) => d.vaultPath === draft.vaultPath);
  return { index, draft };
};

export const addScene = (fileName: string) => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) return;
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      // 1. 浅拷贝数组，避免直接修改原数组
      const newDrafts = [...d];
      // 2. 浅拷贝当前草稿对象
      const targetDraft = { ...(newDrafts[index] as MultipleSceneDraft) };

      targetDraft.scenes = [
        ...targetDraft.scenes,
        { title: fileName, indent: 0 },
      ];
      targetDraft.unknownFiles = targetDraft.unknownFiles.filter(
        (f) => f !== fileName
      );

      // 3. 替换回新数组中
      newDrafts[index] = targetDraft;
      // 4. 返回新数组 → 触发响应式更新
      return newDrafts;
    });
  }
};

export const ignoreScene = (fileName: string) => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) return;
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      const newDrafts = [...d];
      const targetDraft = { ...(newDrafts[index] as MultipleSceneDraft) };

      targetDraft.scenes = targetDraft.scenes.filter(
        (it) => it.title !== fileName
      );
      targetDraft.ignoredFiles = [
        ...targetDraft.ignoredFiles,
        fileName,
      ];
      targetDraft.unknownFiles = targetDraft.unknownFiles.filter(
        (f) => f !== fileName
      );

      newDrafts[index] = targetDraft;
      return newDrafts;
    });
  }
};

export const addAll = () => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) return;
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      const newDrafts = [...d];
      const targetDraft = { ...(newDrafts[index] as MultipleSceneDraft) };

      targetDraft.scenes = [
        ...targetDraft.scenes,
        ...targetDraft.unknownFiles.map((f) => ({ title: f, indent: 0 })),
      ];
      targetDraft.unknownFiles = [];

      newDrafts[index] = targetDraft;
      return newDrafts;
    });
  }
};

export const ignoreAll = () => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) return;
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      const newDrafts = [...d];
      const targetDraft = { ...(newDrafts[index] as MultipleSceneDraft) };

      targetDraft.ignoredFiles = [
        ...targetDraft.ignoredFiles,
        ...targetDraft.unknownFiles,
      ];
      targetDraft.unknownFiles = [];

      newDrafts[index] = targetDraft;
      return newDrafts;
    });
  }
};
