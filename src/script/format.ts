import type { Node } from "./ast";

/**
 * 把腳本攤平成可顯示的行 —— M0 用文字模擬 Blockly 的積木高亮。
 *
 * 先用最便宜的方式驗證「看得見迴圈在跑」這個教學紅利是否成立，
 * 確認有效之後 M1 再換成真正的積木高亮。
 */
export interface ScriptLine {
  id: string;
  depth: number;
  text: string;
  /** 積木類別，用來上色。與工具箱的分類一致，學生的顏色記憶可以沿用 */
  category: "control" | "action" | "state" | "rare" | "move";
}

function categoryOf(kind: Node["kind"]): ScriptLine["category"] {
  switch (kind) {
    case "repeat":
    case "wait":
    case "waitByIndex":
      return "control";
    case "fire":
    case "turn":
    case "turnByIndex":
    case "aim":
      return "action";
    case "setHoming":
    case "setExplode":
    case "setSplit":
      return "rare";
    case "forward":
    case "right":
      return "move";
    default:
      return "state";
  }
}

const AIM_LABEL = {
  nearest: "最近的敵人",
  moveDir: "移動方向",
  random: "隨機",
} as const;

function label(node: Node): string {
  switch (node.kind) {
    case "repeat": return `重複執行 ${node.times} 次`;
    case "wait": return `等待 ${node.seconds} 秒`;
    case "fire": return "發射子彈";
    case "turn": return `方向旋轉 ${node.degrees} 度`;
    case "aim": return `方向設為 ${AIM_LABEL[node.target]}`;
    case "setSpeed": return `子彈速度設為 ${node.value}`;
    case "setSize": return `子彈大小設為 ${node.value}`;
    case "setPierce": return `子彈穿透設為 ${node.value}`;
    case "turnByIndex": return `方向旋轉 ${node.degrees} 度 × 迴圈次數`;
    case "addSpeed": return `子彈速度增加 ${node.value}`;
    case "addSize": return `子彈大小增加 ${node.value}`;
    case "setLife": return `子彈存活 ${node.value} 秒`;
    case "setCurve": return `子彈轉向 每秒 ${node.degrees} 度`;
    case "setMuzzle": return `發射點距離設為 ${node.value}`;
    case "waitByIndex": return `等待 ${node.seconds} 秒 × 迴圈次數`;
    case "setSplit": return "子彈改為分裂";
    case "forward": return `前進 ${node.value}`;
    case "right": return `右轉 ${node.degrees} 度`;
    case "setHoming": return "子彈改為追蹤";
    case "setExplode": return "子彈改為爆裂";
  }
}

export function toLines(nodes: Node[], depth = 0, out: ScriptLine[] = []): ScriptLine[] {
  for (const node of nodes) {
    out.push({ id: node.id, depth, text: label(node), category: categoryOf(node.kind) });
    if (node.kind === "repeat") toLines(node.body, depth + 1, out);
  }
  return out;
}
