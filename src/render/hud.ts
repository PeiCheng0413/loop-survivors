import type { Phase } from "../config";
import type { World } from "../game/world";

/**
 * 戰場側的 HUD。積木面板已由 Blockly 編輯器接手（見 editor.ts），
 * 這裡只留戰況數字、腳本效率指標與血條。
 */
export class Hud {
  private stats: HTMLElement;
  private hpBar: HTMLElement;
  private xpBar: HTMLElement;
  private xpLabel: HTMLElement;
  private bossBar: HTMLElement;
  private bossFill: HTMLElement;
  private bossLabel: HTMLElement;
  /** 階段預告。顯示到玩家按下繼續為止 */
  private telegraph: Phase | null = null;
  private banner: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-stats"></div>
      <div class="hud-hp"><i></i></div>
      <div class="hud-xp"><i></i><span></span></div>
      <div class="hud-boss"><span></span><i></i></div>
      <div class="hud-banner"></div>
      <div class="hud-help">WASD／方向鍵 移動　·　1-5 換角色　·　空白 暫停並試射預覽　·　R 重來</div>
    `;
    this.stats = root.querySelector(".hud-stats")!;
    this.hpBar = root.querySelector(".hud-hp i")!;
    this.xpBar = root.querySelector(".hud-xp i")!;
    this.xpLabel = root.querySelector(".hud-xp span")!;
    this.banner = root.querySelector(".hud-banner")!;
    this.bossBar = root.querySelector(".hud-boss")!;
    this.bossFill = root.querySelector(".hud-boss i")!;
    this.bossLabel = root.querySelector(".hud-boss span")!;
  }

  /**
   * 顯示階段預告。內容直接寫出「該怎麼改排列」——
   * 不要讓學生猜，猜不到的人會硬打到死，那個教學時刻就浪費了。
   */
  showTelegraph(phase: Phase): void {
    this.telegraph = phase;
  }

  clearTelegraph(): void {
    this.telegraph = null;
  }

  update(world: World, fps: number, paused: boolean, started = true): void {
    const t = world.time;
    this.stats.textContent =
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` +
      `　擊殺 ${world.kills}　敵人 ${world.enemies.length}　子彈 ${world.bullets.length}` +
      `　${Math.round(fps)} fps　·　第 ${world.round} 輪 ${world.phase.name}`;

    this.hpBar.style.width = `${(world.player.hp / world.player.maxHp) * 100}%`;
    this.xpBar.style.width = `${(world.xp / world.xpNeeded) * 100}%`;
    const xpText = `Lv.${world.level}　${world.xp}/${world.xpNeeded}`;
    if (this.xpLabel.textContent !== xpText) this.xpLabel.textContent = xpText;

    // 王的血條只在王存在時出現
    const boss = world.boss;
    this.bossBar.classList.toggle("hidden", !boss);
    if (boss) {
      this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      this.bossLabel.textContent = "王";
    }

    let html = "";
    if (!started) {
      html =
        `<span class="banner-title">迴圈生存者</span>` +
        `<span class="banner-hint">左邊是你的攻擊腳本。改好之後按空白鍵開始</span>` +
        `<span class="banner-key">WASD 移動　·　空白鍵 暫停與編輯</span>`;
    } else if (world.dead) {
      // 死亡的訊息由結算畫面負責，HUD 不重複顯示
      html = "";
    }
    else if (this.telegraph) {
      html =
        `<span class="banner-title">第 ${world.round} 輪　${this.telegraph.name}</span>` +
        `<span class="banner-hint"></span>` +
        `<span class="banner-key">按空白鍵繼續</span>`;
    } else if (paused) html = "暫停";

    if (this.banner.innerHTML !== html) {
      this.banner.innerHTML = html;
      const hint = this.banner.querySelector(".banner-hint");
      // 提示用 textContent 填入，階段名稱與提示都來自設定檔而非使用者輸入，
      // 但保持一致的處理方式，日後若開放老師自訂就不會出事
      if (hint && this.telegraph) hint.textContent = this.telegraph.hint;
    }
  }
}
