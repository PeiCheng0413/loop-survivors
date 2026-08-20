import * as Blockly from "blockly/core";
import * as ZhHant from "blockly/msg/zh-hant";
import { BLOCK_DEFS } from "./definitions";

/**
 * 載入語言字串。**這一行不能省，也必須在 inject() 之前執行。**
 *
 * `blockly/core` 只有程式邏輯、不含任何語言字串，Blockly.Msg 是空的。
 * 少了它，inject() 會在建立無障礙標籤時對 undefined 呼叫 .replace 而拋例外，
 * 整個 app 在模組初始化階段就死掉 —— 症狀是整頁空白卡住，
 * 而且看起來完全不像跟語言有關。
 *
 * 選繁體中文而非英文：右鍵選單、提示文字都會跟著中文化，
 * 與積木標籤的語言一致（見 docs/DECISIONS.md §5）。
 */
Blockly.setLocale(ZhHant as unknown as Record<string, string>);

/** 把積木定義註冊進 Blockly。積木的資料本身在 definitions.ts */
Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);

/** 配合遊戲畫面的深色主題，避免編輯器與戰場看起來像兩個不同的程式 */
export const THEME = Blockly.Theme.defineTheme("loop-survivors", {
  name: "loop-survivors",
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: "#101725",
    toolboxBackgroundColour: "#0d1320",
    toolboxForegroundColour: "#d7e3f4",
    flyoutBackgroundColour: "#141c2c",
    flyoutForegroundColour: "#d7e3f4",
    flyoutOpacity: 1,
    scrollbarColour: "#3a4a63",
    insertionMarkerColour: "#5ce1ff",
    insertionMarkerOpacity: 0.5,
    cursorColour: "#5ce1ff",
  },
});
