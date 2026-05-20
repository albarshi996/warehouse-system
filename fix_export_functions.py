#!/usr/bin/env python3
"""
Fix the exportToExcel() function bug in all forms.
Removes visible raw text and ensures proper script tag placement.
"""

import os
import re
from pathlib import Path

FORMS_DIR = Path('/workspaces/brandzo-hub-documentation/public/forms')

# The correct exportToExcel function that should be in the script tag
CORRECT_FUNCTION = r'''function exportToExcel() {
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = function () {
        var dateEl = document.querySelector('input[type="date"]');
        var date = dateEl ? dateEl.value || new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        var titleEl = document.querySelector('.form-title, .main-arabic-title, h1');
        var title = titleEl ? titleEl.textContent.trim() : document.title;

        var rows = [['النموذج', title], ['التاريخ', date], []];

        document.querySelectorAll('.field-group').forEach(function (group) {
            var label = group.querySelector('label');
            var input = group.querySelector('input, textarea, select');
            if (label && input) {
                rows.push([label.textContent.trim(), input.value || '—']);
            }
        });

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
        XLSX.writeFile(wb, 'Brandzo_' + safeTitle + '_' + date + '.xlsx');
    };
    script.onerror = function () { alert('Failed to load Excel library. Check your internet connection.'); };
    document.head.appendChild(script);
}'''

def fix_form(file_path):
    """Fix a single form file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Pattern: Find the visible exportToExcel function outside of script tags
    pattern = r'(</script>\s*)\n\s*function exportToExcel\(\)\s*\{[\s\S]*?\n\s*\}\s*\n\s*(</script>)'
    
    # Check if there's visible code
    match = re.search(pattern, content)
    if match:
        print(f"✓ Found visible exportToExcel in {file_path.name}")
        
        def replacer(m):
            return m.group(1) + '\n<script>\n' + CORRECT_FUNCTION + '\n</script>\n' + m.group(2)
        
        fixed = re.sub(pattern, replacer, content, count=1)
        
        if fixed != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(fixed)
            print(f"  ✓ Fixed {file_path.name}")
            return True
    
    # Alternative pattern: just the visible code block with one closing script tag
    pattern2 = r'\n\s*function exportToExcel\(\)\s*\{[\s\S]*?\n\s*\}\s*\n\s*</script>'
    
    match2 = re.search(pattern2, content)
    if match2:
        print(f"✓ Found visible exportToExcel (variant 2) in {file_path.name}")
        
        def replacer2(m):
            return '\n<script>\n' + CORRECT_FUNCTION + '\n</script>'
        
        fixed = re.sub(pattern2, replacer2, content, count=1)
        
        if fixed != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(fixed)
            print(f"  ✓ Fixed {file_path.name}")
            return True
    
    print(f"  - No visible code found in {file_path.name}")
    return False

def main():
    """Fix all form files."""
    forms = sorted(FORMS_DIR.glob('form_*.html'))
    fixed_count = 0
    
    print(f"Found {len(forms)} form files\n")
    
    for form_file in forms:
        if fix_form(form_file):
            fixed_count += 1
    
    print(f"\n✓ Fixed {fixed_count}/{len(forms)} forms")

if __name__ == '__main__':
    main()
