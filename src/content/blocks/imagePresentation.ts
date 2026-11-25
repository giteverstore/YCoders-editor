export const IMAGE_SIZE_PRESETS = {
  small: '320px',
  medium: '560px',
  large: '800px',
  full: '100%',
} as const

export type ImageSize = keyof typeof IMAGE_SIZE_PRESETS | 'custom'
export type ImageAlignment = 'left' | 'center' | 'right'
export type ImagePresentation = { size?: ImageSize; customWidth?: number; customUnit?: 'px' | '%'; customHeight?: number; heightUnit?: 'auto' | 'px'; objectFit?: 'contain' | 'cover'; alignment?: ImageAlignment; preserveAspectRatio?: boolean }

export const DEFAULT_IMAGE_PRESENTATION = { size: 'medium', customWidth: 640, customUnit: 'px', customHeight: 360, heightUnit: 'auto', objectFit: 'contain', alignment: 'center', preserveAspectRatio: true } as const
export function imagePresentation(value?: ImagePresentation) { return { ...DEFAULT_IMAGE_PRESENTATION, ...value } }
export function validCustomImageWidth(width: number, unit: 'px' | '%') { return Number.isFinite(width) && width >= 1 && width <= (unit === '%' ? 100 : 1600) }
export function validCustomImageHeight(height: number) { return Number.isFinite(height) && height >= 1 && height <= 1200 }
export function imageDisplayWidth(value?: ImagePresentation) { const presentation = imagePresentation(value); return presentation.size === 'custom' ? validCustomImageWidth(presentation.customWidth, presentation.customUnit) ? `${presentation.customWidth}${presentation.customUnit}` : IMAGE_SIZE_PRESETS.medium : IMAGE_SIZE_PRESETS[presentation.size] }
export function imageDisplayStyle(value?: ImagePresentation) { const presentation = imagePresentation(value); return { maxWidth: imageDisplayWidth(presentation), height: presentation.size === 'custom' && !presentation.preserveAspectRatio && presentation.heightUnit === 'px' && validCustomImageHeight(presentation.customHeight) ? `${presentation.customHeight}px` : 'auto', objectFit: presentation.objectFit } as const }
