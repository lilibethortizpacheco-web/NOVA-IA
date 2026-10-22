
"use strict";

/* MATRIX AI — versión local para GitHub Pages
   No utiliza servidores ni claves de API.
   Las respuestas del asistente son básicas hasta conectar
   un modelo de IA que se ejecute localmente.
*/

const $ = (selector) => document.querySelector(selector);

const canvas = $("#matrix-bg");
const ctx = canvas.getContext("2d");

const messagesEl = $("#messages");
const historyEl = $("#history");
const input = $("#messageInput");
const form = $("#chatForm");
const fileInput = $("#fileInput");
const previewEl = $("#attachmentPreview");
const sendBtn = $("#sendBtn");
const toastEl = $("#toast");

const STORAGE_KEY = "matrix_ai_chats_v1";
const MAX_CHATS = 40;
const MAX_MESSAGES = 150;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

let chats = loadChats();
let activeChatId = chats[0]?.id || createChat();
let attachments = [];
let recorder = null;
let audioChunks = [];
let recordingStream = null;
let toastTimer = null;
let recognition = null;
let isListening = false;

const uid = () =>
  Date.now().toString(36) +
  Math.random().toString(36).slice(2, 8);

function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(data)) return data;
  } catch (error) {
    console.warn("No se pudo leer el historial.", error);
  }
  return [];
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    notify("El historial está lleno. Elimina algunos chats.");
  }
}

function createChat() {
  const chat = {
    id: uid(),
    title: "Nuevo chat",
    messages: [],
    updatedAt: Date.now()
  };

  chats.unshift(chat);
  chats = chats.slice(0, MAX_CHATS);
  saveChats();

  return chat.id;
}

function activeChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function notify(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2800);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeTitle(text) {
  return (text || "Nuevo chat").replace(/\s+/g, " ").trim();
}

/* Historial */

function renderHistory() {
  historyEl.replaceChildren();

  const ordered = [...chats].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  for (const chat of ordered) {
    const row = document.createElement("div");
    row.className = "history-item" +
      (chat.id === activeChatId ? " active" : "");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-item";
    open.style.flex = "1";
    open.style.minWidth = "0";
    open.style.padding = "0";
    open.style.border = "0";
    open.style.background = "transparent";

    const icon = document.createElement("span");
    icon.textContent = "▤";

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = chat.title || "Nuevo chat";

    open.append(icon, title);
    open.addEventListener("click", () => {
      activeChatId = chat.id;
      $("#sidebar").classList.remove("open");
      renderHistory();
      renderMessages();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-history";
    remove.textContent = "×";
    remove.title = "Eliminar conversación";
    remove.setAttribute("aria-label", "Eliminar conversación");

    remove.addEventListener("click", event => {
      event.stopPropagation();

      if (!confirm("¿Eliminar esta conversación?")) return;

      chats = chats.filter(item => item.id !== chat.id);

      if (activeChatId === chat.id) {
        activeChatId = chats[0]?.id || createChat();
      }

      saveChats();
      renderHistory();
      renderMessages();
    });

    row.append(open, remove);
    historyEl.append(row);
  }
}

function addMessage(role, text, extra = {}) {
  const chat = activeChat();
  if (!chat) return;

  chat.messages.push({
    id: uid(),
    role,
    text: String(text || ""),
    time: Date.now(),
    ...extra
  });

  chat.messages = chat.messages.slice(-MAX_MESSAGES);

  if (role === "user" && chat.title === "Nuevo chat") {
    chat.title = escapeTitle(text).slice(0, 42) || "Nuevo chat";
  }

  chat.updatedAt = Date.now();

  saveChats();
  renderHistory();
  renderMessages();
}

function renderMessages() {
  const chat = activeChat();
  messagesEl.replaceChildren();

  if (!chat || chat.messages.length === 0) {
    const welcome = document.createElement("div");
    welcome.className = "welcome";

    const orb = document.createElement("div");
    orb.className = "orb";
    orb.textContent = "M";

    const heading = document.createElement("h1");
    heading.append("Bienvenido a ");

    const name = document.createElement("span");
    name.textContent = "Matrix AI";
    heading.append(name);

    const description = document.createElement("p");
    description.textContent =
      "Tu espacio para conversar, explorar ideas y trabajar con tus archivos.";

    const suggestions = document.createElement("div");
    suggestions.className = "suggestions";

    [
      ["📚 Ayúdame a estudiar", "Ayúdame a estudiar un tema"],
      ["🧠 Explícame algo", "Explícame cómo funciona la inteligencia artificial"],
      ["✍️ Escribir un texto", "Ayúdame a escribir un texto"]
    ].forEach(([label, prompt]) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        input.value = prompt;
        input.focus();
        resizeInput();
      });
      suggestions.append(button);
    });

    const notice = document.createElement("p");
    notice.className = "notice";
    notice.textContent =
      "Modo local: todavía no hay un modelo avanzado conectado.";

    welcome.append(orb, heading, description, suggestions, notice);
    messagesEl.append(welcome);
    return;
  }

  for (const message of chat.messages) {
    const article = document.createElement("article");
    article.className = "message " + message.role;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = message.role === "user" ? "TÚ" : "M";

    const content = document.createElement("div");
    content.className = "message-content";

    const head = document.createElement("div");
    head.className = "message-head";

    const speaker = document.createElement("span");
    speaker.textContent = message.role === "user" ? "Tú" : "Matrix AI";

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatTime(message.time);

    head.append(speaker, time);

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.text || "";

    if (message.fileInfo) {
      const fileLabel = document.createElement("p");
      fileLabel.textContent = "📎 " + message.fileInfo;
      bubble.append(fileLabel);
    }

    content.append(head, bubble);

    if (message.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const speak = document.createElement("button");
      speak.type = "button";
      speak.textContent = "🔊 Leer";
      speak.addEventListener("click", () => speakText(message.text));

      actions.append(speak);
      content.append(actions);
    }

    article.append(avatar, content);
    messagesEl.append(article);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* Chat local: no sustituye un modelo de inteligencia artificial */

function localReply(text, fileText = "") {
  const normalized = text.toLowerCase().trim();

  if (!normalized && fileText) {
    return "He leído el texto del archivo en este navegador. " +
      "Puedo mostrarte su contenido, pero todavía necesito un modelo " +
      "de IA para hacer un análisis inteligente y fiable.";
  }

  if (/^(hola|holi|buenas|hey|klk)\b/.test(normalized)) {
    return "¡Hola! 💚 Soy Matrix AI, en mi versión local. " +
      "Puedo ayudarte a organizar texto y usar algunas funciones del navegador. " +
      "Todavía no tengo conectado un modelo avanzado de IA.";
  }

  if (normalized.includes("quién eres") ||
      normalized.includes("quien eres")) {
    return "Soy Matrix AI, un proyecto personal con una interfaz inspirada " +
      "en Matrix. En esta versión funciono sin un modelo avanzado conectado.";
  }

  if (normalized.includes("hora") && normalized.includes("actual")) {
    return "La hora local de tu dispositivo es " +
      new Date().toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit"
      }) + ".";
  }

  if (normalized.includes("resumen") && fileText) {
    const sentences = fileText.match(/[^.!?\n]+[.!?]?/g) || [];
    return "Resumen extractivo inicial del archivo:\n\n" +
      sentences.slice(0, 5).join(" ").slice(0, 1800) +
      "\n\nEste resumen es básico, no un análisis semántico de IA.";
  }

  if (normalized.includes("analiza") && attachments.length > 0) {
    return "He recibido los archivos seleccionados. " +
      "Puedo leer los formatos de texto compatibles, pero esta versión " +
      "no tiene un modelo visual ni un modelo avanzado conectado para " +
      "analizar imágenes o documentos de manera inteligente.";
  }

  return "He recibido tu mensaje: «" + text.slice(0, 500) + "».\n\n" +
    "Esta versión todavía no dispone de un modelo avanzado para razonar " +
    "y responder a preguntas abiertas. La interfaz y el historial funcionan " +
    "localmente; el siguiente paso es integrar un modelo que pueda ejecutarse " +
    "en tu navegador.";
}

