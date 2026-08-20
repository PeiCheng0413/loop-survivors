import type * as Blockly from "blockly/core";
import type { Node, Script } from "../script/ast";

/**
 * 我們的 AST → Blockly 的序列化狀態。
 *
 * 型別直接用 Blockly 自己的 `serialization.blocks.State`，格式錯了編譯就會擋下來，
 * 不必等到瀏覽器裡才發現積木載不進去。
 *
 * 這裡只 import type，執行期沒有任何 Blockly 相依 —— 所以無頭測試可以直接載入。
 */
type State = Blockly.serialization.blocks.State;

function nodeToState(node: Node): State {
  switch (node.kind) {
    case "repeat": {
      const s: State = { type: "ls_repeat", fields: { TIMES: node.times } };
      const body = chainToState(node.body);
      if (body) s.inputs = { DO: { block: body } };
      return s;
    }
    case "wait": return { type: "ls_wait", fields: { SECONDS: node.seconds } };
    case "fire": return { type: "ls_fire" };
    case "turn": return { type: "ls_turn", fields: { DEGREES: node.degrees } };
    case "aim": return { type: "ls_aim", fields: { TARGET: node.target } };
    case "setSpeed": return { type: "ls_set_speed", fields: { VALUE: node.value } };
    case "setSize": return { type: "ls_set_size", fields: { VALUE: node.value } };
    case "setPierce": return { type: "ls_set_pierce", fields: { VALUE: node.value } };
  }
}

/** 把一串節點接成 next 鏈 */
function chainToState(nodes: Node[]): State | null {
  if (nodes.length === 0) return null;
  const head = nodeToState(nodes[0]);
  let tail = head;
  for (let i = 1; i < nodes.length; i++) {
    const s = nodeToState(nodes[i]);
    tail.next = { block: s };
    tail = s;
  }
  return head;
}

export function scriptToState(script: Script): { blocks: { languageVersion: number; blocks: State[] } } {
  const root: State = {
    type: "ls_start",
    // 根積木不可刪、不可移：它是腳本的錨點，學生不小心把它丟掉會整個壞掉
    deletable: false,
    movable: false,
    x: 32,
    y: 28,
  };
  const body = chainToState(script.body);
  if (body) root.inputs = { DO: { block: body } };
  return { blocks: { languageVersion: 0, blocks: [root] } };
}
