import type * as Blockly from "blockly/core";
import { DEFAULT_WEAPON } from "../weapons";

/**
 * 工具箱＝學生能用的積木清單。沒列在這裡的積木，學生就拿不到 ——
 * 這是「只能用特定積木」最直接的實作方式，不需要額外的權限檢查。
 *
 * 清單由**武器定義**決定（weapons/types.ts 的 blocks），所以新增武器時
 * 這個檔案完全不需要改：換武器就是換一份積木清單。
 */

/**
 * 積木的分組與順序。武器只決定「有哪些積木」，分組方式共用這一份 ——
 * 這樣不同武器之間的排版是一致的，學生的空間記憶可以沿用。
 */
const GROUPS: { label: string; types: string[] }[] = [
  { label: "控制", types: ["ls_repeat", "ls_wait"] },
  { label: "發射", types: ["ls_fire", "ls_turn", "ls_turn_by_index", "ls_aim"] },
  {
    label: "子彈狀態",
    types: ["ls_set_speed", "ls_set_size", "ls_set_pierce", "ls_set_life"],
  },
  { label: "累加（放進迴圈會一次比一次多）", types: ["ls_add_speed", "ls_add_size"] },
  { label: "畫形狀", types: ["ls_forward", "ls_right"] },
];

/** 稀有積木的顯示名稱，用來在工具箱裡標出數量 */
const RARE_LABEL: Record<string, string> = {
  ls_homing: "追蹤彈",
  ls_explode: "爆裂彈",
  ls_split: "分裂彈",
};

/**
 * 依「可用積木清單」與「已解鎖的稀有積木」生成工具箱。
 *
 * 基本積木固定在前、稀有積木解鎖後才出現在最下方 ——
 * 學生打開工具箱就看得到自己這局拿到了什麼。
 */
export function buildToolbox(
  available: string[],
  rare: Map<string, number> = new Map(),
): Blockly.utils.toolbox.ToolboxDefinition {
  const contents: Blockly.utils.toolbox.ToolboxItemInfo[] = [];
  const set = new Set(available);

  for (const group of GROUPS) {
    const types = group.types.filter((t) => set.has(t));
    if (types.length === 0) continue;
    if (contents.length > 0) contents.push({ kind: "sep", gap: "16" });
    contents.push({ kind: "label", text: group.label });
    for (const type of types) contents.push({ kind: "block", type });
  }

  if (rare.size > 0) {
    contents.push({ kind: "sep", gap: "16" }, { kind: "label", text: "稀有積木（限量）" });
    for (const [type, count] of rare) {
      contents.push({ kind: "label", text: `　${RARE_LABEL[type] ?? type} ×${count}` });
      contents.push({ kind: "block", type });
    }
  }

  return { kind: "flyoutToolbox", contents };
}

/** 開局的攻擊腳本工具箱：預設武器提供的積木 */
export const TOOLBOX = buildToolbox(DEFAULT_WEAPON.blocks);

/**
 * 護盾形狀的工具箱。只有迴圈與移動 —— 刻意極簡，
 * 因為它要教的只有一件事：正 N 邊形的每次轉角 = 360 ÷ N。
 *
 * 護盾獨立於武器，所以它的清單寫死在這裡，不隨武器改變。
 */
export const SHAPE_TOOLBOX = buildToolbox(["ls_repeat", "ls_forward", "ls_right"]);
