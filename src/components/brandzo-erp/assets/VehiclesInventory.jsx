<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Brandzo | نظام فحص المركبات</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: #0d1b2a;
    --primary2: #1b3a5c;
    --accent: #f0a500;
    --accent2: #ffd166;
    --accent-glow: rgba(240,165,0,0.25);
    --light: #f0f4f8;
    --border: #d4dce8;
    --ok: #00b87a;
    --warn: #f59e0b;
    --bad: #ef4444;
    --na: #94a3b8;
    --text: #1e293b;
    --white: #ffffff;
    --card-bg: #ffffff;
    --surface: #f8fafc;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Tajawal', 'Cairo', sans-serif;
    background: linear-gradient(135deg, #e8edf5 0%, #f0f4fb 100%);
    color: var(--text);
    min-height: 100vh;
  }

  /* ===== TOP BAR ===== */
  .screen-bar {
    background: var(--primary);
    padding: 0 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 200;
    height: 64px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  }

  .screen-bar::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--accent2), var(--accent));
  }

  .bar-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-logo {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 10px;
    padding: 7px 14px;
    font-family: 'Cairo', sans-serif;
    font-size: 1.3rem;
    font-weight: 900;
    color: var(--primary);
    letter-spacing: -0.5px;
    box-shadow: 0 3px 12px var(--accent-glow);
  }

  .brand-divider {
    width: 1.5px;
    height: 28px;
    background: rgba(255,255,255,0.2);
  }

  .bar-title {
    color: rgba(255,255,255,0.85);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .btn-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn {
    padding: 9px 18px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.88rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0);
    transition: background 0.2s;
  }

  .btn:hover::after { background: rgba(255,255,255,0.08); }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.25); }
  .btn:active { transform: translateY(0); }

  .btn-ok-all {
    background: linear-gradient(135deg, #00b87a, #00976a);
    color: white;
    box-shadow: 0 3px 12px rgba(0,184,122,0.4);
  }

  .btn-import {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    box-shadow: 0 3px 12px rgba(59,130,246,0.4);
  }

  .btn-pdf {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    box-shadow: 0 3px 12px rgba(239,68,68,0.4);
  }

  .btn-excel {
    background: linear-gradient(135deg, #059669, #047857);
    color: white;
    box-shadow: 0 3px 12px rgba(5,150,105,0.4);
  }

  .btn-reset {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.8);
    border: 1px solid rgba(255,255,255,0.2);
  }

  .btn-print {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: var(--primary);
    box-shadow: 0 3px 12px var(--accent-glow);
  }

  /* ===== FORM WRAPPER ===== */
  .form-wrapper {
    max-width: 980px;
    margin: 28px auto;
    padding: 0 20px 70px;
  }

  /* ===== HERO HEADER ===== */
  .header-card {
    background: var(--primary);
    border-radius: 18px;
    padding: 30px 38px;
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(13,27,42,0.4);
  }

  .header-card::before {
    content: '';
    position: absolute;
    top: -60px; left: -60px;
    width: 280px; height: 280px;
    background: radial-gradient(circle, rgba(240,165,0,0.18) 0%, transparent 70%);
    border-radius: 50%;
  }

  .header-card::after {
    content: '';
    position: absolute;
    bottom: -80px; right: -40px;
    width: 300px; height: 300px;
    background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%);
    border-radius: 50%;
  }

  .header-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .header-branding {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .header-logo-block {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 14px;
    padding: 12px 20px;
    box-shadow: 0 6px 24px rgba(240,165,0,0.4);
  }

  .header-logo-block span {
    font-family: 'Cairo', sans-serif;
    font-size: 1.6rem;
    font-weight: 900;
    color: var(--primary);
    letter-spacing: -1px;
  }

  .header-text h2 {
    font-size: 1.65rem;
    font-weight: 900;
    color: white;
    margin-bottom: 3px;
    line-height: 1.2;
  }

  .header-text p {
    color: rgba(255,255,255,0.5);
    font-size: 0.85rem;
    font-weight: 400;
  }

  .header-meta {
    display: flex;
    gap: 14px;
  }

  .meta-badge {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 12px 20px;
    text-align: center;
    backdrop-filter: blur(8px);
  }

  .meta-badge .num {
    font-size: 1.6rem;
    font-weight: 900;
    color: var(--accent);
    line-height: 1;
    font-family: 'Cairo', sans-serif;
  }

  .meta-badge .lbl {
    font-size: 0.72rem;
    opacity: 0.6;
    color: white;
    margin-top: 3px;
  }

  /* ===== SUMMARY BAR ===== */
  .summary-bar {
    background: var(--primary2);
    border-radius: 14px;
    padding: 16px 24px;
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 22px;
    flex-wrap: wrap;
    box-shadow: 0 4px 20px rgba(13,27,42,0.2);
    border: 1px solid rgba(255,255,255,0.07);
  }

  .sum-label {
    color: rgba(255,255,255,0.5);
    font-size: 0.8rem;
    font-weight: 700;
    margin-left: auto;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sum-item {
    display: flex;
    align-items: center;
    gap: 9px;
    background: rgba(255,255,255,0.07);
    border-radius: 10px;
    padding: 9px 16px;
    border: 1px solid rgba(255,255,255,0.06);
  }

  .sum-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 8px currentColor;
  }

  .sum-item .sum-text { color: rgba(255,255,255,0.7); font-size: 0.82rem; font-weight: 600; }
  .sum-item .count { font-size: 1.3rem; font-weight: 900; color: white; font-family: 'Cairo', sans-serif; }

  /* ===== SECTION CARD ===== */
  .section-card {
    background: var(--card-bg);
    border-radius: 16px;
    margin-bottom: 20px;
    box-shadow: 0 3px 16px rgba(0,0,0,0.07);
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.05);
  }

  .section-header {
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary2) 100%);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .s-icon {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    box-shadow: 0 3px 10px rgba(240,165,0,0.4);
    flex-shrink: 0;
  }

  .section-header h3 {
    color: white;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .section-all-ok-btn {
    background: rgba(0,184,122,0.2);
    color: #6effd0;
    border: 1px solid rgba(0,184,122,0.4);
    border-radius: 8px;
    padding: 6px 14px;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .section-all-ok-btn:hover {
    background: rgba(0,184,122,0.35);
    transform: scale(1.02);
  }

  .section-body {
    padding: 24px;
  }

  /* ===== GRID FIELDS ===== */
  .fields-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .fields-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .fields-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .fields-grid.cols-1 { grid-template-columns: 1fr; }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field-group label {
    font-size: 0.78rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-group input,
  .field-group select,
  .field-group textarea {
    border: 1.5px solid var(--border);
    border-radius: 9px;
    padding: 9px 13px;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.95rem;
    color: var(--text);
    transition: all 0.2s;
    background: var(--surface);
    width: 100%;
  }

  .field-group input:focus,
  .field-group select:focus,
  .field-group textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 4px rgba(240,165,0,0.12);
    background: white;
  }

  .field-group textarea { resize: vertical; min-height: 75px; }

  /* ===== INSPECTION TABLE ===== */
  .insp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .insp-table thead tr {
    background: linear-gradient(135deg, var(--primary), var(--primary2));
    color: white;
  }

  .insp-table th {
    padding: 12px 16px;
    font-weight: 700;
    text-align: right;
    font-size: 0.83rem;
    letter-spacing: 0.03em;
  }

  .insp-table th:first-child {
    width: 36px;
    text-align: center;
    border-radius: 0 8px 0 0;
  }

  .insp-table th:last-child { border-radius: 8px 0 0 0; }

  .insp-table tbody tr {
    border-bottom: 1px solid #edf0f5;
    transition: background 0.12s;
  }

  .insp-table tbody tr:hover { background: #f8fbff; }
  .insp-table tbody tr:last-child { border-bottom: none; }

  .insp-table td {
    padding: 10px 16px;
    vertical-align: middle;
  }

  .insp-table td:first-child {
    text-align: center;
    font-size: 0.72rem;
    color: #aab4c2;
    font-weight: 900;
    font-family: 'Cairo', sans-serif;
  }

  .row-label {
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--text);
    line-height: 1.4;
  }

  /* ===== RADIO BUTTONS ===== */
  .radio-group {
    display: flex;
    gap: 5px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .radio-btn {
    position: relative;
  }

  .radio-btn input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0; height: 0;
  }

  .radio-btn label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 13px;
    border-radius: 20px;
    font-size: 0.77rem;
    font-weight: 700;
    cursor: pointer;
    border: 1.5px solid #d8dfe9;
    background: #f8fafc;
    transition: all 0.16s;
    white-space: nowrap;
    min-width: 54px;
    user-select: none;
  }

  .radio-btn input[type="radio"]:checked + label {
    border-color: transparent;
    color: white;
    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    transform: scale(1.05);
  }

  .radio-btn.ok input[type="radio"]:checked + label {
    background: linear-gradient(135deg, var(--ok), #00976a);
    box-shadow: 0 3px 10px rgba(0,184,122,0.4);
  }

  .radio-btn.warn input[type="radio"]:checked + label {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    box-shadow: 0 3px 10px rgba(245,158,11,0.4);
  }

  .radio-btn.bad input[type="radio"]:checked + label {
    background: linear-gradient(135deg, var(--bad), #dc2626);
    box-shadow: 0 3px 10px rgba(239,68,68,0.4);
  }

  .radio-btn.na input[type="radio"]:checked + label {
    background: linear-gradient(135deg, #94a3b8, #64748b);
    box-shadow: 0 3px 10px rgba(100,116,139,0.4);
  }

  .radio-btn label:hover {
    border-color: #94a3b8;
    background: #f1f5f9;
    transform: translateY(-1px);
  }

  .radio-btn input[type="radio"]:checked + label:hover {
    opacity: 0.92;
    transform: scale(1.05);
  }

  .notes-input {
    border: 1.5px solid var(--border);
    border-radius: 7px;
    padding: 7px 11px;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.82rem;
    width: 100%;
    min-width: 130px;
    background: var(--surface);
    transition: all 0.18s;
    color: var(--text);
  }

  .notes-input:focus {
    outline: none;
    border-color: var(--accent);
    background: white;
    box-shadow: 0 0 0 3px rgba(240,165,0,0.1);
  }

  /* ===== TIRES ===== */
  .tires-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .tire-item {
    border: 2px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    background: var(--surface);
    transition: border-color 0.2s;
  }

  .tire-item:hover { border-color: var(--accent); }

  .tire-label {
    font-size: 0.88rem;
    font-weight: 800;
    color: var(--primary);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .tire-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  /* ===== SIGNATURES ===== */
  .sig-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }

  .sig-box {
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    text-align: center;
    background: var(--surface);
    transition: border-color 0.2s;
  }

  .sig-box:hover { border-color: var(--accent); }

  .sig-line {
    border-bottom: 2px dashed #c8d4e0;
    height: 58px;
    margin-bottom: 12px;
  }

  .sig-box label {
    font-size: 0.78rem;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: block;
    margin-bottom: 6px;
  }

  .sig-box input {
    border: none;
    background: transparent;
    width: 100%;
    text-align: center;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.92rem;
    color: var(--text);
  }

  .sig-box input:focus { outline: none; }

  /* ===== VEHICLE TYPE TOGGLE ===== */
  .type-toggle {
    display: flex;
    background: var(--surface);
    border-radius: 12px;
    padding: 5px;
    border: 1.5px solid var(--border);
    width: fit-content;
    gap: 2px;
  }

  .type-toggle label {
    padding: 9px 22px;
    border-radius: 9px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    color: #7a8a9e;
    transition: all 0.2s;
    user-select: none;
  }

  .type-toggle input[type="radio"] { display: none; }

  .type-toggle input[type="radio"]:checked + label {
    background: var(--primary);
    color: white;
    box-shadow: 0 3px 12px rgba(13,27,42,0.35);
  }

  /* ===== DIVIDER ===== */
  .divider {
    border: none;
    border-top: 1.5px solid #edf2f8;
    margin: 18px 0;
  }

  .section-sub {
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--accent);
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .section-sub::after {
    content: '';
    flex: 1;
    border-top: 1.5px solid #edf2f8;
  }

  /* ===== OVERALL STATUS ===== */
  .overall-status {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .status-opt { position: relative; }

  .status-opt input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0; height: 0;
  }

  .status-opt label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 12px 24px;
    border-radius: 30px;
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
    border: 2px solid #d8dfe9;
    background: white;
    transition: all 0.2s;
  }

  .status-opt.ok input:checked + label {
    border-color: var(--ok);
    background: linear-gradient(135deg, var(--ok), #00976a);
    color: white;
    box-shadow: 0 4px 16px rgba(0,184,122,0.4);
  }

  .status-opt.cond input:checked + label {
    border-color: #f59e0b;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
    box-shadow: 0 4px 16px rgba(245,158,11,0.4);
  }

  .status-opt.rej input:checked + label {
    border-color: var(--bad);
    background: linear-gradient(135deg, var(--bad), #dc2626);
    color: white;
    box-shadow: 0 4px 16px rgba(239,68,68,0.4);
  }

  /* ===== IMPORT OVERLAY ===== */
  .import-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(13,27,42,0.7);
    z-index: 500;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
  }

  .import-overlay.active { display: flex; }

  .import-modal {
    background: white;
    border-radius: 20px;
    padding: 36px 40px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 30px 80px rgba(0,0,0,0.4);
    text-align: center;
    animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.85) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .import-modal .modal-icon {
    width: 64px; height: 64px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin: 0 auto 20px;
    box-shadow: 0 8px 24px rgba(59,130,246,0.4);
  }

  .import-modal h3 {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--primary);
    margin-bottom: 8px;
  }

  .import-modal p {
    color: #64748b;
    font-size: 0.9rem;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .import-drop-zone {
    border: 2px dashed #d4dce8;
    border-radius: 14px;
    padding: 28px;
    margin-bottom: 20px;
    cursor: pointer;
    transition: all 0.2s;
    background: #f8fafc;
  }

  .import-drop-zone:hover, .import-drop-zone.dragging {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .import-drop-zone .drop-icon {
    font-size: 2.5rem;
    margin-bottom: 10px;
  }

  .import-drop-zone .drop-text {
    font-size: 0.88rem;
    color: #64748b;
  }

  .import-drop-zone .drop-text strong {
    color: #3b82f6;
  }

  #excelFileInput { display: none; }

  .modal-btns {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .modal-btn {
    padding: 10px 24px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    transition: all 0.2s;
  }

  .modal-btn-primary {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    box-shadow: 0 4px 14px rgba(59,130,246,0.4);
  }

  .modal-btn-secondary {
    background: #f1f5f9;
    color: #64748b;
  }

  .modal-btn:hover { opacity: 0.88; transform: translateY(-1px); }

  /* ===== TOAST ===== */
  .toast-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .toast {
    background: var(--primary);
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    border-right: 4px solid var(--accent);
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateY(20px) scale(0.9); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ===== PROGRESS BAR ===== */
  .progress-container {
    background: rgba(255,255,255,0.08);
    border-radius: 8px;
    height: 4px;
    width: 180px;
    overflow: hidden;
    margin-right: auto;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--ok), var(--accent));
    border-radius: 8px;
    transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    width: 0%;
  }

  .progress-label {
    color: rgba(255,255,255,0.6);
    font-size: 0.75rem;
    font-weight: 700;
  }

  /* ===== PRINT ===== */
  @media print {
    .screen-bar, .summary-bar, .import-overlay, .toast-container { display: none !important; }

    body { background: white; font-size: 9pt; }

    .form-wrapper { max-width: 100%; margin: 0; padding: 0; }

    .header-card {
      border-radius: 0;
      box-shadow: none;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      page-break-after: avoid;
    }

    .section-card {
      box-shadow: none;
      border: 1px solid #ccc;
      margin-bottom: 8px;
      page-break-inside: avoid;
    }

    .section-header {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .radio-btn label {
      border: 1px solid #ccc;
      padding: 3px 8px;
      font-size: 7pt;
    }

    .radio-btn input[type="radio"]:checked + label {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .field-group input, .field-group select, .field-group textarea, .notes-input {
      border: none;
      border-bottom: 1px solid #999;
      border-radius: 0;
      background: transparent;
      padding: 2px 4px;
    }

    .insp-table th {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .fields-grid { gap: 8px; }
    .section-body { padding: 12px; }
    .insp-table td, .insp-table th { padding: 5px 8px; }

    @page { size: A4; margin: 10mm 12mm; }
  }
</style>
</head>
<body>

<!-- IMPORT OVERLAY -->
<div class="import-overlay" id="importOverlay">
  <div class="import-modal">
    <div class="modal-icon">📥</div>
    <h3>استيراد بيانات من Excel</h3>
    <p>اختر ملف Excel (xlsx) تم تصديره من هذا النظام لاستعادة البيانات تلقائياً</p>
    <div class="import-drop-zone" id="dropZone" onclick="document.getElementById('excelFileInput').click()">
      <div class="drop-icon">📊</div>
      <div class="drop-text">
        <strong>انقر لاختيار الملف</strong> أو اسحبه وأفلته هنا<br>
        <span style="font-size:0.8rem;color:#94a3b8;margin-top:4px;display:block;">ملفات .xlsx فقط</span>
      </div>
    </div>
    <input type="file" id="excelFileInput" accept=".xlsx" onchange="handleImportFile(event)">
    <div class="modal-btns">
      <button class="modal-btn modal-btn-primary" onclick="document.getElementById('excelFileInput').click()">📂 اختيار ملف</button>
      <button class="modal-btn modal-btn-secondary" onclick="closeImport()">إلغاء</button>
    </div>
  </div>
</div>

<!-- TOAST CONTAINER -->
<div class="toast-container" id="toastContainer"></div>

<!-- TOP BAR -->
<div class="screen-bar">
  <div class="bar-brand">
    <div class="brand-logo">Brandzo</div>
    <div class="brand-divider"></div>
    <div class="bar-title">نظام فحص المركبات المستلمة</div>
  </div>
  <div class="btn-group">
    <div class="progress-container" title="نسبة اكتمال الفحص">
      <div class="progress-bar" id="progressBar"></div>
    </div>
    <span class="progress-label" id="progressLabel">0%</span>
    <button class="btn btn-ok-all" onclick="markAllOk()" title="تحديد جميع البنود كسليم">✅ كل سليم</button>
    <button class="btn btn-import" onclick="openImport()">📥 استيراد</button>
    <button class="btn btn-pdf" onclick="exportPDF()">📄 PDF</button>
    <button class="btn btn-excel" onclick="exportExcel()">📊 Excel</button>
    <button class="btn btn-print" onclick="window.print()">🖨 طباعة</button>
    <button class="btn btn-reset" onclick="resetForm()">↺ جديد</button>
  </div>
</div>

<div class="form-wrapper" id="mainForm">

  <!-- HERO HEADER -->
  <div class="header-card">
    <div class="header-inner">
      <div class="header-branding">
        <div class="header-logo-block">
          <span>Brandzo</span>
        </div>
        <div class="header-text">
          <h2>نموذج استلام وفحص المركبة</h2>
          <p>Vehicle Receiving & Inspection Report · System v2.0</p>
        </div>
      </div>
      <div class="header-meta">
        <div class="meta-badge">
          <div class="num" id="formNumber">---</div>
          <div class="lbl">رقم النموذج</div>
        </div>
        <div class="meta-badge">
          <div class="num" id="liveDate">---</div>
          <div class="lbl">تاريخ الفحص</div>
        </div>
      </div>
    </div>
  </div>

  <!-- SUMMARY BAR -->
  <div class="summary-bar" id="summaryBar">
    <div class="sum-label">ملخص الفحص ▾</div>
    <div class="sum-item">
      <div class="sum-dot" style="background:var(--ok);color:var(--ok)"></div>
      <span class="sum-text">سليم</span>
      <span class="count" id="cnt-ok">0</span>
    </div>
    <div class="sum-item">
      <div class="sum-dot" style="background:#f59e0b;color:#f59e0b"></div>
      <span class="sum-text">متابعة</span>
      <span class="count" id="cnt-warn">0</span>
    </div>
    <div class="sum-item">
      <div class="sum-dot" style="background:var(--bad);color:var(--bad)"></div>
      <span class="sum-text">معطل</span>
      <span class="count" id="cnt-bad">0</span>
    </div>
    <div class="sum-item">
      <div class="sum-dot" style="background:var(--na);color:var(--na)"></div>
      <span class="sum-text">لا ينطبق</span>
      <span class="count" id="cnt-na">0</span>
    </div>
  </div>

  <!-- SECTION 1: BASIC INFO -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">📋</div>
        <h3>١ - البيانات الأساسية</h3>
      </div>
    </div>
    <div class="section-body">
      <div style="margin-bottom:20px;">
        <div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">نوع المركبة</div>
        <div class="type-toggle">
          <input type="radio" name="vehicleCategory" id="cat-admin" value="سيارة إدارية" checked onchange="toggleVehicleType()">
          <label for="cat-admin">🚗 سيارة إدارية</label>
          <input type="radio" name="vehicleCategory" id="cat-transport" value="مركبة نقل" onchange="toggleVehicleType()">
          <label for="cat-transport">🚛 مركبة نقل</label>
          <input type="radio" name="vehicleCategory" id="cat-heavy" value="معدة ثقيلة" onchange="toggleVehicleType()">
          <label for="cat-heavy">🏗 معدة ثقيلة</label>
          <input type="radio" name="vehicleCategory" id="cat-bus" value="حافلة" onchange="toggleVehicleType()">
          <label for="cat-bus">🚌 حافلة</label>
        </div>
      </div>

      <div class="fields-grid cols-4">
        <div class="field-group">
          <label>تاريخ الفحص</label>
          <input type="date" id="inspDate" name="inspDate" onchange="updateLiveDate()">
        </div>
        <div class="field-group">
          <label>وقت الفحص</label>
          <input type="time" id="inspTime" name="inspTime">
        </div>
        <div class="field-group">
          <label>رقم النموذج</label>
          <input type="text" id="formNo" name="formNo" placeholder="FI-2026-001">
        </div>
        <div class="field-group">
          <label>الجهة / القسم</label>
          <input type="text" id="department" name="department" placeholder="اسم الجهة أو القسم">
        </div>
      </div>

      <hr class="divider">
      <div class="section-sub">بيانات المركبة</div>

      <div class="fields-grid cols-4">
        <div class="field-group">
          <label>رقم اللوحة</label>
          <input type="text" id="plateNo" name="plateNo" placeholder="أ ب ج 1234">
        </div>
        <div class="field-group">
          <label>الماركة</label>
          <input type="text" id="brand" name="brand" placeholder="تويوتا / فورد...">
        </div>
        <div class="field-group">
          <label>الموديل</label>
          <input type="text" id="model" name="model" placeholder="النوع">
        </div>
        <div class="field-group">
          <label>سنة الصنع</label>
          <input type="number" id="year" name="year" placeholder="2024" min="1990" max="2030">
        </div>
        <div class="field-group">
          <label>اللون</label>
          <input type="text" id="color" name="color" placeholder="اللون">
        </div>
        <div class="field-group">
          <label>رقم الهيكل (VIN)</label>
          <input type="text" id="vin" name="vin" placeholder="17 حرف/رقم">
        </div>
        <div class="field-group">
          <label>رقم المحرك</label>
          <input type="text" id="engineNo" name="engineNo" placeholder="رقم المحرك">
        </div>
        <div class="field-group">
          <label>نوع الوقود</label>
          <select id="fuelType" name="fuelType">
            <option value="">اختر...</option>
            <option>بنزين</option>
            <option>ديزل</option>
            <option>غاز طبيعي</option>
            <option>كهرباء</option>
            <option>هايبرد</option>
          </select>
        </div>
      </div>

      <hr class="divider">
      <div class="section-sub">بيانات التسجيل والاستلام</div>

      <div class="fields-grid cols-4">
        <div class="field-group">
          <label>عداد المسافة (كم)</label>
          <input type="number" id="odometer" name="odometer" placeholder="0">
        </div>
        <div class="field-group">
          <label>تاريخ آخر صيانة</label>
          <input type="date" id="lastService" name="lastService">
        </div>
        <div class="field-group">
          <label>آخر صيانة عند (كم)</label>
          <input type="number" id="lastServiceKm" name="lastServiceKm" placeholder="0">
        </div>
        <div class="field-group">
          <label>انتهاء الرخصة</label>
          <input type="date" id="licExpiry" name="licExpiry">
        </div>
        <div class="field-group">
          <label>المستلم من</label>
          <input type="text" id="receivedFrom" name="receivedFrom">
        </div>
        <div class="field-group">
          <label>رقم وثيقة التأمين</label>
          <input type="text" id="insNo" name="insNo">
        </div>
        <div class="field-group">
          <label>انتهاء التأمين</label>
          <input type="date" id="insExpiry" name="insExpiry">
        </div>
        <div class="field-group">
          <label>الحمولة المصرح بها (طن)</label>
          <input type="text" id="payload" name="payload" placeholder="للنقل فقط">
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 2: EXTERNAL -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">🔍</div>
        <h3>٢ - الفحص الخارجي للهيكل</h3>
      </div>
      <button class="section-all-ok-btn" onclick="markSectionOk('ext')">✅ كل سليم</button>
    </div>
    <div class="section-body">
      <table class="insp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>بند الفحص</th>
            <th style="text-align:center;min-width:230px;">الحالة</th>
            <th style="min-width:160px;">ملاحظات</th>
          </tr>
        </thead>
        <tbody id="extBody"></tbody>
      </table>
    </div>
  </div>

  <!-- SECTION 3: MECHANICAL -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">⚙️</div>
        <h3>٣ - الفحص الميكانيكي</h3>
      </div>
      <button class="section-all-ok-btn" onclick="markSectionOk('mech')">✅ كل سليم</button>
    </div>
    <div class="section-body">
      <table class="insp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>بند الفحص</th>
            <th style="text-align:center;min-width:230px;">الحالة</th>
            <th style="min-width:160px;">ملاحظات</th>
          </tr>
        </thead>
        <tbody id="mechBody"></tbody>
      </table>
    </div>
  </div>

  <!-- SECTION 4: ELECTRICAL -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">⚡</div>
        <h3>٤ - الفحص الكهربائي</h3>
      </div>
      <button class="section-all-ok-btn" onclick="markSectionOk('elec')">✅ كل سليم</button>
    </div>
    <div class="section-body">
      <table class="insp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>بند الفحص</th>
            <th style="text-align:center;min-width:230px;">الحالة</th>
            <th style="min-width:160px;">ملاحظات</th>
          </tr>
        </thead>
        <tbody id="elecBody"></tbody>
      </table>
    </div>
  </div>

  <!-- SECTION 5: TIRES -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">🔧</div>
        <h3>٥ - فحص الإطارات والعجلات</h3>
      </div>
    </div>
    <div class="section-body">
      <div class="tires-grid" id="tiresGrid"></div>
      <hr class="divider">
      <div class="fields-grid cols-3" style="margin-top:16px;">
        <div class="field-group">
          <label>الإطار الاحتياطي</label>
          <select name="spareTire">
            <option value="">اختر...</option>
            <option>موجود وجيد</option>
            <option>موجود ومتهالك</option>
            <option>غير موجود</option>
          </select>
        </div>
        <div class="field-group">
          <label>المثلث العاكس</label>
          <select name="triangle">
            <option value="">اختر...</option>
            <option>موجود</option>
            <option>غير موجود</option>
          </select>
        </div>
        <div class="field-group">
          <label>طفاية الحريق</label>
          <select name="fireExt">
            <option value="">اختر...</option>
            <option>موجودة وصالحة</option>
            <option>موجودة منتهية</option>
            <option>غير موجودة</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 6: INTERIOR -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">🪑</div>
        <h3>٦ - الفحص الداخلي</h3>
      </div>
      <button class="section-all-ok-btn" onclick="markSectionOk('int')">✅ كل سليم</button>
    </div>
    <div class="section-body">
      <table class="insp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>بند الفحص</th>
            <th style="text-align:center;min-width:230px;">الحالة</th>
            <th style="min-width:160px;">ملاحظات</th>
          </tr>
        </thead>
        <tbody id="intBody"></tbody>
      </table>
    </div>
  </div>

  <!-- SECTION 7: TRANSPORT -->
  <div class="section-card" id="transportSection">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">🚛</div>
        <h3>٧ - بنود خاصة بمركبات النقل والمعدات</h3>
      </div>
      <button class="section-all-ok-btn" onclick="markSectionOk('trans')">✅ كل سليم</button>
    </div>
    <div class="section-body">
      <table class="insp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>بند الفحص</th>
            <th style="text-align:center;min-width:230px;">الحالة</th>
            <th style="min-width:160px;">ملاحظات</th>
          </tr>
        </thead>
        <tbody id="transBody"></tbody>
      </table>
    </div>
  </div>

  <!-- SECTION 8: ACCESSORIES -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">📦</div>
        <h3>٨ - الملحقات والوثائق</h3>
      </div>
    </div>
    <div class="section-body">
      <div class="fields-grid cols-4">
        <div class="field-group">
          <label>دليل المالك</label>
          <select name="ownerManual"><option value="">اختر...</option><option>موجود</option><option>غير موجود</option></select>
        </div>
        <div class="field-group">
          <label>كتالوج قطع الغيار</label>
          <select name="partsCatalog"><option value="">اختر...</option><option>موجود</option><option>غير موجود</option></select>
        </div>
        <div class="field-group">
          <label>استمارة تسجيل</label>
          <select name="regCard"><option value="">اختر...</option><option>موجودة وسارية</option><option>موجودة منتهية</option><option>غير موجودة</option></select>
        </div>
        <div class="field-group">
          <label>وثيقة التأمين</label>
          <select name="insDoc"><option value="">اختر...</option><option>موجودة وسارية</option><option>موجودة منتهية</option><option>غير موجودة</option></select>
        </div>
        <div class="field-group">
          <label>مفاتيح إضافية (العدد)</label>
          <input type="number" name="extraKeys" placeholder="0" min="0">
        </div>
        <div class="field-group">
          <label>بطاقة رفع (جاكاوية)</label>
          <select name="jackCard"><option value="">اختر...</option><option>موجودة</option><option>غير موجودة</option></select>
        </div>
        <div class="field-group">
          <label>مفتاح الإطارات</label>
          <select name="tireWrench"><option value="">اختر...</option><option>موجود</option><option>غير موجود</option></select>
        </div>
        <div class="field-group">
          <label>جهاز GPS / تتبع</label>
          <select name="gps"><option value="">اختر...</option><option>موجود وفعال</option><option>موجود غير فعال</option><option>غير موجود</option></select>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 9: RESULTS -->
  <div class="section-card">
    <div class="section-header">
      <div class="section-header-left">
        <div class="s-icon">📝</div>
        <h3>٩ - النتيجة العامة والملاحظات</h3>
      </div>
    </div>
    <div class="section-body">
      <div style="margin-bottom:20px;">
        <div style="font-size:0.8rem;font-weight:800;color:#64748b;margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em;">الحكم العام على المركبة</div>
        <div class="overall-status">
          <div class="status-opt ok">
            <input type="radio" name="overallStatus" id="st-ok" value="مقبولة - جاهزة للتشغيل">
            <label for="st-ok">✅ مقبولة - جاهزة للتشغيل</label>
          </div>
          <div class="status-opt cond">
            <input type="radio" name="overallStatus" id="st-cond" value="مقبولة بشروط - تحتاج إصلاحات">
            <label for="st-cond">⚠️ مقبولة بشروط - تحتاج إصلاحات</label>
          </div>
          <div class="status-opt rej">
            <input type="radio" name="overallStatus" id="st-rej" value="مرفوضة - غير صالحة للتشغيل">
            <label for="st-rej">❌ مرفوضة - غير صالحة للتشغيل</label>
          </div>
        </div>
      </div>

      <div class="fields-grid cols-1">
        <div class="field-group">
          <label>الملاحظات العامة والإجراءات المطلوبة</label>
          <textarea name="generalNotes" rows="4" placeholder="اكتب ملاحظاتك وأي إجراءات مطلوبة..."></textarea>
        </div>
      </div>

      <hr class="divider">
      <div class="section-sub">التوقيعات</div>

      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-line"></div>
          <label>الفاحص الميكانيكي</label>
          <input type="text" name="sigMechanic" placeholder="الاسم">
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <label>المستلم</label>
          <input type="text" name="sigReceiver" placeholder="الاسم">
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <label>المسؤول / المشرف</label>
          <input type="text" name="sigSupervisor" placeholder="الاسم">
        </div>
      </div>
    </div>
  </div>

</div>

<script>
// ===================== DATA =====================
const EXT_ITEMS = [
  {id:'ext1',label:'الهيكل العام - وجود صدمات أو تشويه'},
  {id:'ext2',label:'لون الطلاء - تجانس اللون وعدم وجود طلاء مجدد'},
  {id:'ext3',label:'الباب الأمامي الأيمن'},
  {id:'ext4',label:'الباب الأمامي الأيسر'},
  {id:'ext5',label:'الباب الخلفي الأيمن'},
  {id:'ext6',label:'الباب الخلفي الأيسر'},
  {id:'ext7',label:'غطاء المحرك - سلامة الإقفال'},
  {id:'ext8',label:'الصندوق الخلفي / الكبوت'},
  {id:'ext9',label:'الجناح الأمامي الأيمن'},
  {id:'ext10',label:'الجناح الأمامي الأيسر'},
  {id:'ext11',label:'الجناح الخلفي الأيمن'},
  {id:'ext12',label:'الجناح الخلفي الأيسر'},
  {id:'ext13',label:'المصد الأمامي - سلامة وتثبيت'},
  {id:'ext14',label:'المصد الخلفي - سلامة وتثبيت'},
  {id:'ext15',label:'الزجاج الأمامي - شقوق أو كسر'},
  {id:'ext16',label:'الزجاج الخلفي'},
  {id:'ext17',label:'زجاج الجانب الأيمن (كامل)'},
  {id:'ext18',label:'زجاج الجانب الأيسر (كامل)'},
  {id:'ext19',label:'المرايا الجانبية - اتجاه وسلامة'},
  {id:'ext20',label:'المصابيح الأمامية (هيدلايت)'},
  {id:'ext21',label:'الإشارات والأضواء الجانبية'},
  {id:'ext22',label:'المصابيح الخلفية والفرامل'},
  {id:'ext23',label:'السقف ووجود صدأ أو تلف'},
  {id:'ext24',label:'الأرضية أسفل المركبة - صدأ أو تسريب'},
];

const MECH_ITEMS = [
  {id:'m1',label:'مستوى زيت المحرك'},
  {id:'m2',label:'حالة زيت المحرك (اللون والرائحة)'},
  {id:'m3',label:'مستوى ماء الرادياتير / سائل التبريد'},
  {id:'m4',label:'حالة الرادياتير - تسريب أو تآكل'},
  {id:'m5',label:'سائل ناقل الحركة (جير)'},
  {id:'m6',label:'سائل الدريكسيون الهيدروليكي'},
  {id:'m7',label:'سائل الفرامل'},
  {id:'m8',label:'سائل محور الزجاج'},
  {id:'m9',label:'البطارية - الشحن والتثبيت'},
  {id:'m10',label:'حزام الميناتور / الداينمو'},
  {id:'m11',label:'حزام التوقيت أو السلسلة (إن أمكن)'},
  {id:'m12',label:'نظام العادم والشكمان - تسريب أو صوت'},
  {id:'m13',label:'الفرامل الأمامية (تآكل وسماكة)'},
  {id:'m14',label:'الفرامل الخلفية (تآكل وسماكة)'},
  {id:'m15',label:'الفرامل اليدوية'},
  {id:'m16',label:'نظام التوجيه والدريكسيون'},
  {id:'m17',label:'المشكات والروافد'},
  {id:'m18',label:'الصلبة والقضبان'},
  {id:'m19',label:'جهاز التعليق الأمامي (مطاط ومساعد)'},
  {id:'m20',label:'جهاز التعليق الخلفي'},
  {id:'m21',label:'ناقل الحركة / التروس - سلاسة التحويل'},
  {id:'m22',label:'الوصلات المرنة والأكسل'},
  {id:'m23',label:'مضخة الوقود وخط الوقود'},
  {id:'m24',label:'فلتر الهواء - نظافة'},
  {id:'m25',label:'فلتر الوقود - حالة'},
  {id:'m26',label:'نظام التكييف - ضغط الغاز'},
  {id:'m27',label:'ضاغط التكييف (كمبريسور)'},
];

const ELEC_ITEMS = [
  {id:'e1',label:'تشغيل المحرك - سلاسة الإقلاع'},
  {id:'e2',label:'مؤشرات لوحة القيادة'},
  {id:'e3',label:'مؤشر الوقود'},
  {id:'e4',label:'مؤشر درجة حرارة المحرك'},
  {id:'e5',label:'الضوء الأمامي القصير والبعيد'},
  {id:'e6',label:'أضواء الضباب (إن وجدت)'},
  {id:'e7',label:'إشارات الانعطاف (4 زوايا)'},
  {id:'e8',label:'أضواء التحذير الطارئة (فلاشر)'},
  {id:'e9',label:'أضواء الرجوع (النزول)'},
  {id:'e10',label:'بوق التنبيه'},
  {id:'e11',label:'شاشة ووسائط الترفيه'},
  {id:'e12',label:'نظام مسح الزجاج (شبان الشاشة)'},
  {id:'e13',label:'رافعات النوافذ الكهربائية'},
  {id:'e14',label:'مرايا كهربائية'},
  {id:'e15',label:'نظام الإنذار من السرقة'},
  {id:'e16',label:'أجهزة الاستشعار (Park Sensors)'},
  {id:'e17',label:'الشاحن والمقابس الداخلية'},
];

const INT_ITEMS = [
  {id:'i1',label:'حالة المقاعد الأمامية - شقوق أو تمزق'},
  {id:'i2',label:'حالة المقاعد الخلفية'},
  {id:'i3',label:'حزام الأمان (جميع المقاعد)'},
  {id:'i4',label:'السقف الداخلي والتنجيد'},
  {id:'i5',label:'الأرضية وإسفنج الأرضية'},
  {id:'i6',label:'الكونسول والداشبورد - شقوق'},
  {id:'i7',label:'مقود القيادة'},
  {id:'i8',label:'البداليات والكبة'},
  {id:'i9',label:'عمل التكييف من الداخل'},
  {id:'i10',label:'فتحة السقف (إن وجدت)'},
  {id:'i11',label:'نظافة الداخل العام'},
];

const TRANS_ITEMS = [
  {id:'t1',label:'هيكل الصندوق / المقطورة - سلامة'},
  {id:'t2',label:'باب الصندوق الخلفي - إقفال وإغلاق'},
  {id:'t3',label:'الرافعة الهيدروليكية (لوري القلاب)'},
  {id:'t4',label:'خزان الوقود الإضافي - تسريب'},
  {id:'t5',label:'نظام الهواء المضغوط (الفرامل الهوائية)'},
  {id:'t6',label:'خزان الهواء وأنابيبه'},
  {id:'t7',label:'الأرجل الدعامة (الجاك الجانبي للمقطورة)'},
  {id:'t8',label:'سلسلة/كوبلة ربط المقطورة'},
  {id:'t9',label:'أضواء المقطورة / الصندوق'},
  {id:'t10',label:'الإطارات الوسطى (للشاحنات ذات المحور المزدوج)'},
  {id:'t11',label:'صلابة الشاسيه وحمالات التعليق الخلفي'},
  {id:'t12',label:'نظام PTO (نقل القدرة) إن وجد'},
  {id:'t13',label:'الرافعة / الأوناش إن وجدت'},
  {id:'t14',label:'الأقفاص والحواجز الداخلية للصندوق'},
];

const TIRE_POSITIONS = [
  {id:'fl',label:'الأمامي الأيمن',icon:'↖'},
  {id:'fr',label:'الأمامي الأيسر',icon:'↗'},
  {id:'rl',label:'الخلفي الأيمن',icon:'↙'},
  {id:'rr',label:'الخلفي الأيسر',icon:'↘'},
];

const SECTION_ITEMS = {ext: EXT_ITEMS, mech: MECH_ITEMS, elec: ELEC_ITEMS, int: INT_ITEMS, trans: TRANS_ITEMS};

// ===================== RENDER =====================
function makeRadios(id) {
  return `<div class="radio-group">
    <div class="radio-btn ok"><input type="radio" name="status_${id}" id="${id}_ok" value="سليم" onchange="updateSummary()"><label for="${id}_ok">✅ سليم</label></div>
    <div class="radio-btn warn"><input type="radio" name="status_${id}" id="${id}_warn" value="يحتاج متابعة" onchange="updateSummary()"><label for="${id}_warn">⚠️ متابعة</label></div>
    <div class="radio-btn bad"><input type="radio" name="status_${id}" id="${id}_bad" value="معطل" onchange="updateSummary()"><label for="${id}_bad">❌ معطل</label></div>
    <div class="radio-btn na"><input type="radio" name="status_${id}" id="${id}_na" value="لا ينطبق" onchange="updateSummary()"><label for="${id}_na">— لا ينطبق</label></div>
  </div>`;
}

function renderTable(tbodyId, items) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = items.map((item, i) => `
    <tr>
      <td>${i+1}</td>
      <td class="row-label">${item.label}</td>
      <td>${makeRadios(item.id)}</td>
      <td><input class="notes-input" type="text" name="notes_${item.id}" placeholder="ملاحظة..."></td>
    </tr>`).join('');
}

function renderTires(positions) {
  const grid = document.getElementById('tiresGrid');
  grid.innerHTML = positions.map(t => `
    <div class="tire-item">
      <div class="tire-label">${t.icon} ${t.label}</div>
      <div class="tire-fields">
        <div class="field-group"><label>المقاس</label><input type="text" name="tire_size_${t.id}" placeholder="225/75R16"></div>
        <div class="field-group"><label>العمق (ملم)</label><input type="number" name="tire_depth_${t.id}" placeholder="5" min="0" max="12" step="0.5"></div>
        <div class="field-group"><label>الضغط (PSI)</label><input type="number" name="tire_pressure_${t.id}" placeholder="35" min="0" max="120"></div>
        <div class="field-group"><label>الحالة</label><select name="tire_cond_${t.id}"><option value="">اختر...</option><option>جيد</option><option>مقبول</option><option>يحتاج تغيير</option></select></div>
      </div>
    </div>`).join('');
}

// ===================== SUMMARY =====================
function updateSummary() {
  const all = document.querySelectorAll('input[type="radio"][name^="status_"]:checked');
  let ok=0,warn=0,bad=0,na=0;
  all.forEach(r => {
    if(r.value==='سليم') ok++;
    else if(r.value==='يحتاج متابعة') warn++;
    else if(r.value==='معطل') bad++;
    else if(r.value==='لا ينطبق') na++;
  });
  document.getElementById('cnt-ok').textContent = ok;
  document.getElementById('cnt-warn').textContent = warn;
  document.getElementById('cnt-bad').textContent = bad;
  document.getElementById('cnt-na').textContent = na;

  const totalItems = EXT_ITEMS.length + MECH_ITEMS.length + ELEC_ITEMS.length + INT_ITEMS.length + INT_ITEMS.length + TRANS_ITEMS.length;
  const done = ok+warn+bad+na;
  const pct = Math.round((done/totalItems)*100);
  document.getElementById('progressBar').style.width = Math.min(pct,100)+'%';
  document.getElementById('progressLabel').textContent = Math.min(pct,100)+'%';
}

// ===================== MARK ALL OK =====================
function markAllOk() {
  const allItems = [...EXT_ITEMS,...MECH_ITEMS,...ELEC_ITEMS,...INT_ITEMS,...TRANS_ITEMS];
  allItems.forEach(item => {
    const radio = document.getElementById(`${item.id}_ok`);
    if(radio) radio.checked = true;
  });
  updateSummary();
  showToast('✅ تم تحديد جميع البنود كسليم');
}

function markSectionOk(sectionPrefix) {
  const items = SECTION_ITEMS[sectionPrefix] || [];
  items.forEach(item => {
    const radio = document.getElementById(`${item.id}_ok`);
    if(radio) radio.checked = true;
  });
  updateSummary();
  showToast('✅ تم تحديد قسم كامل كسليم');
}

// ===================== UTILS =====================
function generateFormNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth()+1;
  const d = now.getDate();
  const rand = String(Math.floor(Math.random()*900)+100);
  const num = `BZ-${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}-${rand}`;
  document.getElementById('formNumber').textContent = num;
  document.getElementById('formNo').value = num;
}

function setDefaultDateTime() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  document.getElementById('inspDate').value = dateStr;
  document.getElementById('inspTime').value = now.toTimeString().slice(0,5);
  updateLiveDate();
}

function updateLiveDate() {
  const d = document.getElementById('inspDate').value;
  document.getElementById('liveDate').textContent = d || '---';
}

function toggleVehicleType() {
  const val = document.querySelector('input[name="vehicleCategory"]:checked')?.value||'';
  const show = val==='مركبة نقل'||val==='معدة ثقيلة'||val==='حافلة';
  document.getElementById('transportSection').style.display = show?'':'none';
}

function resetForm() {
  if(!confirm('هل تريد مسح جميع البيانات وبدء نموذج جديد؟')) return;
  document.querySelectorAll('input:not([type="radio"]):not([type="date"]):not([type="time"]), textarea, select').forEach(el => el.value='');
  document.querySelectorAll('input[type="radio"]').forEach(el => el.checked=false);
  document.getElementById('cat-admin').checked=true;
  generateFormNumber();
  setDefaultDateTime();
  updateSummary();
  showToast('🔄 تم إنشاء نموذج جديد');
}

function getVal(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? (el.value||'') : '';
}

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function showToast(msg) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ===================== IMPORT =====================
function openImport() {
  document.getElementById('importOverlay').classList.add('active');
}

function closeImport() {
  document.getElementById('importOverlay').classList.remove('active');
}

// Drag and drop
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if(file) processImportFile(file);
});

function handleImportFile(event) {
  const file = event.target.files[0];
  if(file) processImportFile(file);
}

function processImportFile(file) {
  if(!file.name.endsWith('.xlsx')) {
    showToast('⚠️ يرجى اختيار ملف .xlsx صحيح');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});

      // Sheet 1: Basic Info
      const ws1 = wb.Sheets['البيانات الأساسية'];
      if(ws1) {
        const rows = XLSX.utils.sheet_to_json(ws1, {header:1, defval:''});
        rows.forEach(row => {
          if(row.length >= 2) {
            const key = String(row[0]).trim();
            const val = String(row[1]).trim();
            const fieldMap = {
              'رقم النموذج':'formNo','تاريخ الفحص':'inspDate','وقت الفحص':'inspTime',
              'الجهة / القسم':'department','رقم اللوحة':'plateNo','الماركة':'brand',
              'الموديل':'model','سنة الصنع':'year','اللون':'color','رقم الهيكل (VIN)':'vin',
              'رقم المحرك':'engineNo','نوع الوقود':'fuelType','العداد الحالي (كم)':'odometer',
              'تاريخ آخر صيانة':'lastService','آخر صيانة عند (كم)':'lastServiceKm',
              'انتهاء الرخصة':'licExpiry','المستلم من':'receivedFrom','المستلم':'receivedFrom',
              'رقم وثيقة التأمين':'insNo','انتهاء التأمين':'insExpiry','الحمولة (طن)':'payload'
            };
            if(fieldMap[key] && val) {
              const el = document.getElementById(fieldMap[key]) || document.querySelector(`[name="${fieldMap[key]}"]`);
              if(el) el.value = val;
            }
            if(key==='نوع المركبة' && val) {
              const radios = document.querySelectorAll('input[name="vehicleCategory"]');
              radios.forEach(r => { if(r.value===val) r.checked=true; });
              toggleVehicleType();
            }
            if(key==='الحكم على المركبة' && val) {
              const radios = document.querySelectorAll('input[name="overallStatus"]');
              radios.forEach(r => { if(r.value===val) r.checked=true; });
            }
          }
          if(row.length >= 4 && String(row[2]).trim()) {
            const key = String(row[2]).trim();
            const val = String(row[3]).trim();
            const fieldMap = {
              'نوع المركبة':'vehicleCategory','وقت الفحص':'inspTime','الماركة':'brand',
              'سنة الصنع':'year','نوع الوقود':'fuelType','رقم المحرك':'engineNo',
              'آخر صيانة عند (كم)':'lastServiceKm','انتهاء الرخصة':'licExpiry',
              'رقم وثيقة التأمين':'insNo','الحمولة (طن)':'payload'
            };
            if(fieldMap[key] && val) {
              const el = document.getElementById(fieldMap[key]) || document.querySelector(`[name="${fieldMap[key]}"]`);
              if(el) el.value = val;
            }
          }
        });
      }

      // Sheet 2: Inspection Results
      const ws2 = wb.Sheets['نتائج الفحص'];
      if(ws2) {
        const rows = XLSX.utils.sheet_to_json(ws2, {header:1, defval:''});
        const allItems = [...EXT_ITEMS,...MECH_ITEMS,...ELEC_ITEMS,...INT_ITEMS,...TRANS_ITEMS];
        rows.slice(1).forEach(row => {
          const label = String(row[1]||'').trim();
          const status = String(row[2]||'').trim();
          const notes = String(row[3]||'').trim();
          const item = allItems.find(x => x.label===label);
          if(item && status) {
            const statusMap = {'سليم':'_ok','يحتاج متابعة':'_warn','معطل':'_bad','لا ينطبق':'_na'};
            const suffix = statusMap[status];
            if(suffix) {
              const radio = document.getElementById(item.id+suffix);
              if(radio) radio.checked=true;
            }
            if(notes) {
              const notesEl = document.querySelector(`[name="notes_${item.id}"]`);
              if(notesEl) notesEl.value = notes;
            }
          }
        });
      }

      // Sheet 3: Tires
      const ws3 = wb.Sheets['الإطارات'];
      if(ws3) {
        const rows = XLSX.utils.sheet_to_json(ws3, {header:1, defval:''});
        rows.slice(1).forEach(row => {
          const label = String(row[0]||'').trim();
          const tire = TIRE_POSITIONS.find(t => t.label===label || label.includes(t.label));
          if(tire) {
            const sizeEl = document.querySelector(`[name="tire_size_${tire.id}"]`);
            const depthEl = document.querySelector(`[name="tire_depth_${tire.id}"]`);
            const pressEl = document.querySelector(`[name="tire_pressure_${tire.id}"]`);
            const condEl = document.querySelector(`[name="tire_cond_${tire.id}"]`);
            if(sizeEl && row[1]) sizeEl.value = row[1];
            if(depthEl && row[2]) depthEl.value = row[2];
            if(pressEl && row[3]) pressEl.value = row[3];
            if(condEl && row[4]) condEl.value = row[4];
          }
          // Extras
          const accessMap = {'الإطار الاحتياطي':'spareTire','المثلث العاكس':'triangle','طفاية الحريق':'fireExt'};
          if(accessMap[label] && row[1]) {
            const el = document.querySelector(`[name="${accessMap[label]}"]`);
            if(el) el.value = row[1];
          }
        });
      }

      updateSummary();
      updateLiveDate();
      closeImport();
      showToast('✅ تم استيراد البيانات بنجاح!');
    } catch(err) {
      showToast('❌ خطأ في قراءة الملف، تأكد أنه من هذا النظام');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===================== PDF EXPORT =====================
function exportPDF() {
  showToast('📄 جاري تحضير PDF...');
  window.print();
}

// ===================== EXCEL EXPORT (BRANDZO STYLE) =====================
function exportExcel() {
  const wb = XLSX.utils.book_new();

  // ===========================
  // SHEET 1: البيانات الأساسية
  // ===========================
  const plateno = getVal('plateNo')||'غير محدد';
  const brand = getVal('brand')||'';
  const model = getVal('model')||'';

  const info = [
    // Header rows
    ['Brandzo', '', 'نظام فحص المركبات المستلمة', ''],
    ['Vehicle Inspection Report', '', `المركبة: ${brand} ${model}`, ''],
    ['', '', '', ''],
    ['رقم النموذج', getVal('formNo'), 'نوع المركبة', getRadio('vehicleCategory')],
    ['تاريخ الفحص', getVal('inspDate'), 'وقت الفحص', getVal('inspTime')],
    ['الجهة / القسم', getVal('department'), '', ''],
    ['', '', '', ''],
    ['── بيانات المركبة ──', '', '', ''],
    ['رقم اللوحة', getVal('plateNo'), 'الماركة', getVal('brand')],
    ['الموديل', getVal('model'), 'سنة الصنع', getVal('year')],
    ['اللون', getVal('color'), 'نوع الوقود', getVal('fuelType')],
    ['رقم الهيكل (VIN)', getVal('vin'), 'رقم المحرك', getVal('engineNo')],
    ['', '', '', ''],
    ['── بيانات التشغيل ──', '', '', ''],
    ['العداد الحالي (كم)', getVal('odometer'), 'آخر صيانة عند (كم)', getVal('lastServiceKm')],
    ['تاريخ آخر صيانة', getVal('lastService'), 'انتهاء الرخصة', getVal('licExpiry')],
    ['المستلم من', getVal('receivedFrom'), 'رقم وثيقة التأمين', getVal('insNo')],
    ['انتهاء التأمين', getVal('insExpiry'), 'الحمولة (طن)', getVal('payload')],
    ['', '', '', ''],
    ['── النتيجة العامة ──', '', '', ''],
    ['الحكم على المركبة', getRadio('overallStatus'), '', ''],
    ['الملاحظات العامة', document.querySelector('[name="generalNotes"]')?.value||'', '', ''],
    ['', '', '', ''],
    ['الفاحص الميكانيكي', getVal('sigMechanic'), 'المستلم', getVal('sigReceiver')],
    ['المشرف / المسؤول', getVal('sigSupervisor'), '', ''],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(info);

  // Style: column widths
  ws1['!cols'] = [{wch:30},{wch:28},{wch:30},{wch:28}];

  // Merge cells for header
  ws1['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:1}},
    {s:{r:0,c:2},e:{r:0,c:3}},
    {s:{r:1,c:0},e:{r:1,c:1}},
    {s:{r:1,c:2},e:{r:1,c:3}},
  ];

  applySheetStyle(ws1, info);
  XLSX.utils.book_append_sheet(wb, ws1, 'البيانات الأساسية');

  // ===========================
  // SHEET 2: نتائج الفحص
  // ===========================
  const allItems = [
    ...EXT_ITEMS.map(x => ({...x,section:'الفحص الخارجي للهيكل',sectionNum:'٢'})),
    ...MECH_ITEMS.map(x => ({...x,section:'الفحص الميكانيكي',sectionNum:'٣'})),
    ...ELEC_ITEMS.map(x => ({...x,section:'الفحص الكهربائي',sectionNum:'٤'})),
    ...INT_ITEMS.map(x => ({...x,section:'الفحص الداخلي',sectionNum:'٦'})),
    ...TRANS_ITEMS.map(x => ({...x,section:'مركبات النقل والمعدات',sectionNum:'٧'})),
  ];

  const inspRows = [
    ['Brandzo — نتائج الفحص الفني الشامل', '', '', ''],
    ['المركبة: '+(brand+' '+model).trim() + ' | اللوحة: '+plateno, '', '', ''],
    ['', '', '', ''],
    ['القسم', 'بند الفحص', 'الحالة', 'ملاحظات'],
  ];

  let lastSection = '';
  allItems.forEach(item => {
    if(item.section !== lastSection) {
      inspRows.push(['', '', '', '']);
      inspRows.push([`◆ ${item.sectionNum} - ${item.section}`, '', '', '']);
      lastSection = item.section;
    }
    const status = getRadio(`status_${item.id}`);
    const notes = getVal(`notes_${item.id}`);
    inspRows.push([item.section, item.label, status||'—', notes]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(inspRows);
  ws2['!cols'] = [{wch:26},{wch:45},{wch:20},{wch:38}];
  ws2['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:3}},
    {s:{r:1,c:0},e:{r:1,c:3}},
  ];
  applyInspectionStyle(ws2, inspRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'نتائج الفحص');

  // ===========================
  // SHEET 3: الإطارات
  // ===========================
  const tireRows = [
    ['Brandzo — تقرير الإطارات والعجلات', '', '', '', ''],
    ['', '', '', '', ''],
    ['الإطار', 'المقاس', 'العمق (ملم)', 'الضغط (PSI)', 'الحالة'],
  ];

  TIRE_POSITIONS.forEach(t => {
    tireRows.push([
      t.icon+' '+t.label,
      getVal(`tire_size_${t.id}`),
      getVal(`tire_depth_${t.id}`),
      getVal(`tire_pressure_${t.id}`),
      getVal(`tire_cond_${t.id}`)||'—',
    ]);
  });

  tireRows.push(['','','','','']);
  tireRows.push(['── ملحقات السلامة ──', '', '', '', '']);
  tireRows.push(['الإطار الاحتياطي', getVal('spareTire')||'—', '', '', '']);
  tireRows.push(['المثلث العاكس', getVal('triangle')||'—', '', '', '']);
  tireRows.push(['طفاية الحريق', getVal('fireExt')||'—', '', '', '']);

  const ws3 = XLSX.utils.aoa_to_sheet(tireRows);
  ws3['!cols'] = [{wch:24},{wch:18},{wch:16},{wch:16},{wch:20}];
  ws3['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}}];
  XLSX.utils.book_append_sheet(wb, ws3, 'الإطارات');

  // ===========================
  // SHEET 4: الملخص التنفيذي
  // ===========================
  const ok = parseInt(document.getElementById('cnt-ok').textContent)||0;
  const warn = parseInt(document.getElementById('cnt-warn').textContent)||0;
  const bad = parseInt(document.getElementById('cnt-bad').textContent)||0;
  const na = parseInt(document.getElementById('cnt-na').textContent)||0;
  const total = ok+warn+bad+na;
  const pct = total>0 ? Math.round((ok/total)*100) : 0;

  const sumRows = [
    ['Brandzo', 'التقرير التنفيذي لنتائج الفحص', '', ''],
    ['Vehicle Inspection Summary', getVal('formNo'), '', ''],
    ['', '', '', ''],
    ['── بيانات المركبة ──', '', '', ''],
    ['اللوحة', plateno, 'المركبة', (brand+' '+model).trim()],
    ['التاريخ', getVal('inspDate'), 'القسم', getVal('department')],
    ['', '', '', ''],
    ['── نتائج الفحص ──', '', 'العدد', 'النسبة'],
    ['✅ سليم', '', ok, (total>0 ? (ok/total*100).toFixed(1)+'%' : '0%')],
    ['⚠️ يحتاج متابعة', '', warn, (total>0 ? (warn/total*100).toFixed(1)+'%' : '0%')],
    ['❌ معطل', '', bad, (total>0 ? (bad/total*100).toFixed(1)+'%' : '0%')],
    ['— لا ينطبق', '', na, (total>0 ? (na/total*100).toFixed(1)+'%' : '0%')],
    ['', '', '', ''],
    ['إجمالي البنود المفحوصة', '', total, '100%'],
    ['نسبة السلامة العامة', '', pct+'%', ''],
    ['', '', '', ''],
    ['── الحكم النهائي ──', '', '', ''],
    ['نتيجة الفحص', getRadio('overallStatus')||'—', '', ''],
    ['', '', '', ''],
    ['── التوقيعات ──', '', '', ''],
    ['الفاحص الميكانيكي', getVal('sigMechanic')||'—', 'المستلم', getVal('sigReceiver')||'—'],
    ['المشرف / المسؤول', getVal('sigSupervisor')||'—', '', ''],
    ['', '', '', ''],
    ['', '', '', 'Powered by Brandzo'],
  ];

  const ws4 = XLSX.utils.aoa_to_sheet(sumRows);
  ws4['!cols'] = [{wch:32},{wch:28},{wch:16},{wch:16}];
  ws4['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:0}},
    {s:{r:0,c:1},e:{r:0,c:3}},
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'الملخص التنفيذي');

  const plateClean = plateno.replace(/\s/g,'-');
  const dateStr = getVal('inspDate')||new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Brandzo_فحص_${plateClean}_${dateStr}.xlsx`);
  showToast('📊 تم تصدير Excel بنجاح!');
}

function applySheetStyle(ws, data) {
  const hStyle = {
    font: {bold:true, sz:14, color:{rgb:'F0A500'}},
    fill: {fgColor:{rgb:'0D1B2A'}},
    alignment: {horizontal:'center', vertical:'center', readingOrder:2}
  };
  const sectionStyle = {
    font: {bold:true, sz:10, color:{rgb:'1B3A5C'}},
    fill: {fgColor:{rgb:'FFF8E7'}},
    alignment: {readingOrder:2}
  };
  const labelStyle = {
    font: {bold:true, sz:10, color:{rgb:'1E293B'}},
    alignment: {readingOrder:2}
  };

  // Apply styles to header rows (A1, C1, A2, C2)
  ['A1','C1','A2','C2'].forEach(addr => {
    if(!ws[addr]) ws[addr] = {v:'', t:'s'};
    ws[addr].s = hStyle;
  });
}

function applyInspectionStyle(ws, data) {
  // Style header rows
  ['A1','B1','C1','D1','A2','B2','C2','D2'].forEach(addr => {
    if(!ws[addr]) ws[addr] = {v:'', t:'s'};
    ws[addr].s = {
      font: {bold:true, sz:13, color:{rgb:'F0A500'}},
      fill: {fgColor:{rgb:'0D1B2A'}},
      alignment: {horizontal:'center', vertical:'center', readingOrder:2}
    };
  });
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  generateFormNumber();
  setDefaultDateTime();
  renderTable('extBody', EXT_ITEMS);
  renderTable('mechBody', MECH_ITEMS);
  renderTable('elecBody', ELEC_ITEMS);
  renderTable('intBody', INT_ITEMS);
  renderTable('transBody', TRANS_ITEMS);
  renderTires(TIRE_POSITIONS);
  toggleVehicleType();
  updateSummary();
});
</script>
</body>
</html>
