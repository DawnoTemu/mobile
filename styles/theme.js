// Combines all styles into a cohesive theme
import { COLORS } from './colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS, TEXT_STYLES } from './fonts';

// Spacing scale (for margins, paddings, etc.)
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

// Border radius scale
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  round: 9999, // For fully rounded (circles)
};

// Shadow styles
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Animation timing
export const ANIMATION = {
  fast: 200,
  normal: 300,
  slow: 500,
};

// Z-index levels
export const Z_INDEX = {
  base: 0,
  content: 10,
  header: 20,
  modal: 30,
  tooltip: 40,
  toast: 50,
};

// Export the complete theme
export const THEME = {
  colors: COLORS,
  fonts: FONTS,
  fontSizes: FONT_SIZES,
  lineHeights: LINE_HEIGHTS,
  textStyles: TEXT_STYLES,
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  animation: ANIMATION,
  zIndex: Z_INDEX,
};

export default THEME;