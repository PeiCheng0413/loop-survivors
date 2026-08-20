export interface Player {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  /** 上次移動方向（度）。給「方向設為 移動方向」積木用 */
  moveDir: number;
  /** 剩餘無敵時間 */
  invuln: number;
}

export interface Enemy {
  x: number;
  y: number;
  r: number;
  hp: number;
  speed: number;
  /** 受擊閃白的剩餘時間 —— 打到東西的手感有一半來自這個 */
  hit: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  /** 還能穿透幾個敵人。0 = 命中即消失 */
  pierce: number;
  life: number;
}
