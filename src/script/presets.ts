import type { AimTarget, Node, Script } from "./ast";

/**
 * 三張角色卡的起手腳本。
 *
 * M0 階段這是唯一的腳本來源（手寫 JSON），M1 之後改由 Blockly 產生，
 * 但這三段會留下來當角色卡的預設值 —— 空白畫布是新手最大的挫折來源，
 * 起手腳本則是免費的範例教學。
 */

let seq = 0;
const nid = () => `b${++seq}`;

// 這些小建構子讓下面的腳本讀起來接近積木本身的樣子
const repeat = (times: number, body: Node[]): Node => ({ kind: "repeat", id: nid(), times, body });
const wait = (seconds: number): Node => ({ kind: "wait", id: nid(), seconds });
const fire = (): Node => ({ kind: "fire", id: nid() });
const turn = (degrees: number): Node => ({ kind: "turn", id: nid(), degrees });
const aim = (target: AimTarget): Node => ({ kind: "aim", id: nid(), target });
const setSpeed = (value: number): Node => ({ kind: "setSpeed", id: nid(), value });
const turnByIndex = (degrees: number): Node => ({ kind: "turnByIndex", id: nid(), degrees });
const addSpeed = (value: number): Node => ({ kind: "addSpeed", id: nid(), value });
const setSize = (value: number): Node => ({ kind: "setSize", id: nid(), value });
const setPierce = (value: number): Node => ({ kind: "setPierce", id: nid(), value });

export const PRESETS: Script[] = [
  {
    // 單層迴圈 + 角度：最直觀的「迴圈畫出形狀」示範
    name: "散彈手",
    capacity: 12,
    body: [repeat(8, [turn(45), fire()])],
  },
  {
    // 單層迴圈 + 節奏：示範「等待」如何把時間變成設計元素
    name: "機槍手",
    capacity: 10,
    body: [aim("nearest"), repeat(3, [fire(), wait(0.1)])],
  },
  {
    // 刻意不含迴圈。選它的學生會很快發現火力不足，主動去想
    // 「我是不是該加個重複」—— 那個時刻就是我們要的。
    name: "狙擊手",
    capacity: 8,
    // 刻意壓低規格：它是「無迴圈」的對照組，若它是最強起手，
    // 學生會得到「不用迴圈也很好」的錯誤結論
    body: [aim("nearest"), setSpeed(560), setSize(6), setPierce(1), fire()],
  },
  {
    // 示範迴圈變數與累加器：旋轉量隨圈數遞增畫出螺旋，
    // 速度逐發累加讓子彈分層飛出，兩者都是「迴圈裡的值會一路長上去」
    name: "螺旋手",
    capacity: 14,
    body: [repeat(8, [turn(44), turnByIndex(6), addSpeed(40), fire()])],
  },
  {
    // 巢狀迴圈示範。M0 用來確認「同一塊積木塞內層或外層，畫面完全不同」
    // 這件事真的成立 —— 這是整個教學設計的核心賭注。
    name: "巢狀測試",
    capacity: 16,
    body: [repeat(8, [turn(45), repeat(3, [fire(), turn(6)])])],
  },
];
