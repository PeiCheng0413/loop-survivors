/**
 * 積木腳本的抽象語法樹。
 *
 * 這個格式就是 M1 之後 Blockly 要序列化成的目標 —— 先在 M0 用手寫 JSON 驗證
 * 遊戲手感，確定好玩了才接編輯器。若順序反過來，萬一手感不好，Blockly 的
 * 整合工作全部白做。
 */

/** 「方向設為」的目標。這塊積木把「瞄準」從手部動作轉譯成邏輯決策 */
export type AimTarget = "nearest" | "moveDir" | "random";

export type Node =
  /** 重複執行 (times) 次 —— C 形積木，可巢狀，本專案的主角 */
  | { kind: "repeat"; id: string; times: number; body: Node[] }
  /** 等待 (seconds) 秒 —— 顯式的大額時間成本，學生用它創造節奏 */
  | { kind: "wait"; id: string; seconds: number }
  /** 發射子彈 */
  | { kind: "fire"; id: string }
  /** 方向旋轉 (degrees) 度 —— 相對轉向 */
  | { kind: "turn"; id: string; degrees: number }
  /** 方向設為 [目標] —— 絕對轉向 */
  | { kind: "aim"; id: string; target: AimTarget }
  /** 子彈速度設為 (value) */
  | { kind: "setSpeed"; id: string; value: number }
  /** 子彈大小設為 (value) */
  | { kind: "setSize"; id: string; value: number }
  /** 子彈穿透設為 (value) */
  | { kind: "setPierce"; id: string; value: number }
  /**
   * 方向旋轉 (degrees) 度 × 目前迴圈次數。
   *
   * 這是「迴圈變數」的輕量版：不引入完整的變數系統，但讓學生第一次能用到
   * 「現在是第幾圈」這個資訊 —— 而它畫出來就是螺旋。迴圈跑到第幾次不再只是
   * 內部細節，而是可以拿來運算的東西。
   */
  | { kind: "turnByIndex"; id: string; degrees: number }
  /** 子彈速度增加 (value) —— 放進迴圈就是累加器 */
  | { kind: "addSpeed"; id: string; value: number }
  /** 子彈大小增加 (value) —— 放進迴圈就是累加器 */
  | { kind: "addSize"; id: string; value: number }
  /** 子彈存活時間設為 (value) 秒。速度 × 存活 = 射程 */
  | { kind: "setLife"; id: string; value: number }
  /**
   * 子彈轉向 每秒 (degrees) 度 —— 子彈會沿著弧線飛。
   *
   * 與迴圈相乘的效果最明顯：八方射線每發都彎，就成了旋渦。
   */
  | { kind: "setCurve"; id: string; degrees: number }
  /**
   * 發射點距離設為 (value) —— 子彈從離玩家這麼遠的地方生出來。
   *
   * 配合旋轉迴圈就是一圈發射點，隊形因此變寬。
   * 它教的是「位置也是可以設定的參數」。
   */
  | { kind: "setMuzzle"; id: string; value: number }
  /** 等待 (seconds) 秒 × 迴圈次數 —— 越後面的迭代等越久，做出漸慢的節奏 */
  | { kind: "waitByIndex"; id: string; seconds: number }
  /** 子彈改為追蹤 —— 稀有積木，只能從升級卡取得 */
  | { kind: "setHoming"; id: string }
  /** 子彈改為爆裂 —— 稀有積木，只能從升級卡取得 */
  | { kind: "setExplode"; id: string }
  /** 子彈改為分裂 —— 稀有積木，命中後分成兩發小彈 */
  | { kind: "setSplit"; id: string }
  /** 前進 (value) —— 箭矢專用。移動需要時間，距離越長花越久 */
  | { kind: "forward"; id: string; value: number }
  /** 右轉 (degrees) 度 —— 箭矢專用 */
  | { kind: "right"; id: string; degrees: number };

export interface Script {
  name: string;
  /** 容量上限（格數）。每塊積木佔 1 格，C 形積木本身也算 1 格 */
  capacity: number;
  body: Node[];
}

/**
 * 計算腳本佔用的格數。
 *
 * 這就是「容量上限」規則的實作 —— 迴圈之所以划算，是因為
 * 「重複 8 次 { 旋轉; 發射 }」只佔 3 格，展開寫要 16 格。
 * 學生不是被規定要用迴圈，是被逼到不得不發現迴圈划算。
 */
export function countBlocks(nodes: Node[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    if (node.kind === "repeat") n += countBlocks(node.body);
  }
  return n;
}

/** 展開寫需要幾格 —— 拿來跟實際格數對比，就是「迴圈省了多少」的量化 */
export function countExpanded(nodes: Node[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === "repeat") n += countExpanded(node.body) * node.times;
    else n += 1;
  }
  return n;
}

/**
 * 一輪腳本會發射幾發子彈。
 *
 * 跟 countBlocks() 一起顯示，就是「你用 3 格積木產生了 8 發子彈」這個
 * 效率指標 —— 迴圈的價值第一次被量化成學生看得懂的數字。
 */
export function countFires(nodes: Node[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === "fire") n += 1;
    else if (node.kind === "repeat") n += countFires(node.body) * node.times;
  }
  return n;
}

/** 腳本中出現過的最高子彈規格。火力換機動的計算基礎 */
export interface Spec {
  speed: number;
  size: number;
  pierce: number;
  life: number;
}

/**
 * 取腳本中設定過的最高規格。
 *
 * 取最高值而非實際發射時的值，是為了堵住「設高再設回來」的鑽漏洞空間，
 * 同時讓規則可預測 —— 學生拖積木的當下就看得到移速變化，不必等到開火。
 */
export function scriptSpec(nodes: Node[], base: Spec): Spec {
  const spec = { ...base };
  const walk = (list: Node[]) => {
    for (const node of list) {
      if (node.kind === "setSpeed") spec.speed = Math.max(spec.speed, node.value);
      else if (node.kind === "setSize") spec.size = Math.max(spec.size, node.value);
      else if (node.kind === "setPierce") spec.pierce = Math.max(spec.pierce, node.value);
      else if (node.kind === "setLife") spec.life = Math.max(spec.life, node.value);
      // 累加積木要算進負載，否則「速度增加 300 放進迴圈」就是免費的規格提升
      else if (node.kind === "addSpeed" && node.value > 0) spec.speed += node.value;
      else if (node.kind === "addSize" && node.value > 0) spec.size += node.value;
      else if (node.kind === "repeat") walk(node.body);
    }
  };
  walk(nodes);
  return spec;
}
