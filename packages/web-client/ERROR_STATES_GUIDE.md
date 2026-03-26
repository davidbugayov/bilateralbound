# Error State Design System

Integrated error messaging that feels like part of the UI, not intrusive popups. Errors are now contextual, calm, and supportive—matching the therapeutic nature of the EMDR platform.

## Architecture

### Two Systems

#### 1. Viewer Error Bar (Passive Feedback)

Single persistent banner at bottom of screen. Use for connection issues, loading failures, or critical viewer-side errors.

**Location**: Fixed to bottom of viewport
**Style**: Warm orange gradient, smooth slide-up animation
**Dismiss**: Click × or auto-dismiss with action

**API**:

```javascript
// Show error with optional retry
globalThis.viewerErrorBar.show(
  "Connection Lost", // title
  "Reconnecting...", // message
  () => {
    // retryCallback (optional)
    // Retry logic
  },
);

// Hide
globalThis.viewerErrorBar.hide();

// Check if visible
if (globalThis.viewerErrorBar.isVisible()) {
  /* ... */
}
```

**HTML Structure** (already in viewer.html):

```html
<div id="errorBar" class="error-bar hidden">
  <div class="error-bar-icon">⚠️</div>
  <div class="error-bar-content">
    <div class="error-bar-title" id="errorBarTitle"></div>
    <div class="error-bar-message" id="errorBarMessage"></div>
  </div>
  <div class="error-bar-actions">
    <button class="error-bar-btn" id="errorBarRetry" style="display:none;">
      Retry
    </button>
    <button class="error-bar-btn error-bar-close" onclick="...">×</button>
  </div>
</div>
```

#### 2. Controller Error State Manager (Contextual Errors)

Multiple inline error cards positioned at bottom-left. Use for section-specific errors, validation failures, or actionable problems.

**Location**: Fixed to bottom-left, stacks vertically
**Style**: Orange-tinted cards with action buttons, smooth fade-in
**Dismiss**: Automatic or user-triggered

**API**:

```javascript
// Show error with actions
globalThis.errorStateManager.show("connection-failed", {
  title: "Viewer Connection Failed",
  message: "Unable to reach viewer. Check network connection.",
  actions: [
    {
      label: "Retry",
      callback: () => reestablishConnection(),
    },
  ],
  duration: 0, // 0 = persist, or milliseconds to auto-hide
});

// Hide specific error
globalThis.errorStateManager.hide("connection-failed");

// Clear all errors
globalThis.errorStateManager.clearAll();
```

## Design Principles

### Color Palette

- **Dark theme**: Warm orange gradient (`#d97706` → `#b45309`)
- **Light theme**: Softer orange tints (`#fb923c` primary)
- **Text**: Warm cream (`#fef3c7` dark), dusty orange (`#fed7aa`)

### Typography

- **Title**: 13px bold, slightly brighter color
- **Message**: 12px regular, slightly muted
- **Action text**: 11px bold, uppercase-ish

### Spacing & Layout

- **Padding**: 12px horizontal, 10px vertical (compact, integrated)
- **Gap**: 8px between elements
- **Border radius**: 10px (soft, not aggressive)
- **Border**: Thin, semi-transparent (`1px solid rgba(...)`)

### Animation

- **Entrance**: Smooth slide-up or fade-in (0.3s ease)
- **Exit**: Quick fade-out (0.2s ease)
- **No shake/vibration**: Therapeutic, calm motion

### Accessibility

- **Role**: `role="alert"` on error containers
- **Live region**: `aria-live="polite"` for screen readers
- **Keyboard**: All buttons accessible, Tab-navigable
- **Color contrast**: WCAG AA compliant (orange text on dark background)

## Usage Examples

### Viewer: Connection Error

```javascript
globalThis.viewerErrorBar.show(
  "Connection Lost",
  "Retrying connection...",
  () => {
    websocketClient.reconnect();
  },
);
```

### Controller: Viewer Not Connected

```javascript
globalThis.errorStateManager.show("viewer-offline", {
  title: "Viewer Not Connected",
  message: "Waiting for patient to join. Share the link to continue.",
  duration: 0, // Persist until manually dismissed
});
```

### Controller: Settings Update Failed

```javascript
globalThis.errorStateManager.show("settings-update-failed", {
  title: "Failed to Update Settings",
  message: "Unable to save ball color. Please try again.",
  actions: [
    {
      label: "Retry",
      callback: () => updateBallColor(selectedColor),
    },
  ],
  duration: 5000, // Auto-dismiss after 5 seconds
});
```

### Controller: Multiple Errors

```javascript
// Each error has unique ID, shown as separate cards
globalThis.errorStateManager.show("audio-init", {
  title: "Audio Failed",
  message: "Microphone not available.",
});

globalThis.errorStateManager.show("viewer-sync", {
  title: "Sync Lost",
  message: "Trying to resync with viewer...",
});

// Clear specific error
globalThis.errorStateManager.hide("audio-init");

// Or clear all at once
globalThis.errorStateManager.clearAll();
```

## CSS Classes

### Viewer Error Bar

- `.error-bar` — container
- `.error-bar.show` — visible state
- `.error-bar.hidden` — hidden (display: none)
- `.error-bar-title`, `.error-bar-message`, `.error-bar-actions` — content structure

### Controller Error Message

- `.error-message` — container
- `.error-message-title` — title with icon
- `.error-message-text` — body text
- `.error-message-actions` — button group
- `.error-message-btn` — action/dismiss button

### Control Sections (Optional)

- `.control-section.error-state` — tint section with error background
- `.controls-card.disabled-state` — dim/disable controls

## When to Use Each System

### Use Viewer Error Bar when:

- Connection lost/regained
- Session ended unexpectedly
- Critical playback failure
- User action needed immediately

### Use Controller Error State Manager when:

- Viewer not connected (status message)
- Settings update failed
- Preview sync issues
- Audio initialization failed
- File upload/save errors
- Validation errors on form input

### Keep Controller Disconnect Dialog unchanged:

- Connection status ("Controller connected" / "Waiting for controller")
- Session setup (still uses modal confirm if needed)

## Styling Customization

### Dark Theme (Default)

```css
.error-bar {
  background: linear-gradient(
    90deg,
    rgba(217, 119, 6, 0.95) 0%,
    rgba(180, 83, 9, 0.95) 100%
  );
  color: #fef3c7;
}

.error-message {
  background: linear-gradient(
    135deg,
    rgba(251, 146, 60, 0.15) 0%,
    rgba(180, 83, 9, 0.1) 100%
  );
  border: 1px solid rgb(251, 146, 60 / 25%);
  color: #fed7aa;
}
```

### Light Theme

```css
body.light-theme .error-bar {
  background: linear-gradient(
    90deg,
    rgba(251, 146, 60, 0.95) 0%,
    rgba(234, 88, 12, 0.95) 100%
  );
  color: #7c2d12;
}

body.light-theme .error-message {
  background: linear-gradient(
    135deg,
    rgba(251, 146, 60, 0.12) 0%,
    rgba(180, 83, 9, 0.08) 100%
  );
  color: #92400e;
}
```

## Integration Checklist

- [ ] Load `/js/ui/error-states.js` before bundle scripts
- [ ] Replace `showErrorNotification()` calls with new managers
- [ ] Update error handling in WebSocket client
- [ ] Test in both dark and light themes
- [ ] Verify mobile responsiveness
- [ ] Check keyboard navigation (Tab, Enter, Escape)
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)

## Deprecation Notice

`globalThis.notificationSystem` (toast notifications) is still available but should be phased out. New errors use the integrated error state system for better UX.