/* Envío de mensajes */

async function sendMessage() {
  const text = input.value.trim();

  if (!text && attachments.length === 0) return;

  const selected = [...attachments];
  attachments = [];
  renderAttachments();

  const fileNames = selected.map(file => file.name).join(", ");
  const combinedText = text +
    (fileNames ? "\n\nArchivos adjuntos: " + fileNames : "");

  addMessage("user", combinedText, {
    fileInfo: fileNames || undefined
  });

  input.value = "";
  resizeInput();

  const fileTexts = [];

  for (const file of selected) {
    if (file.textContent) {
      fileTexts.push(
        "Archivo: " + file.name + "\n" +
        file.textContent.slice(0, 12000)
      );
    }
  }

  const readableText = fileTexts.join("\n\n");
  const reply = localReply(text, readableText);

  // Pequeña pausa visual. No simula una conexión real con un modelo.
  sendBtn.disabled = true;

  await new Promise(resolve => setTimeout(resolve, 300));

  addMessage("assistant", reply);
  sendBtn.disabled = false;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage();
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
}

input.addEventListener("input", resizeInput);

/* Nuevo chat y borrar conversación */

$("#newChat").addEventListener("click", () => {
  activeChatId = createChat();
  $("#sidebar").classList.remove("open");
  renderHistory();
  renderMessages();
  input.focus();
});

$("#clearChat").addEventListener("click", () => {
  const chat = activeChat();
  if (!chat || !chat.messages.length) return;

  if (!confirm("¿Borrar los mensajes de este chat?")) return;

  chat.messages = [];
  chat.title = "Nuevo chat";
  chat.updatedAt = Date.now();

  saveChats();
  renderHistory();
  renderMessages();
});

/* Menú para móviles */

$("#menuBtn").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
});

$("#closeSidebar").addEventListener("click", () => {
  $("#sidebar").classList.remove("open");
});

