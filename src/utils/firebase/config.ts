// @ts-nocheck
// Firebase Configuration — project indexpilotai-e1106
import { initializeApp } from "firebase/app";
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

const app = initializeApp(firebaseConfig);

let messaging: Messaging | null = null;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Failed to initialize Firebase Messaging:", error);
  }
}

export { app, messaging };
export default firebaseConfig;
