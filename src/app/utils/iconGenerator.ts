// 🎨 Automatic Icon Generator for PWA
// Generates all required icon sizes from a single source

export async function generatePWAIcons(logoText: string = "IP", baseColor: string = "#3b82f6") {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const icons: { size: number; blob: Blob; url: string }[] = [];

  for (const size of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) continue;

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(1, adjustColor(baseColor, -20));

    // Draw rounded square background
    const radius = size * 0.15;
    ctx.fillStyle = gradient;
    roundRect(ctx, 0, 0, size, size, radius);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = adjustColor(baseColor, 20);
    ctx.lineWidth = size * 0.02;
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, radius);
    ctx.stroke();

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.35}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add shadow for better visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = size * 0.02;
    ctx.shadowOffsetY = size * 0.01;
    
    ctx.fillText(logoText, size / 2, size / 2);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob());
      }, 'image/png');
    });

    icons.push({
      size,
      blob,
      url: URL.createObjectURL(blob)
    });
  }

  return icons;
}

// Helper: Draw rounded rectangle
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper: Adjust color brightness
function adjustColor(color: string, amount: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Generate icons from uploaded image
export async function generateIconsFromImage(imageFile: File | string): Promise<{ size: number; blob: Blob; url: string }[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
      const icons: { size: number; blob: Blob; url: string }[] = [];

      for (const size of sizes) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx) continue;

        // Draw image scaled to size
        ctx.drawImage(img, 0, 0, size, size);

        // Convert to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob || new Blob());
          }, 'image/png');
        });

        icons.push({
          size,
          blob,
          url: URL.createObjectURL(blob)
        });
      }

      resolve(icons);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    if (typeof imageFile === 'string') {
      img.src = imageFile;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(imageFile);
    }
  });
}

// Download all icons as zip would require a library, so we'll provide individual downloads
export function downloadIcon(blob: Blob, size: number) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `icon-${size}x${size}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Download all icons
export function downloadAllIcons(icons: { size: number; blob: Blob }[]) {
  icons.forEach((icon) => {
    setTimeout(() => {
      downloadIcon(icon.blob, icon.size);
    }, 100 * icon.size); // Stagger downloads
  });
}
