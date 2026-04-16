

# Plan: Convert IndexpilotAI to Native Android App using Capacitor

## Summary
Wrap your existing React trading platform into a native Android APK using Capacitor. This reuses 100% of your current code — no rewriting needed.

## What Lovable Will Do (Low Credit)

### Step 1: Install Capacitor Dependencies
Add `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android` to your project.

### Step 2: Initialize Capacitor Config
Create `capacitor.config.ts` with:
- **App ID**: `app.lovable.53074c3b4efc45559d5055b7d0bc2930`
- **App Name**: `IndexpilotAI`
- **Web Dir**: `dist` (Vite build output)
- **Live reload** pointing to your preview URL for development

### Step 3: Update Vite Config
Ensure the build output is compatible with Capacitor's webview (base path set to `./` for local file loading).

---

## What You Need to Do on Your Computer

After Lovable sets up the config, you will need to:

1. **Export to GitHub** → Click "Export to GitHub" button in Lovable
2. **Clone the repo** → `git clone <your-repo-url>`
3. **Install dependencies** → `npm install`
4. **Add Android platform** → `npx cap add android`
5. **Build the web app** → `npm run build`
6. **Sync to Android** → `npx cap sync android`
7. **Open in Android Studio** → `npx cap open android`
8. **Build APK** → In Android Studio: Build → Build Bundle/APK → Build APK

**Requirements on your computer:**
- Android Studio installed
- Java JDK 17+
- Android SDK

## What You Get
- A real `.apk` file you can install on any Android phone
- Can publish to Google Play Store
- All your existing features work: trading engine, signals, orders, settings
- Push notifications via Firebase (already configured in your project)

## Technical Details
- Only 3 files created/modified in Lovable: `capacitor.config.ts`, `package.json`, `vite.config.ts`
- Very low credit usage — minimal changes needed

