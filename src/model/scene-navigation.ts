import {
  type Editor,
  type MarkdownFileInfo,
  type MarkdownView,
  type Vault,
} from "obsidian";

import { newLeafForScene } from "src/commands/new-leaf-for-scene";
import type { CommandBuilder } from "./types";
import {
  findSceneWithVault,
  scenePath,
  scenePathForLocation,
  type SceneNavigationLocation,
} from "src/model/scene-navigation";
import { get } from "svelte/store";
import { activeFile, selectedDraft } from "src/view/stores";
import { drafts } from "src/model/stores";

function navigate(
  checking: boolean,
  location: SceneNavigationLocation,
  vault: Vault
): boolean | void {
  const draftsValue = get(drafts);
  const path = get(activeFile).path;
  if (!path) return false;

  const target = scenePathForLocation(location, path, draftsValue, vault);

  if (checking) {
    return !!target;
  }

  if (target) {
    newLeafForScene(target, location.maintainIndent).open();
  }
}

export const nextScene: CommandBuilder = (plugin) => ({
  id: "longform-next-scene",
  name: "Next scene",
  editorCheckCallback: (checking: boolean) =>
    navigate(checking, { position: "next", maintainIndent: false }, plugin.app.vault),
});

export const previousScene: CommandBuilder = (plugin) => ({
  id: "longform-previous-scene",
  name: "Previous scene",
  editorCheckCallback: (checking: boolean) =>
    navigate(checking, { position: "previous", maintainIndent: false }, plugin.app.vault),
});

export const nextSceneMaintainIndent: CommandBuilder = (plugin) => ({
  id: "longform-next-scene-maintain-indent",
  name: "Next scene (maintain indent)",
  editorCheckCallback: (checking: boolean) =>
    navigate(checking, { position: "next", maintainIndent: true }, plugin.app.vault),
});

export const previousSceneMaintainIndent: CommandBuilder = (plugin) => ({
  id: "longform-previous-scene-maintain-indent",
  name: "Previous scene (maintain indent)",
  editorCheckCallback: (checking: boolean) =>
    navigate(checking, { position: "previous", maintainIndent: true }, plugin.app.vault),
});
