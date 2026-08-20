import type * as Blockly from "blockly/core";

/**
 * 工具箱＝學生能用的積木清單。沒列在這裡的積木，學生就拿不到 ——
 * 這是「只能用特定積木」最直接的實作方式，不需要額外的權限檢查。
 *
 * 基本八塊一開始就全部在此（見 docs/DECISIONS.md §5a）：核心教學點不能
 * 被骰子決定，若「重複執行」要靠升級抽到，沒抽到的學生這堂課就白上了。
 *
 * M2 的稀有積木會用 updateToolbox() 動態加進來。
 */
export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: "flyoutToolbox",
  contents: [
    { kind: "label", text: "控制" },
    { kind: "block", type: "ls_repeat" },
    { kind: "block", type: "ls_wait" },
    { kind: "sep", gap: "16" },
    { kind: "label", text: "發射" },
    { kind: "block", type: "ls_fire" },
    { kind: "block", type: "ls_turn" },
    { kind: "block", type: "ls_aim" },
    { kind: "sep", gap: "16" },
    { kind: "label", text: "子彈狀態" },
    { kind: "block", type: "ls_set_speed" },
    { kind: "block", type: "ls_set_size" },
    { kind: "block", type: "ls_set_pierce" },
  ],
};
