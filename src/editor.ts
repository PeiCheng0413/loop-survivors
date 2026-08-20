import * as Blockly from "blockly/core";
import { HEAT_DECAY } from "./config";
import { THEME } from "./blocks/defs";
import { buildToolbox, TOOLBOX } from "./blocks/toolbox";
import { workspaceToScript } from "./blocks/serialize";
import { hintFor, HINT_SOURCE } from "./blocks/hints";
import { scriptToState } from "./blocks/state";
import type { Script } from "./script/ast";

/**
 * 積木編輯器。包住 Blockly，對外只暴露「載入腳本 / 讀出腳本 / 點亮積木」。
 *
 * 三層限制全部由 Blockly 原生支援，不需要自製積木 UI：
 *   容量上限   → maxBlocks ＋ remainingCapacity()
 *   迴圈次數   → 數字欄位的 min/max（見 blocks/defs.ts）
 *   稀有積木   → maxInstances（M2 才會用到）
 */
export class Editor {
  readonly workspace: Blockly.WorkspaceSvg;
  private heat = new Map<string, number>();
  private headId: string | null = null;
  private current: Script;
  /** 本輪累積中的執行次數 */
  private counts = new Map<string, number>();
  /** 上一輪的執行次數。冷卻期間維持不變，學生才讀得到 */
  private shown = new Map<string, number>();
  private badges = new Map<string, SVGTextElement>();
  private lastCycle = -1;
  /** 這一局已解鎖的稀有積木與數量 */
  private rare = new Map<string, number>();

  constructor(container: HTMLElement, onChange: () => void) {
    this.workspace = Blockly.inject(container, {
      toolbox: TOOLBOX,
      theme: THEME,
      renderer: "zelos",
      // Blockly 預設會去官方 CDN 抓圖示。這裡指向 public/ 底下的本機副本，
      // 讓整個站台維持離線可用、也不依賴外部服務存活
      media: "blockly-media/",
      trashcan: false,
      grid: { spacing: 28, length: 2, colour: "#1b2436", snap: false },
      zoom: { controls: true, startScale: 0.75, minScale: 0.4, maxScale: 1.4 },
      move: { scrollbars: true, drag: true, wheel: true },
      sounds: false,
    });

    // UI 事件（選取、捲動、拖曳中）不代表程式碼有變，不必重新編譯腳本
    this.workspace.addChangeListener((e) => {
      if (e.isUiEvent) return;
      this.updateHints();
      onChange();
    });

    this.current = { name: "", capacity: 0, body: [] };
  }

  load(script: Script): void {
    // maxBlocks 連根積木一起數，但根積木不該佔學生的容量，所以 +1。
    // 注意 Blockly 數的是工作區裡所有積木，包含拖出來沒接上的散塊 ——
    // 這是刻意接受的行為（見 docs/DECISIONS.md 未解風險 2）。
    this.workspace.options.maxBlocks = script.capacity + 1;
    this.current = { ...script };
    this.rare.clear();
    this.workspace.options.maxInstances = {};
    this.workspace.updateToolbox(TOOLBOX);
    this.heat.clear();
    this.counts.clear();
    this.shown.clear();
    this.badges.clear(); // 積木會被整批換掉，舊的 SVG 節點跟著消失
    this.lastCycle = -1;
    this.headId = null;
    Blockly.serialization.workspaces.load(scriptToState(script), this.workspace);
    this.updateHints();
  }

  /**
   * 重算每塊積木上的代價提示。
   *
   * 必須用 Events.disable() 包起來：setValue 會發出 BLOCK_CHANGE 事件，
   * 而我們正是在變更監聽器裡呼叫這個函式 —— 不擋掉就是無窮遞迴。
   */
  private updateHints(): void {
    Blockly.Events.disable();
    try {
      // 工具箱裡的積木也要標上代價 —— 學生在「要不要拖它下來」的當下
      // 就該看得到價碼，而不是拖下來才發現
      const flyout = this.workspace.getFlyout()?.getWorkspace();
      const blocks = flyout
        ? [...this.workspace.getAllBlocks(false), ...flyout.getAllBlocks(false)]
        : this.workspace.getAllBlocks(false);
      for (const block of blocks) {
        const source = HINT_SOURCE[block.type];
        if (!source) continue;
        const field = block.getField("HINT");
        if (!field) continue;
        const text = hintFor(block.type, Number(block.getFieldValue(source)));
        if (text !== null && field.getValue() !== text) field.setValue(text);
      }
    } finally {
      Blockly.Events.enable();
    }
  }

