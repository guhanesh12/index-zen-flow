// @ts-nocheck
// Firebase Configuration — project indexpilotai-e1106
import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBUt38Mx2WR-EfEU1wLfFEjNygNMay8eYo",
  authDomain: "indexpilotai-e1106.firebaseapp.com",
  projectId: "indexpilotai-e1106",
  storageBucket: "indexpilotai-e1106.firebasestorage.app",
  messagingSenderId: "167770668435",
  appId: "1:167770668435:web:ec781a95603f5b24bbbc66",
  measurementId: "G-6BTDWSVFPQ",
};

export const WEB_PUSH_VAPID_KEY = "BAMIKImrcshfd4Qv_QUkWl2mv3MZczdqMnTnXAnLku9ax9Ri9T3yovmSkdAQDBnigJsF5KoBpcc8FQIcA8TsqIA2";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let messaging: Messaging | null = null;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Failed to initialize Firebase Messaging:", error);
  }
}

export async function getFirebaseMessagingRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;

  try {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
    });
  } catch (error) {
    console.error("Failed to register Firebase Messaging service worker:", error);
    return undefined;
  }
}

export { app, messaging };
export default firebaseConfig;
