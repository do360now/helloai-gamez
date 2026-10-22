// Codex GPT-6: current and visible next-piece search. Run with agents/run.mjs.
const shapes = { I:['####'], O:['##','##'], T:['.#.','###'], S:['.##','##.'], Z:['##.','.##'], J:['#..','###'], L:['..#','###'] };
function rotations(type) {
  let cells = shapes[type].flatMap((row,y) => [...row].flatMap((v,x) => v === '#' ? [[x,y]] : []));
  const out = [];
  for (let r=0;r<4;r++) {
    out.push(cells);
    const h = Math.max(...cells.map(c=>c[1]));
    cells = cells.map(([x,y])=>[h-y,x]);
  }
  return out;
}
function place(board,cells,col) {
  const fits = y => cells.every(([x,dy]) => col+x>=0 && col+x<10 && y+dy<20 && !board[y+dy][col+x]);
  if (!fits(0)) return null;
  let y=0;
  while(fits(y+1)) y++;
  let b=board.map(r=>r.slice());
  for(const [x,dy] of cells) b[y+dy][col+x]=true;
  const kept=b.filter(row=>!row.every(Boolean)), lines=20-kept.length;
  while(kept.length<20) kept.unshift(Array(10).fill(false));
  return {board:kept,lines};
}
function quality(board) {
  let holes=0, covered=0;
  const heights=Array(10).fill(0);
  for(let x=0;x<10;x++) {
    let blocks=0;
    for(let y=0;y<20;y++) {
      if(board[y][x]) {if(!heights[x]) heights[x]=20-y;blocks++;}
      else if(blocks) {holes++;covered+=blocks;}
    }
  }
  const bump=heights.slice(1).reduce((s,h,i)=>s+Math.abs(h-heights[i]),0);
  return -0.5*heights.reduce((s,h)=>s+h,0)-0.3*bump-10*holes-0.4*covered-0.5*Math.max(...heights);
}
function choose(obs) {
  const board=obs.board.map(row=>[...row].map(c=>c==='#'));
  let best=null;
  for(const action of obs.placements) {
    const [,r,c]=action.split(' ').map(Number);
    const result=place(board,obs.rotations[r],c);
    if(!result) continue;
    let value=quality(result.board)+6*result.lines;
    if(obs.piecesLeft>1 && obs.next) {
      let future=-1e9;
      for(const cells of rotations(obs.next)) {
        const width=1+Math.max(...cells.map(c=>c[0]));
        for(let col=0;col<=10-width;col++) {
          const next=place(result.board,cells,col);
          if(next) future=Math.max(future,quality(next.board)+6*next.lines);
        }
      }
      value=6*result.lines+future+0.05*quality(result.board);
    }
    if(!best || value>best.value) best={action,value};
  }
  if(!best) throw Error('No legal placement');
  return best.action;
}


export { choose };
export const player = {
  "id": "codex-gpt-6",
  "name": "Codex GPT-6",
  "kind": "agent",
  "model": "gpt-6",
  "harness": "Codex-authored JavaScript placement search via Playwright; public JSON observations; current and visible next piece",
  "notes": "Attempt 2, one completed run. The user requested a restart during attempt 1 (manual model decisions, 15 pieces, 920 points, 3 lines). Attempt 2 used a fixed two-piece heuristic search penalizing stack height, holes, covered holes and unevenness and rewarding line clears. No hold, seed prediction, hidden state, parameter tuning or further retries. Read the repository baseline source before attempt 1. Harness saved alongside the run."
};
