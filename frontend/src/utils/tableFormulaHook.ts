import Cherry from 'cherry-markdown';

/**
 * 支持的公式函数：
 * - =SUM(col)    对指定列（从1开始）的数据行求和
 * - =AVG(col)    对指定列求平均值
 * - =COUNT(col)  对指定列的非空数值计数
 * - =MAX(col)    取指定列的最大值
 * - =MIN(col)    取指定列的最小值
 *
 * 使用示例：
 * | 项目   | 金额  |
 * |--------|-------|
 * | 早餐   | 15    |
 * | 午餐   | 30    |
 * | 晚餐   | 25    |
 * | **合计** | =SUM(2) |
 *
 * 预览时 =SUM(2) 会被替换为 70
 */

const FORMULA_PATTERN = /^=\s*(SUM|AVG|COUNT|MAX|MIN)\s*\(\s*(\d+)\s*\)$/i;

/**
 * 匹配一个完整的 GFM 表格块（包含表头、分隔行、数据行）
 * - 表头行: | xxx | xxx |
 * - 分隔行: |---|---|  或 |:---|---:|
 * - 数据行: | xxx | xxx |（至少1行）
 */
const TABLE_BLOCK_PATTERN = /(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:|-]+\|\s*\n(?:\|[^\n]+\|\s*\n?)+)/g;

interface ParsedRow {
  cells: string[];
  originalLine: string;
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function collectColumnValues(dataRows: ParsedRow[], columnIndex: number): number[] {
  const values: number[] = [];
  for (const row of dataRows) {
    const cell = row.cells[columnIndex];
    if (cell === undefined) continue;
    // 跳过公式单元格本身
    if (FORMULA_PATTERN.test(cell)) continue;
    const numericValue = parseFloat(cell.replace(/,/g, ''));
    if (!isNaN(numericValue)) {
      values.push(numericValue);
    }
  }
  return values;
}

function evaluateFormula(funcName: string, values: number[]): string {
  const upperFunc = funcName.toUpperCase();
  if (values.length === 0) return '0';

  switch (upperFunc) {
    case 'SUM':
      return formatNumber(values.reduce((sum, val) => sum + val, 0));
    case 'AVG':
      return formatNumber(values.reduce((sum, val) => sum + val, 0) / values.length);
    case 'COUNT':
      return String(values.length);
    case 'MAX':
      return formatNumber(Math.max(...values));
    case 'MIN':
      return formatNumber(Math.min(...values));
    default:
      return '#ERROR';
  }
}

function formatNumber(value: number): string {
  // 最多保留4位小数，去除末尾多余的0
  return parseFloat(value.toFixed(4)).toString();
}

function processTableBlock(tableBlock: string): string {
  const lines = tableBlock.trim().split('\n');
  if (lines.length < 3) return tableBlock;

  // 第一行：表头，第二行：分隔符，之后：数据行
  const headerLine = lines[0];
  const separatorLine = lines[1];

  if (!isSeparatorRow(separatorLine)) return tableBlock;

  const dataRows: ParsedRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    dataRows.push({
      cells: parseTableCells(lines[i]),
      originalLine: lines[i],
    });
  }

  let hasFormula = false;

  // 扫描数据行，查找并计算公式
  const processedRows = dataRows.map((row) => {
    const newCells = row.cells.map((cell) => {
      const match = cell.match(FORMULA_PATTERN);
      if (!match) return cell;

      hasFormula = true;
      const funcName = match[1];
      const columnIndex = parseInt(match[2], 10) - 1; // 转为0-based索引
      const values = collectColumnValues(dataRows, columnIndex);
      return evaluateFormula(funcName, values);
    });

    // 重建表格行
    return `| ${newCells.join(' | ')} |`;
  });

  if (!hasFormula) return tableBlock;

  return [headerLine, separatorLine, ...processedRows].join('\n');
}

/**
 * 创建 Cherry Markdown 表格公式自定义语法 Hook
 *
 * 工作原理：在 beforeMakeHtml 阶段预处理 Markdown 源码，
 * 将表格中的公式标记替换为计算结果，然后交由内置 table hook 正常渲染。
 */
export function createTableFormulaHook() {
  return Cherry.createSyntaxHook(
    'tableFormula',
    Cherry.constants.HOOKS_TYPE_LIST.PAR,
    {
      beforeMakeHtml(str: string): string {
        return str.replace(TABLE_BLOCK_PATTERN, (_match: string, tableBlock: string) => {
          return `\n${processTableBlock(tableBlock)}`;
        });
      },

      makeHtml(str: string): string {
        return str;
      },

      rule(): { reg: RegExp } {
        return { reg: /(?=(?![\s\S]))/ }; // 不匹配任何内容，仅使用 beforeMakeHtml
      },
    },
  );
}
