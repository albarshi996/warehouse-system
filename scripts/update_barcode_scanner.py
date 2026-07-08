#!/usr/bin/env python3
"""Replace the existing Brandzo barcode-scanner CSS + modal/script block in
every form HTML under public/forms/ with an upgraded version that:

1.  Loads `html5-qrcode.min.js` from the **local** ../lib/ directory first,
    falling back to the jsDelivr CDN. The previously hard-coded
    `html5-qrcode@2.3.10` URL was returning 404 (latest published release
    on jsDelivr is 2.3.8), which is why the scanner showed
    "فشل تحميل ماسح الباركود" on mobile.
2.  Runs an explicit `navigator.mediaDevices.getUserMedia({ video: …})`
    probe before handing off to html5-qrcode. This both forces the browser
    permission prompt to fire and lets us catch DOMException names
    (NotAllowedError, NotFoundError, NotReadableError, …) so we can show
    targeted Arabic error messages instead of a black screen.
3.  Maps the four most common camera errors to the Arabic strings the user
    requested.

The CSS additions and SKU-column wrapping logic from the original
inject_barcode_scanner.py are unchanged; this script only swaps the modal
HTML and the inline `<script id="brandzo-barcode-script">` block.
"""
from __future__ import annotations

import re
from pathlib import Path

FORMS_DIR = Path(__file__).resolve().parent.parent / "public" / "forms"

