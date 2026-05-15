# Absolute Best of the Best: Spatial Handoff & Widget UX

## 1. Bulletproof Lifecycle Hooks (Main Process)
Currently, we only listen to the `minimize` event. But users interact with windows in multiple ways:
- **Cmd+H (Hide)**
- **Cmd+W (Close Window)**
- **Cmd+M / Click Minimize (Minimize)**

**Solution:** In `electron/main.ts`, we must bind the handoff logic to `minimize`, `hide`, AND we should intercept `close` to just hide the window (unless quitting). This ensures *any* action that dismisses the main app spawns the widget perfectly.

## 2. Refined Widget "Maximize" (Renderer)
Right now, clicking anywhere on the `SovereignOrb` or the background of the `MiniWidget` restores the main app. This is error-prone. If you are taking a quick note in the widget, a misclick throws you into the heavy main app.

**Solution:**
- The widget should only expand/collapse based on intention (e.g., hovering or clicking the orb).
- Add a dedicated, beautiful **"Open Sovereign" (Expand) icon** in the top right of the `MiniWidget`. Clicking *that* specific button restores the main app.
- This creates a deliberate boundary: the widget is for ambient tasks, the main app is for deep work.

## 3. Re-Opening "Only" the Widget
If the main app is completely closed or minimized, and you want to summon *just* the widget to take a quick note:
**Solution:**
- Enhance the global shortcut (`Cmd/Ctrl+Shift+W`) to be a true "Sovereign Summon".
- If the main app is open, it hides the main app and spawns the widget in `expanded` mode right next to your mouse or in the corner.
- If the widget is already open, it focuses it.

