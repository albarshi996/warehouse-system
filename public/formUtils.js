/**
 * Brandzo Smart Forms Utility (SAFE & ULTIMATE VERSION)
 * Handles localStorage persistence, barcode scanning, print optimization, dynamic rows, row deletion, and Form Reset.
 */

(function () {
  const FORM_ID = window.location.pathname;

  // 1. Initialize logic when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    loadDraft();
    setupEventListeners();
    setupAutoFill();
    injectLandscapePrint();
    setupPrintValidation();
    setupDynamicRows();
    setupClearFormFeature(); // تفعيل ميزة إفراغ النموذج
    setupExcelExport();     // تفعيل تصدير Excel لجميع النماذج تلقائياً
  });

  // 2. Setup Event Listeners
  function setupEventListeners() {
    document.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        saveDraft();
        syncToPrint(e.target);
        handleAutoCalculation(e.target);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('table')) {
        saveDraft();
      }
    });
  }

  // 3. Save to localStorage
  function saveDraft() {
    const formData = {};
    const inputs = document.querySelectorAll('input, textarea, select');

    inputs.forEach((input, index) => {
      if (input.id || input.name) {
        if (input.type === 'checkbox' || input.type === 'radio') {
          formData[input.id || input.name] = input.checked;
        } else if (input.tagName === 'SELECT') {
          formData[input.id || input.name] = input.value;
        } else {
          formData[input.id || input.name] = input.value;
        }
      } else {
        if (input.type === 'checkbox' || input.type === 'radio') {
          formData[`input_index_${index}`] = input.checked;
        } else if (input.tagName === 'SELECT') {
          formData[`input_index_${index}`] = input.value;
        } else {
          formData[`input_index_${index}`] = input.value;
        }
      }
    });

    formData.tables = getTableData();
    localStorage.setItem(`brandzo_draft_${FORM_ID}`, JSON.stringify(formData));
  }

  // 4. Load from localStorage
  function loadDraft() {
    const saved = localStorage.getItem(`brandzo_draft_${FORM_ID}`);
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      const inputs = document.querySelectorAll('input, textarea, select');

      Object.keys(data).forEach(key => {
        if (key === 'tables') {
          restoreTableData(data.tables);
        } else if (key.startsWith('input_index_')) {
          const index = parseInt(key.replace('input_index_', ''));
          const el = inputs[index];
          if (el) {
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = data[key];
            } else if (el.tagName === 'SELECT') {
              el.value = data[key];
            } else {
              el.value = data[key];
            }
            syncToPrint(el);
          }
        } else {
          const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
          if (el) {
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = data[key];
            } else if (el.tagName === 'SELECT') {
              el.value = data[key];
            } else {
              el.value = data[key];
            }
            syncToPrint(el);
          }
        }
      });
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
  }

  // 5. Table Data Mapping
  function getTableData() {
    const tableData = [];
    const tables = document.querySelectorAll('table');

    tables.forEach((table, tIndex) => {
      const rows = [];
      const trs = table.querySelectorAll('tbody tr');
      trs.forEach((tr, rIndex) => {
        const rowData = {};
        const inputs = tr.querySelectorAll('input, select, textarea');
        inputs.forEach((input, i) => {
          if (input.type === 'checkbox' || input.type === 'radio') {
            rowData[`col_${i}`] = input.checked;
          } else {
            rowData[`col_${i}`] = input.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          rows.push({ rowIndex: rIndex, data: rowData });
        }
      });
      if (rows.length > 0) {
        tableData.push({ tableIndex: tIndex, rows: rows });
      }
    });
    return tableData;
  }

  function restoreTableData(tableData) {
    const tables = document.querySelectorAll('table');
    tableData.forEach(tData => {
      const table = tables[tData.tableIndex];
      if (!table) return;

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const currentRowsCount = tbody.querySelectorAll('tr').length;
      const targetRowsCount = tData.rows.length;

      if (targetRowsCount > currentRowsCount) {
        const rowsToAdd = targetRowsCount - currentRowsCount;
        for (let i = 0; i < rowsToAdd; i++) {
          const added = addNewRow(table);
          if (!added) break;
        }
      }

      const trs = tbody.querySelectorAll('tr');
      tData.rows.forEach(rData => {
        const tr = trs[rData.rowIndex];
        if (tr) {
          const inputs = tr.querySelectorAll('input, select, textarea');
          Object.keys(rData.data).forEach(key => {
            const colIndex = parseInt(key.replace('col_', ''));
            if (inputs[colIndex]) {
              const el = inputs[colIndex];
              if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = rData.data[key];
              } else if (el.tagName === 'SELECT') {
                el.value = rData.data[key];
              } else {
                el.value = rData.data[key];
              }
              syncToPrint(el);
            }
          });
        }
      });

      // Trigger auto-calculation on all numeric inputs after restoration
      const numericInputs = tbody.querySelectorAll('input[type="number"], .item-qty, .item-price');
      numericInputs.forEach(input => handleAutoCalculation(input));
    });
  }

  // 6. Print Persistence & Sync
  function syncToPrint(el) {
    el.setAttribute('value', el.value);
    const parent = el.parentElement;
    if (parent && (parent.tagName === 'TD' || parent.classList.contains('print-sync'))) {
      let printSpan = parent.querySelector('.print-only-text');
      if (!printSpan) {
        printSpan = document.createElement('span');
        printSpan.className = 'print-only-text hidden print:block';
        parent.appendChild(printSpan);
      }
      printSpan.innerText = el.value;
    }
  }

  // 7. Auto-calculation
  function handleAutoCalculation(target) {
    if (target.classList.contains('item-qty') || target.classList.contains('item-price')) {
      const row = target.closest('tr');
      if (!row) return;

      const qtyInput = row.querySelector('.item-qty');
      const priceInput = row.querySelector('.item-price');
      const totalInput = row.querySelector('.item-total');

      if (qtyInput && priceInput && totalInput) {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        const total = qty * price;
        totalInput.value = total.toFixed(2);
        syncToPrint(totalInput);
      }
    }
  }

  // 8. Dynamic Rows Feature (Add & Delete)
  function setupDynamicRows() {
    document.querySelectorAll('table').forEach(function (table) {
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'bz-table-actions no-print';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'bz-btn bz-btn-add no-print';
      addBtn.textContent = '+ إضافة صف';
      addBtn.setAttribute('aria-label', 'إضافة صف جديد للجدول');
      addBtn.setAttribute('title', 'إضافة صف جديد');

      addBtn.addEventListener('click', function () {
        addNewRow(table);
        saveDraft();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'bz-btn bz-btn-delete no-print';
      deleteBtn.textContent = '- حذف صف';
      deleteBtn.setAttribute('aria-label', 'حذف الصف الأخير من الجدول');
      deleteBtn.setAttribute('title', 'حذف الصف الأخير');

      deleteBtn.addEventListener('click', function () {
        deleteLastRow(table);
        saveDraft();
      });

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'bz-btn bz-btn-clear no-print';
      clearBtn.textContent = 'مسح الجدول';
      clearBtn.setAttribute('aria-label', 'مسح جميع البيانات من الجدول والعودة للصف الأول');
      clearBtn.setAttribute('title', 'مسح الجدول');

      clearBtn.addEventListener('click', function () {
        if (confirm('هل أنت متأكد أنك تريد مسح جميع البيانات من هذا الجدول؟')) {
          clearTable(table);
          saveDraft();
        }
      });

      actionsContainer.appendChild(addBtn);
      actionsContainer.appendChild(deleteBtn);
      actionsContainer.appendChild(clearBtn);
      table.parentNode.insertBefore(actionsContainer, table.nextSibling);
    });
  }

  function addNewRow(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return false;

    const templateRow = tbody.querySelector('tr:first-child');
    if (!templateRow) return false;

    const newRow = templateRow.cloneNode(true);
    const rowIndex = tbody.querySelectorAll('tr').length + 1;

    // Deep-clone and reset all form elements
    newRow.querySelectorAll('input, textarea, select').forEach(function (el) {
      // Reset value to empty
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }

      // Remove value attribute
      el.removeAttribute('value');

      // Remove ID to prevent duplicates
      if (el.hasAttribute('id')) {
        el.removeAttribute('id');
      }

      // Remove data-* carry-over attributes
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-')) {
          el.removeAttribute(attr.name);
        }
      });

      // Remove inline styles that were set by auto-calc highlighting
      el.style.removeProperty('color');
      el.style.removeProperty('background');
      el.style.removeProperty('font-weight');

      // Remove print-only text spans
      const parent = el.parentElement;
      if (parent) {
        const oldSpan = parent.querySelector('.print-only-text');
        if (oldSpan) oldSpan.remove();
      }
    });

    // Clear computed/stale text values
    newRow.querySelectorAll('*').forEach(function (el) {
      const text = el.textContent.trim();
      if (el.children.length === 0 && (text === '0.00' || text === '0' || text === '0.0' || text === '0.000')) {
        el.textContent = '';
      }
    });

    // Rewrite row number in td[data-col="row-num"] OR td:first-child (if numeric)
    const rowNumCell = newRow.querySelector('td[data-col="row-num"]');
    const firstTd = newRow.querySelector('td:first-child');

    if (rowNumCell) {
      rowNumCell.textContent = rowIndex;
    } else if (firstTd && !firstTd.querySelector('input') && /^\d+$/.test(firstTd.textContent.trim())) {
      firstTd.textContent = rowIndex;
    }

    // Add flash animation class
    newRow.classList.add('row-flash');
    setTimeout(() => newRow.classList.remove('row-flash'), 600);

    // Append the new row
    tbody.appendChild(newRow);

    // Recalculate ALL auto-sum fields in the table
    const numericInputs = newRow.querySelectorAll('input[type="number"], .item-qty, .item-price');
    numericInputs.forEach(input => handleAutoCalculation(input));

    // Focus the first editable input in the new row
    const firstInput = newRow.querySelector('input:not([readonly]), textarea:not([readonly]), select');
    if (firstInput) {
      firstInput.focus();
    }

    return true;
  }

  function deleteLastRow(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return false;

    const rows = tbody.querySelectorAll('tr');

    if (rows.length <= 1) {
      alert('عذراً، لا يمكن حذف الصف الأخير.');
      return false;
    }

    const lastRow = rows[rows.length - 1];
    lastRow.remove();

    // Recalculate totals after deletion
    table.querySelectorAll('input[type="number"], input[data-calc]').forEach(function(el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    return true;
  }

  function clearTable(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return false;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length <= 1) {
      // Just clear the single row's values
      const templateRow = rows[0];
      templateRow.querySelectorAll('input, textarea, select').forEach(function (el) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = false;
        } else if (el.tagName === 'SELECT') {
          el.selectedIndex = 0;
        } else {
          el.value = '';
        }
        syncToPrint(el);
      });
      return true;
    }

    // Remove all rows except the first one
    for (let i = rows.length - 1; i > 0; i--) {
      rows[i].remove();
    }

    // Clear the first row
    const templateRow = tbody.querySelector('tr:first-child');
    templateRow.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }
      syncToPrint(el);
    });

    // Reset row number to 1
    const rowNumCell = templateRow.querySelector('td[data-col="row-num"]');
    const firstTd = templateRow.querySelector('td:first-child');
    if (rowNumCell) {
      rowNumCell.textContent = '1';
    } else if (firstTd && !firstTd.querySelector('input') && /^\d+$/.test(firstTd.textContent.trim())) {
      firstTd.textContent = '1';
    }

    return true;
  }

  // 9. Form Reset Feature
  function setupClearFormFeature() {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '🗑️ إفراغ النموذج';
    clearBtn.className = 'no-print';
    clearBtn.style.cssText = 'position: fixed; bottom: 20px; left: 20px; padding: 10px 20px; background: #333; color: #fff; border: none; border-radius: 50px; cursor: pointer; font-size: 14px; font-family: inherit; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: background 0.3s;';
    
    clearBtn.onmouseover = () => clearBtn.style.background = '#dc3545';
    clearBtn.onmouseout = () => clearBtn.style.background = '#333';

    clearBtn.addEventListener('click', function () {
      if (confirm('هل أنت متأكد أنك تريد مسح جميع البيانات والبدء بنموذج جديد؟')) {
        localStorage.removeItem(`brandzo_draft_${FORM_ID}`);
        window.location.reload();
      }
    });

    document.body.appendChild(clearBtn);
  }

  // 10. Excel Export — Universal for all forms
  function setupExcelExport() {
    // Inject CSS for the excel button (only once)
    if (!document.getElementById('brandzo-excel-style')) {
      const style = document.createElement('style');
      style.id = 'brandzo-excel-style';
      style.textContent = `
        .excel-btn {
          display: inline-block;
          margin: 8px 6px;
          padding: 10px 28px;
          background: #16a34a;
          color: #fff;
          border: none;
          font-family: 'Cairo', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          border-radius: 6px;
          box-shadow: 0 3px 12px rgba(22,163,74,0.4);
          transition: background 0.25s;
        }
        .excel-btn:hover { background: #15803d; }
        @media print { .excel-btn { display: none !important; } }
      `;
      document.head.appendChild(style);
    }

    // Inject button only if none exists yet (يشمل زر الماركب bz-btn-excel لمنع التكرار)
    if (!document.querySelector('.excel-btn, .bz-btn-excel')) {
      // Find existing print button container or create one
      const printBtn = document.querySelector('.print-btn');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'excel-btn no-print';
      btn.textContent = '📊 تصدير إلى إكسيل | Export to Excel';
      btn.onclick = exportToExcel;

      if (printBtn && printBtn.parentNode) {
        printBtn.parentNode.insertBefore(btn, printBtn.nextSibling);
      } else {
        // Fallback: insert before first form section
        const firstSection = document.querySelector('.form-wrap, .form-body, main, form');
        if (firstSection) {
          firstSection.parentNode.insertBefore(btn, firstSection);
        } else {
          document.body.insertBefore(btn, document.body.firstChild);
        }
      }
    }
  }

  window.exportToExcel = function exportToExcel() {
    // Load SheetJS only once
    if (window.XLSX) {
      _doExport();
      return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = _doExport;
    script.onerror = function () {
      alert('تعذّر تحميل مكتبة Excel. تحقق من اتصالك بالإنترنت.\nFailed to load Excel library. Check your internet connection.');
    };
    document.head.appendChild(script);
  };

  function _doExport() {
    var dateEl = document.querySelector('input[type="date"]');
    var date = dateEl
      ? dateEl.value || new Date().toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    var titleEl = document.querySelector('.form-title, .main-arabic-title, h1');
    var title = titleEl ? titleEl.textContent.trim() : document.title;

    var rows = [['النموذج', title], ['التاريخ', date], []];

    // Field groups (label + input pairs)
    document.querySelectorAll('.field-group').forEach(function (group) {
      var label = group.querySelector('label');
      var input = group.querySelector('input, textarea, select');
      if (label && input) {
        rows.push([label.textContent.trim(), input.value || '—']);
      }
    });

    // Tables
    document.querySelectorAll('table').forEach(function (table) {
      rows.push([]);
      var headers = [];
      table.querySelectorAll('thead th').forEach(function (th) {
        headers.push(th.textContent.trim());
      });
      if (headers.length) rows.push(headers);
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var rowData = [];
        tr.querySelectorAll('td').forEach(function (td) {
          var inp = td.querySelector('input, select, textarea');
          rowData.push(inp ? (inp.value || '') : td.textContent.trim());
        });
        rows.push(rowData);
      });
    });

    // Summary / footer field groups
    document.querySelectorAll('.summary-grid .field-group, .count-summary .field-group, .form-footer .field-group').forEach(function (group) {
      var label = group.querySelector('label');
      var input = group.querySelector('input, textarea, select');
      if (label && input) {
        rows.push([label.textContent.trim(), input.value || '—']);
      }
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array(15).fill({ wch: 22 });
    XLSX.utils.book_append_sheet(wb, ws, 'Export');

    var safeTitle = title.replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40);
    var defaultName = 'Brandzo_' + safeTitle + '_' + date + '.xlsx';
    var userFileName = prompt('أدخل اسم الملف قبل الحفظ:', defaultName);
    if (userFileName === null) return;
    var finalName = userFileName.trim() !== ''
      ? (userFileName.trim().endsWith('.xlsx') ? userFileName.trim() : userFileName.trim() + '.xlsx')
      : defaultName;
    XLSX.writeFile(wb, finalName);
  }

  // 11. Extra Utils
  function setupPrintValidation() { /* إلغاء القيود */ }

  function setupAutoFill() {
    const dateInput = document.querySelector('input[type="date"]');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
      syncToPrint(dateInput);
    }
  }

  function injectLandscapePrint() {
    if (document.getElementById('brandzo-landscape-print')) return;
    const style = document.createElement('style');
    style.id = 'brandzo-landscape-print';
    style.textContent = '@page { size: A4 landscape; margin: 10mm; } @media print { .no-print { display: none !important; } }';
    document.head.appendChild(style);
  }

})();
