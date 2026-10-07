// 字体：全部是 OFL 开源字体（google/fonts），构建单文件时内嵌完整字体。
//   HuangYou = 站酷庆科黄油体（粗壮圆润，名字大字/标题）
//   KuaiLe   = 站酷快乐体（俏皮手写感，对白/界面/小字）
//   XiaoWei  = 站酷小薇（绘本衬线，旁白/片头片尾）
//   Fredoka  = 圆体拉丁 可变字重 300–700（数字、LV、HP、英文）
export const FONT = {
  display: '"HuangYou", "KuaiLe", "PingFang SC", sans-serif',
  play: '"KuaiLe", "HuangYou", "PingFang SC", sans-serif',
  serif: '"XiaoWei", "Songti SC", serif',
  latin: '"Fredoka", "KuaiLe", sans-serif',
};

const FACES = [
  ['HuangYou', 'ZCOOLQingKeHuangYou-Regular.ttf', { weight: '400' }],
  ['KuaiLe', 'ZCOOLKuaiLe-Regular.ttf', { weight: '400' }],
  ['XiaoWei', 'ZCOOLXiaoWei-Regular.ttf', { weight: '400' }],
  ['Fredoka', 'Fredoka-Variable.ttf', { weight: '300 700' }],
];

/** 注册字体并预热（canvas 首次用到某字体时可能先用回退字体画一帧）。 */
export async function loadFonts(base = '/assets/fonts/') {
  const embedded = globalThis.__EMBED_FONTS__ || {};
  await Promise.all(FACES.map(async ([family, file, desc]) => {
    const src = embedded[file] ? `url(${embedded[file]})` : `url(${base}${file})`;
    const f = new FontFace(family, src, desc);
    await f.load();
    document.fonts.add(f);
  }));
  const probe = document.createElement('canvas').getContext('2d');
  const sample = '纸艺故事 字体预热 ABC 0123456789';
  for (const f of ['40px "HuangYou"', '40px "KuaiLe"', '40px "XiaoWei"', '400 40px "Fredoka"', '700 40px "Fredoka"']) {
    await document.fonts.load(f, sample);
    probe.font = f; probe.fillText(sample, -999, -999);
  }
}

/** canvas font 串。family 取 FONT 的键或任意 CSS 字体族。 */
export const font = (size, family = 'display', weight = 400) => `${weight} ${size}px ${FONT[family] || family}`;
