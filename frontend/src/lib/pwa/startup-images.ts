// Logical portrait width/height and scale; orientation changes the image, not
// device-width/device-height. Includes 14 Pro Max (430×932 @3x).
export const appleStartupScreens = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [360, 780, 3],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 896, 2],
  [414, 896, 3],
  [420, 912, 3],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [744, 1133, 2],
  [1024, 1366, 2],
  [834, 1210, 2],
  [1032, 1376, 2],
] as const

export const appleStartupImages = appleStartupScreens.flatMap(
  ([width, height, scale]) =>
    (['portrait', 'landscape'] as const).map((orientation) => {
      const landscape = orientation === 'landscape'
      const pixelWidth = (landscape ? height : width) * scale
      const pixelHeight = (landscape ? width : height) * scale
      return {
        width: landscape ? height : width,
        height: landscape ? width : height,
        scale,
        pixelWidth,
        pixelHeight,
        href: `/splash/launch-v2-${pixelWidth}-${pixelHeight}.png`,
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})`,
      }
    }),
)
