import { HEAT_DECAY } from "../config";
import type { Script } from "../script/ast";
import { toLines } from "../script/format";

/**
 * 遊玩時的腳本監視器。
 *
 * 積木面板在遊戲進行中是收起來的，但**暫停時 VM 根本沒在跑** ——
 * 也就是說 Blockly 上的積木高亮永遠看不到執行過程。而「看得見迴圈在繞圈」
 * 正是 4ms 時間成本設計換來的最大教學紅利（見 docs/DECISIONS.md §3a）。
 *
 * 所以把腳本以去背的小積木疊在戰場左上角，執行時逐塊發亮。
 * 它不是編輯器，只負責顯示 —— 要改積木還是得暫停。
 */
export class ScriptMonitor {
  private root: HTMLElement;
  private lineEls = new Map<string, HTMLElement>();
  private countEls = new Map<string, HTMLElement>();
  private heat = new Map<string, number>();
  private counts = new Map<string, number>();
  private shown = new Map<string, number>();
  private lastCycle = -1;
  private headId: string | null = null;

  private progress: HTMLElement;
  private list: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    // 進度條與積木列表講的是同一件事（腳本跑到哪），放在一起才不會
    // 在畫面上變成兩個互不相干、還會互相疊到的元素
    root.innerHTML = `<div class="mon-progress"><i></i></div><div class="mon-list"></div>`;
    this.progress = root.querySelector(".mon-progress i")!;
    this.list = root.querySelector(".mon-list")!;
  }

  setScript(script: Script): void {
    this.list.innerHTML = "";
    this.lineEls.clear();
    this.countEls.clear();
    this.heat.clear();
    this.counts.clear();
    this.shown.clear();
    this.lastCycle = -1;
    this.headId = null;

    for (const line of toLines(script.body)) {
      const el = document.createElement("div");
      el.className = `mon-line ${line.category}`;
      el.style.marginLeft = `${line.depth * 14}px`;

      const text = document.createElement("span");
      text.textContent = line.text;
      const count = document.createElement("span");
      count.className = "mon-count";

      el.append(text, count);
      this.list.appendChild(el);
      this.lineEls.set(line.id, el);
      this.countEls.set(line.id, count);
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /**
   * 與編輯器共用同一份執行軌跡（由 main 取一次分給兩邊）。
   * 餘輝的原理與參數見 config/ui.ts 的 HEAT_DECAY。
   */
  update(trace: string[], dt: number, cycle: number, progress = 0): void {
    this.progress.style.width = `${(progress * 100).toFixed(1)}%`;

    for (const id of trace) {
      this.heat.set(id, 1);
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    if (trace.length > 0) this.headId = trace[trace.length - 1];

    if (cycle !== this.lastCycle) {
      if (this.counts.size > 0) {
        this.shown = new Map(this.counts);
        this.counts.clear();
        this.renderCounts();
      }
      this.lastCycle = cycle;
    }

    const fade = dt / HEAT_DECAY;
    for (const [id, el] of this.lineEls) {
      let h = this.heat.get(id) ?? 0;
      if (h > 0 && fade > 0) {
        h = Math.max(0, h - fade);
        this.heat.set(id, h);
      }
      el.style.opacity = `${(0.3 + h * 0.7).toFixed(2)}`;
      el.classList.toggle("hot", h > 0.05);
      el.classList.toggle("head", h > 0 && id === this.headId);
    }
  }

  private renderCounts(): void {
    for (const [id, el] of this.countEls) {
      const n = this.shown.get(id) ?? 0;
      const label = n > 1 ? `×${n}` : "";
      if (el.textContent !== label) el.textContent = label;
    }
  }
}
