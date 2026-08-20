import { GRID_CELL } from "../config";
import type { Enemy } from "./types";

/**
 * 敵人的均勻網格索引。
 *
 * 彈幕遊戲的碰撞是 N 顆子彈 × M 個敵人，暴力解在後期（數百對數百）會變成
 * 每幀十萬次以上的距離計算。網格把它降到每顆子彈只檢查鄰近幾格，
 * 而且實作只有幾十行 —— 這不是過早最佳化，是這個類型的基本裝備。
 */
export class EnemyGrid {
  private cells = new Map<number, number[]>();

  private key(cx: number, cy: number): number {
    // 兩個整數壓成一個 key。座標可能為負，先偏移到非負區間
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  }

  rebuild(enemies: Enemy[]): void {
    this.cells.clear();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const k = this.key(Math.floor(e.x / GRID_CELL), Math.floor(e.y / GRID_CELL));
      const bucket = this.cells.get(k);
      if (bucket) bucket.push(i);
      else this.cells.set(k, [i]);
    }
  }

  /** 對座標附近（含半徑涵蓋範圍）的敵人索引逐一呼叫 fn */
  forEachNear(x: number, y: number, radius: number, fn: (index: number) => void): void {
    const span = Math.ceil(radius / GRID_CELL);
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    for (let gx = cx - span; gx <= cx + span; gx++) {
      for (let gy = cy - span; gy <= cy + span; gy++) {
        const bucket = this.cells.get(this.key(gx, gy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
