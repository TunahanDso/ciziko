import WORDS_TR from "./words/tr";

export function pickOptions(used:Set<string>, count=4) {
  const pool = WORDS_TR.filter(w => !used.has(w));
  shuffle(pool);
  const options = pool.slice(0, count);
  options.forEach(w => used.add(w)); // tekrarı engellemek için round’luk işaretliyoruz
  return options;
}

function shuffle<T>(a:T[]) {
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
}
