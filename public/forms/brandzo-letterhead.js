/* ============================================================
   BRANDZO — Unified Letterhead Footer (Print / PDF)
   يُحقن مركزياً في كل النماذج. عدّل معلومات التواصل هنا مرة واحدة.
   غير تدميري: يستبدل محتوى .brand-footer فقط، ولا يمس منطق النموذج.
   ============================================================ */
(function () {
  // ── معلومات التواصل (نقطة تعديل واحدة لكل النماذج) ──
  var CONTACT = {
    phone:   '0912203770',
    website: 'www.brandzo.com',
    email:   'Info@brandzo.com',
    address: 'نادي الأهلي - بنغازي، ليبيا'
  };

  var ICON = {
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.4 21 3 13.6 3 4.5c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.4 0 .8-.3 1z"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.5a15 15 0 00-1.3-3.4A8 8 0 0118.9 8zM12 4c.8 1 1.5 2.4 1.9 4h-3.8c.4-1.6 1.1-3 1.9-4zM4.3 14a8 8 0 010-4h2.9a17 17 0 000 4H4.3zm.8 2h2.5c.3 1.2.8 2.4 1.3 3.4A8 8 0 015.1 16zm2.5-8H5.1a8 8 0 013.8-3.4A15 15 0 007.6 8zM12 20c-.8-1-1.5-2.4-1.9-4h3.8c-.4 1.6-1.1 3-1.9 4zm2.3-6H9.7a15 15 0 010-4h4.6a15 15 0 010 4zm.4 5.4c.5-1 1-2.2 1.3-3.4h2.5a8 8 0 01-3.8 3.4zM16.8 14a17 17 0 000-4h2.9a8 8 0 010 4h-2.9z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>'
  };

  function item(icon, text, href) {
    var inner = '<span class="bz-ci-icon">' + icon + '</span>';
    if (href) {
      inner += '<a class="bz-ci-text" dir="ltr" href="' + href + '">' + text + '</a>';
    } else {
      inner += '<span class="bz-ci-text">' + text + '</span>';
    }
    return '<div class="bz-contact-item">' + inner + '</div>';
  }

  function buildHTML() {
    return (
      '<div class="bz-contact-row">' +
        item(ICON.phone, CONTACT.phone, 'tel:' + CONTACT.phone.replace(/\s/g, '')) +
        item(ICON.globe, CONTACT.website, 'https://' + CONTACT.website) +
        item(ICON.mail, CONTACT.email, 'mailto:' + CONTACT.email) +
        item(ICON.pin, CONTACT.address, null) +
      '</div>' +
      '<div class="bz-footer-bars" aria-hidden="true">' +
        '<div class="bz-bar-dark"></div>' +
        '<div class="bz-bar-blocks"><span></span><span></span><span></span></div>' +
        '<div class="bz-bar-grad"></div>' +
      '</div>'
    );
  }

  function build() {
    var f = document.querySelector('.brand-footer');
    if (!f) {
      f = document.createElement('footer');
      f.className = 'brand-footer';
      document.body.appendChild(f);
    }
    f.classList.add('bz-contact-footer');
    f.innerHTML = buildHTML();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
