import type { OutfitBoard, OutfitContext } from '@/services/outfit';

// Free keyless AI imagery (Pollinations, no signup). This renders an
// ILLUSTRATIVE preview — a stylized person wearing the described outfit —
// not a true virtual try-on of the user's photos (that needs a paid GPU
// pipeline; tracked separately). Prompts carry item descriptions only,
// never personal data.

function describeBoard(board: OutfitBoard): string {
  const part = (label: string, colors: string[]) =>
    `${colors.join(' and ') || ''} ${label}`.trim();
  const pieces = [
    part('top', board.top.colors),
    part('bottom', board.bottom.colors),
    part('shoes', board.shoes.colors),
  ];
  if (board.outerwear) pieces.push(part('outerwear', board.outerwear.colors));
  if (board.accessory) pieces.push(part('accessory', board.accessory.colors));
  return pieces.join(', ');
}

export function buildRenderPrompt(
  board: OutfitBoard,
  ctx: OutfitContext,
): string {
  const light =
    ctx.tempC >= 20 ? 'bright daylight' : ctx.tempC >= 10 ? 'soft daylight' : 'overcast daylight';
  return `Full-body vector illustration, entire person visible head to shoes in frame, faceless person with blank face and no facial features, standing in a cozy bedroom with an open wardrobe closet full of clothes behind, wearing ${describeBoard(board)}, ${ctx.mood} mood styling, ${ctx.dress} dress code, ${light} from a window, flat colors, clean vector shapes, minimalist fashion illustration, no photo, no realism, no cropped body`;
}

export function buildRenderUrl(
  prompt: string,
  seed: number,
  referenceImages: string[],
): string {
  const params = new URLSearchParams({
    width: '768',
    height: '1024',
    seed: String(seed),
    nologo: 'true',
  });
  // Garment references for image-to-image grounding (ignored by models
  // without image support — the text description still carries the outfit).
  for (const url of referenceImages.slice(0, 3)) {
    params.append('image', url);
  }
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
}
