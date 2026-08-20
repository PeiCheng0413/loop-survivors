import { countExpanded, countFires, type Script } from "../script/ast";
import type { World } from "../game/world";

/**
 * 戰場側的 HUD。積木面板已由 Blockly 編輯器接手（見 editor.ts），
 * 這裡只留戰況數字、腳本效率指標與血條。
 */
export class Hud {
  private stats: HTMLElement;
  private meta: HTMLElement;
  private progressBar: HTMLElement;
  private hpBar: HTMLElement;
  private banner: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-stats"></div>
      <div class="hud-meta"></div>
      <div class="hud-hp"><i></i></div>
      <div class="hud-progress"><i></i></div>
      <div class="hud-banner"></div>
      <div class="hud-help">WASD／方向鍵 移動　·　1-4 換角色　·　空白 暫停並試射預覽　·　R 重來</div>
    `;
    this.stats = root.querySelector(".hud-stats")!;
    this.meta = root.querySelector(".hud-meta")!;
    this.progressBar = root.querySelector(".hud-progress i")!;
    this.hpBar = root.querySelector(".hud-hp i")!;
    this.banner = root.querySelector(".hud-banner")!;
  }

  /**
   * 腳本改變時更新效率指標。
   *
   * 「3/12 格 → 每輪 8 發（展開寫需 16 格）」就是迴圈價值的量化 ——
   * 學生每拖一塊積木，這行數字就會動，容量的壓力因此是持續可見的。
   */
  setScript(script: Script, used: number, overCapacity: boolean, mobility: number): void {
    const fires = countFires(script.body);
    const expanded = countExpanded(script.body);
    // 移速跟著子彈規格連動，拖積木的當下就看得到代價
    const move = Math.round(mobility * 100);
    this.meta.textContent =
      `${script.name}　·　容量 ${used}/${script.capacity} 格　·　每輪 ${fires} 發　·　` +
      `展開寫需 ${expanded} 格　·　移速 ${move}%`;
    this.meta.classList.toggle("over", overCapacity);
  }

  update(world: World, fps: number, paused: boolean): void {
    const t = world.time;
    this.stats.textContent =
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` +
      `　擊殺 ${world.kills}　敵人 ${world.enemies.length}　子彈 ${world.bullets.length}` +
      `　週期 ${world.runner.cycles}　${Math.round(fps)} fps`;

    this.progressBar.style.width = `${world.runner.progress * 100}%`;
    this.hpBar.style.width = `${(world.player.hp / world.player.maxHp) * 100}%`;

    const msg = world.dead ? "陣亡　按 R 重來" : paused ? "暫停" : "";
    if (this.banner.textContent !== msg) this.banner.textContent = msg;
  }
}
