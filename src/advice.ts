import { countBlocks, type Node, type Script } from "./script/ast";
import type { Phase } from "./config";

/**
 * 依這一局的實際情況給一句建議。
 *
 * 死亡是學生最願意接受建議的時刻，而「你撐了 2 分 10 秒」本身不會讓人知道
 * 下一步該改什麼。所以這裡看的是**腳本結構與死亡當下的階段**，
 * 給出可以馬上動手的一句話 —— 不是泛泛的鼓勵。
 *
 * 順序即優先序：越前面的問題越根本。
 */
export function adviceFor(script: Script, phase: Phase, capacityLeft: number): string {
  const has = (kind: Node["kind"]) => contains(script.body, kind);

  // 最根本的問題：整份腳本沒有迴圈
  if (!has("repeat")) {
    return "你的腳本裡沒有迴圈。把「發射子彈」包進「重複執行」，同樣的格數可以射出好幾倍的子彈。";
  }

  // 死在哪個階段，就針對那個階段的弱點給建議
  switch (phase.kind) {
    case "armor":
      if (!has("wait")) {
        return "你死在裝甲兵手上。它的傷害門檻讓弱子彈完全無效 —— 把「等待」放進迴圈裡蓄力，換少而重的子彈。";
      }
      break;
    case "shielded":
      if (!has("aim")) {
        return "你死在護盾兵手上。它要短時間內命中三次，先用「方向設為 最近的敵人」對準，再用「重複 3 次」連射。";
      }
      break;
    case "rush":
      if (!has("turn")) {
        return "你死在疾行群手上。它們又快又多，要的是覆蓋面 —— 在迴圈裡加「方向旋轉」，把子彈灑向四面八方。";
      }
      break;
    case "boss":
      if (has("turn") && !has("aim")) {
        return "你死在王手上。散射有大半子彈射進空氣 —— 拿掉旋轉、改用「方向設為 最近的敵人」，把火力集中。";
      }
      break;
    default:
      break;
  }

  // 沒有結構性問題就看資源有沒有用完
  if (capacityLeft >= 3) {
    return `你還有 ${capacityLeft} 格容量沒用。多放幾塊積木進迴圈，同樣一輪能打出更多輸出。`;
  }
  if (!nested(script.body)) {
    return "試試巢狀迴圈：在「重複執行」裡面再放一個「重複執行」，火力會翻好幾倍。";
  }
  return "腳本結構不錯。下一局試著在階段切換時暫停，依照敵人種類換一種排列。";
}

function contains(nodes: Node[], kind: Node["kind"]): boolean {
  for (const node of nodes) {
    if (node.kind === kind) return true;
    if (node.kind === "repeat" && contains(node.body, kind)) return true;
  }
  return false;
}

/** 是否已經用了巢狀迴圈 */
function nested(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.kind === "repeat") {
      if (contains(node.body, "repeat")) return true;
      if (nested(node.body)) return true;
    }
  }
  return false;
}

/** 目前腳本還剩幾格容量 */
export function capacityLeftOf(script: Script): number {
  return script.capacity - countBlocks(script.body);
}
