// js/app.js
// Point d'entrée de index.html : vérifie la session, construit l'UI,
// relie les modules (gallery, upload, albums, trash, auth).

import { requireAuth, watchSession, logout } from "./auth.js";
import { supabase } from "./supabase.js";
import { escapeHTML, formatBytes, formatDate } from "./security.js";
import * as Gallery from "./gallery.js";
import * as Albums from "./albums.js";
import * as Trash from "./trash.js";
import { uploadPhotos } from "./upload.js";

const state = {
  section: "all", // all | albums | favorites | recent | trash | settings
  page: 0,
  search: "",
  sortBy: "created_at",
  sortDir: "desc",
  currentAlbumId: null,
  selection: new Set(),
  albums: [],
};

const app = document.getElementById("app");

async function init() {
  const session = await requireAuth();
  if (!session) return; // requireAuth redirige déjà vers login.html
  watchSession();

  document.getElementById("user-email").textContent = session.user.email ?? "";
  bindGlobalEvents();
  state.albums = await Albums.fetchAlbums();
  renderAlbumList();
  await loadAndRenderGallery();
  registerServiceWorker();
}

function bindGlobalEvents() {
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.querySelectorAll("[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });

  const searchInput = document.getElementById("search-input");
  let debounce;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.search = e.target.value;
      state.page = 0;
      loadAndRenderGallery();
    }, 300);
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    const [sortBy, sortDir] = e.target.value.split(":");
    state.sortBy = sortBy;
    state.sortDir = sortDir;
    loadAndRenderGallery();
  });

  const fileInput = document.getElementById("file-input");
  document.getElementById("add-photos-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(Array.from(e.target.files)));

  const dropzone = document.getElementById("app");
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
  });

  document.getElementById("new-album-btn").addEventListener("click", async () => {
    const name = prompt("Nom du nouvel album :");
    if (!name) return;
    try {
      await Albums.createAlbum(name);
      state.albums = await Albums.fetchAlbums();
      renderAlbumList();
    } catch (err) {
      notify(err.message, "error");
    }
  });

  document.getElementById("empty-trash-btn").addEventListener("click", async () => {
    if (!confirm("Vider définitivement la corbeille ? Cette action est irréversible.")) return;
    try {
      await Trash.emptyTrash();
      await loadAndRenderGallery();
    } catch (err) {
      notify(err.message, "error");
    }
  });

  document.getElementById("bulk-delete-btn").addEventListener("click", async () => {
    if (state.selection.size === 0) return;
    await Gallery.moveToTrash([...state.selection]);
    state.selection.clear();
    await loadAndRenderGallery();
  });
}

function switchSection(section) {
  state.section = section;
  state.page = 0;
  state.currentAlbumId = null;
  state.selection.clear();
  document.querySelectorAll("[data-section]").forEach((b) => b.classList.toggle("active", b.dataset.section === section));
  document.getElementById("bulk-delete-btn").hidden = section === "trash";
  document.getElementById("empty-trash-btn").hidden = section !== "trash";
  loadAndRenderGallery();
}

async function loadAndRenderGallery() {
  const grid = document.getElementById("photo-grid");
  grid.innerHTML = `<p class="empty-state">Chargement…</p>`;

  try {
    if (state.section === "trash") {
      const items = await Trash.fetchTrash();
      renderTrash(items);
      return;
    }

    const { photos, total } = await Gallery.fetchPhotos({
      page: state.page,
      search: state.search,
      sortBy: state.section === "recent" ? "created_at" : state.sortBy,
      sortDir: state.section === "recent" ? "desc" : state.sortDir,
      albumId: state.currentAlbumId,
      favoritesOnly: state.section === "favorites",
    });

    if (photos.length === 0) {
      grid.innerHTML = `<p class="empty-state">Aucune photo ici pour le moment.</p>`;
      return;
    }

    grid.innerHTML = "";
    for (const photo of photos) {
      grid.appendChild(await renderPhotoCard(photo));
    }
  } catch (err) {
    grid.innerHTML = `<p class="empty-state error">${escapeHTML(err.message)}</p>`;
  }
}

