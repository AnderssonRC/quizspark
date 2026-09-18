# Notas de seguridad — Desafíate (QuizSpark)

Este documento registra hallazgos de la auditoría de seguridad realizada en
2026-09 sobre las reglas de Firestore y el flujo cliente-servidor. Se
mantiene actualizado a mano; si cambian las reglas de Firestore o el flujo
de examen/sala en vivo, revisar si estas notas siguen vigentes.

**Estado:** riesgos documentados y **aceptados conscientemente** por el
dueño del proyecto (no se corrigen por ahora). Revisar si el uso de la app
crece más allá de un salón de clase controlado por un docente de confianza.

---

## 1. Las respuestas correctas viajan al navegador del estudiante

**Dónde:** `08-online.js`, carga del quiz por `publishCode` (`db.collection("quizzes").where("publishCode","==",examCode)`)
y `gradeSubmission()`. Reglas de Firestore: `match /quizzes/{quizId} { allow read: if true; }`.

**Qué pasa:** el documento completo del quiz —incluidas las opciones
marcadas `correct: true`— se descarga al navegador del estudiante en cuanto
abre el link del examen, antes de responder. Cualquiera con el panel de
Red/Consola del navegador (F12) puede leer las respuestas correctas.

**Por qué no se corrige ahora:** requiere mover la calificación a un backend
de confianza (Cloud Function) o rediseñar el modelo de datos para no enviar
`correct` al cliente hasta después de calificar — cambio estructural, no
una corrección quirúrgica.

**Riesgo aceptado porque:** el examen se aplica en un salón controlado por
el docente; el impacto real depende de que un estudiante sepa usar las
herramientas de desarrollador del navegador durante la evaluación.

**Mitigación futura recomendada:** Cloud Function `submitExam(quizId, answers)`
que lea el quiz server-side, califique y escriba el resultado, sin que el
cliente reciba nunca las respuestas correctas ni pueda enviar una nota
propia.

---

## 2. La calificación se calcula en el cliente y se guarda sin validar

**Dónde:** `08-online.js` (`handleSubmit`), `10-workshop.js`,
`13c-omr-results.js`. Reglas de Firestore: `match /results/{resultId} { allow create: if true; }`.

**Qué pasa:** el navegador calcula `score`, `correct`, `pointsEarned`, etc.
y los envía como datos de confianza a `results`. La regla de Firestore
permite crear documentos en `results` sin autenticarse y sin validar que
los campos sean coherentes (rango de nota, que `quizId` exista, etc.).

**Impacto:** un estudiante (o cualquiera con el `quizId`, que es público —
ver hallazgo 1) podría escribir directamente en Firestore un resultado con
una nota inventada, sin pasar por la interfaz del examen.

**Por qué no se corrige ahora:** decisión explícita del dueño del proyecto
de no tocar las reglas de Firestore por el momento.

**Mitigación futura recomendada (sin tocar `liveSessions`, que queda fuera
de esta nota):**
```
match /results/{resultId} {
  allow create: if true
    && request.resource.data.quizId is string
    && request.resource.data.score is number
    && request.resource.data.score >= 0 && request.resource.data.score <= 5;
  allow read: if request.auth != null;
  allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
}
```
Esto acota el daño (rango de nota válido) pero no elimina la posibilidad de
notas falsas mientras la calificación siga siendo responsabilidad del
cliente — ver hallazgo 1.

---

## 3. Un docente puede autoaprobarse o autoasignarse rol de administrador

**Dónde:** reglas de Firestore, `match /users/{userId} { allow update: if request.auth != null; }`.

**Qué pasa:** cualquier usuario autenticado (incluida una cuenta de
docente recién registrada, con `status:"pending"`) puede actualizar
**cualquier** documento de la colección `users`, no solo el propio. Desde
la consola del navegador podría cambiar su propio `status` a `"approved"`
o su `role` a `"admin"`, saltándose por completo el flujo de aprobación
manual descrito en `AdminPanel` (`00b-auth.js`).

**Confirmado por código:** el registro (`00b-auth.js:187-193`) siempre crea
el documento con `role:"teacher"` y `status:"pending"`; no existe en el
código ningún flujo donde un docente actualice su propio documento — el
único lugar que escribe `status` es `AdminPanel.updateStatus`, pensado para
que lo use un administrador sobre la cuenta de otro usuario. La regla
actual no exige eso.

**Por qué no se corrige ahora:** decisión explícita del dueño del proyecto
de no tocar las reglas de Firestore por el momento. (Se dejó lista y
revisada una regla de reemplazo, pendiente de confirmar antes de aplicar
que la cuenta de administrador real ya tenga `role:"admin"` guardado en su
documento de Firestore — de lo contrario, aplicarla rompería el panel de
aprobación.)

**Mitigación futura recomendada:**
```
match /users/{userId} {
  function isAdmin() {
    return request.auth != null &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
  }
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.auth.uid == userId
    && request.resource.data.get('role', '') != 'admin'
    && request.resource.data.get('status', 'pending') == 'pending';
  allow update: if isAdmin()
    || (request.auth != null
        && request.auth.uid == userId
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'status']));
}
```

---

## 4. Sala en vivo (`liveSessions`): escritura pública sin restricción

**Dónde:** reglas de Firestore, `match /liveSessions/{sessionId} { allow update: if true; }`.

**Qué pasa:** cualquiera, sin autenticarse ni haberse unido a la sesión,
puede modificar cualquier campo de cualquier sala en vivo (estado de la
sesión, pregunta activa, `ownerId`, etc.).

**Estado:** revisado, **no se toca por instrucción explícita** del dueño
del proyecto (`09-live.js` y sus reglas quedan fuera de esta ronda de
correcciones). Antes de tocar esta regla en el futuro, hay que confirmar en
`09-live.js` qué campos escribe el estudiante directamente sobre el
documento de `liveSessions` (fuera de las subcolecciones `answers` y
`joinRequests`, que ya son públicas por diseño), porque restringir esta
regla sin ese análisis podría romper el flujo de la sala en vivo.

---

## 5. Otros de menor severidad (documentados, no evaluados como aceptados o rechazados aquí)

- **Lectura de `users` abierta a cualquier autenticado:** cualquier docente
  puede leer los datos (correo, institución, estado) de todos los demás.
  Baja severidad si todos los usuarios son de confianza.
- **`liveSessions/answers` y `liveSessions/joinRequests`:** lectura y
  escritura totalmente públicas, sin validar forma de los datos. Es el
  diseño esperado para que los estudiantes participen sin login; sin
  validación de campos, alguien podría escribir datos basura.

---

## Resumen de decisiones tomadas

| Hallazgo | Acción |
|---|---|
| Respuestas correctas expuestas al cliente | Aceptado, sin corregir (estructural) |
| Calificación falsificable en `results` | Aceptado, sin corregir (requiere tocar reglas, descartado por ahora) |
| Auto-aprobación / escalación de rol en `users` | Aceptado, sin corregir (requiere tocar reglas, descartado por ahora) |
| `liveSessions` con escritura pública sin dueño | Aceptado, sin corregir — **no se toca `09-live.js` ni sus reglas** |
| Envío del examen se pierde si falla la conexión | **Corregido** — ver `08-online.js`, borrador en `localStorage` + reintento manual |
| Bug cosmético `color: var(#ffffff)` en pantalla de carga de login | **Corregido** — `00b-auth.js` |
