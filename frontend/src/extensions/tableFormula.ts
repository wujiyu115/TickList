import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const FORMULA_PATTERN = /^=\s*(SUM|AVG|COUNT|MAX|MIN)\s*\(\s*(\d+)\s*\)$/i;

const tableFormulaKey = new PluginKey('tableFormula');

function formatNumber(value: number): string {
  return parseFloat(value.toFixed(4)).toString();
}

function evaluateFormula(funcName: string, values: number[]): string {
  if (values.length === 0) return '0';
  switch (funcName.toUpperCase()) {
    case 'SUM':
      return formatNumber(values.reduce((s, v) => s + v, 0));
    case 'AVG':
      return formatNumber(values.reduce((s, v) => s + v, 0) / values.length);
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

function collectColumnValues(
  table: any,
  colIndex: number,
  skipRowIndex: number,
): number[] {
  const values: number[] = [];
  let rowIdx = 0;
  table.forEach((row: any) => {
    if (rowIdx === 0) {
      rowIdx++;
      return;
    }
    if (rowIdx === skipRowIndex) {
      rowIdx++;
      return;
    }
    let cellIdx = 0;
    row.forEach((cell: any) => {
      if (cellIdx === colIndex) {
        const text = cell.textContent.trim().replace(/,/g, '');
        if (!FORMULA_PATTERN.test(text)) {
          const num = parseFloat(text);
          if (!isNaN(num)) values.push(num);
        }
      }
      cellIdx++;
    });
    rowIdx++;
  });
  return values;
}

export const TableFormula = Extension.create({
  name: 'tableFormula',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableFormulaKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'table') return;

              let rowIndex = 0;
              node.forEach((row, rowOffset) => {
                if (rowIndex === 0) {
                  rowIndex++;
                  return;
                }
                let cellIndex = 0;
                row.forEach((cell, cellOffset) => {
                  const cellText = cell.textContent.trim();
                  const match = cellText.match(FORMULA_PATTERN);
                  if (match) {
                    const funcName = match[1];
                    const colIdx = parseInt(match[2], 10) - 1;
                    const values = collectColumnValues(node, colIdx, rowIndex);
                    const result = evaluateFormula(funcName, values);

                    const cellStart = pos + 1 + rowOffset + 1 + cellOffset + 1;
                    const textStart = cellStart;
                    const textEnd = cellStart + cell.content.size;

                    decorations.push(
                      Decoration.node(textStart - 1, textEnd + 1, {}, {
                        // Can't replace node content with Decoration alone,
                        // so use widget after the cell content
                      }),
                    );

                    // Overlay widget that shows computed result
                    decorations.push(
                      Decoration.widget(textStart, () => {
                        const span = document.createElement('span');
                        span.className = 'table-formula-result';
                        span.textContent = result;
                        span.title = `${cellText} = ${result}`;
                        return span;
                      }, { side: -1 }),
                    );

                    // Hide original formula text
                    if (cell.content.size > 0) {
                      decorations.push(
                        Decoration.inline(textStart, textStart + cell.content.size, {
                          class: 'table-formula-source',
                        }),
                      );
                    }
                  }
                  cellIndex++;
                });
                rowIndex++;
              });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