async function renderPhotoCard(photo) {
  const card = document.createElement("div");
  card.className = "photo-card";
  card.dataset.id = photo.id;

  let url = "";
  try {
    url = await Gallery.getSignedUrl(photo.file_path);
  } catch {
    /* placeholder géré ci-dessous */
  }

  card.innerHTML = `
    <img loading="lazy" src="${url || ""}" alt="${escapeHTML(photo.original_name)}" />
    <div class="photo-meta">
      <span class="photo-name" title="${escapeHTML(photo.original_name)}">${escapeHTML(photo.original_name)}</span>
      <span class="photo-date">${formatDate(photo.created_at)} · ${formatBytes(photo.file_size)}</span>
    </div>
    <div class="photo-actions">
      <button class="fav-btn ${photo.is_favorite ? "active" : ""}" title="Favori">★</button>
      <button class="dl-btn" title="Télécharger">⬇</button>
      <button class="del-btn" title="Supprimer">🗑</button>
    </div>
  `;

  card.querySelector(".fav-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const next = !photo.is_favorite;
    await Gallery.toggleFavorite(photo.id, next);
    loadAndRenderGallery();
  });
  card.querySelector(".dl-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    Gallery.downloadPhoto(photo.file_path, photo.original_name);
  });
  card.querySelector(".del-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    await Gallery.moveToTrash([photo.id]);
    loadAndRenderGallery();
  });
  card.addEventListener("click", () => openLightbox(photo, url));

  return card;
}

function renderTrash(items) {
  const grid = document.getElementById("photo-grid");
  if (items.length === 0) {
    grid.innerHTML = `<p class="empty-state">La corbeille est vide.</p>`;
    return;
  }
  grid.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "photo-card trash-card";
    card.innerHTML = `
      <div class="trash-info">
        <span class="photo-name">${escapeHTML(item.original_name)}</span>
        <span class="photo-date">Supprimée le ${formatDate(item.deleted_at)}</span>
        <span class="days-left">${item.daysLeft} jour(s) avant suppression définitive</span>
      </div>
      <div class="photo-actions">
        <button class="restore-btn">Restaurer</button>
        <button class="purge-btn">Supprimer définitivement</button>
      </div>
    `;
    card.querySelector(".restore-btn").addEventListener("click", async () => {
      await Trash.restorePhotos([item.id]);
      loadAndRenderGallery();
    });
    card.querySelector(".purge-btn").addEventListener("click", async () => {
      if (!confirm("Supprimer définitivement cette photo ? Action irréversible.")) return;
      await Trash.permanentlyDelete([item]);
      loadAndRenderGallery();
    });
    grid.appendChild(card);
  }
}

function renderAlbumList() {
  const list = document.getElementById("album-list");
  list.innerHTML = "";
  for (const album of state.albums) {
    const li = document.createElement("li");
    li.textContent = album.name;
    li.addEventListener("click", () => {
      state.section = "albums";
      state.currentAlbumId = album.id;
      loadAndRenderGallery();
    });
    list.appendChild(li);
  }
}

function openLightbox(photo, url) {
  const lb = document.getElementById("lightbox");
  lb.querySelector("img").src = url;
  lb.querySelector(".lightbox-caption").textContent = `${photo.original_name} · ${formatDate(photo.created_at)}`;
  lb.hidden = false;
  lb.querySelector(".lightbox-close").onclick = () => (lb.hidden = true);
}

async function handleFiles(files) {
  const progressEl = document.getElementById("upload-progress");
  progressEl.hidden = false;
  progressEl.innerHTML = files.map((f, i) => `<div id="up-${i}">${escapeHTML(f.name)} : en attente…</div>`).join("");

  await uploadPhotos(files, {
    onProgress: (i, { status, message }) => {
      const el = document.getElementById(`up-${i}`);
      if (!el) return;
      const labels = { pending: "en attente…", uploading: "envoi…", done: "✅ importée", error: `❌ ${message ?? "erreur"}` };
      el.textContent = `${escapeHTML(files[i].name)} : ${labels[status]}`;
    },
  });

  setTimeout(() => (progressEl.hidden = true), 4000);
  await loadAndRenderGallery();
}

function notify(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker non enregistré :", err.message);
    });
  }
}

init();
