/* rescogitans-puente.js — Conecta los archivos de la marca Res Cogitans con Desafíate.
 *
 * 22-terminos.js y 21-bienvenida.js se escribieron para Presentaciones Interactivas y usan:
 *   window.fbAuth  (firebase.auth())        window.fbDB  (firebase.firestore())
 *   AIP.onAuth(cb) -> función para dejar de escuchar
 *   AIP.signOut()  AIP.esAdmin() -> true si el usuario actual es el administrador
 * Aquí se crean a partir de la conexión que ya abre 00-firebase.js (window.QS).
 * Cargarlo DESPUÉS de 00-firebase.js.
 */
(function () {
  // UID del administrador en el proyecto de Firebase de Desafíate (quizspark-77f33).
  // No es el mismo de Presentaciones Interactivas (otro proyecto de Firebase).
  // Si se deja vacío, el administrador se reconoce igual por su rol en Firestore
  // (users/{uid}.role === "admin"), que es como Desafíate ya lo distingue.
  var ADMIN_UIDS = [];

  var QS = window.QS || {};
  if (!window.firebase && !QS.auth) { console.warn('Res Cogitans: Firebase no está cargado; los términos no funcionarán.'); return; }
  if (!window.fbAuth) window.fbAuth = QS.auth || firebase.auth();
  if (!window.fbDB) window.fbDB = QS.db || firebase.firestore();

  var A = window.AIP = window.AIP || {};
  if (!A.onAuth) A.onAuth = function (cb) { return window.fbAuth.onAuthStateChanged(cb); };
  if (!A.signOut) A.signOut = function () { return window.fbAuth.signOut(); };
  if (!A.esAdmin) A.esAdmin = function () {
    var u = window.fbAuth.currentUser;
    if (!u) return false;
    if (ADMIN_UIDS.indexOf(u.uid) >= 0) return true;
    var datos = window.QS && window.QS.currentUserData;
    return !!datos && datos.role === 'admin';
  };
})();
