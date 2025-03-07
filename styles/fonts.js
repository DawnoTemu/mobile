// Font configurations for the app

// Font families
export const FONTS = {
    logo: 'Comfortaa-Regular', // Used for logo and main headings
    primary: 'Quicksand-Regular', // For most content
    
    // Font variations
    regular: {
      primary: 'Quicksand-Regular',
      logo: 'Comfortaa-Regular',
    },
    medium: {
      primary: 'Quicksand-Medium',
    },
    bold: {
      primary: 'Quicksand-Bold',
      logo: 'Comfortaa-Regular', // We use regular + fontWeight for Comfortaa bold
    },
  };
  
  // Font sizes
  export const FONT_SIZES = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
  };
  
  // Line heights
  export const LINE_HEIGHTS = {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.8,
  };
  
  // Text styles to use across the app
  export const TEXT_STYLES = {
    // Headings
    h1: {
      fontFamily: FONTS.logo,
      fontSize: FONT_SIZES['3xl'],
      fontWeight: 'bold',
    },
    h2: {
      fontFamily: FONTS.logo,
      fontSize: FONT_SIZES['2xl'],
      fontWeight: 'bold',
    },
    h3: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.xl,
      fontWeight: 'bold',
    },
    
    // Body text
    body: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.md,
    },
    bodySmall: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.sm,
    },
    
    // Button text
    button: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
    },
    
    // Labels, captions, etc.
    label: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
    },
    caption: {
      fontFamily: FONTS.primary,
      fontSize: FONT_SIZES.xs,
    },
  };