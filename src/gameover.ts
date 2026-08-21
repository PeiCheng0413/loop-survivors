import { formatTime, type RunRecord } from "./records";

/**
 * 死亡結算。
 *
 * 除了成績，還會給一句**針對這一局的建議** —— 死亡是學生最願意接受
 * 建議的時刻，而「你撐了 2 分 10 秒」本身不會讓人知道下一步該改什麼。
 */
export class GameOver {
  private root: HTMLElement;
  private open_ = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  show(run: RunRecord, records: RunRecord[], rank: number, advice: string): void {
    this.open_ = true;
    this.root.classList.remove("hidden");

    const rows = records
      .map((r, i) => {
        const me = r === run;
        return `<tr class="${me ? "me" : ""}">
          <td>${i + 1}</td>
          <td>${formatTime(r.time)}</td>
          <td>第 ${r.round} 輪</td>
          <td>${r.kills}</td>
          <td class="dim">${r.script}</td>
        </tr>`;
      })
      .join("");

    this.root.innerHTML = `
      <div class="over-box">
        <div class="over-title">${rank === 0 ? "新紀錄！" : "陣亡"}</div>
        <div class="over-score">${formatTime(run.time)}</div>
        <div class="over-stats">
          撐過第 ${run.round} 輪　·　擊殺 ${run.kills}　·　等級 ${run.level}
        </div>
        <div class="over-advice">${advice}</div>
        <table class="over-table">
          <thead><tr><th></th><th>存活</th><th>輪數</th><th>擊殺</th><th>角色</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="over-key">按 R 用同一份腳本再來一局</div>
      </div>
    `;
  }

  close(): void {
    this.open_ = false;
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }
}
