# Clone artwork attribution

The cover and menu icon are adapted from [Clones Plus artwork](https://github.com/TurboWarp/extensions/blob/master/images/Lily/ClonesPlus.svg), created by [LilyMakesThings](https://scratch.mit.edu/users/LilyMakesThings/) in [TurboWarp/extensions#656](https://github.com/TurboWarp/extensions/pull/656).

The artwork is licensed under **GPL-3.0** under the [upstream licensing policy](https://github.com/TurboWarp/extensions#license). The dango artwork is based on [Twemoji](https://github.com/twitter/twemoji), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is recorded in the [upstream image credits](https://github.com/TurboWarp/extensions/blob/master/images/README.md#lilyclonesplussvg).

Blockdia modifications: removed the plus sign, centered the cover motif, and made a transparent vector icon with Scratch-style gray outlines from the cover's dango and copy arrow. The same icon is used on the extension card, category menu, and blocks. The extension remains named Clones and does not claim compatibility with TurboWarp's Clones Plus extension.

See the repository root `LICENSE` for GPL-3.0.

## GUI 与 VM 的职责边界

克隆能力、积木定义和稳定的 `clones` 扩展 ID 保留在 scratch-vm。封面、分类图标和积木图标全部由 GUI 管理，遵循上方的素材许可。VM 不需要保存 SVG 或 Base64 编码的 JS 副本。

- `clones.svg`：扩展库封面。
- `clones-small.svg`：小图标的唯一可编辑源文件，由扩展库和 `src/lib/extension-artwork.js` 共同导入，通过 Webpack 生成资源 URL。
- `src/lib/extension-artwork.js`：在 VM 提供的显示数据副本中加入分类图标、标准积木图标和分隔线。加入图标时同步调整参数占位符编号，排除菜单影子积木，不修改 VM 元数据或作品序列化格式。
- `src/lib/themes/blockHelpers.js`：在应用主题颜色之前加入图标，默认主题也走同一流程。

其他使用 VM 的应用默认不会显示这组图标，需要在自己的显示层提供素材。图标移入 GUI 不改变素材许可证，也不代表发布产物的许可要求已全部完成。

## TODO

- 当更多内置扩展需要 GUI 专属素材时，将扩展库、积木和主题的图标映射整理为统一的 GUI 显示配置，继续保持运行逻辑与素材许可的边界。
- 如果克隆扩展以后加入动态布局积木，让动态积木渲染器也使用同一素材映射。目前克隆积木均为静态布局。
- 发布前，在站点的致谢或许可页面提供素材署名、GPL 许可和可编辑 SVG 源文件入口，并检查 npm 包及静态构建的实际产物。仅有源码目录中的署名，尚不足以确认所有发布方式都已覆盖。
