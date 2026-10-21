/** Recolour neutral artwork without changing its geometry, alpha or shading.
 * sRGB keeps the source's grey values aligned with the theme's five tone stops. */
export default function PiecePalette({ id, tones }: { id: string; tones: readonly string[] }) {
  const channel = (offset: number) => tones.map((hex) => parseInt(hex.slice(offset, offset + 2), 16) / 255).join(' ');
  return (
    <svg className="piece-palette-definitions" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={channel(1)} />
            <feFuncG type="table" tableValues={channel(3)} />
            <feFuncB type="table" tableValues={channel(5)} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
