'use strict';

/* ---------- 地点数据（经纬度 + UTC 偏移小时） ---------- */
const LOCATIONS = [
  { name: '北京',       lat: 39.9042, lng: 116.4074, tz: 8 },
  { name: '上海',       lat: 31.2304, lng: 121.4737, tz: 8 },
  { name: '广州',       lat: 23.1291, lng: 113.2644, tz: 8 },
  { name: '成都',       lat: 30.5728, lng: 104.0668, tz: 8 },
  { name: '西安',       lat: 34.3416, lng: 108.9398, tz: 8 },
  { name: '哈尔滨',     lat: 45.8038, lng: 126.5350, tz: 8 },
  { name: '拉萨',       lat: 29.6520, lng: 91.1721,  tz: 8 },
  { name: '乌鲁木齐',   lat: 43.8256, lng: 87.6168,  tz: 8 },
  { name: '香港',       lat: 22.3193, lng: 114.1694, tz: 8 },
  { name: '东京',       lat: 35.6762, lng: 139.6503, tz: 9 },
  { name: '伦敦',       lat: 51.5074, lng: -0.1278,  tz: 0 },
  { name: '纽约',       lat: 40.7128, lng: -74.0060, tz: -5 }
];

const PHASE_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];

/* ---------- 状态 ---------- */
const state = {
  loc: LOCATIONS[0],
  date: startOfToday(),     // 选中的本地日期（当地时区 0 点，用 UTC 表示的时刻）
  year: new Date().getUTCFullYear(),
  obsMinutes: null          // 观测时刻（当地 0..1439 分钟）；null 时按当天升落中点
};

