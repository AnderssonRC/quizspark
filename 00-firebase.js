/* global firebase */
// ============================================================
// QuizSpark — Configuración de Firebase
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCM2hI2VLcjWClUEWbYqGGFFDiaPhNufmA",
  authDomain: "quizspark-77f33.firebaseapp.com",
  projectId: "quizspark-77f33",
  storageBucket: "quizspark-77f33.firebasestorage.app",
  messagingSenderId: "314033688734",
  appId: "1:314033688734:web:19a7a3f53ca5c98e676b8f"
};

// Inicializar Firebase (compat global, funciona con scripts UMD)
firebase.initializeApp(firebaseConfig);

// Exponer servicios como globales para que el resto de archivos los usen
const auth = firebase.auth();
const db = firebase.firestore();

// Helpers globales para todo el proyecto
window.QS = window.QS || {};
window.QS.auth = auth;
window.QS.db = db;
window.QS.firebase = firebase;

// Estado de sesión global
window.QS.currentUser = null;
window.QS.currentUserData = null;
