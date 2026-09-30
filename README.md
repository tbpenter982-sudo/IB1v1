# IB Race — Firebase multiplayer trial

A GitHub Pages-ready 1v1 IB practice race for Math AA HL and Physics HL.

## Files to upload to GitHub

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firebase-rules.json` (reference file; its contents go into Firebase Console)

## No Terminal is required

### 1. Create a Firebase project

1. Go to https://console.firebase.google.com/
2. Click **Create a project**.
3. Open the project and choose **Build → Realtime Database**.
4. Click **Create database**.
5. Pick a region and create it.

### 2. Add a Web app

1. In **Project settings**, under **Your apps**, click the Web `</>` icon.
2. Register the app. You do not need Firebase Hosting.
3. Firebase will show a `firebaseConfig` object.

### 3. Configure `firebase-config.js` on GitHub

Open `firebase-config.js` in your GitHub repository, click the pencil/edit button, and replace the placeholder values with the values Firebase gives you.

Make sure the config includes `databaseURL`. You can copy the Realtime Database URL from the Realtime Database page if Firebase's generated config does not show it.

Do not paste a service-account key or private server credentials.

### 4. Add the Realtime Database rules

Open `firebase-rules.json` from this project and copy its contents.

In Firebase Console go to:

**Build → Realtime Database → Rules**

Replace the existing rules with the contents of `firebase-rules.json`, then click **Publish**.

These rules are intentionally simple for a trial build. A production public app should use Authentication and stricter per-player permissions.

### 5. Publish with GitHub Pages

In GitHub:

**Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save**

Your app will be available at:

`https://YOURUSERNAME.github.io/REPOSITORY-NAME/`

## Test a race

1. Open the site on device/browser A and click **Create a race**.
2. Copy the six-character room code.
3. Open the same site on device/browser B and click **Join with code**.
4. Enter the code.
5. The host clicks **Start race**.

Both players should see the same questions and live scores.
