# 🎙️ Meeting Assistant Component

A fully-functional React-based AI Meeting Assistant component with speech recognition, smart summarization, translation, and PDF export capabilities.

## Features

✅ **Speech Recognition** - Real-time Arabic/English voice recording with Web Speech API
✅ **Smart Summarization** - AI-powered extraction of key points, decisions, and action items
✅ **Multi-language Support** - Full RTL support for Arabic, UI language toggle
✅ **Translation** - Automatic translation between Arabic and English using MyMemory API
✅ **PDF Export** - Professional meeting minutes export with formatted layout
✅ **Waveform Visualization** - Live animated waveform during recording
✅ **Keyboard Shortcuts** - Ctrl+S (summarize), Ctrl+P (PDF), Ctrl+T (translate), Ctrl+Shift+R (record)
✅ **Toast Notifications** - User feedback for all actions
✅ **Copy to Clipboard** - Quick transcript and translation copying

## Component Structure

```
src/components/brandzo-erp/MeetingAssistant/
├── MeetingAssistant.jsx          # Main React component (600+ lines)
└── MeetingAssistant.module.css   # Animation styles (keyframes)

src/pages/dashboard/
└── meeting-assistant.astro       # Page integration
```

## Installation & Setup

### 1. Install Dependency

The `html2pdf.js` library is already installed:
```bash
npm install html2pdf.js
```

### 2. Access the Component

Navigate to the Meeting Assistant page:
```
http://localhost:3000/dashboard/meeting-assistant
```

Or import directly in components:
```jsx
import MeetingAssistant from '../../components/brandzo-erp/MeetingAssistant/MeetingAssistant';

export default function SomePage() {
  return <MeetingAssistant client:load />;
}
```

## How It Works

### Recording
- Click the microphone button to start recording
- Browser will request microphone permission
- Supports pause/resume functionality
- Automatically segments by speaker

### Summarization
- Extracts key points using keyword matching
- Identifies decisions and action items
- Works with both Arabic and English text

### Translation
- Uses MyMemory API (free tier)
- Translates up to 500 characters
- Fallback message if service unavailable

### PDF Export
- Generates professional meeting minutes
- Includes transcript, summary, and translation
- Formatted with Arabic/English layout support

## Styling Approach

### Tailwind CSS Only
- All layout and colors use Tailwind utility classes
- No global CSS pollution
- Fully scoped within component
- Responsive design (mobile-first)

### CSS Module for Animations
- Complex keyframe animations isolated in `MeetingAssistant.module.css`
- Pulse effects for recording indicator
- Ring expansion animations
- Blink animations for status dots

## API Integration

### Speech Recognition API
- Native browser Web Speech API (Chrome, Edge)
- Fallback warning for unsupported browsers
- Continuous mode with interim results

### Translation API
```
Endpoint: https://api.mymemory.translated.net/get
Method: GET
Params: q={text}, langpair=ar|en
```

### PDF Generation
```
Library: html2pdf.js
Format: A4 portrait
Options: JPEG quality 0.95, scale 2
```

## i18n Implementation

All UI text uses `i18n` object with Arabic (ar) and English (en) support:
```jsx
const t = (key) => i18n[lang]?.[key] || i18n.ar[key] || key;
```

## Component Props

The component is **self-contained** and requires no props:
```jsx
<MeetingAssistant />
```

## State Management

All state is managed with React Hooks:
- `useState` - UI state and content
- `useEffect` - Lifecycle and listeners
- `useRef` - Non-rendering refs for Speech API and timers

## Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Edge
- ✅ Safari (with limitations)
- ❌ Firefox (no Speech Recognition)

## Performance Considerations

- Waveform animation runs only during recording (140ms intervals)
- Toast notifications auto-dismiss (2.8s)
- Speech recognition continuously restarts on disconnect
- Large transcripts are handled efficiently with segments array

## Accessibility

- Semantic HTML in JSX
- Keyboard shortcuts for power users
- ARIA-friendly button labels
- Color contrast complies with WCAG standards
- RTL/LTR support for screen readers

## Safety & Isolation

✅ **No Breaking Changes**
- Standalone component with zero side effects
- No global state modifications
- No routing changes
- No DOM pollution outside component
- CSS Modules prevent style conflicts

## Debugging

Enable console logs:
```javascript
// In browser console during active session
console.log('🚀 مساعد الاجتماعات الذكي — AI Meeting Assistant')
console.log('⌨️ Ctrl+S=Summarize | Ctrl+P=PDF | Ctrl+T=Translate')
```

## Known Limitations

1. **Translation API Rate Limit** - Free tier limited to 500 char/request
2. **Speech Recognition** - Requires HTTPS in production
3. **PDF Export** - Large transcripts may create multi-page PDFs
4. **Mobile Recording** - Some Android browsers don't support Web Speech API

## Future Enhancements

- [ ] Local storage for transcript persistence
- [ ] Speaker identification with names
- [ ] Custom summary templates
- [ ] Audio waveform visualization
- [ ] Agenda-based meeting structure
- [ ] Export to multiple formats (DOCX, TXT)
- [ ] Real-time collaboration support

## Troubleshooting

### "Microphone access denied"
- Check browser permissions
- Ensure HTTPS in production
- Try incognito/private mode

### "Translation service unavailable"
- Check internet connection
- Try again later (API rate limit)
- Fallback message will display

### "Speech Recognition not supported"
- Use Chrome or Edge browser
- Update to latest version
- Warning banner will display

## License

Part of the Brandzo Warehouse Management System
All rights reserved © 2026
