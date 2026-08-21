import type * as Blockly from "blockly/core";
import type { AimTarget, Node, Script } from "../script/ast";

/**
 * Blockly 工作區 → 我們的 AST。
 *
 * 關鍵細節：**直接沿用 Blockly 的積木 id 當作 AST 節點 id**。
 * 這樣 VM 執行時回報的 id 可以直接拿去 workspace.getBlockById() 找到
 * 對應的積木來點亮 —— 積木高亮因此不需要任何額外的對照表。
 */

const num = (b: Blockly.Block, field: string): number => Number(b.getFieldValue(field));

/** 走訪一條積木鏈（同一層由上往下接的所有積木） */
function chain(first: Blockly.Block | null): Node[] {
  const out: Node[] = [];
  let b = first;
  while (b) {
    // 被停用的積木不執行。這讓學生可以「暫時關掉一段」來對照效果，
    // 是除錯時很自然的動作，不該把它序列化進腳本
    if (b.isEnabled()) {
      const node = toNode(b);
      if (node) out.push(node);
    }
    b = b.getNextBlock();
  }
  return out;
}

function toNode(b: Blockly.Block): Node | null {
  switch (b.type) {
    case "ls_repeat":
      return { kind: "repeat", id: b.id, times: num(b, "TIMES"), body: chain(b.getInputTargetBlock("DO")) };
    case "ls_wait":
      return { kind: "wait", id: b.id, seconds: num(b, "SECONDS") };
    case "ls_fire":
      return { kind: "fire", id: b.id };
    case "ls_turn":
      return { kind: "turn", id: b.id, degrees: num(b, "DEGREES") };
    case "ls_aim":
      return { kind: "aim", id: b.id, target: b.getFieldValue("TARGET") as AimTarget };
    case "ls_set_speed":
      return { kind: "setSpeed", id: b.id, value: num(b, "VALUE") };
    case "ls_set_size":
      return { kind: "setSize", id: b.id, value: num(b, "VALUE") };
    case "ls_set_pierce":
      return { kind: "setPierce", id: b.id, value: num(b, "VALUE") };
    case "ls_turn_by_index":
      return { kind: "turnByIndex", id: b.id, degrees: num(b, "DEGREES") };
    case "ls_add_speed":
      return { kind: "addSpeed", id: b.id, value: num(b, "VALUE") };
    case "ls_add_size":
      return { kind: "addSize", id: b.id, value: num(b, "VALUE") };
    case "ls_set_life":
      return { kind: "setLife", id: b.id, value: num(b, "VALUE") };
    case "ls_set_curve":
      return { kind: "setCurve", id: b.id, degrees: num(b, "DEGREES") };
    case "ls_set_muzzle":
      return { kind: "setMuzzle", id: b.id, value: num(b, "VALUE") };
    case "ls_wait_by_index":
      return { kind: "waitByIndex", id: b.id, seconds: num(b, "SECONDS") };
    case "ls_split":
      return { kind: "setSplit", id: b.id };
    case "ls_forward":
      return { kind: "forward", id: b.id, value: num(b, "VALUE") };
    case "ls_right":
      return { kind: "right", id: b.id, degrees: num(b, "DEGREES") };
    case "ls_homing":
      return { kind: "setHoming", id: b.id };
    case "ls_explode":
      return { kind: "setExplode", id: b.id };
    default:
      return null;
  }
}

export function workspaceToScript(
  workspace: Blockly.Workspace,
  name: string,
  capacity: number,
): Script {
  const root = workspace.getTopBlocks(true).find((b) => b.type === "ls_start");
  return { name, capacity, body: root ? chain(root.getInputTargetBlock("DO")) : [] };
}