/* ---------- 时间辅助 ----------
   我们用「当地时区」思考。做法：把某地当地时间 t(local) 对应的 UTC 时刻 =
   Date.UTC(y,m,d,h - tz)。反过来，一个 UTC Date 在当地的显示 = 加上 tz 小时后读 UTC 字段。
*/
function startOfToday() {
  const now = new Date();
  // 以北京时区起步；真正按选中地点重算在 setLocation 里
  return localMidnightUTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8);
}
function localMidnightUTC(y, mon, day, tz) {
  // 当地 00:00 对应的 UTC 时刻
  return new Date(Date.UTC(y, mon, day, 0, 0, 0) - tz * 3600 * 1000);
}
// 把 UTC Date 转成「当地时钟」的分钟数(0..1440)，用于在 24h 轴上定位
function localMinutes(utcDate, tz) {
  const shifted = new Date(utcDate.getTime() + tz * 3600 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}
function fmtLocal(utcDate, tz) {
  if (!utcDate) return '--:--';
  const shifted = new Date(utcDate.getTime() + tz * 3600 * 1000);
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const m = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
// 选中日期在当地的 y/m/d
function localYMD(utcDate, tz) {
  const shifted = new Date(utcDate.getTime() + tz * 3600 * 1000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}
// 选中日期 + 当地分钟 → 对应的 UTC 时刻
function localDateTimeUTC(utcDayStart, tz, minutes) {
  const ymd = localYMD(utcDayStart, tz);
  return new Date(localMidnightUTC(ymd.y, ymd.m, ymd.d, tz).getTime() + minutes * 60 * 1000);
}
// 若选中日期就是「今天」，返回当地当前分钟；否则返回 null
function nowLocalMinutesIfToday() {
  const now = new Date();
  const nowYMD = localYMD(now, state.loc.tz);
  const selYMD = localYMD(state.date, state.loc.tz);
  if (nowYMD.y === selYMD.y && nowYMD.m === selYMD.m && nowYMD.d === selYMD.d) {
    return localMinutes(now, state.loc.tz);
  }
  return null;
}

/* ---------- 月相 ---------- */
function phaseIndex(fraction, phaseVal) {
  // phaseVal: 0=新月, 0.5=满月, 依 SunCalc.phase (0..1)
  // 按 8 相划分
  const p = phaseVal;
  if (p < 0.03 || p > 0.97) return 0;      // 新月
  if (p < 0.22) return 1;                  // 娥眉月
  if (p < 0.28) return 2;                  // 上弦
  if (p < 0.47) return 3;                  // 盈凸
  if (p < 0.53) return 4;                  // 满月
  if (p < 0.72) return 5;                  // 亏凸
  if (p < 0.78) return 6;                  // 下弦
  return 7;                                // 残月
}

/* 在 canvas 上画月相：illum=0..1 照明比例，phaseVal 决定盈亏(左暗还是右暗) */
function drawMoon(ctx, cx, cy, r, illum, phaseVal, opts) {
  opts = opts || {};
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 暗面底盘
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.dark || '#1c2340';
  ctx.fill();

  // 亮面：用两段圆弧近似晨昏线
  const lit = Math.max(0, Math.min(1, illum));
  const waxing = phaseVal <= 0.5; // 上半月：右侧被照亮
  // 终结线的横向半轴 (-r..r)，lit=0.5 时为 0（半月）
  const a = (1 - 2 * lit) * r;

  ctx.beginPath();
  // 亮的外缘半圆
  if (waxing) {
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false); // 右半圆
  } else {
    ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false); // 左半圆
  }
  // 终结线（椭圆弧）
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.abs(a) / r || 0.0001, 1);
  if (waxing) {
    if (a >= 0) ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, true);
    else ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);
  } else {
    if (a >= 0) ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
    else ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  }
  ctx.restore();
  ctx.closePath();

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  grad.addColorStop(0, '#fffdf0');
  grad.addColorStop(1, opts.moon || '#efe9c4');
  ctx.fillStyle = grad;
  ctx.fill();

  // 外圈微光
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(244,241,208,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/* ---------- 天空穹顶 SVG ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function renderDome() {
  const svg = document.getElementById('dome');
  svg.innerHTML = '';
  const W = 800, H = 460;
  const cx = W / 2, baseY = 380, R = 320; // 半圆：地平线 baseY，半径 R

  // 地平线
  svg.appendChild(el('line', { x1: cx - R, y1: baseY, x2: cx + R, y2: baseY, stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1.5 }));
  // 半圆弧（天空穹顶）
  svg.appendChild(el('path', {
    d: `M ${cx - R} ${baseY} A ${R} ${R} 0 0 1 ${cx + R} ${baseY}`,
    fill: 'none', stroke: 'rgba(142,162,255,0.35)', 'stroke-width': 1.5
  }));

  // 计算当天月升/月落（用当地日期的 UTC 起点）
  const { loc } = state;
  const ymd = localYMD(state.date, loc.tz);
  const dayStartUTC = localMidnightUTC(ymd.y, ymd.m, ymd.d, loc.tz);
  const times = SunCalc.getMoonTimes(dayStartUTC, loc.lat, loc.lng, true);
  const illum = SunCalc.getMoonIllumination(new Date(dayStartUTC.getTime() + 12 * 3600 * 1000));
  const pIdx = phaseIndex(illum.fraction, illum.phase);

  // 24 小时刻度沿半圆分布：0h 在左端(月升侧起点)，24h 在右端
  // 角度：左端 = 180°，右端 = 0°（标准数学角，y 向上）
  function hourToPoint(hour) {
    const frac = hour / 24;               // 0..1
    const ang = Math.PI * (1 - frac);     // 180°→0°
    return { x: cx + R * Math.cos(ang), y: baseY - R * Math.sin(ang) };
  }

  for (let h = 0; h <= 24; h += 2) {
    const p = hourToPoint(h);
    const inner = { x: cx + (R - 12) * Math.cos(Math.PI * (1 - h / 24)), y: baseY - (R - 12) * Math.sin(Math.PI * (1 - h / 24)) };
    svg.appendChild(el('line', { x1: inner.x, y1: inner.y, x2: p.x, y2: p.y, stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 1 }));
    if (h % 6 === 0) {
      const lp = { x: cx + (R + 16) * Math.cos(Math.PI * (1 - h / 24)), y: baseY - (R + 16) * Math.sin(Math.PI * (1 - h / 24)) };
      const t = el('text', { x: lp.x, y: lp.y + 4, fill: 'rgba(154,163,199,0.8)', 'font-size': 13, 'text-anchor': 'middle' });
      t.textContent = `${h}:00`;
      svg.appendChild(t);
    }
  }

  // 方位标注
  const eastT = el('text', { x: cx - R, y: baseY + 22, fill: 'var(--ink-faint)', 'font-size': 12, 'text-anchor': 'middle' });
  eastT.textContent = '东 · 月升';
  const westT = el('text', { x: cx + R, y: baseY + 22, fill: 'var(--ink-faint)', 'font-size': 12, 'text-anchor': 'middle' });
  westT.textContent = '西 · 月落';
  svg.appendChild(eastT); svg.appendChild(westT);

  // 月亮升落弧线段：从 rise 时刻到 set 时刻沿穹顶
  let riseMin = times.rise ? localMinutes(times.rise, loc.tz) : null;
  let setMin = times.set ? localMinutes(times.set, loc.tz) : null;

  if (riseMin !== null && setMin !== null) {
    let riseH = riseMin / 60, setH = setMin / 60;
    // 若落在升之前，说明跨越，简单处理：画 rise→set（若 set<rise 则 set+24 截断到24）
    let endH = setH >= riseH ? setH : 24;
    // 高亮月亮走过的弧
    const arcPts = [];
    for (let h = riseH; h <= endH; h += 0.25) arcPts.push(hourToPoint(h));
    if (arcPts.length > 1) {
      let d = `M ${arcPts[0].x.toFixed(1)} ${arcPts[0].y.toFixed(1)}`;
      for (let i = 1; i < arcPts.length; i++) d += ` L ${arcPts[i].x.toFixed(1)} ${arcPts[i].y.toFixed(1)}`;
      svg.appendChild(el('path', { d, fill: 'none', stroke: 'rgba(244,241,208,0.5)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    }
  }

  // 升点、落点标记
  if (riseMin !== null) {
    const rp = hourToPoint(riseMin / 60);
    svg.appendChild(el('circle', { cx: rp.x, cy: rp.y, r: 5, fill: '#ffd08a' }));
  }
  if (setMin !== null) {
    const sp = hourToPoint(setMin / 60);
    svg.appendChild(el('circle', { cx: sp.x, cy: sp.y, r: 5, fill: '#a6b4ff' }));
  }

  // ---- 观测时刻：决定要在穹顶上把「当前月亮」画在哪个小时位置 ----
  // 优先用用户设定的 obsMinutes；否则若是今天用当前时刻；再否则用升落中点
  let obsMin = state.obsMinutes;
  if (obsMin === null) {
    const nowMin = nowLocalMinutesIfToday();
    if (nowMin !== null) obsMin = nowMin;
  }
  let moonH, obsPos = null, obsIsLive = (obsMin !== null);
  if (obsMin !== null) {
    moonH = obsMin / 60;
    const at = localDateTimeUTC(state.date, loc.tz, obsMin);
    obsPos = SunCalc.getMoonPosition(at, loc.lat, loc.lng); // altitude, azimuth
  } else if (riseMin !== null && setMin !== null) {
    let riseH = riseMin / 60, setH = setMin / 60;
    let endH = setH >= riseH ? setH : setH + 24;
    moonH = ((riseH + endH) / 2) % 24;
  } else if (riseMin !== null) moonH = (riseMin / 60 + 6) % 24;
  else if (setMin !== null) moonH = (setMin / 60 - 6 + 24) % 24;
  else moonH = null;

  if (moonH !== null) {
    const mp = hourToPoint(moonH);
    const aboveHorizon = obsPos ? obsPos.altitude > 0 : true;
    const size = 64;
    const fo = el('foreignObject', { x: mp.x - size / 2, y: mp.y - size / 2, width: size, height: size });
    const cvWrap = document.createElement('div');
    cvWrap.style.width = size + 'px'; cvWrap.style.height = size + 'px';
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    cvWrap.appendChild(cv);
    fo.appendChild(cvWrap);
    svg.appendChild(fo);
    const mctx = cv.getContext('2d');
    mctx.save();
    if (aboveHorizon) {
      mctx.shadowColor = 'rgba(244,241,208,0.7)';
      mctx.shadowBlur = 18;
    } else {
      mctx.globalAlpha = 0.35; // 地平线下：暗淡表示看不到
    }
    drawMoon(mctx, size / 2, size / 2, size / 2 - 6, illum.fraction, illum.phase);
    mctx.restore();

    // 观测时刻的竖直指示线（从地平线到月亮）
    if (obsIsLive) {
      const foot = { x: mp.x, y: baseY };
      svg.appendChild(el('line', { x1: foot.x, y1: foot.y, x2: mp.x, y2: mp.y + size / 2 - 6,
        stroke: aboveHorizon ? 'rgba(244,241,208,0.35)' : 'rgba(154,163,199,0.25)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      const tl = el('text', { x: mp.x, y: mp.y - size / 2 - 4, 'text-anchor': 'middle', 'font-size': 12,
        fill: aboveHorizon ? '#f4f1d0' : 'var(--ink-faint)' });
      const hh = String(Math.floor(obsMin / 60)).padStart(2, '0'), mm = String(obsMin % 60).padStart(2, '0');
      tl.textContent = `${hh}:${mm}`;
      svg.appendChild(tl);
    }
  }

  // 更新信息栏
  document.getElementById('riseTime').textContent = fmtLocal(times.rise, loc.tz);
  document.getElementById('setTime').textContent = fmtLocal(times.set, loc.tz);
  document.getElementById('phaseName').textContent = PHASE_NAMES[pIdx];
  document.getElementById('phaseIllum').textContent = `照明 ${Math.round(illum.fraction * 100)}%`;

  // 方位角
  let riseAzDeg = null, setAzDeg = null;
  if (times.rise) {
    const pos = SunCalc.getMoonPosition(times.rise, loc.lat, loc.lng);
    riseAzDeg = (pos.azimuth * 180 / Math.PI + 180) % 360; // 0=北, 顺时针
    document.getElementById('riseAz').textContent = `方位 ${Math.round(riseAzDeg)}°`;
  } else document.getElementById('riseAz').textContent = times.alwaysUp ? '整夜在空' : '当日不升';
  if (times.set) {
    const pos = SunCalc.getMoonPosition(times.set, loc.lat, loc.lng);
    setAzDeg = (pos.azimuth * 180 / Math.PI + 180) % 360;
    document.getElementById('setAz').textContent = `方位 ${Math.round(setAzDeg)}°`;
  } else document.getElementById('setAz').textContent = times.alwaysDown ? '当日不落' : '';

  renderObserve(riseAzDeg, setAzDeg, times, obsPos, obsMin);
  renderPoem(pIdx, illum);
}

/* ---------- 观测指引：面向正北时月亮在哪 ---------- */
// 方位角(0=北,顺时针) → 中文方位词
function azToChinese(az) {
  const dirs = [
    { n: '正北', c: 0 }, { n: '东北', c: 45 }, { n: '正东', c: 90 }, { n: '东南', c: 135 },
    { n: '正南', c: 180 }, { n: '西南', c: 225 }, { n: '正西', c: 270 }, { n: '西北', c: 315 }
  ];
  let best = dirs[0], bd = 999;
  for (const d of dirs) {
    let diff = Math.abs(az - d.c); if (diff > 180) diff = 360 - diff;
    if (diff < bd) { bd = diff; best = d; }
  }
  return best.n;
}
// 面向正北时，方位角在观测者的哪一侧
function sideWhenFacingNorth(az) {
  // 面向北：正前=0/360, 正右=90(东), 正后=180(南), 正左=270(西)
  if (az < 22.5 || az >= 337.5) return '正前方';
  if (az < 67.5) return '右前方';
  if (az < 112.5) return '正右方（右手边）';
  if (az < 157.5) return '右后方';
  if (az < 202.5) return '正后方（身后）';
  if (az < 247.5) return '左后方';
  if (az < 292.5) return '正左方（左手边）';
  return '左前方';
}

function renderObserve(riseAz, setAz, times, obsPos, obsMin) {
  const svg = document.getElementById('compass');
  svg.innerHTML = '';
  const cx = 110, cy = 110, R = 82;

  // 外圈 = 地平线，内圈 = 高度参考，圆心 = 头顶(天顶)
  svg.appendChild(el('circle', { cx, cy, r: R, fill: 'rgba(20,27,58,0.6)', stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1.5 }));
  svg.appendChild(el('circle', { cx, cy, r: R * 0.62, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 }));

  // 四个方位（面向北：N在上，E在右，S在下，W在左）
  const dirDefs = [['北 N', -90, true], ['东 E', 0, false], ['南 S', 90, false], ['西 W', 180, false]];
  for (const [lbl, deg, hi] of dirDefs) {
    const a = deg * Math.PI / 180;
    const lp = { x: cx + (R + 14) * Math.cos(a), y: cy + (R + 14) * Math.sin(a) };
    const t = el('text', { x: lp.x, y: lp.y + 4, 'text-anchor': 'middle', 'font-size': 13, fill: hi ? '#8ea2ff' : 'rgba(154,163,199,0.85)' });
    t.textContent = lbl; svg.appendChild(t);
    const i1 = { x: cx + (R - 6) * Math.cos(a), y: cy + (R - 6) * Math.sin(a) };
    const i2 = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    svg.appendChild(el('line', { x1: i1.x, y1: i1.y, x2: i2.x, y2: i2.y, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': hi ? 2 : 1 }));
  }

  // 观测者（面向北=向上）
  svg.appendChild(el('circle', { cx, cy, r: 6, fill: '#e8ecff' }));
  svg.appendChild(el('line', { x1: cx, y1: cy, x2: cx, y2: cy - 26, stroke: 'rgba(232,236,255,0.5)', 'stroke-width': 2, 'stroke-dasharray': '3 3' }));
  const faceLbl = el('text', { x: cx, y: cy + 26, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-faint)' });
  faceLbl.textContent = '你(面向北↑)'; svg.appendChild(faceLbl);

  function azToXY(az, radius) {
    const a = (az - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  // 月升/月落方向作为参考（细）
  if (riseAz !== null) {
    const tip = azToXY(riseAz, R);
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: tip.x, y2: tip.y, stroke: 'rgba(255,208,138,0.55)', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }));
    const rl = azToXY(riseAz, R + 13);
    const rt = el('text', { x: rl.x, y: rl.y + 4, 'text-anchor': 'middle', 'font-size': 10, fill: '#ffd08a' });
    rt.textContent = '升'; svg.appendChild(rt);
  }
  if (setAz !== null) {
    const tip = azToXY(setAz, R);
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: tip.x, y2: tip.y, stroke: 'rgba(166,180,255,0.5)', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }));
    const sl = azToXY(setAz, R + 13);
    const st = el('text', { x: sl.x, y: sl.y + 4, 'text-anchor': 'middle', 'font-size': 10, fill: '#a6b4ff' });
    st.textContent = '落'; svg.appendChild(st);
  }

  const descEl = document.getElementById('observeDesc');
  const hintEl = document.getElementById('observeHint');

  // ---- 观测时刻的实时月亮位置（主角）----
  if (obsPos) {
    const azDeg = (obsPos.azimuth * 180 / Math.PI + 180) % 360;
    const altDeg = obsPos.altitude * 180 / Math.PI;
    const above = altDeg > 0;
    // 半径映射：地平线(alt=0)→R，天顶(alt=90)→0
    const rr = above ? R * (1 - Math.max(0, Math.min(90, altDeg)) / 90) : R;
    const mp = azToXY(azDeg, rr);

    if (above) {
      // 指向月亮的粗箭头
      svg.appendChild(el('line', { x1: cx, y1: cy, x2: mp.x, y2: mp.y, stroke: '#f4f1d0', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      const g = el('circle', { cx: mp.x, cy: mp.y, r: 8, fill: '#f4f1d0' });
      g.setAttribute('style', 'filter: drop-shadow(0 0 7px rgba(244,241,208,0.9))');
      svg.appendChild(g);
    } else {
      // 地平线下：在外缘画空心月，提示看不到
      const g = el('circle', { cx: mp.x, cy: mp.y, r: 7, fill: 'none', stroke: 'rgba(154,163,199,0.7)', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' });
      svg.appendChild(g);
    }

    const dir = azToChinese(azDeg);
    const side = sideWhenFacingNorth(azDeg);
    const hh = String(Math.floor(obsMin / 60)).padStart(2, '0'), mm = String(obsMin % 60).padStart(2, '0');
    if (above) {
      descEl.innerHTML = `${hh}:${mm} 月亮在 <b>${dir}（方位 ${Math.round(azDeg)}°）</b>，高度约 <b>${Math.round(altDeg)}°</b>。<br>你面向正北时，抬头看向 <b>${side}</b> 就能看到它。`;
      hintEl.textContent = `高度 0°=地平线、90°=正头顶。罗盘里月亮越靠中心表示越高。金/紫虚线为当天月升/月落方向。`;
    } else {
      descEl.innerHTML = `${hh}:${mm} 月亮在地平线<b>以下（高度 ${Math.round(altDeg)}°）</b>，此刻<b>看不到</b>。<br>它位于 ${dir} 方向的地平线之下。`;
      hintEl.textContent = `换到月升(${fmtLocal(times.rise, state.loc.tz)})与月落(${fmtLocal(times.set, state.loc.tz)})之间的时刻即可看到。`;
    }
    return;
  }

  // ---- 无观测时刻（非今天且未手动设定）：退回显示月升方向 ----
  if (riseAz !== null) {
    const tip = azToXY(riseAz, R - 4);
    const g = el('circle', { cx: tip.x, cy: tip.y, r: 7, fill: '#f4f1d0' });
    g.setAttribute('style', 'filter: drop-shadow(0 0 6px rgba(244,241,208,0.8))');
    svg.appendChild(g);
    const dir = azToChinese(riseAz);
    const side = sideWhenFacingNorth(riseAz);
    const t = fmtLocal(times.rise, state.loc.tz);
    descEl.innerHTML = `${t} 月亮从 <b>${dir}（方位 ${Math.round(riseAz)}°）</b> 升起。<br>你面向正北站着时，它在你的 <b>${side}</b>，贴近地平线。`;
    hintEl.textContent = '设定上方「观测时刻」即可实时查看那一刻月亮的方位和高度。';
  } else if (times.alwaysUp) {
    descEl.innerHTML = `今天月亮<b>整夜都在地平线以上</b>。设定观测时刻可查看具体方位。`;
    hintEl.textContent = '此纬度当天月亮不落。';
  } else {
    descEl.innerHTML = `今天在此地点月亮<b>不升起</b>。`;
    hintEl.textContent = '换一个日期或地点试试。';
  }
}

/* ---------- 配诗 ---------- */
function renderPoem(pIdx, illum) {
  const pool = window.MOON_POEMS[pIdx] || window.MOON_POEMS[4];
  const ymd = localYMD(state.date, state.loc.tz);
  const idx = (ymd.d + ymd.m) % pool.length; // 按日期选，稳定且有变化
  const poem = pool[idx];
  document.getElementById('poemText').textContent = poem.text;
  document.getElementById('poemAuthor').textContent = '—— ' + poem.author;
  const cv = document.getElementById('poemMoon');
  drawMoon(cv.getContext('2d'), 36, 36, 30, illum.fraction, illum.phase);
}

/* ---------- 全年概览（左右两列竖排） ---------- */
function renderYear() {
  const leftGrid = document.getElementById('yearGridLeft');
  const rightGrid = document.getElementById('yearGridRight');
  leftGrid.innerHTML = '';
  rightGrid.innerHTML = '';
  const { loc, year } = state;
  document.getElementById('yearLabel').textContent = year;
  document.getElementById('yearTitle').textContent = `${year} 全年月相`;

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const selYMD = localYMD(state.date, loc.tz);

  for (let m = 0; m < 12; m++) {
    const block = document.createElement('div');
    block.className = 'month-block';
    const title = document.createElement('div');
    title.className = 'month-title';
    title.textContent = monthNames[m];
    block.appendChild(title);

    const row = document.createElement('div');
    row.className = 'days-row';
    const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      const noonUTC = localMidnightUTC(year, m, d, loc.tz).getTime() + 12 * 3600 * 1000;
      const illum = SunCalc.getMoonIllumination(new Date(noonUTC));
      const pIdx = phaseIndex(illum.fraction, illum.phase);
      if (pIdx === 4) cell.classList.add('full');
      if (selYMD.y === year && selYMD.m === m && selYMD.d === d) cell.classList.add('selected');

      const cv = document.createElement('canvas');
      cv.width = 26; cv.height = 26;
      cell.appendChild(cv);
      drawMoon(cv.getContext('2d'), 13, 13, 11, illum.fraction, illum.phase);

      cell.title = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} · ${PHASE_NAMES[pIdx]} ${Math.round(illum.fraction * 100)}%`;
      cell.addEventListener('click', () => {
        state.date = localMidnightUTC(year, m, d, loc.tz);
        state.obsMinutes = null;
        renderDome();
        renderYear();
        syncTimeControls();
        document.getElementById('datePicker').value = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      });
      row.appendChild(cell);
    }
    block.appendChild(row);
    (m < 6 ? leftGrid : rightGrid).appendChild(block);
  }
}

/* ---------- 星空 ---------- */
function makeStars() {
  const box = document.getElementById('stars');
  const n = 90;
  let html = '';
  for (let i = 0; i < n; i++) {
    const size = Math.random() * 2 + 0.5;
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const dur = 3 + Math.random() * 5;
    const delay = Math.random() * 5;
    html += `<span class="star" style="width:${size}px;height:${size}px;top:${top}%;left:${left}%;--dur:${dur}s;animation-delay:${delay}s"></span>`;
  }
  box.innerHTML = html;
}

/* ---------- 控件 ---------- */
// 计算当前生效的观测分钟（与 renderDome 内一致的优先级）
function effectiveObsMinutes() {
  if (state.obsMinutes !== null) return state.obsMinutes;
  const nowMin = nowLocalMinutesIfToday();
  return nowMin !== null ? nowMin : 20 * 60; // 非今天默认晚 8 点
}
function syncTimeControls() {
  const m = effectiveObsMinutes();
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  document.getElementById('obsTime').value = `${hh}:${mm}`;
  document.getElementById('timeSlider').value = m;
  const live = document.getElementById('liveState');
  const isNowToday = state.obsMinutes === null && nowLocalMinutesIfToday() !== null;
  if (isNowToday) { live.textContent = '· 实时'; live.classList.add('on'); }
  else { live.textContent = ''; live.classList.remove('on'); }
}

function setupControls() {
  const locSel = document.getElementById('location');
  LOCATIONS.forEach((l, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = l.name;
    locSel.appendChild(o);
  });
  locSel.value = 0;
  locSel.addEventListener('change', () => {
    const prev = localYMD(state.date, state.loc.tz);
    state.loc = LOCATIONS[+locSel.value];
    state.date = localMidnightUTC(prev.y, prev.m, prev.d, state.loc.tz);
    renderDome(); renderYear(); syncTimeControls();
  });

  const dp = document.getElementById('datePicker');
  const ymd0 = localYMD(state.date, state.loc.tz);
  dp.value = `${ymd0.y}-${String(ymd0.m + 1).padStart(2, '0')}-${String(ymd0.d).padStart(2, '0')}`;
  dp.addEventListener('change', () => {
    const [y, m, d] = dp.value.split('-').map(Number);
    state.date = localMidnightUTC(y, m - 1, d, state.loc.tz);
    if (y !== state.year) { state.year = y; }
    state.obsMinutes = null; // 换日期后回到「实时/默认」
    renderDome(); renderYear(); syncTimeControls();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    const ny = now.getUTCFullYear(), nm = now.getUTCMonth(), nd = now.getUTCDate();
    state.date = localMidnightUTC(ny, nm, nd, state.loc.tz);
    state.year = ny;
    state.obsMinutes = null;
    dp.value = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
    renderDome(); renderYear(); syncTimeControls();
  });

  // 观测时刻：时间输入框
  const obsTime = document.getElementById('obsTime');
  obsTime.addEventListener('input', () => {
    const v = obsTime.value; if (!v) return;
    const [h, mi] = v.split(':').map(Number);
    state.obsMinutes = h * 60 + mi;
    renderDome(); syncTimeControls();
  });
  // 滑块
  const slider = document.getElementById('timeSlider');
  slider.addEventListener('input', () => {
    state.obsMinutes = +slider.value;
    renderDome(); syncTimeControls();
  });
  // 「此刻」按钮：回到实时（仅今天有意义；非今天则跳到今天）
  document.getElementById('nowBtn').addEventListener('click', () => {
    const now = new Date();
    const selYMD = localYMD(state.date, state.loc.tz);
    const nowYMD = localYMD(now, state.loc.tz);
    if (selYMD.y !== nowYMD.y || selYMD.m !== nowYMD.m || selYMD.d !== nowYMD.d) {
      state.date = localMidnightUTC(nowYMD.y, nowYMD.m, nowYMD.d, state.loc.tz);
      state.year = nowYMD.y;
      dp.value = `${nowYMD.y}-${String(nowYMD.m + 1).padStart(2, '0')}-${String(nowYMD.d).padStart(2, '0')}`;
      renderYear();
    }
    state.obsMinutes = null;
    renderDome(); syncTimeControls();
  });

  document.getElementById('prevYear').addEventListener('click', () => { state.year--; renderYear(); });
  document.getElementById('nextYear').addEventListener('click', () => { state.year++; renderYear(); });
}

/* ---------- 启动 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  makeStars();
  setupControls();
  renderDome();
  renderYear();
  syncTimeControls();

  // 实时模式下每分钟自动刷新月亮位置
  setInterval(() => {
    if (state.obsMinutes === null && nowLocalMinutesIfToday() !== null) {
      renderDome();
      syncTimeControls();
    }
  }, 60 * 1000);
});
