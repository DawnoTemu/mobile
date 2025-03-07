# DawnoTemu

DawnoTemu is a React Native mobile application that allows users to create a voice clone and then listen to stories narrated in their own voice. The app provides a personalized storytelling experience by combining high-quality story content with the user's voice characteristics.

![DawnoTemu Logo](./assets/images/logo.png)

## Features

- **Voice Cloning**: Record your voice or upload an audio file to create a digital clone
- **Story Selection**: Browse through a collection of stories
- **Voice Synthesis**: Generate narration of stories using your cloned voice
- **Audio Player**: Control playback with play/pause, rewind, fast-forward, and seek functionality
- **Offline Support**: Queue operations when offline and process them when back online
- **Caching**: Store generated audio files locally for quick access

## Project Structure

```
my-app/
├── app/                       # Main app entry point
├── assets/                    # Static assets (images, fonts, etc.)
├── components/                # Reusable UI components
│   ├── Modals/                # Modal components
│   ├── AudioControls.js       # Audio player component
│   ├── StatusToast.js         # Toast notification component
│   └── StoryItem.js           # Story list item component
├── hooks/                     # Custom React hooks
│   ├── useAudioPlayer.js      # Hook for audio playback
│   └── useAudioRecorder.js    # Hook for voice recording
├── navigation/                # Navigation configuration
│   └── AppNavigator.js        # Main navigation stack
├── screens/                   # App screens
│   ├── CloneScreen.js         # Voice cloning screen
│   ├── SplashScreen.js        # Initial loading screen
│   └── SynthesisScreen.js     # Story selection and playback screen
├── services/                  # API and service integrations
│   └── voiceService.js        # Voice cloning and synthesis service
├── styles/                    # Global styles
│   ├── colors.js              # Color definitions
│   ├── fonts.js               # Typography styles
│   └── theme.js               # Combined theme configuration
└── utils/                     # Utility functions
    └── audioUtils.js          # Audio-related utility functions
```

## Tech Stack

- **React Native**: Cross-platform mobile framework
- **Expo**: Development platform for React Native
- **React Navigation**: Navigation library
- **Expo AV**: Audio recording and playback
- **Expo FileSystem**: File management
- **AsyncStorage**: Local data persistence
- **NetInfo**: Network connectivity monitoring
- **Expo Blur**: Visual blur effects
- **Animated API**: Animation system

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/dawnottemu.git
   cd dawnottemu
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npx expo start
   ```

## Usage

### Voice Cloning

1. Launch the app and you'll be directed to the voice cloning screen
2. Choose to either:
   - Record your voice by reading the provided text
   - Upload an existing audio file

### Accessing Stories

Once your voice is cloned:

1. Browse through the available stories
2. Tap on a story to select it
3. The app will generate audio narration using your voice
4. Use the audio controls to play, pause, rewind, or fast-forward

## API Integration

The app connects to a voice cloning and synthesis API. The service endpoints include:

- `/clone`: Upload voice samples for cloning
- `/synthesize`: Generate audio narration for stories
- `/audio/{voiceId}/{storyId}`: Retrieve generated audio files
- `/stories`: Get available stories

## Customization

### Colors

You can customize the app's color scheme in `styles/colors.js`:

```javascript
export const COLORS = {
  peach: '#FFB5A7',
  lavender: '#D4C1EC',
  mint: '#B8E0D2',
  // ... other colors
};
```

### Fonts

Font configurations are in `styles/fonts.js`. The app uses Comfortaa and Quicksand font families.

## Development Notes

### Environment Configuration

The app supports multiple environments:

```javascript
const ENV = {
  DEV: 'http://192.168.1.108:8000/api',
  STAGING: 'https://staging-story-voice.herokuapp.com/api',
  PROD: 'https://story-voice-47d650d68bd6.herokuapp.com/api'
};
```

To change the environment, modify the `API_BASE_URL` in `services/voiceService.js`.

### Audio Processing

The app handles audio in several formats:
- Recording: WAV format
- Playback: MP3 format
- Storage: Files are cached in the app's temporary directory

### Offline Support

The app queues operations when offline and processes them when connectivity is restored:

- Voice cloning operations
- Story generation requests 
- Download operations

## Troubleshooting

### Audio Permission Issues

If you encounter issues with recording:

1. Ensure microphone permissions are granted
2. On iOS, check that "Microphone" permission is enabled in device settings
3. On Android, verify recording permissions in app settings

### Playback Problems

If audio doesn't play:

1. Check device volume
2. Ensure the audio file was downloaded successfully
3. Try restarting the app

## License

[Add your license information here]

## Contact

[Add your contact information here]