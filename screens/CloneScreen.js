import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import RecordingModal from '../components/Modals/RecordingModal';
import ConfirmModal from '../components/Modals/ConfirmModal';
import { useToast } from '../components/StatusToast';
import useAudioRecorder from '../hooks/useAudioRecorder';
import { cloneVoice } from '../services/voiceService';
import { COLORS } from '../styles/colors';

export default function CloneScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  // State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasExistingVoice, setHasExistingVoice] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  
  // Audio recorder hook
  const {
    isRecording,
    startRecording,
    stopRecording,
    recordingDuration,
    formatDuration,
    audioUri,
    progress,
    handleAudioFileUpload,
  } = useAudioRecorder();
  
  // Check for existing voice clone and network status on mount
  useEffect(() => {
    checkExistingVoice();
    setupNetworkListener();
  }, []);
  
  // Set up network status listener
  const setupNetworkListener = () => {
    // Check initial status
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected === true);
    });
    
    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
    });
    
    return () => unsubscribe();
  };
  
  // Check if user has an existing voice clone
  const checkExistingVoice = async () => {
    try {
      const voiceId = await AsyncStorage.getItem('voice_id');
      setHasExistingVoice(!!voiceId);
      
      // If user already has a voice clone, navigate to synthesis screen
      if (voiceId) {
        navigation.replace('Synthesis');
      }
    } catch (error) {
      console.error('Error checking for voice ID:', error);
    }
  };
  
  // Start recording flow
  const handleStartRecording = async () => {
    // Check if online
    if (!isOnline) {
      showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
      return;
    }
    
    // Check if user already has a voice, show confirm dialog if needed
    if (hasExistingVoice) {
      setIsConfirmModalVisible(true);
      return;
    }
    
    // Show recording modal and start recording
    setIsModalVisible(true);
    
    // Pass handleStopRecording as the callback for auto-stop
    const success = await startRecording((audioUri) => {
      // This function will be called automatically when recording stops after 30 seconds
      processAudioForCloning(audioUri);
    });
    
    if (!success) {
      setIsModalVisible(false);
      showToast('Nie udało się rozpocząć nagrywania. Sprawdź uprawnienia mikrofonu.', 'ERROR');
    }
  };
  
  // Stop recording and process audio
  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    const uri = await stopRecording();
    if (uri) {
      processAudioForCloning(uri);
    } else {
      setIsModalVisible(false);
      showToast('Wystąpił problem z nagraniem. Spróbuj ponownie.', 'ERROR');
    }
  };

  // Cancel recording modal
  const handleCancelRecording = async () => {
    if (isRecording) {
      await stopRecording();
    }
    
    if (isProcessing) {
      // Consider adding logic to cancel in-progress API calls
    }
    
    setIsModalVisible(false);
    setIsProcessing(false);
  };
  
  // Handle audio file upload
  const handleFileUpload = async () => {
    try {
      // Check if online
      if (!isOnline) {
        showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
        return;
      }
      
      // Check if user already has a voice, show confirm dialog if needed
      if (hasExistingVoice) {
        setIsConfirmModalVisible(true);
        return;
      }
      
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      const fileUri = result.assets[0].uri;
      showToast('Plik audio wybrany pomyślnie', 'SUCCESS');
      
      // Show the modal before processing
      setIsModalVisible(true);
      
      // Process the file for voice cloning
      processAudioForCloning(fileUri);
    } catch (error) {
      console.error('Error picking document:', error);
      showToast('Wystąpił problem z wybranym plikiem. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Process audio (either recorded or uploaded) for voice cloning
  const processAudioForCloning = async (uri) => {
    try {
      // Keep the modal visible but switch to processing state
      setIsProcessing(true);
      
      // API call to clone voice
      const result = await cloneVoice(uri);
      
      // Hide modals at the end
      setIsProcessing(false);
      setIsModalVisible(false);
      
      if (result.success) {
        // Save voice ID to AsyncStorage
        await AsyncStorage.setItem('voice_id', result.voiceId);
        
        showToast('Głos sklonowany pomyślnie!', 'SUCCESS');
        
        // Navigate to synthesis screen
        navigation.replace('Synthesis');
      } else {
        if (result.code === 'OFFLINE') {
          showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
        } else {
          showToast(`Błąd klonowania głosu: ${result.error}`, 'ERROR');
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsProcessing(false);
      setIsModalVisible(false);
      showToast('Wystąpił problem podczas przetwarzania audio. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Reset voice clone (after confirmation)
  const handleResetVoice = async () => {
    try {
      // Clear voice ID and any generated stories
      await AsyncStorage.removeItem('voice_id');
      await AsyncStorage.removeItem('generated_stories');
      
      setHasExistingVoice(false);
      setIsConfirmModalVisible(false);
      
      showToast('Reset pomyślny. Możesz nagrać nowy głos.', 'INFO');
    } catch (error) {
      console.error('Error resetting voice:', error);
      showToast('Wystąpił problem podczas resetowania. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/logo-stacked.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          {!isOnline && (
            <View style={styles.offlineMessage}>
              <Feather name="wifi-off" size={20} color={COLORS.text.secondary} />
              <Text style={styles.offlineText}>
                Klonowanie głosu wymaga połączenia z internetem.
                Połącz się z internetem i spróbuj ponownie.
              </Text>
            </View>
          )}
          
          <View style={styles.optionsContainer}>
            <View style={styles.recordSection}>
              <Text style={styles.sectionTitle}>
                Stwórz próbkę swojego głosu
              </Text>
              <Text style={styles.sectionDescription}>
                Przeczytaj na głos fragment wiersza, który zaraz zobaczysz
              </Text>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  !isOnline && styles.disabledButton
                ]}
                onPress={handleStartRecording}
                activeOpacity={0.8}
                disabled={!isOnline}
              >
                <Text style={styles.buttonText}>Rozpocznij nagrywanie</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>lub</Text>
              <View style={styles.dividerLine} />
            </View>
            
            <View style={styles.uploadSection}>
              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  !isOnline && styles.disabledButton
                ]}
                onPress={handleFileUpload}
                activeOpacity={0.8}
                disabled={!isOnline}
              >
                <Text style={styles.buttonText}>Prześlij plik audio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Recording Modal */}
      <RecordingModal
        visible={isModalVisible}
        isRecording={isRecording}
        isProcessing={isProcessing}
        progress={progress}
        recordingDuration={recordingDuration}
        statusText={
          isProcessing
            ? 'Przetwarzanie głosu...'
            : isRecording
            ? `Pozostało: ${formatDuration(recordingDuration)}`
            : 'Rozpocznij mówić'
        }
        onCancel={handleCancelRecording}
        formatDuration={formatDuration}
      />
      
      {/* Confirmation Modal */}
      <ConfirmModal
        visible={isConfirmModalVisible}
        title="Na pewno zaczynamy od nowa?"
        message="Usuniemy Twój obecny model głosu i wszystkie dotychczas powstałe bajki. Czy na pewno chcesz kontynuować?"
        confirmText="Usuń i nagraj ponownie"
        cancelText="Anuluj"
        onConfirm={handleResetVoice}
        onCancel={() => setIsConfirmModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    alignItems: 'center', // Centers horizontally
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 128,
    height: 62,
    marginTop: 32,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  optionsContainer: {
    marginTop: 32,
  },
  recordSection: {
    backgroundColor: `${COLORS.white}`, // 10% opacity
    padding: 0,
    borderRadius: 12,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionDescription: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  recordButton: {
    backgroundColor: COLORS.peach,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: COLORS.text.tertiary,
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.tertiary,
    paddingHorizontal: 8,
  },
  uploadSection: {
    marginBottom: 8,
  },
  offlineMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 181, 167, 0.2)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  offlineText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});