# Replacement block — modal + inline script. Keeps the same outer IDs/markers
# so existing CSS selectors and the table-wrap injector continue to work.
NEW_SCAN_BLOCK = """    <!-- ============================================================
         BRANDZO BARCODE SCANNER — local html5-qrcode bundle with CDN
         fallback, explicit camera permission probe, and Arabic
         per-error messages. Hidden on print.
         ============================================================ -->
    <div class="scan-modal no-print" id="brandzoScanModal" aria-hidden="true">
        <div class="scan-modal__panel" role="dialog" aria-label="ماسح الباركود">
            <div class="scan-modal__title">📷 امسح الباركود / QR</div>
            <div class="scan-modal__hint">وجّه الكاميرا نحو الباركود — سيتم إدراج القيمة تلقائياً.</div>
            <div id="brandzoScanViewport" class="scan-modal__viewport"></div>
            <div class="scan-modal__buttons">
                <button type="button" class="scan-modal__btn scan-modal__btn--cancel" id="brandzoScanCancel">إغلاق</button>
            </div>
        </div>
    </div>
    <script id="brandzo-barcode-script">
        (function () {
            'use strict';
            var modal = document.getElementById('brandzoScanModal');
            var viewport = document.getElementById('brandzoScanViewport');
            var cancelBtn = document.getElementById('brandzoScanCancel');
            if (!modal || !viewport || !cancelBtn) return;

            // The library is bundled with the site so we don't depend on a
            // working CDN connection from the user's mobile network.
            // Forms live at /<base>/forms/*.html, the lib lives at
            // /<base>/lib/html5-qrcode.min.js — so a relative ../lib/ URL
            // works regardless of the deployment base path.
            var LOCAL_URL = '../lib/html5-qrcode.min.js';
            var CDN_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';

            var libPromise = null;
            var html5QrInstance = null;
            var targetInput = null;
            var scanCompleted = false;

            function loadScript(url) {
                return new Promise(function (resolve, reject) {
                    var s = document.createElement('script');
                    s.src = url;
                    s.async = true;
                    s.onload = function () {
                        if (window.Html5Qrcode) resolve();
                        else reject(new Error('LIB_LOADED_BUT_GLOBAL_MISSING'));
                    };
                    s.onerror = function () {
                        s.remove();
                        reject(new Error('SCRIPT_LOAD_FAILED:' + url));
                    };
                    document.head.appendChild(s);
                });
            }

            function loadLib() {
                if (libPromise) return libPromise;
                libPromise = new Promise(function (resolve, reject) {
                    if (window.Html5Qrcode) return resolve();
                    loadScript(LOCAL_URL).then(resolve).catch(function () {
                        // Local bundle missing or blocked — try the public CDN.
                        loadScript(CDN_URL).then(resolve).catch(function () {
                            reject(new Error('فشل تحميل ماسح الباركود. تأكد من الاتصال بالإنترنت.'));
                        });
                    });
                });
                return libPromise;
            }

            /**
             * Map a DOMException / Error from getUserMedia or html5-qrcode
             * to an Arabic message the user can act on.
             */
            function arabicErrorMessage(err) {
                if (!err) return 'تعذر فتح ماسح الباركود.';
                var name = err.name || '';
                var msg = err.message || String(err);
                if (name === 'NotAllowedError' || /Permission denied|denied/i.test(msg)) {
                    return 'تعذر الوصول للكاميرا. يرجى التأكد من السماح للمتصفح باستخدام الكاميرا من الإعدادات.';
                }
                if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                    return 'لم يتم العثور على كاميرا في هذا الجهاز.';
                }
                if (name === 'NotReadableError' || name === 'AbortError') {
                    return 'الكاميرا قيد الاستخدام من تطبيق آخر. أغلق التطبيقات الأخرى ثم حاول مجدداً.';
                }
                if (name === 'SecurityError') {
                    return 'لا يمكن الوصول للكاميرا. يجب فتح الصفحة عبر اتصال آمن (HTTPS).';
                }
                if (msg && msg.indexOf('فشل تحميل') === 0) {
                    return msg;
                }
                if (msg === 'NOT_SUPPORTED' ||
                    !navigator.mediaDevices ||
                    !navigator.mediaDevices.getUserMedia) {
                    return 'هذا المتصفح لا يدعم الوصول للكاميرا. جرب متصفحاً آخر مثل Chrome أو Safari.';
                }
                return 'تعذر فتح الكاميرا: ' + msg;
            }

            function showError(text) {
                viewport.innerHTML =
                    '<div style="padding:18px 14px;color:#fff;text-align:center;line-height:1.7;font-family:Cairo,sans-serif;">' +
                    '<div style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">' + text + '</div>' +
                    '</div>';
            }

            function showLoading() {
                viewport.innerHTML =
                    '<div style="padding:24px 14px;color:#fff;text-align:center;font-family:Cairo,sans-serif;">' +
                    '<div style="font-size:0.92rem;">جارٍ تشغيل الكاميرا…</div>' +
                    '</div>';
            }

            /**
             * Explicitly request camera access so the browser permission
             * prompt fires deterministically and we get the specific
             * DOMException name on rejection. The probe stream is stopped
             * immediately so html5-qrcode can claim the device cleanly.
             */
            function probeCamera() {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    return Promise.reject(Object.assign(new Error('NOT_SUPPORTED'), {
                        name: 'SecurityError',
                    }));
                }
                return navigator.mediaDevices
                    .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
                    .then(function (stream) {
                        stream.getTracks().forEach(function (t) { t.stop(); });
                    });
            }

            function startScanner() {
                viewport.innerHTML = '<div id="brandzoScanCam" style="width:100%;"></div>';
                try {
                    html5QrInstance = new window.Html5Qrcode('brandzoScanCam');
                } catch (e) {
                    showError(arabicErrorMessage(e));
                    return;
                }
                html5QrInstance.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 250, height: 200 } },
                    function (decodedText) { handleResult(decodedText); },
                    function () { /* per-frame scan failures — ignore */ }
                ).catch(function (err) {
                    showError(arabicErrorMessage(err));
                });
            }

            function openModal(input) {
                targetInput = input;
                scanCompleted = false;
                showLoading();
                modal.classList.add('is-open');
                modal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
                loadLib()
                    .then(probeCamera)
                    .then(startScanner)
                    .catch(function (err) {
                        showError(arabicErrorMessage(err));
                    });
            }

            function teardownScanner() {
                if (!html5QrInstance) return Promise.resolve();
                var instance = html5QrInstance;
                html5QrInstance = null;
                try {
                    return instance.stop()
                        .catch(function () {})
                        .then(function () {
                            try { instance.clear(); } catch (e) { /* noop */ }
                        });
                } catch (e) {
                    return Promise.resolve();
                }
            }

            function closeModal() {
                teardownScanner().then(function() {
                    modal.classList.remove('is-open');
                    modal.setAttribute('aria-hidden', 'true');
                    viewport.innerHTML = '';
                    targetInput = null;
                    scanCompleted = false;
                    document.body.style.overflow = '';
                });
            }

            /**
             * Inject the decoded text into the input that triggered the
             * scanner, dispatch input + change events for any framework
             * listeners, then close the modal. Guarded by scanCompleted
             * so the multi-frame success callback can only act once.
             */
            function handleResult(value) {
                if (scanCompleted) return;
                scanCompleted = true;

                var input = targetInput; // capture before any teardown
                var clean = String(value == null ? '' : value).trim();

                // 1) Write the value FIRST while the DOM is guaranteed
                //    to still be alive. Use both the property setter and
                //    the attribute so any framework or print-mirror code
                //    that reads either path sees the new value.
                if (input) {
                    try { input.value = clean; } catch (e) { /* noop */ }
                    try { input.setAttribute('value', clean); } catch (e) { /* noop */ }
                    try {
                        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    } catch (e) { /* noop */ }
                    try {
                        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    } catch (e) { /* noop */ }
                }

                // 2) Visual confirmation so the user sees that the scan
                //    actually landed in the right cell.
                viewport.innerHTML =
                    '<div style="padding:32px 14px;color:#10b981;text-align:center;font-family:Cairo,sans-serif;">' +
                    '<div style="font-size:2.6rem;line-height:1;margin-bottom:10px;">✓</div>' +
                    '<div style="font-size:1rem;font-weight:700;margin-bottom:10px;color:#fff;">تم قراءة الباركود بنجاح</div>' +
                    '<div style="font-size:0.86rem;color:#fff;background:#0f172a;padding:8px 12px;border-radius:6px;font-family:monospace;direction:ltr;display:inline-block;max-width:100%;overflow-wrap:anywhere;">' +
                    (clean || '—') +
                    '</div></div>';

                // 3) أوقف الكاميرا أولاً ثم أغلق — بشكل متزامن وآمن
                teardownScanner().then(function() {
                    modal.classList.remove('is-open');
                    modal.setAttribute('aria-hidden', 'true');
                    viewport.innerHTML = '';
                    targetInput = null;
                    scanCompleted = false;
                    if (input) {
                        try { input.focus(); } catch (e) { /* noop */ }
                    }
                });
            }

            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
            });
            document.body.addEventListener('click', function (e) {
                var btn = e.target.closest && e.target.closest('.scan-btn');
                if (!btn) return;
                e.preventDefault();
                var wrap = btn.closest('.scan-cell-wrap');
                var input = wrap ? wrap.querySelector('input') : null;
                if (input) openModal(input);
            });
        })();
    </script>
"""

# Match the modal opening through the closing </script> of the inline
# scanner script. Tolerates whitespace differences between forms.
BLOCK_RE = re.compile(
    r"[ \t]*<!-- =+\n"
    r"[ \t]*BRANDZO BARCODE SCANNER.*?"
    r'<script id="brandzo-barcode-script">.*?</script>\n?',
    re.S,
)


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if 'id="brandzo-barcode-script"' not in text:
        return f"SKIP {path.name} (no scanner block to upgrade)"

    new_text, n = BLOCK_RE.subn(NEW_SCAN_BLOCK, text)
    if n == 0:
        return f"WARN {path.name} (regex did not match — manual review needed)"
    if n > 1:
        return f"WARN {path.name} (matched {n} blocks — expected 1)"

    path.write_text(new_text, encoding="utf-8")
    return f"PATCHED {path.name}"


def main() -> int:
    forms = sorted(FORMS_DIR.glob("form_*.html"))
    if not forms:
        print("No forms found")
        return 1
    for p in forms:
        print(patch(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
