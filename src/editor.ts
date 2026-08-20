import * as Blockly from "blockly/core";
import { HEAT_DECAY } from "./config";
import { THEME } from "./blocks/defs";
import { TOOLBOX } from "./blocks/toolbox";
import { workspaceToScript } from "./blocks/serialize";
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
      onChange();
    });

    this.current = { name: "", capacity: 0, body: [] };
  }

  load(script: Script): void {
    // maxBlocks 連根積木一起數，但根積木不該佔學生的容量，所以 +1。
    // 注意 Blockly 數的是工作區裡所有積木，包含拖出來沒接上的散塊 ——
    // 這是刻意接受的行為（見 docs/DECISIONS.md 未解風險 2）。
    this.workspace.options.maxBlocks = script.capacity + 1;
    this.current = script;
    this.heat.clear();
    this.headId = null;
    Blockly.serialization.workspaces.load(scriptToState(script), this.workspace);
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
  updateHeat(trace: string[], dt: number): void {
    for (const id of trace) this.heat.set(id, 1);
    if (trace.length > 0) this.headId = trace[trace.length - 1];

    const fade = dt / HEAT_DECAY;
    for (const [id, prev] of [...this.heat]) {
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
}
