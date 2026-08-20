import { countBlocks, countExpanded, countFires, type Script } from "../script/ast";
import { toLines } from "../script/format";
import type { World } from "../game/world";

/**
 * HUD 用 DOM 而非 canvas 繪製：中文字排版、腳本清單的高亮切換，
 * DOM 都比 canvas 省事太多，而且更新量小（每幀只改幾個 textContent）。
 *
 * 這裡的腳本面板是 M1 Blockly 工作區的前身 —— 先用文字驗證
 * 「看得見迴圈在跑」這個教學紅利是否真的成立。
 */
export class Hud {
  private stats: HTMLElement;
  private scriptName: HTMLElement;
  private scriptMeta: HTMLElement;
  private scriptBody: HTMLElement;
  private progressBar: HTMLElement;
  private hpBar: HTMLElement;
  private banner: HTMLElement;
  private lineEls = new Map<string, HTMLElement>();
  private activeId: string | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-stats"></div>
      <div class="hud-script">
        <div class="hud-script-name"></div>
        <div class="hud-script-meta"></div>
        <div class="hud-script-body"></div>
        <div class="hud-progress"><i></i></div>
      </div>
      <div class="hud-hp"><i></i></div>
      <div class="hud-banner"></div>
      <div class="hud-help">WASD／方向鍵 移動　·　1-4 切換腳本　·　空白 暫停　·　R 重來</div>
    `;
    this.stats = root.querySelector(".hud-stats")!;
    this.scriptName = root.querySelector(".hud-script-name")!;
    this.scriptMeta = root.querySelector(".hud-script-meta")!;
    this.scriptBody = root.querySelector(".hud-script-body")!;
    this.progressBar = root.querySelector(".hud-progress i")!;
    this.hpBar = root.querySelector(".hud-hp i")!;
    this.banner = root.querySelector(".hud-banner")!;
  }

  setScript(script: Script): void {
    const used = countBlocks(script.body);
    const expanded = countExpanded(script.body);
    const fires = countFires(script.body);

    this.scriptName.textContent = script.name;
    // 「3 格 → 每輪 8 發」就是迴圈價值的量化。展開寫要 16 格、爆掉容量，
    // 這個對比是整個容量規則想讓學生看見的東西。
    this.scriptMeta.textContent =
      `容量 ${used}/${script.capacity} 格　·　每輪 ${fires} 發　·　展開寫需 ${expanded} 格`;

    this.scriptBody.innerHTML = "";
    this.lineEls.clear();
    this.activeId = null;
    for (const line of toLines(script.body)) {
      const el = document.createElement("div");
      el.className = "hud-line";
      el.style.paddingLeft = `${line.depth * 16}px`;
      el.textContent = line.text;
      this.scriptBody.appendChild(el);
      this.lineEls.set(line.id, el);
    }
  }

  update(world: World, fps: number, paused: boolean): void {
    const t = world.time;
    this.stats.textContent =
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` +
      `　擊殺 ${world.kills}　敵人 ${world.enemies.length}　子彈 ${world.bullets.length}` +
      `　週期 ${world.runner.cycles}　${Math.round(fps)} fps`;

    // 積木高亮：只切換有變動的兩個元素，不整份重繪
    const id = world.runner.state.currentId;
    if (id !== this.activeId) {
      if (this.activeId) this.lineEls.get(this.activeId)?.classList.remove("active");
      if (id) this.lineEls.get(id)?.classList.add("active");
      this.activeId = id;
    }

    this.progressBar.style.width = `${world.runner.progress * 100}%`;
    this.hpBar.style.width = `${(world.player.hp / world.player.maxHp) * 100}%`;

    const msg = world.dead ? "陣亡　按 R 重來" : paused ? "暫停" : "";
    if (this.banner.textContent !== msg) this.banner.textContent = msg;
  }
}
