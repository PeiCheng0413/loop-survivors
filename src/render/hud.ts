import { countBlocks, countExpanded, countFires, type Script } from "../script/ast";
import { toLines } from "../script/format";
import type { World } from "../game/world";

/**
 * HUD 用 DOM 而非 canvas 繪製：中文字排版、腳本清單的高亮切換，
 * DOM 都比 canvas 省事太多，而且更新量小。
 *
 * 這裡的腳本面板是 M1 Blockly 工作區的前身 —— 先用文字驗證
 * 「看得見迴圈在跑」這個教學紅利是否真的成立。
 */

/**
 * 餘輝衰減時間（秒）的候選值，用 H 鍵即時切換。
 *
 * 為什麼需要餘輝：一塊積木只佔 4ms，而畫面每 16.7ms 才畫一次 —— 直接畫
 * 「當前積木」等於每幀隨機抽一塊來亮，中間跑過的五塊完全看不見，看起來
 * 就是亂閃。改成熱度衰減後，一整幀跑過的積木會全部亮起來並逐漸退色，
 * 迴圈就變成一道**看得見的行進波**。
 *
 * 怎麼選值：散彈手一輪 418ms＝執行 83ms＋冷卻 350ms。衰減若比整個週期還長
 * （例如 0.45），畫面永遠不會全暗，看起來像一直亮著的糊團而非脈動；
 * 0.2 秒剛好涵蓋整段執行，又能在下一輪開始前退乾淨，留出黑暗間隙 ——
 * 於是脈衝的節奏就是攻擊週期本身。
 *
 * 這個值只影響顯示，完全不動遊戲速度 —— 可讀性與遊戲性不必互相犧牲。
 * 手感定案後可以把切換鍵拿掉，只留選定的常數。
 */
const HEAT_DECAY_STEPS = [0, 0.12, 0.2, 0.3, 0.45];

/** 0 代表關閉餘輝：熱度當幀清零，只畫這一幀跑過的積木，不留殘影 */
const HEAT_OFF = 0;

export class Hud {
  private stats: HTMLElement;
  private scriptName: HTMLElement;
  private scriptMeta: HTMLElement;
  private scriptBody: HTMLElement;
  private progressBar: HTMLElement;
  private hpBar: HTMLElement;
  private banner: HTMLElement;
  private help: HTMLElement;

  private lineEls = new Map<string, HTMLElement>();
  private countEls = new Map<string, HTMLElement>();
  /** 每塊積木的餘輝熱度 0～1 */
  private heat = new Map<string, number>();
  /** 本輪各積木的執行次數（累積中） */
  private counts = new Map<string, number>();
  /** 上一輪的執行次數（顯示用，冷卻期間維持不變才讀得到） */
  private shown = new Map<string, number>();
  private lastCycle = -1;
  private headId: string | null = null;
  private decayIndex = 0;

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
      <div class="hud-help"></div>
    `;
    this.stats = root.querySelector(".hud-stats")!;
    this.scriptName = root.querySelector(".hud-script-name")!;
    this.scriptMeta = root.querySelector(".hud-script-meta")!;
    this.scriptBody = root.querySelector(".hud-script-body")!;
    this.progressBar = root.querySelector(".hud-progress i")!;
    this.hpBar = root.querySelector(".hud-hp i")!;
    this.banner = root.querySelector(".hud-banner")!;
    this.help = root.querySelector(".hud-help")!;
    this.renderHelp();
  }

  /** 切換餘輝衰減速度。手感是主觀的，與其來回猜，不如讓人當場挑 */
  cycleDecay(): void {
    this.decayIndex = (this.decayIndex + 1) % HEAT_DECAY_STEPS.length;
    this.renderHelp();
  }

  private renderHelp(): void {
    const d = HEAT_DECAY_STEPS[this.decayIndex];
    this.help.textContent =
      `WASD／方向鍵 移動　·　1-4 切換腳本　·　空白 暫停　·　R 重來　·　` +
      `H 餘輝 ${d === HEAT_OFF ? "關" : `${d.toFixed(2)}s`}`;
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
    this.countEls.clear();
    this.heat.clear();
    this.counts.clear();
    this.shown.clear();
    this.headId = null;
    this.lastCycle = -1;

    for (const line of toLines(script.body)) {
      const el = document.createElement("div");
      el.className = "hud-line";
      el.style.paddingLeft = `${8 + line.depth * 16}px`;

      const text = document.createElement("span");
      text.textContent = line.text;
      const count = document.createElement("span");
      count.className = "hud-count";

      el.append(text, count);
      this.scriptBody.appendChild(el);
      this.lineEls.set(line.id, el);
      this.countEls.set(line.id, count);
    }
  }

  /** dt 傳 0 代表凍結餘輝（暫停時定格檢視） */
  update(world: World, dt: number, fps: number, paused: boolean): void {
    const t = world.time;
    this.stats.textContent =
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` +
      `　擊殺 ${world.kills}　敵人 ${world.enemies.length}　子彈 ${world.bullets.length}` +
      `　週期 ${world.runner.cycles}　${Math.round(fps)} fps`;

    this.updateHeat(world, dt);

    this.progressBar.style.width = `${world.runner.progress * 100}%`;
    this.hpBar.style.width = `${(world.player.hp / world.player.maxHp) * 100}%`;

    const msg = world.dead ? "陣亡　按 R 重來" : paused ? "暫停" : "";
    if (this.banner.textContent !== msg) this.banner.textContent = msg;
  }

  private updateHeat(world: World, dt: number): void {
    // 一輪跑完就把計數換到顯示欄位。冷卻期間數字維持不變，
    // 學生才有時間讀「這一輪這塊跑了 24 次」。
    if (world.runner.cycles !== this.lastCycle) {
      if (this.counts.size > 0) {
        this.shown = new Map(this.counts);
        this.counts.clear();
      }
      this.lastCycle = world.runner.cycles;
    }

    // 取走這一幀跑過的所有積木 —— 不是只取最後一塊
    const trace = world.runner.drainTrace();
    for (const id of trace) {
      this.heat.set(id, 1);
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    if (trace.length > 0) this.headId = trace[trace.length - 1];

    // 衰減設為 0 時 fade 是 Infinity，熱度當幀歸零 —— 就是「關閉餘輝」。
    // 暫停時 dt=0，0/0 得到 NaN，下方的 fade > 0 判斷會擋掉，餘輝照樣凍結。
    const fade = dt / HEAT_DECAY_STEPS[this.decayIndex];
    for (const [id, el] of this.lineEls) {
      let h = this.heat.get(id) ?? 0;
      if (h > 0 && fade > 0) {
        h = Math.max(0, h - fade);
        this.heat.set(id, h);
      }

      // 底色強度直接綁在熱度上：剛跑過的最亮，越舊越淡。
      // 因為衰減比執行慢得多，整個迴圈體會同時發亮，
      // 而最亮的那塊就是「現在跑到哪」的行進波前緣。
      el.style.backgroundColor = h > 0 ? `rgba(255, 200, 60, ${(0.10 + h * 0.42).toFixed(3)})` : "";
      el.style.color = h > 0.05 ? "#fff3d0" : "";
      el.classList.toggle("head", h > 0 && id === this.headId);

      const n = this.shown.get(id) ?? 0;
      const label = n > 1 ? `×${n}` : "";
      const countEl = this.countEls.get(id)!;
      if (countEl.textContent !== label) countEl.textContent = label;
    }
  }
}
