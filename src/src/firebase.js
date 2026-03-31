import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBwCfrF43DbT6QtGxXnLcztRvjOGEOdwQ",
  authDomain: "hogar-silvia-xavi.firebaseapp.com",
  projectId: "hogar-silvia-xavi",
  storageBucket: "hogar-silvia-xavi.firebasestorage.app",
  messagingSenderId: "106159407079",
  appId: "1:106159407079:web:522246ca29a845ea1f0742"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
