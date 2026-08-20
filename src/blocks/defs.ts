import * as Blockly from "blockly/core";
import { BLOCK_DEFS } from "./definitions";

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
