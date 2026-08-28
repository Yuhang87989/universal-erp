import React from 'react';

/**
 * 零依赖轻量 Markdown 渲染组件
 * 支持：###/##/# 标题、**加粗**、--- 分隔线、- 无序列表、1. 有序列表、空行分段
 * 用于渲染 AI 返回的文本，避免 ###/** 等符号直接裸露
 */

// 渲染行内：**加粗**
const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`${keyPrefix}-b${i}`} style={{ color: '#1f1f1f' }}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-t${i}`}>{part}</React.Fragment>;
  });
};

interface Props {
  content: string;
  fontSize?: number;
}

const MarkdownText: React.FC<Props> = ({ content, fontSize = 14 }) => {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: '' | 'ul' | 'ol' = '';
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    nodes.push(
      <Tag
        key={`list-${listKey++}`}
        style={{ margin: '6px 0 10px', paddingLeft: listType === 'ol' ? 22 : 18 }}
      >
        {listItems}
      </Tag>
    );
    listItems = [];
    listType = '';
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const key = `l${idx}`;

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      nodes.push(<hr key={key} style={{ border: 'none', borderTop: '1px dashed #e8e8e8', margin: '12px 0' }} />);
      return;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const sizes: Record<number, number> = { 1: 17, 2: 16, 3: 15, 4: 14 };
      nodes.push(
        <div key={key} style={{
          fontWeight: 600, fontSize: sizes[level] || 15, color: '#262626',
          margin: '14px 0 6px', lineHeight: 1.5,
        }}>
          {renderInline(h[2], key)}
        </div>
      );
      return;
    }

    // 无序列表
    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(
        <li key={key} style={{ margin: '3px 0', lineHeight: 1.8 }}>
          {renderInline(ul[1], key)}
        </li>
      );
      return;
    }

    // 有序列表
    const ol = line.match(/^\d+[.、)]\s*(.*)$/);
    if (ol) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(
        <li key={key} style={{ margin: '3px 0', lineHeight: 1.8 }}>
          {renderInline(ol[1], key)}
        </li>
      );
      return;
    }

    // 空行
    if (line === '') {
      flushList();
      return;
    }

    // 普通段落
    flushList();
    nodes.push(
      <div key={key} style={{ margin: '6px 0', lineHeight: 1.9 }}>
        {renderInline(line, key)}
      </div>
    );
  });
  flushList();

  return (
    <div style={{ fontSize, color: '#595959', wordBreak: 'break-word' }}>
      {nodes}
    </div>
  );
};

export default MarkdownText;