/* Lectura en voz alta */

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    notify("Tu navegador no admite lectura en voz alta.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

/* Dictado: depende de la compatibilidad del navegador */

$("#dictateBtn").addEventListener("click", () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    notify("El dictado no está disponible en este navegador.");
    return;
  }

  if (isListening && recognition) {
    recognition.stop();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = false;
  recognition.interimResults = true;

  isListening = true;
  $("#dictateBtn").textContent = "⏹ Detener";

  recognition.onresult = event => {
    let transcript = "";

    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    input.value = transcript;
    resizeInput();
  };

  recognition.onerror = () => {
    notify("No se pudo reconocer la voz.");
  };

  recognition.onend = () => {
    isListening = false;
    $("#dictateBtn").textContent = "🎙 Dictar";
  };

  try {
    recognition.start();
  } catch (error) {
    isListening = false;
    $("#dictateBtn").textContent = "🎙 Dictar";
    notify("No se pudo iniciar el micrófono.");
  }
});

/* Grabar audio para reproducirlo localmente */

$("#recordBtn").addEventListener("click", async () => {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder) {
    notify("La grabación de audio no es compatible con este navegador.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    audioChunks = [];
    recorder = new MediaRecorder(recordingStream);

    recorder.ondataavailable = event => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(audioChunks, {
        type: recorder.mimeType || "audio/webm"
      });

      const url = URL.createObjectURL(blob);

      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = url;

      const chat = activeChat();
      if (chat) {
        const message = {
          id: uid(),
          role: "user",
          text: "🎧 Nota de audio grabada. Puedes reproducirla aquí.",
          time: Date.now(),
          audioUrl: null
        };

        chat.messages.push(message);
        chat.updatedAt = Date.now();
        saveChats();
        renderHistory();
        renderMessages();

        const bubble = messagesEl.lastElementChild
          ?.querySelector(".bubble");

        if (bubble) bubble.append(audio);
      }

      recordingStream?.getTracks().forEach(track => track.stop());
      recordingStream = null;

      $("#recordBtn").textContent = "⏺ Audio";
      notify("Audio grabado en esta sesión.");
    };

    recorder.start();
    $("#recordBtn").textContent = "⏹ Detener";
    notify("Grabando audio… Pulsa otra vez para detener.");
  } catch (error) {
    recordingStream?.getTracks().forEach(track => track.stop());
    recordingStream = null;
    notify("No se pudo acceder al micrófono. Revisa los permisos.");
  }
});

/* Adjuntar archivos */

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      notify(file.name + " supera el límite de 2 MB.");
      continue;
    }

    const attachment = {
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      textContent: "",
      previewUrl: null
    };

    if (file.type.startsWith("image/")) {
      attachment.previewUrl = URL.createObjectURL(file);
    } else if (/\.(txt|md|csv|json|html|css|js|xml|log)$/i.test(file.name)) {
      try {
        attachment.textContent = await file.text();
      } catch (error) {
        notify("No se pudo leer " + file.name);
      }
    } else if (/\.pdf$/i.test(file.name)) {
      attachment.textContent = "";
      attachment.note =
        "Los PDF requieren un lector compatible que todavía no está instalado.";
    } else {
      attachment.note = "Este formato todavía no se puede leer localmente.";
    }

    attachments.push(attachment);
  }

  renderAttachments();
  fileInput.value = "";
});

function renderAttachments() {
  previewEl.replaceChildren();

  attachments.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const label = document.createElement("span");
    label.textContent = (file.type.startsWith("image/") ? "🖼 " : "📎 ") +
      file.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Quitar " + file.name);

    remove.addEventListener("click", () => {
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      attachments.splice(index, 1);
      renderAttachments();
    });

    chip.append(label, remove);
    previewEl.append(chip);
  });
}

/* Fondo animado Matrix */

const alphabet = "アカサタナハマヤラワ012345789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let fontSize = 15;
let columns = 0;
let drops = [];

function resizeMatrix() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  columns = Math.ceil(window.innerWidth / fontSize);
  drops = Array.from(
    { length: columns },
    () => Math.random() * -window.innerHeight / fontSize
  );
}

function drawMatrix() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.fillStyle = "rgba(2, 7, 3, 0.075)";
  ctx.fillRect(0, 0, width, height);

  ctx.font = fontSize + "px monospace";
  ctx.fillStyle = "#39ff88";

  for (let i = 0; i < drops.length; i++) {
    const char = alphabet[Math.floor(Math.random() * alphabet.length)];

    ctx.fillText(char, i * fontSize, drops[i] * fontSize);

    if (drops[i] * fontSize > height && Math.random() > 0.975) {
      drops[i] = 0;
    }

    drops[i] += 0.45 + Math.random() * 0.45;
  }

  requestAnimationFrame(drawMatrix);
}

window.addEventListener("resize", resizeMatrix);

resizeMatrix();
ctx.fillStyle = "#020703";
ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
drawMatrix();

/* Inicialización */

if (!chats.length) {
  activeChatId = createChat();
}

renderHistory();
renderMessages();
    
