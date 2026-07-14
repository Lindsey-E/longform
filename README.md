## Longform

## 🎉 Longform 修改版 v3.0.0

基于原版 Longform 插件进行了以下优化和改进：

---

## 🔥 3.0.0 更新内容

- **场景 frontmatter 编号**：启用后，场景文件会自动写入 `longform-order` 和 `longform-number`，方便外部工具使用。
- **项目级场景模板**：每个项目可单独指定新场景所使用的模板文件。
- **未知文件引导界面**：场景文件夹内新出现的 `.md` 文件会在列表中显示，可一键添加或忽略。
- **会话存储方式**：新增“插件文件夹内的 JSON 文件”和“仓库内文件”两种存储方式，满足选择性同步需求。
- **等待同步优化**：可配置同步等待行为，包括启用/关掉及自定义等待时间。
- **用户脚本步骤增强**：支持在脚本中使用 `app`、`draft` 等上下文对象，实现更高级的编译操作。
- **UI 优化**：可折叠区域、内联重命名草稿、更平滑的拖拽体验。
- **公共 API**：其他开发者可通过 `import 'longform'` 调用 `indentedScenesToNestedArrays`、`scenesWithNumberings` 等实用函数。

## ✨ 主要功能

### 📁 项目与场景管理
- **多场景项目**：将一部作品拆分为多个独立的“场景”笔记，支持层级缩进（子场景）。
- **单场景项目**：用单个笔记承载整个项目（适合短篇、散文）。
- **可视化场景列表**：在 Longform 侧边栏中拖拽排序、左右调整缩进、折叠/展开子场景。
- **新场景输入框**：输入标题即可快速创建场景，自动应用模板。
- **未知文件自动发现**：场景文件夹内出现新的 Markdown 文件时，可选“添加”或“忽略”。
- **场景编号**：自动生成 1, 1.1, 1.1.2 等层级编号，并可选写入笔记的 frontmatter。

### ✍️ 写作会话与目标
- **字数统计**：实时显示当前场景、草稿、整部项目的字数，可嵌入状态栏。
- **写作会话**：按日或手动开启新会话，追踪每次写作的净增/删除字数。
- **目标进度条**：设定每日/每项目/每场景的字数目标，完成后显示通知。
- **会话存储**：支持将数据保存在插件 data.json、外部 JSON 文件或仓库内任意文件中。

### ⚙️ 编译与导出（工作流）
- **可视化工作流编辑**：拖拽步骤卡片，为每个步骤配置参数。
- **内置编译步骤**：
  - 去除 YAML frontmatter
  - 删除 Wiki 链接或外部链接，仅保留文字
  - 移除 HTML/Markdown 批注
  - 移除删除线文本
  - 在场景前添加标题（支持编号/层级格式）
  - 连接所有场景为一份手稿（可自定义分隔符）
  - 将手稿保存为指定路径的笔记
  - 添加自定义 frontmatter
- **用户脚本步骤**（高级）：将 `.js` 脚本放在指定文件夹中，即可作为自定义编译步骤使用（支持 Scene、Join、Manuscript 三种阶段）。
- **一键编译**：通过命令面板或侧边栏按钮完成整个工作流。

### 🧭 导航与命令
- **场景间跳转**：上一个/下一个场景，或按当前缩进层级跳转。
- **快速定位**：命令面板中 `Jump to project` / `Jump to scene`。
- **新建草稿**：为同一项目创建不同版本（如“第二稿”），可选择复制所有场景。
- **打开 Longform 侧边栏**、**重命名场景/草稿**、**在文件管理中定位** 等快捷命令。

### ⚙️ 项目管理
- **项目元数据**：标题、场景文件夹、场景模板（支持 Templater / Core Templates 插件）。
- **多草稿（Drafts）**：同一项目可拥有多个草稿，每个草稿独立追踪场景顺序和字数。
- **从旧版迁移**：内置迁移向导，将 Longform 1.x 项目转换为 2.x/3.x 格式。

### 🌐 其他亮点
- **Obsidian Sync 友好**：可设置等待同步完成后再进行文件扫描，避免因同步不完整导致的误报“新文件”。
- **完全基于 frontmatter**：项目数据保存在笔记的 YAML 头部中，可安全地在不同设备间同步。
- **主题/移动端适配**：提供 CSS 变量，可在移动端使用，支持自定义外观（如 `styles.css`）。

## 🚀 快速上手

