import { REPEAT_LIMIT, SHIELD } from "../config";
import type { Node, Script } from "../script/ast";

export interface Point {
  x: number;
  y: number;
}

export interface ShieldShape {
  /** 相對玩家的頂點，已以形心置中 */
  points: Point[];
  /** 邊數。buff 強度依這個值 */
  sides: number;
  /** 起點與終點的距離。0 代表完美閉合 */
  gap: number;
  /** 轉角總和（度）。算錯時用來告訴學生差了幾度 */
  turnTotal: number;
  /** 形狀的最大半徑，用來篩選要做碰撞判定的敵人 */
  radius: number;
}

/** 頂點數上限。巢狀迴圈可能展開出極多的邊，這是效能與可讀性的保險 */
const MAX_POINTS = 240;

/**
 * 把積木腳本當成海龜走一遍，算出護盾的形狀。
 *
 * **不模擬時間**：護盾是靜態幾何，只在腳本改動時算一次（見 docs/DECISIONS.md §9b）。
 * 這也是護盾優於原本「飛行箭矢」設計的地方 —— 箭矢要每幀跑 VM 走路徑。
 *
 * 沒有閉合的形狀**不做任何特殊處理**：護盾就是這些邊，沒接上自然就有缺口，
 * 敵人穿得過去。畫錯的後果因此是「看得見的破綻」，而不是「沒有生效」。
 */
export function buildShield(script: Script): ShieldShape {
  const points: Point[] = [{ x: 0, y: 0 }];
  const turtle = { x: 0, y: 0, dir: 0, turnTotal: 0 };

  const walk = (nodes: Node[]): void => {
    for (const node of nodes) {
      if (points.length >= MAX_POINTS) return;
      switch (node.kind) {
        case "repeat": {
          const times = Math.max(0, Math.min(Math.floor(node.times), REPEAT_LIMIT));
          for (let i = 0; i < times; i++) walk(node.body);
          break;
        }
        case "forward": {
          const rad = (turtle.dir * Math.PI) / 180;
          turtle.x += Math.cos(rad) * node.value;
          turtle.y += Math.sin(rad) * node.value;
          points.push({ x: turtle.x, y: turtle.y });
          break;
        }
        case "right":
          turtle.dir += node.degrees;
          turtle.turnTotal += node.degrees;
          break;
        default:
          // 其他積木對形狀沒有影響，直接略過
          break;
      }
    }
  };
  walk(script.body);

  // 以形心置中，讓玩家站在形狀正中間 —— 否則護盾會偏在身體一側。
  //
  // 閉合的形狀最後一個頂點會與第一個重疊，計入形心會讓那個頂點被算兩次，
  // 整個圖形因此偏向起點。算之前要先排除掉。
  const first0 = points[0];
  const last0 = points[points.length - 1];
  const duplicated =
    points.length > 2 && Math.hypot(last0.x - first0.x, last0.y - first0.y) < 1e-6;
  const counted = duplicated ? points.length - 1 : points.length;

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < counted; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= counted;
  cy /= counted;
  for (const p of points) {
    p.x -= cx;
    p.y -= cy;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const gap = Math.hypot(last.x - first.x, last.y - first.y);

  let radius = 0;
  for (const p of points) radius = Math.max(radius, Math.hypot(p.x, p.y));

  return {
    points,
    sides: Math.max(0, points.length - 1),
    gap,
    turnTotal: turtle.turnTotal,
    radius: radius + SHIELD.thickness,
  };
}

/**
 * 點到線段的最短距離，並回傳最近點。
 * 護盾的碰撞就是「敵人離某條邊夠近」，不需要多邊形內外判定 ——
 * 缺口因此自然成立：沒有邊的地方就擋不住。
 */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; nx: number; ny: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const dist = Math.hypot(px - cx, py - cy) || 1e-6;
  return { dist, nx: (px - cx) / dist, ny: (py - cy) / dist };
}
