// ============================================================
// VIBETUBE - FIREBASE CONFIGURATION
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    sendPasswordResetEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    addDoc,
    onSnapshot,
    serverTimestamp,
    orderBy,
    increment,
    arrayUnion,
    arrayRemove,
    writeBatch,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// CONFIGURATION
// ============================================================

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAWfJv870D2SK8avO4PohFZfNl6VWzpgrk",
    authDomain: "vibetube-218de.firebaseapp.com",
    databaseURL: "https://vibetube-218de-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "vibetube-218de",
    storageBucket: "vibetube-218de.firebasestorage.app",
    messagingSenderId: "438992891226",
    appId: "1:438992891226:web:cd0dcee2f188bcdc3b1763",
    measurementId: "G-DVLZPPQS74"
};

// Cloudinary Config (Free Video Hosting)
export const CLOUDINARY = {
    cloudName: "qkphqu6f",
    uploadPreset: "ml_default",
    apiUrl: "https://api.cloudinary.com/v1_1"
};

// ImgBB Config (Free Image Hosting)
export const IMGBB = {
    apiKey: "b07d80d995554c6541209651619ddbba",
    apiUrl: "https://api.imgbb.com/1/upload"
};

// ============================================================
// INITIALIZE FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ============================================================
// EXPORT HELPER FUNCTIONS
// ============================================================

// Upload to Cloudinary (for videos)
export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY.uploadPreset);
    
    const response = await fetch(`${CLOUDINARY.apiUrl}/${CLOUDINARY.cloudName}/upload`, {
        method: "POST",
        body: formData
    });
    
    const data = await response.json();
    if (!data.secure_url) {
        throw new Error("Cloudinary upload failed: " + JSON.stringify(data));
    }
    return data.secure_url;
}

// Upload to ImgBB (for images)
export async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append("image", file);
    
    const response = await fetch(`${IMGBB.apiUrl}?key=${IMGBB.apiKey}`, {
        method: "POST",
        body: formData
    });
    
    const data = await response.json();
    if (!data.success) {
        throw new Error("ImgBB upload failed: " + JSON.stringify(data));
    }
    return data.data.url;
}

// Universal upload function
export async function uploadMedia(file) {
    if (file.type.startsWith("image/")) {
        return await uploadToImgBB(file);
    } else if (file.type.startsWith("video/")) {
        return await uploadToCloudinary(file);
    } else {
        throw new Error("Unsupported file type");
    }
}

// ============================================================
// EXPORT AUTH FUNCTIONS
// ============================================================

export const authFunctions = {
    login: signInWithEmailAndPassword,
    signup: createUserWithEmailAndPassword,
    logout: signOut,
    resetPassword: sendPasswordResetEmail,
    updatePassword: updatePassword,
    reauthenticate: reauthenticateWithCredential,
    deleteUser: deleteUser,
    EmailAuthProvider: EmailAuthProvider,
    setPersistence: setPersistence,
    browserLocalPersistence: browserLocalPersistence,
    browserSessionPersistence: browserSessionPersistence,
    onAuthStateChanged: onAuthStateChanged
};

// ============================================================
// EXPORT FIRESTORE FUNCTIONS
// ============================================================

export const firestore = {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    addDoc,
    onSnapshot,
    serverTimestamp,
    orderBy,
    increment,
    arrayUnion,
    arrayRemove,
    writeBatch,
    getCountFromServer
};

console.log("🔥 Firebase initialized successfully!");
console.log("📸 ImgBB API Key:", IMGBB.apiKey ? "✅ Configured" : "❌ Missing");
console.log("☁️ Cloudinary configured:", CLOUDINARY.cloudName);