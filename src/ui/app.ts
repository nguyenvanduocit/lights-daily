import { SIZE, dailyBoard, isSolved, shareString } from "../core/index";
import { arrowTarget, press, type Game } from "./game";

/** Renders today's puzzle into `root` and wires mouse and keyboard play. */
export function mountApp(root: HTMLElement, today: Date): void {
  root.innerHTML = `
    <h1>Lights Daily</h1>
    <p id="help">Turn every light off. Pressing a cell flips it and its neighbours. Arrow keys move, Enter or Space presses.</p>
    <p class="moves">Moves: <span data-testid="moves">0</span></p>
    <div class="board" role="group" aria-label="Board" aria-describedby="help"></div>
    <p class="status" role="status"></p>
    <button class="copy" type="button" hidden>Copy result</button>
  `;
  const boardEl = root.querySelector<HTMLElement>(".board")!;
  const movesEl = root.querySelector<HTMLElement>("[data-testid=moves]")!;
  const statusEl = root.querySelector<HTMLElement>(".status")!;
  const copyEl = root.querySelector<HTMLButtonElement>(".copy")!;

  let game: Game = { board: dailyBoard(today), moves: 0 };
  let focused = 0;

  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.addEventListener("click", () => {
      focused = i;
      game = press(game, Math.floor(i / SIZE), i % SIZE);
      render();
    });
    cell.addEventListener("keydown", (event) => {
      const target = arrowTarget(i, event.key);
      if (target === null) return;
      event.preventDefault();
      focused = target;
      render();
      cells[target].focus();
    });
    boardEl.append(cell);
    return cell;
  });

  copyEl.addEventListener("click", async () => {
    const url = location.origin + location.pathname;
    try {
      await navigator.clipboard.writeText(shareString(today, game.moves, url));
      copyEl.textContent = "Copied";
    } catch {
      copyEl.textContent = "Copy failed — try again";
    }
  });

  function render(): void {
    const solved = isSolved(game.board);
    cells.forEach((cell, i) => {
      const on = game.board[i];
      cell.classList.toggle("on", on);
      cell.setAttribute("aria-label", `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}, ${on ? "on" : "off"}`);
      cell.setAttribute("aria-disabled", String(solved));
      cell.tabIndex = i === focused ? 0 : -1;
    });
    movesEl.textContent = String(game.moves);
    statusEl.textContent = solved ? `Solved in ${game.moves} moves!` : "";
    copyEl.hidden = !solved;
  }

  render();
}