1. 安装插件后，在信件夹（仓库内的任意文件夹）上右键，选择 **Create Longform Project**。
2. 在弹出的窗口中输入项目名称，选择“多场景”或“单场景”项目。
3. 创建成功后，项目索引文件会被打开；你可以在 Longform 侧边栏中看到 **Scenes**、**Project**、**Compile** 三个标签页。
4. 在 **Scenes** 页的输入框中输入场景名称，按回车即可创建场景。
5. 拖动场景调整顺序，按住 Shift 拖动可调整缩进。
6. 在 **Compile** 页选择或创建工作流，编辑步骤参数，点击 **Compile** 生成手稿。

详细文档请访问 [GitHub 仓库 Wiki](https://github.com/kevboh/longform)（如存在）。


### ⚠️ 注意

本版本为社区修改版，非原版 Longform 官方发布。
原版地址：https://github.com/kevboh/longform


Longform is a plugin for [Obsidian](https://obsidian.md) that helps you write and edit novels, screenplays, and other long projects. It lets you organize a series of notes, or _scenes_, into an ordered manuscript. It also supports single-note projects for shorter works.

> [!TIP]
> If you’d like a way to sync, share your manuscripts with others, and edit them on the web check out my other project, [screen.garden](https://screen.garden).

Major features include:

- A dedicated sidebar that collects your projects from across your vault;
- A [reorderable, nestable list](./docs/MULTIPLE_SCENE_PROJECTS.md) of scenes;
- Scene/draft/project [word counts](./docs/WORD_COUNTS.md#word-counts-for-projects-drafts-and-scenes);
- Daily [writing session goals](./docs/WORD_COUNTS.md#writing-sessions-and-word-count-goals) with lots of options to help fit your writing style;
- A [workflow-based compilation tool](./docs/COMPILE.md) that can create manuscripts from your projects;
- Support for [single-scene projects](/docs/SINGLE_SCENE_PROJECTS.md) so that your shorter works can use the same workflows and tooling as your longer ones;
- Plus lots of commands, modals, and menu items to help you manage your work.

A Getting Started guide follows; there is also reasonably-complete [documentation](./docs/).

## Installing

Longform is in the Community Plugins section of Obsidian’s settings. You may also install it manually by copying the `main.js`, `manifest.json`, and `styles.css` files from a release into a `longform/` folder in the `.obsidian/plugins` folder of your vault. The Community Plugins interface is preferred.

## Getting Started

Longform works by searching your vault for any note that contains a frontmatter entry named `longform` (don’t worry if you don’t know what that means; Longform includes tools to help you generate these files). You can think of these notes as the “spines” or tables of contents of your projects. Let‘s walk through creating two different Longform projects: a novel and a short story.

### Creating a Novel

1. To begin, find or create a folder somewhere in your vault in which you’d like to create your novel. Right-click it and select `Create Longform Project`.

![Create Longform Project menu item](./docs/res/walkthrough-create-longform-project.png)

2. A `Create Project` modal will appear. This modal lets us choose between Multi- and Single-scene project types. We’re creating a novel, so we’ll stick with Multi. The text under the project type switch explains a little about how each type of project works.

3. In the `Title` field, enter your novel’s title. For this example we’ll use `My Great Novel`. The modal tells us the type of project we’re creating and the location of the _Index File_ it will create in our vault. We’ll get into what Index Files are in a moment.

![A filled-out create multi-scene project modal](./docs/res/walkthrough-create-multi.png)

> **Note**
>
> You don’t have to use this menu item and modal to create Longform projects. As you will see shortly, Longform projects are one or more notes organized around some YAML frontmatter. You can always create a note yourself somewhere in your vault and use the `Insert Multi-Scene Frontmatter` and `Insert Single-Scene Frontmatter` commands to populate the note—Longform will recognize it automatically. Although not recommended, you can also author the YAML frontmatter manually, too.

4. Click `Create`. Longform has created the promised file. If we switch to the [Longform pane](./docs/THE_LONGFORM_PANE.md) in the sidebar the project is already selected. You should see three tabs: Scenes, Project, and Compile, and Scenes should be selected.

![The newly-created project in the Longform pane](./docs/res/walkthrough-multi-fresh-pane.png)

5. That _New Scene_ placeholder is a text field—click it and enter something that sounds like the first scene of a novel, maybe “The Sun Rises on Dublin,” and press enter. You should now be editing a so-named note, and your scene should appear in the Scenes tab:

![the "My Great Novel" novel with a freshly-created scene](./docs/res/multi-walkthrough-2.png)

6. Your editor also now has the scene open and ready to write. If you click the small `My Great Novel/Index.md` link under your project name, you’ll be taken back to the index file where you’ll see your new scene listed under the `scenes` frontmatter entry:

```yaml
scenes:
  - The Sun Rises on Dublin
```

This is how Longform tracks your work.

> **Warning**
>
> You should probably avoid editing the `longform` frontmatter in your index file directly unless you really know what you’re doing. Longform supports direct editing of it and will do its best to sync, but it’s easy to accidentally mess things up. You can always revert your changes, though: Longform will never delete files based on changes in the index file.

7. You’re now ready to write your novel. Keep adding scenes as needed. If you’d like to add structure to your novel you can drag scenes left or right (or use the indent/Unindent commands) to create folders of scenes with parent scenes. [The full documentation for multiple-scene projects](./docs/MULTIPLE_SCENE_PROJECTS.md) might be useful.

8. When you’re ready to generate a single manuscript for your readers, use the [Compile](./docs/COMPILE.md) feature. Congratulations! You’ve written a novel.

### Creating a Short Story

Longform also supports [single-scene projects](./docs/SINGLE_SCENE_PROJECTS.md) that live as a single note in your vault. Let’s create one.

1. Right-click the enclosing folder as before and select the `Create Longform Project` menu item.

2. In the Create Project modal, choose `Single`. Let’s write something noirish and call it `On the Rooftops`.

![Creating a single-scene Longform project in the Create Project modal](./docs/res/walkthrough-create-single.png)

3. Click Create. Because this is a single-scene project, there is only one note associated with it and Longform will open it automatically. The frontmatter at the top tells Longform how to track your project; we’ll write the story in the note itself.

4. Write your story! When you’re ready, you can use the Compile tab to generate a manuscript. Single-scene projects can use scene and manuscript steps in any order.

## Drafts & Projects

Longform supports the creation of multiple _drafts_ for a given project. Under the hood, drafts are just different Longform projects with the same title—they are then grouped together by Longform and presented as different versions of the same project.

To create a new draft of a project use the new draft (+) button in the Project tab, or create an entirely new project somewhere and set the title in the Project tab to be the same as your existing project.

You can rename drafts by right-clicking them in the Project tab and selecting Rename, or by setting the `draftTitle` attribute in their `longform` frontmatter.

## Compiling

The Compile tab allows you to create custom workflows that turn your project into a manuscript. See [COMPILE.md](https://github.com/kevboh/longform/blob/main/docs/COMPILE.md) for more.

> [!TIP]
> You can find more compile steps for various use cases in the [community collection of compile steps](https://github.com/obsidian-community/longform-compile-steps).

## Scene-only Styling

Longform will automatically attach a `.longform-leaf` class to the container panes of any notes that are part of a Longform project. This means you can add custom CSS snippets to Obsidian that style your writing environment and _only_ your writing environment. For example, I prefer a dark theme for Obsidian but a light theme for writing, so my writing snippet looks something like this:

```css
/* Set some variables for the entire leaf. */
.longform-leaf {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
}

/* Style the editor. */
.longform-leaf .markdown-source-view {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
  --text-selection: #aaa;
  --text-normal: black;
  color: black;
  background-color: white;
}

/* Style text selection. */
.longform-leaf .suggestion-item.is-selected {
  background-color: var(--text-accent);
}

/* Style the header of the leaf. */
.longform-leaf .view-header {
  background-color: white;
}

/* Style the text content of the leaf header. */
.longform-leaf .view-header-title {
  --text-normal: black;
}
```

Longform’s own UI will always use existing Obsidian CSS theme variables when possible, so it should always look at home in your theme.

## Troubleshooting

First, the most important bit: **Longform is built specifically to never alter the contents on your notes.** The only note it rewrites is a project’s index file. As such, Longform can’t delete or lose your notes.

Longform does a lot of complex tracking to bridge a project’s metadata with the state of files on disk. Although it tries to cover lots of edge cases, it is possible to cause desync between what Longform thinks is happening with projects and what’s actually going on. Most often this occurs when a project’s frontmatter is malformed or invalid in some way. Because projects are inferred from frontmatter, if your frontmatter is correct you can always restart Obsidian (or choose the "reload without saving" command) to force Longform to recalculate projects.

## Sponsorship

Any [sponsorship](https://github.com/sponsors/kevboh) is deeply appreciated, although by no means necessary.

## License

See [LICENSE.md](./LICENSE.md). You can view the license’s history [here](https://git.sr.ht/~boringcactus/fafol/tree/master/LICENSE.md).
