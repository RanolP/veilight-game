export type AtlasImage = ImageBitmap | HTMLImageElement;

export type Assets = Readonly<{
  atlases: readonly AtlasImage[];
}>;

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Failed to load atlas image: ${url}`)), {
      once: true,
    });
    image.src = url;
  });
}

async function loadAtlas(url: string): Promise<AtlasImage> {
  if ("createImageBitmap" in window) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await createImageBitmap(await response.blob());
    } catch (error) {
      console.warn(`Falling back to HTMLImageElement for atlas ${url}.`, error);
    }
  }

  return loadImageElement(url);
}

export async function loadAssets({ atlases }: { atlases: readonly string[] }): Promise<Assets> {
  return Object.freeze({
    atlases: Object.freeze(await Promise.all(atlases.map(loadAtlas))),
  });
}
