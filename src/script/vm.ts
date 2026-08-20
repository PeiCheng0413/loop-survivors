import { BLOCK_COST, REPEAT_LIMIT, BULLET } from "../config";
import type { AimTarget, Node, Script } from "./ast";

/**
 * VM 與遊戲世界之間的唯一介面。
 *
 * VM 絕不直接碰 World —— 因為 M1 的試射預覽視窗要傳入一個假的 host
 * （沒有敵人的簡化場景），重用同一個 VM。這層介面就是預覽功能的地基。
 */
export interface ScriptHost {
  fire(dirDeg: number, opts: BulletOpts): void;
  /** 回傳角度（度）。查不到目標時回傳 fallback，讓腳本永遠不會卡住 */
  aimAngle(target: AimTarget, fallback: number): number;
}

export interface BulletOpts {
  speed: number;
  size: number;
  pierce: number;
}

/** 腳本的執行狀態。發射參數是狀態積木的作用對象 */
export interface VMState {
  /** 目前發射方向（度）。0 = 右，順時針為正（Canvas 的 Y 軸向下） */
  dir: number;
  speed: number;
  size: number;
  pierce: number;
  /** 目前執行到哪一塊積木 —— 積木高亮的資料來源 */
  currentId: string | null;
}

function freshOpts(): BulletOpts {
  return { speed: BULLET.speed, size: BULLET.size, pierce: BULLET.pierce };
}

/**
 * 直譯器本體。
 *
 * yield 出去的數字 = 這一步要消耗的腳本時間（秒）。
 * 呼叫端（ScriptRunner）負責把它換算成幀。用 generator 而不是自己維護
 * 指令指標與呼叫堆疊，是因為巢狀迴圈的狀態機用 yield* 遞迴表達最乾淨。
 */
export function* exec(
  nodes: Node[],
  st: VMState,
  host: ScriptHost,
): Generator<number, void, void> {
  for (const node of nodes) {
    st.currentId = node.id;

    switch (node.kind) {
      case "repeat": {
        // 迴圈本身只在進入時計費一次，不是每次迭代都收 —— 讓迴圈的成本
        // 幾乎等於它展開後的內容，這樣「用迴圈」跟「手動展開」在時間上
        // 公平，容量上限才是唯一的差別，教學訊號才乾淨。
        yield BLOCK_COST;
        const times = Math.max(0, Math.min(Math.floor(node.times), REPEAT_LIMIT));
        for (let i = 0; i < times; i++) {
          yield* exec(node.body, st, host);
          // 回到迴圈頭：讓高亮在跳回時閃一下，視覺上看得出「又繞了一圈」
          st.currentId = node.id;
        }
        break;
      }

      case "wait":
        yield BLOCK_COST + Math.max(0, node.seconds);
        break;

      case "fire":
        host.fire(st.dir, { speed: st.speed, size: st.size, pierce: st.pierce });
        yield BLOCK_COST;
        break;

      case "turn":
        st.dir += node.degrees;
        yield BLOCK_COST;
        break;

      case "aim":
        st.dir = host.aimAngle(node.target, st.dir);
        yield BLOCK_COST;
        break;

      case "setSpeed":
        st.speed = node.value;
        yield BLOCK_COST;
        break;

      case "setSize":
        st.size = node.value;
        yield BLOCK_COST;
        break;

      case "setPierce":
        st.pierce = node.value;
        yield BLOCK_COST;
        break;
    }
  }
}

/**
 * 把 generator 的「腳本時間」接到遊戲的「真實時間」上。
 *
 * 核心是一套「欠債」機制：每次 next() 回來的成本先記成 debt，
 * 用每幀的時間預算去償還；債還完才能推進下一步。積木成本與週期冷卻
 * 共用同一套機制，所以程式碼只有一條路徑。
 */
export class ScriptRunner {
  readonly state: VMState;
  /** 完成的攻擊週期數，拿來觀察腳本節奏 */
  cycles = 0;
  /** 這一輪已經跑到第幾步，給 HUD 的進度條用 */
  private steps = 0;
  private stepsLastCycle = 1;

  private gen: Generator<number, void, void> | null = null;
  private debt = 0;

  script: Script;
  private host: ScriptHost;
  private cycleCooldown: number;

  constructor(script: Script, host: ScriptHost, cycleCooldown: number) {
    this.script = script;
    this.host = host;
    this.cycleCooldown = cycleCooldown;
    this.state = { dir: 0, ...freshOpts(), currentId: null };
  }

  /** 本輪執行進度 0～1，純粹給 HUD 顯示用 */
  get progress(): number {
    return Math.min(1, this.steps / Math.max(1, this.stepsLastCycle));
  }

  reset(script?: Script): void {
    if (script) this.script = script;
    this.gen = null;
    this.debt = 0;
    this.cycles = 0;
    this.steps = 0;
    this.state.dir = 0;
    Object.assign(this.state, freshOpts());
    this.state.currentId = null;
  }

  update(dt: number): void {
    let budget = dt;
    // 防呆上限：極端腳本（例如全是零成本積木）不該把主執行緒卡死。
    // 正常情況一幀約推進 4 步，離這個上限很遠。
    let guard = 0;

    while (budget > 0 && guard++ < 5000) {
      if (this.debt > 0) {
        const pay = Math.min(this.debt, budget);
        this.debt -= pay;
        budget -= pay;
        if (this.debt > 1e-9) return; // 預算用完，債還沒還完，下一幀繼續
        this.debt = 0;
      }

      if (!this.gen) {
        this.gen = exec(this.script.body, this.state, this.host);
        this.steps = 0;
        // 每輪重置發射參數，但**保留 dir**。
        // 保留方向讓「重複 8 次 { 旋轉 50 度; 發射 }」跨週期持續轉動，
        // 自然長出旋轉扇形 —— 這是彈幕遊戲最經典的造型，也獎勵學生
        // 去試那些不能整除 360 的角度。
        Object.assign(this.state, freshOpts());
      }

      const r = this.gen.next();
      this.steps++;

      if (r.done) {
        this.gen = null;
        this.cycles++;
        this.stepsLastCycle = Math.max(1, this.steps);
        this.state.currentId = null;
        this.debt = this.cycleCooldown; // 冷卻沿用同一套欠債機制
      } else {
        this.debt = r.value;
      }
    }
  }
}
