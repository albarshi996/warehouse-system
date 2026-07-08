'use client';

import React, { useState } from 'react';
import { addTask } from './taskService';

const DEPARTMENTS = [
  'الاستلام والرقابة',
  'فحص الجودة (QC)',
  'التخزين الموجه',
  'تحضير الطلبات',
  'الشحن والتوزيع',
  'المرتجعات والتسويات',
  'إدارة المخزون',
  'الصيانة والسلامة',
];

const TAGS_LIST = [
  'جرد دوري',
  'استلام GRN',
  'فحص جودة',
  'صيانة',
  'تدريب',
  'طوارئ 🚨',
  'HACCP',
  'تقرير',
];

/**
 * TaskForm Component
 * Handles task creation with all required fields
 */
export default function TaskForm({ onTaskAdded, onShowToast }) {
  // Core fields
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]); // Today
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState('low'); // low, med, high
  const [tags, setTags] = useState(new Set());
  const [customTag, setCustomTag] = useState('');
  const [description, setDescription] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Toggle tag selection
  const toggleTag = (tag) => {
    const newTags = new Set(tags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setTags(newTags);
  };

  // Add step to checklist
  const addStep = () => {
    if (checklistInput.trim()) {
      setChecklist([...checklist, { text: checklistInput.trim(), done: false }]);
      setChecklistInput('');
    }
  };

  // Remove step from checklist
  const removeStep = (index) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  // Toggle step completion
  const toggleStep = (index) => {
    const newChecklist = [...checklist];
    newChecklist[index].done = !newChecklist[index].done;
    setChecklist(newChecklist);
  };

  // Format phone: strip spaces, remove leading 0
  const formatPhone = (phoneStr) => {
    return phoneStr.replace(/\s+/g, '').replace(/^0+/, '');
  };

  // Validate email
  const isValidEmail = (emailStr) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
  };

  // Save task
  const handleSaveTask = () => {
    // Validation: title is required
    if (!title.trim()) {
      onShowToast('❌ الرجاء إدخال عنوان المهمة', true);
      return;
    }

    // Build tag array including custom tag
    const allTags = Array.from(tags);
    if (customTag.trim() && tags.has('أخرى')) {
      allTags.push(customTag.trim());
    }

    // Build task object (no timestamps, service will add them)
    const taskData = {
      title: title.trim(),
      dept,
      owner: owner.trim(),
      dueDate,
      dueTime,
      priority,
      tags: allTags,
      customTag: customTag.trim(),
      description: description.trim(),
      checklist,
      phone,
      email: email.trim(),
    };

    try {
      const savedTask = addTask(taskData);
      onShowToast('✅ تم حفظ المهمة بنجاح', false);
      
      // Reset form
      setTitle('');
      setDept('');
      setOwner('');
      setDueDate(new Date().toISOString().split('T')[0]);
      setDueTime('09:00');
      setPriority('low');
      setTags(new Set());
      setCustomTag('');
      setDescription('');
      setChecklist([]);
      setChecklistInput('');
      setPhone('');
      setEmail('');

      // Notify parent
      onTaskAdded?.(savedTask);
    } catch (err) {
      onShowToast('❌ حدث خطأ أثناء حفظ المهمة', true);
    }
  };

  // Send WhatsApp
  const handleSendWhatsApp = () => {
    if (!phone.trim()) {
      onShowToast('❌ الرجاء إدخال رقم WhatsApp', true);
      return;
    }

    const prioMap = { high: 'عاجل', med: 'متوسط', low: 'عادي' };
    const formattedPhone = formatPhone(phone);
    const stepsText =
      checklist.length > 0
        ? '\n\nخطوات التنفيذ:\n\n' + checklist.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
        : '';

    const message =
      `🏭 *Brandzo Hub — مهمة تشغيلية*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *${title}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🚨 *الأولوية:* ${prioMap[priority]}\n` +
      `🏢 *القسم:* ${dept || '—'}\n` +
      `👤 *المسؤول:* ${owner || '—'}\n` +
      `📅 *الاستحقاق:* ${dueDate}${dueTime ? ' — ' + dueTime : ''}\n` +
      `🏷️ *التصنيف:* ${Array.from(tags).join(' · ') || '—'}\n` +
      (description ? `\n📝 *التفاصيل:*\n${description}` : '') +
      stepsText +
      `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
      `*Brandzo Franchise Partners — COMMAND CENTER*`;

    const encodedMessage = encodeURIComponent(message);
    const waLink = `https://wa.me/218${formattedPhone}?text=${encodedMessage}`;

    window.open(waLink, '_blank');
    onShowToast('✅ تم فتح واتساب بنجاح', false);
  };

  // Send Email
  const handleSendEmail = () => {
    if (!email.trim()) {
      onShowToast('❌ الرجاء إدخال عنوان البريد الإلكتروني', true);
      return;
    }

    if (!isValidEmail(email.trim())) {
      onShowToast('❌ عنوان البريد الإلكتروني غير صحيح', true);
      return;
    }

    const prioMap = { high: 'عاجل', med: 'متوسط', low: 'عادي' };
    const stepsText =
      checklist.length > 0
        ? '\n\nخطوات التنفيذ:\n' + checklist.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
        : '';

    const subject = encodeURIComponent(`[Brandzo Task] ${title} — ${prioMap[priority]}`);
    const body = encodeURIComponent(
      `Brandzo Hub 2026 — مهمة تشغيلية\n` +
      `${'═'.repeat(40)}\n` +
      `العنوان: ${title}\n` +
      `الأولوية: ${prioMap[priority]}\n` +
      `القسم: ${dept || '—'}\n` +
      `المسؤول: ${owner || '—'}\n` +
      `الاستحقاق: ${dueDate}${dueTime ? ' — ' + dueTime : ''}\n` +
      `التصنيف: ${Array.from(tags).join(' · ') || '—'}\n` +
      (description ? `\nالتفاصيل:\n${description}` : '') +
      stepsText +
      `\n\n${'═'.repeat(40)}\n` +
      `Brandzo Franchise Partners — COMMAND CENTER`
    );

    const mailtoLink = `mailto:${email.trim()}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
    onShowToast('📧 تم فتح البريد الإلكتروني', false);
  };

  return (
    <div className="glass-card p-6 space-y-6">
      <h2 className="text-2xl font-bold text-white" style={{ color: 'var(--color-brand-yellow)' }}>
        📋 إنشاء مهمة جديدة
      </h2>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          عنوان المهمة <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ادخل عنوان المهمة..."
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          style={{
            '--color-brand-yellow': 'var(--color-brand-yellow)',
          }}
        />
      </div>

      {/* Department */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">القسم</label>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
        >
          <option value="">-- اختر القسم --</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Owner */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">المسؤول</label>
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="اسم الموظف..."
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
        />
      </div>

      {/* Due Date & Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">تاريخ الاستحقاق</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">الوقت</label>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          />
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-white mb-3">الأولوية</label>
        <div className="flex gap-3">
          <button
            onClick={() => setPriority('low')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all ${
              priority === 'low'
                ? 'bg-blue-600/40 border-2 border-blue-400 text-blue-300 shadow-lg shadow-blue-500/30'
                : 'bg-white/5 border border-white/10 text-gray-100 hover:border-blue-400/50'
            }`}
          >
            عادي
          </button>
          <button
            onClick={() => setPriority('med')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all ${
              priority === 'med'
                ? 'bg-amber-600/40 border-2 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/30'
                : 'bg-white/5 border border-white/10 text-gray-100 hover:border-amber-400/50'
            }`}
          >
            متوسط
          </button>
          <button
            onClick={() => setPriority('high')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all ${
              priority === 'high'
                ? 'bg-brand-red/40 border-2 border-brand-red text-red-300 shadow-lg shadow-brand-red/30'
                : 'bg-white/5 border border-white/10 text-gray-100 hover:border-brand-red/50'
            }`}
            style={{
              '--color-brand-red': 'var(--color-brand-red)',
            }}
          >
            عاجل
          </button>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-white mb-3">التصنيفات</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {TAGS_LIST.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                tags.has(tag)
                  ? 'bg-brand-yellow text-brand-navy'
                  : 'bg-white/5 border border-white/10 text-gray-100 hover:border-brand-yellow/50'
              }`}
              style={{
                '--color-brand-yellow': 'var(--color-brand-yellow)',
                '--color-brand-navy': 'var(--color-brand-navy)',
              }}
            >
              {tag}
            </button>
          ))}
          <button
            onClick={() => toggleTag('أخرى')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
              tags.has('أخرى')
                ? 'bg-brand-yellow text-brand-navy'
                : 'bg-white/5 border border-white/10 text-gray-100 hover:border-brand-yellow/50'
            }`}
          >
            أخرى
          </button>
        </div>

        {/* Custom Tag Input */}
        {tags.has('أخرى') && (
          <input
            type="text"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="اكتب تصنيف مخصص..."
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          />
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">التفاصيل</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="اكتب تفاصيل المهمة..."
          rows={4}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow resize-none"
        />
      </div>

      {/* Checklist */}
      <div>
        <label className="block text-sm font-medium text-white mb-3">قائمة التحقق</label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={checklistInput}
            onChange={(e) => setChecklistInput(e.target.value)}
            placeholder="أضف خطوة..."
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
            onKeyPress={(e) => e.key === 'Enter' && addStep()}
          />
          <button
            onClick={addStep}
            className="px-4 py-2 bg-brand-yellow hover:bg-brand-yellow/80 text-brand-navy rounded-lg font-bold transition-colors"
            style={{
              backgroundColor: 'var(--color-brand-yellow)',
              color: 'var(--color-brand-navy)',
            }}
          >
            إضافة
          </button>
        </div>
        <div className="space-y-2">
          {checklist.map((step, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 rounded-lg">
              <input
                type="checkbox"
                checked={step.done}
                onChange={() => toggleStep(idx)}
                className="w-5 h-5 cursor-pointer"
              />
              <span className={step.done ? 'line-through text-gray-200' : 'text-white flex-1'}>
                {step.text}
              </span>
              <button
                onClick={() => removeStep(idx)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp Phone */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">رقم WhatsApp</label>
        <div className="flex gap-2">
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-bold flex items-center">
            +218
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="9XXXXXXXX (بدون الصفر الأول)"
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">📧 البريد الإلكتروني</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@mail.com"
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
        />
      </div>

      {/* Action Buttons */}
      <div className="pt-4 space-y-3">
        {/* Save Button */}
        <button
          onClick={handleSaveTask}
          className="w-full py-3 px-4 bg-gradient-to-r from-brand-red to-brand-red-dark hover:from-brand-red-dark hover:to-brand-red text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-xl"
          style={{
            backgroundImage: `linear-gradient(to right, var(--color-brand-red), var(--color-brand-red-dark))`,
            '--color-brand-red': 'var(--color-brand-red)',
            '--color-brand-red-dark': 'var(--color-brand-red-dark)',
          }}
        >
          💾 حفظ المهمة
        </button>

        {/* WhatsApp Send Button */}
        <button
          onClick={handleSendWhatsApp}
          className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-5.031 1.378c-1.536.946-2.504 2.404-2.652 4.04C3.85 15.978 5.487 19.129 8.113 20.5c-.042.571-.213 1.121-.413 1.706a50.881 50.881 0 01-1.232-9.694zm7.08.387c1.711.213 3.226 1.171 4.103 2.691.559 1.03.89 2.17.89 3.465 0 1.457-.328 2.839-.95 4.07-.321.614-.753 1.189-1.277 1.682.594-.118 1.168-.308 1.704-.568 2.626-1.387 4.313-4.309 4.313-7.644 0-3.334-1.687-6.257-4.313-7.644-1.906-1.006-4.18-1.006-6.126 0z" />
          </svg>
          <span>إرسال واتساب</span>
        </button>

        {/* Email Send Button */}
        <button
          onClick={handleSendEmail}
          className="w-full py-3 px-4 bg-white/5 border-2 border-brand-yellow hover:bg-white/10 text-brand-yellow rounded-lg font-bold transition-all"
          style={{
            borderColor: 'var(--color-brand-yellow)',
            color: 'var(--color-brand-yellow)',
          }}
        >
          📧 إرسال بريد إلكتروني
        </button>
      </div>
    </div>
  );
}
