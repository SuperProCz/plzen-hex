import { MONUMENT_PHOTOS_URL, SHOW_MONUMENT_PHOTOS } from "../config";

export interface MonumentPhoto {
  /** File name on Wikimedia Commons. */
  file: string;
  author: string;
  license: string;
  /** Czech Wikipedia article title, if there is one. */
  wiki?: string;
}

/** Monument ÚSKP id → photo. Optional extra: resolves to {} when switched off or unavailable. */
export async function loadMonumentPhotos(): Promise<Record<string, MonumentPhoto>> {
  if (!SHOW_MONUMENT_PHOTOS) return {};
  try {
    const res = await fetch(MONUMENT_PHOTOS_URL);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

/** A ~400 px wide thumbnail served by Commons. */
export const photoUrl = (p: MonumentPhoto) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.file)}?width=400`;

export const commonsPage = (p: MonumentPhoto) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.file.replace(/ /g, "_"))}`;

export const wikipediaPage = (p: MonumentPhoto) => `https://cs.wikipedia.org/wiki/${encodeURIComponent(p.wiki!)}`;

/**
 * Photo block for a popup: the image (blurred until the monument is discovered), the required credit,
 * and a Wikipedia link. Removes itself if the image can't load (e.g. offline).
 */
export function photoFigure(p: MonumentPhoto, alt: string, discovered: boolean): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = discovered ? "popup-photo" : "popup-photo is-locked";
  const img = document.createElement("img");
  img.src = photoUrl(p);
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => figure.remove());
  const caption = document.createElement("figcaption");
  const source = Object.assign(document.createElement("a"), {
    href: commonsPage(p),
    target: "_blank",
    rel: "noopener",
    textContent: "Wikimedia Commons",
  });
  caption.append(`Foto: ${p.author} · ${p.license} · `, source);
  figure.append(img, caption);
  if (!discovered) figure.append(Object.assign(document.createElement("span"), { className: "photo-lock", textContent: "🔒" }));
  return figure;
}
