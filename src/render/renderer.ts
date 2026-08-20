import type { World } from "../game/world";

const DEG = Math.PI / 180;

const COLOR = {
  bg: "#0b0f18",
  grid: "#151d2c",
  gridMajor: "#1d2839",
  player: "#e8f4ff",
  playerRing: "#4aa8ff",
  aim: "#4aa8ff",
  enemy: "#ff4d5a",
  enemyHit: "#ffffff",
  bullet: "#5ce1ff",
  gem: "#7dffb0",
};

const GRID = 80;

/**
 * Canvas 2D 繪製。**只讀 World，不改任何狀態** —— 這條鐵律是
 * 「日後換掉渲染層不必動遊戲邏輯」的前提（見 CLAUDE.md 架構鐵律 2）。
 *
 * 全部用幾何圖形繪製，專案零圖檔：彈幕遊戲與幾何風天生相配，
 * 沒有版權問題，部署也乾淨。
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("取得 2D context 失敗");
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  draw(world: World, w: number, h: number, dpr: number): void {
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, w, h);

    // 鏡頭跟著玩家。世界是無邊界平面，靠背景格線提供移動感 ——
    // 沒有格線的話，在空曠處走動會完全看不出自己有沒有在動。
    const camX = world.player.x - w / 2;
    const camY = world.player.y - h / 2;
    ctx.save();
    ctx.translate(-camX, -camY);

    this.drawGrid(camX, camY, w, h);
    this.drawGems(world);
    this.drawEnemies(world);
    this.drawBullets(world);
    this.drawPlayer(world);

    ctx.restore();
  }

  private drawGrid(camX: number, camY: number, w: number, h: number): void {
    const ctx = this.ctx;
    const x0 = Math.floor(camX / GRID) * GRID;
    const y0 = Math.floor(camY / GRID) * GRID;
    ctx.lineWidth = 1;
    for (let x = x0; x < camX + w + GRID; x += GRID) {
      ctx.strokeStyle = x % (GRID * 5) === 0 ? COLOR.gridMajor : COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(x, camY);
      ctx.lineTo(x, camY + h);
      ctx.stroke();
    }
    for (let y = y0; y < camY + h + GRID; y += GRID) {
      ctx.strokeStyle = y % (GRID * 5) === 0 ? COLOR.gridMajor : COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(camX, y);
      ctx.lineTo(camX + w, y);
      ctx.stroke();
    }
  }

  /** 經驗球畫成菱形，跟圓形的敵人與子彈一眼分得開 */
  private drawGems(world: World): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLOR.gem;
    for (const g of world.gems) {
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 6);
      ctx.lineTo(g.x + 4.5, g.y);
      ctx.lineTo(g.x, g.y + 6);
      ctx.lineTo(g.x - 4.5, g.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawEnemies(world: World): void {
    const ctx = this.ctx;
    for (const e of world.enemies) {
      // 受擊閃白：打到東西的手感有一半來自這個 8 分之 1 秒
      ctx.fillStyle = e.hit > 0 ? COLOR.enemyHit : COLOR.enemy;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawBullets(world: World): void {
    const ctx = this.ctx;
    // 加法混色做發光。比 shadowBlur 快一個量級，密集彈幕下差異很明顯
    ctx.globalCompositeOperation = "lighter";
    for (const b of world.bullets) {
      // 蓄力反映在亮度與光暈上，不明顯改變大小 ——
      // 大小是學生用積木控制的參數，混在一起會讓兩件事都讀不準
      ctx.globalAlpha = 0.1 + Math.min(0.38, b.charge * 0.14);
      ctx.fillStyle = COLOR.bullet;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.charge > 1.7 ? "#ffffff" : COLOR.bullet;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.92 + b.charge * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  private drawPlayer(world: World): void {
    const ctx = this.ctx;
    const p = world.player;

    // 目前發射方向的指示線：讓學生看得見腳本裡的 dir 變數在轉，
    // 這是把「程式狀態」畫進遊戲畫面最便宜的一次機會
    const a = world.runner.state.dir * DEG;
    ctx.strokeStyle = COLOR.aim;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(a) * 34, p.y + Math.sin(a) * 34);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 無敵時間內閃爍
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return;

    ctx.fillStyle = COLOR.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLOR.playerRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
