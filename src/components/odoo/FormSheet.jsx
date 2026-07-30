import StatusBar from './StatusBar.jsx';
import StatBox from './StatBox.jsx';

/**
 * FormSheet — ورقة النموذج البيضاء فوق خلفية رمادية (D2 · النمط ٢).
 * بطاقة بعرض أقصى 1140px تطفو فوق خلفية الورقة (--o-sheet-background): شريط مراحل، أزرار إحصاء،
 * ثمّ جسم الحقول (children)، وتحتها منطقة محادثة اختيارية.
 *
 * props:
 *   statusBar: { buttons, stages, current }   // اختياري
 *   stats:     [{ value, text, onClick? }]     // اختياري
 *   chatter:   عقدة React                       // اختياري (تُعرَض أسفل الورقة)
 *   children:  جسم النموذج (عنوان + مجموعات + دفتر)
 */
export default function FormSheet({ statusBar = null, stats = null, chatter = null, children }) {
  return (
    <div className="o_form_view">
      <div className="o_form_sheet">
        {statusBar && <StatusBar {...statusBar} />}
        {stats && stats.length > 0 && <StatBox stats={stats} />}
        <div className="o_form_body">{children}</div>
      </div>
      {chatter}
    </div>
  );
}
