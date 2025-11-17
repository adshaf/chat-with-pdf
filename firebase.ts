import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";;
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDzK8CJRKr2UJ1fl-1bd_jOVIN6mLgdRtE",
  authDomain: "chat-with-pdf-3ce9d.firebaseapp.com",
  projectId: "chat-with-pdf-3ce9d",
  storageBucket: "chat-with-pdf-3ce9d.firebasestorage.app",
  messagingSenderId: "794112113386",
  appId: "1:794112113386:web:b112ac3f777b1c0e773593"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };