// 計算キーボードの式（COMMON-03）。使う記号は + − × ÷。結果は整数に四捨五入する（OV-05）
export const OPS = ['+', '−', '×', '÷'];

// 式を数と記号に分ける。最後が記号なら無視する
function tokens(expr) {
  const out = [];
  let num = '';
  for (const ch of expr) {
    if (ch >= '0' && ch <= '9') num += ch;
    else if (OPS.includes(ch)) {
      if (num === '') {
        if (out.length && OPS.includes(out[out.length - 1])) out[out.length - 1] = ch;
        continue;
      }
      out.push(Number(num), ch);
      num = '';
    }
  }
  if (num !== '') out.push(Number(num));
  else if (OPS.includes(out[out.length - 1])) out.pop();
  return out;
}

// 式の値。空や 0 での割り算は null
export function evaluate(expr) {
  const tk = tokens(String(expr ?? ''));
  if (!tk.length) return null;
  // × ÷ を先に計算する
  const sum = [tk[0]];
  for (let i = 1; i < tk.length; i += 2) {
    const op = tk[i];
    const v = tk[i + 1];
    if (op === '×') sum[sum.length - 1] *= v;
    else if (op === '÷') {
      if (v === 0) return null;
      sum[sum.length - 1] /= v;
    } else sum.push(op, v);
  }
  let r = sum[0];
  for (let i = 1; i < sum.length; i += 2) r = sum[i] === '+' ? r + sum[i + 1] : r - sum[i + 1];
  return Number.isFinite(r) ? Math.round(r) : null;
}

export function hasOperator(expr) {
  return OPS.some((op) => String(expr).slice(1).includes(op));
}

// キーを押したときの式。'C' で消す、'⌫' で1文字消す
export function pressKey(expr, key) {
  const s = String(expr ?? '');
  if (key === 'C') return '';
  if (key === '⌫') return s.slice(0, -1);
  if (OPS.includes(key)) {
    if (s === '') return '';
    return OPS.includes(s.at(-1)) ? s.slice(0, -1) + key : s + key;
  }
  // 数の先頭の 0 は重ねない
  const lastNum = s.split(/[+−×÷]/).at(-1);
  if (lastNum === '0') return s.slice(0, -1) + (key === '00' ? '0' : key);
  if (lastNum === '' && key === '00') return s + '0';
  if (s.length >= 40) return s;
  return s + key;
}
