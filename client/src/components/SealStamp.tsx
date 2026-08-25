import React from 'react';

interface SealStampProps {
  type: string;
  name: string;
  code?: string;
  size?: number;
  filed?: boolean;
}

/**
 * 真实中国印章 SVG 组件
 * - 公章：圆形，单位名称环绕，中央五角星
 * - 财务专用章：圆形，横排文字，五角星
 * - 法定代表人名章：方形，名字竖排
 * - 合同专用章：圆形，横排文字
 * - 发票专用章：椭圆形
 * - 自定义：圆形
 */
const SealStamp: React.FC<SealStampProps> = ({ type, name, code, size = 160, filed }) => {
  const red = '#c41e1e';
  const center = size / 2;
  const radius = size / 2 - size * 0.06;

  // 沿圆弧排列文字
  const circularText = (text: string, r: number, startAngle: number, endAngle: number, fontSize: number) => {
    if (!text) return null;
    const chars = text.split('');
    const angleRange = endAngle - startAngle;
    const step = chars.length > 1 ? angleRange / (chars.length - 1) : 0;
    return chars.map((char, i) => {
      const angle = startAngle + step * i;
      const rad = (angle * Math.PI) / 180;
      const x = center + r * Math.sin(rad);
      const y = center - r * Math.cos(rad);
      const rotate = angle;
      return (
        <text
          key={i}
          x={x}
          y={y}
          fill={red}
          fontSize={fontSize}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${rotate}, ${x}, ${y})`}
          style={{ fontFamily: '"SimSun", "STSong", "Songti SC", serif' }}
        >
          {char}
        </text>
      );
    });
  };

  // 五角星 path
  const starPath = (cx: number, cy: number, outerR: number, innerR: number) => {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * 36 - 90) * (Math.PI / 180);
      points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return points.join(' ');
  };

  // 法定代表人名章：方形
  if (type === 'legal_rep') {
    const s = size * 0.85;
    const offset = (size - s) / 2;
    const chars = name.replace(/.*章$/, '').slice(-4) || name;
    const charArr = chars.split('');
    // 2x2 grid for up to 4 chars, or vertical for fewer
    const cols = charArr.length > 2 ? 2 : 1;
    const rows = charArr.length > 2 ? 2 : charArr.length;
    const cellW = s / cols;
    const cellH = s / rows;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect
          x={offset}
          y={offset}
          width={s}
          height={s}
          fill="none"
          stroke={red}
          strokeWidth={size * 0.035}
          rx={2}
        />
        {charArr.map((char, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return (
            <text
              key={i}
              x={offset + col * cellW + cellW / 2}
              y={offset + row * cellH + cellH / 2}
              fill={red}
              fontSize={size * 0.16}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontFamily: '"SimSun", "STSong", "Songti SC", "KaiTi", serif' }}
            >
              {char}
            </text>
          );
        })}
        {filed && (
          <text x={center} y={size - 4} fill={red} fontSize={size * 0.05} textAnchor="middle" opacity={0.7}>
            ★ 已备案
          </text>
        )}
      </svg>
    );
  }

  // 发票专用章：椭圆形
  if (type === 'invoice') {
    const rx = radius;
    const ry = radius * 0.7;
    const labelText = '发票专用章';
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <ellipse cx={center} cy={center} rx={rx} ry={ry} fill="none" stroke={red} strokeWidth={size * 0.028} />
        <ellipse cx={center} cy={center} rx={rx - size * 0.05} ry={ry - size * 0.04} fill="none" stroke={red} strokeWidth={size * 0.012} />
        {/* 税号 */}
        {code && (
          <text x={center} y={center + ry * 0.55} fill={red} fontSize={size * 0.06} textAnchor="middle" fontWeight="bold"
            style={{ fontFamily: 'Arial, sans-serif', letterSpacing: 1 }}>
            {code}
          </text>
        )}
        {/* 横排文字 */}
        <text x={center} y={center - size * 0.02} fill={red} fontSize={size * 0.1} textAnchor="middle" dominantBaseline="central" fontWeight="bold"
          style={{ fontFamily: '"SimSun", "STSong", "Songti SC", serif' }}>
          {name.length > 8 ? name.slice(0, 8) : name}
        </text>
      </svg>
    );
  }

  // 圆形印章（公章/财务/合同/自定义）
  const isSpecial = ['financial', 'contract'].includes(type);
  const labelMap: Record<string, string> = {
    financial: '财务专用章',
    contract: '合同专用章',
  };
  const labelText = labelMap[type] || '';
  const topText = isSpecial ? name : name;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 外圆 */}
      <circle cx={center} cy={center} r={radius} fill="none" stroke={red} strokeWidth={size * 0.032} />
      {/* 内圈装饰线 */}
      <circle cx={center} cy={center} r={radius - size * 0.045} fill="none" stroke={red} strokeWidth={size * 0.008} opacity={0.4} />

      {/* 顶部环绕文字 - 单位名称 */}
      {topText && circularText(
        topText.length > 16 ? topText.slice(0, 16) : topText,
        radius - size * 0.1,
        -120,
        120,
        size * 0.062
      )}

      {/* 中央五角星 */}
      <polygon
        points={starPath(center, center - (isSpecial ? size * 0.02 : 0), radius * 0.22, radius * 0.09)}
        fill={red}
      />

      {/* 专用章横排文字 */}
      {isSpecial && (
        <text
          x={center}
          y={center + radius * 0.35}
          fill={red}
          fontSize={size * 0.085}
          fontWeight="bold"
          textAnchor="middle"
          style={{ fontFamily: '"SimSun", "STSong", "Songti SC", serif', letterSpacing: 2 }}
        >
          {labelText}
        </text>
      )}

      {/* 底部备案编号 */}
      {code && (
        <text
          x={center}
          y={center + radius * 0.72}
          fill={red}
          fontSize={size * 0.05}
          textAnchor="middle"
          fontWeight="bold"
          style={{ fontFamily: 'Arial, sans-serif', letterSpacing: 0.5 }}
        >
          {code}
        </text>
      )}
    </svg>
  );
};

export default SealStamp;
