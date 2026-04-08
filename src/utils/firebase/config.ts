// @ts-nocheck
// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBwqxzsY4_ueHSams1jDJCjxKhLEOYVrtU",
  authDomain: "algo-app-615ae.firebaseapp.com",
  projectId: "algo-app-615ae",
  storageBucket: "algo-app-615ae.firebasestorage.app",
  messagingSenderId: "759806420144",
  appId: "1:759806420144:web:a9aaeebe4b93bb48594775",
  measurementId: "G-VX9L36H2G5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
let messaging: Messaging | null = null;

// Only initialize messaging in browser context (not SSR)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Failed to initialize Firebase Messaging:', error);
  }
}

export { app, messaging };
export default firebaseConfig;
