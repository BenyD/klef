// Canvas-side of the avatar cropper: draw the selected region of the source
// image onto a small square canvas and hand back a data URL for storage.

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropImageToDataUrl(
  src: string,
  crop: PixelCrop,
  size = 128,
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image");
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}
