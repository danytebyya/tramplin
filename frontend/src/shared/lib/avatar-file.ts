const AVATAR_MAX_DIMENSION = 1600;
const AVATAR_TARGET_TYPE = "image/webp";
const AVATAR_TARGET_QUALITY = 0.86;
const AVATAR_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };

    image.src = objectUrl;
  });
}

function resolveCanvasSize(width: number, height: number) {
  const longestSide = Math.max(width, height);

  if (longestSide <= AVATAR_MAX_DIMENSION) {
    return { width, height };
  }

  const scale = AVATAR_MAX_DIMENSION / longestSide;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("AVATAR_CONVERSION_FAILED"));
          return;
        }

        resolve(
          new File([blob], fileName.replace(/\.[^.]+$/, "") + ".webp", {
            type: AVATAR_TARGET_TYPE,
            lastModified: Date.now(),
          }),
        );
      },
      AVATAR_TARGET_TYPE,
      AVATAR_TARGET_QUALITY,
    );
  });
}

export async function prepareAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("AVATAR_INVALID_TYPE");
  }

  const image = await loadImageFromFile(file);
  const nextSize = resolveCanvasSize(image.naturalWidth, image.naturalHeight);
  const shouldTransform =
    file.size > AVATAR_MAX_FILE_SIZE_BYTES ||
    nextSize.width !== image.naturalWidth ||
    nextSize.height !== image.naturalHeight;

  if (!shouldTransform) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = nextSize.width;
  canvas.height = nextSize.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("AVATAR_CONTEXT_UNAVAILABLE");
  }

  context.drawImage(image, 0, 0, nextSize.width, nextSize.height);

  return canvasToFile(canvas, file.name);
}