  read(): Script {
    return workspaceToScript(this.workspace, this.current.name, this.current.capacity);
  }

  /** 已用格數（不含根積木） */
  used(): number {
    return Math.max(0, this.workspace.getAllBlocks(false).length - 1);
  }

  capacity(): number {
    return this.current.capacity;
  }

  /** 容量升級卡。maxBlocks 連根積木一起數，所以要 +1 */
  addCapacity(n: number): void {
    this.current.capacity += n;
    this.workspace.options.maxBlocks = this.current.capacity + 1;
  }

  rareCount(type: string): number {
    return this.rare.get(type) ?? 0;
  }

  /**
   * 解鎖一塊稀有積木。
   *
   * maxInstances 是 Blockly 原生的每型別上限：達到上限後不但拖不出新的，
   * isDuplicatable() 也會自動回傳 false —— 連「複製貼上繞過限量」都不必自己擋。
   */
  unlockBlock(type: string): void {
    const next = this.rareCount(type) + 1;
    this.rare.set(type, next);
    this.workspace.options.maxInstances = {
      ...this.workspace.options.maxInstances,
      [type]: next,
    };
    this.workspace.updateToolbox(buildToolbox(this.rare));
  }

  resize(): void {
    Blockly.svgResize(this.workspace);
  }

  /**
   * 依執行軌跡點亮積木。dt 傳 0 代表凍結（暫停時定格檢視）。
   *
   * 濾鏡只套在積木自己的 path 上，不套整個 SVG 群組 —— 巢狀積木在
   * Blockly 裡是父積木的子元素，套在群組上會讓亮度滲透到內層積木，
   * 看起來像整個迴圈都在執行。
   */
  updateHeat(trace: string[], dt: number, cycle: number): void {
    for (const id of trace) {
      this.heat.set(id, 1);
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    if (trace.length > 0) this.headId = trace[trace.length - 1];

    // 一輪跑完就把計數換到顯示欄位，冷卻期間數字不動
    if (cycle !== this.lastCycle) {
      if (this.counts.size > 0) {
        this.shown = new Map(this.counts);
        this.counts.clear();
        this.renderBadges();
      }
      this.lastCycle = cycle;
    }

    const fade = dt / HEAT_DECAY;
    // 邊走訪邊 delete 目前這個 key 對 Map 是安全的，不需要先複製一份
    for (const [id, prev] of this.heat) {
      let h = prev;
      if (h > 0 && fade > 0) {
        h = Math.max(0, h - fade);
        this.heat.set(id, h);
      }

      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      const path = block?.pathObject?.svgPath as SVGElement | undefined;
      if (path) {
        if (h <= 0) {
          path.style.filter = "";
        } else if (id === this.headId) {
          path.style.filter =
            `brightness(${(1 + h * 0.5).toFixed(2)}) drop-shadow(0 0 9px rgba(255, 225, 130, ${h.toFixed(2)}))`;
        } else {
          path.style.filter = `brightness(${(1 + h * 0.45).toFixed(2)})`;
        }
      }

      if (h <= 0) this.heat.delete(id);
    }
  }

  /**
   * 在每塊積木旁標上「本輪執行了幾次」。
   *
   * 這是教巢狀迴圈最有力的一個畫面：外層 ×8、內層 ×24 並排，
   * 「內層跑得比外層兇」不需要解釋，指著看就懂了。
   * 動畫看過就忘，數字會留在畫面上被討論。
   *
   * 標籤直接掛進積木自己的 SVG 群組，因此縮放、拖曳、捲動時
   * 都會自動跟著走，不需要任何座標換算。
   */
  private renderBadges(): void {
    for (const [id, badge] of this.badges) {
      if (!this.shown.has(id)) {
        badge.remove();
        this.badges.delete(id);
      }
    }

    for (const [id, n] of this.shown) {
      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      const root = block?.getSvgRoot();
      if (!root) continue;

      // 只跑一次的積木不標數字：那是常態，標了只是噪音
      if (n <= 1) {
        this.badges.get(id)?.remove();
        this.badges.delete(id);
        continue;
      }

      let badge = this.badges.get(id);
      if (!badge || !badge.isConnected) {
        badge = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badge.setAttribute("class", "ls-count");
        this.badges.set(id, badge);
      }
      root.appendChild(badge); // 重新掛回最上層，避免被積木重繪蓋住
      badge.setAttribute("x", String(block!.width + 10));
      badge.setAttribute("y", "22");
      badge.textContent = `×${n}`;
    }
  }
}
