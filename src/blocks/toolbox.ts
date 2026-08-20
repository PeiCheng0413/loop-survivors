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
/** 稀有積木的顯示名稱，用來在工具箱裡標出數量 */
const RARE_LABEL: Record<string, string> = {
  ls_homing: "追蹤彈",
  ls_explode: "爆裂彈",
  ls_split: "分裂彈",
};

const BASE_CONTENTS: Blockly.utils.toolbox.ToolboxItemInfo[] = [
    { kind: "label", text: "控制" },
    { kind: "block", type: "ls_repeat" },
    { kind: "block", type: "ls_wait" },
    { kind: "sep", gap: "16" },
    { kind: "label", text: "發射" },
    { kind: "block", type: "ls_fire" },
    { kind: "block", type: "ls_turn" },
    { kind: "block", type: "ls_turn_by_index" },
    { kind: "block", type: "ls_aim" },
    { kind: "sep", gap: "16" },
    { kind: "label", text: "子彈狀態" },
    { kind: "block", type: "ls_set_speed" },
    { kind: "block", type: "ls_set_size" },
    { kind: "block", type: "ls_set_pierce" },
    { kind: "block", type: "ls_set_life" },
    { kind: "sep", gap: "16" },
    { kind: "label", text: "累加（放進迴圈會一次比一次多）" },
    { kind: "block", type: "ls_add_speed" },
    { kind: "block", type: "ls_add_size" },
];

/**
 * 依已解鎖的稀有積木生成工具箱。
 *
 * 基本八塊固定在前，稀有積木解鎖後才出現在最下方 ——
 * 學生打開工具箱就看得到自己這局拿到了什麼。
 */
export function buildToolbox(rare: Map<string, number>): Blockly.utils.toolbox.ToolboxDefinition {
  const contents: Blockly.utils.toolbox.ToolboxItemInfo[] = [...BASE_CONTENTS];
  if (rare.size > 0) {
    contents.push({ kind: "sep", gap: "16" }, { kind: "label", text: "稀有積木（限量）" });
    for (const [type, count] of rare) {
      contents.push({ kind: "label", text: `　${RARE_LABEL[type] ?? type} ×${count}` });
      contents.push({ kind: "block", type });
    }
  }
  return { kind: "flyoutToolbox", contents };
}


/** 起始工具箱：只有基本八塊 */
export const TOOLBOX = buildToolbox(new Map());
